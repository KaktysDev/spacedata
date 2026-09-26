import { test, expect } from "@playwright/test";
import {
  distanceKm,
  nearestSite,
  PROVIDERS,
  PROVIDER_IDS,
  DEFAULT_LOCATION,
} from "../lib/starcloud/catalog";
import { compare } from "../lib/starcloud/comparison";
import {
  acceptPrompt,
  assertPromptText,
  clientAddress,
  takeRateToken,
  reserveRequest,
} from "../lib/server/chat-guard";
import { runAnswer, availableProviders, providerKey } from "../lib/server/llm";
import { isChatSuccessBody } from "../lib/starcloud/chat-types";
import { POST } from "../app/api/chat/route";
const originalFetch = globalThis.fetch;
const envNames = [
  "GEMINI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "XAI_API_KEY",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "NODE_ENV",
  "VERCEL",
  "APP_ORIGIN",
  "CHAT_DAILY_LIMIT",
];
const env = Object.fromEntries(envNames.map((k) => [k, process.env[k]]));
test.beforeEach(() => {
  for (const k of envNames) delete process.env[k];
  Object.assign(process.env, {
    GEMINI_API_KEY: "test-secret",
    UPSTASH_REDIS_REST_URL: "https://limiter.upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "test-redis",
    NODE_ENV: "production",
  });
});
test.afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});
function req(
  body: unknown = { prompt: "Why is the sky blue?", provider: "gemini" },
  headers: Record<string, string> = {},
) {
  return new Request("https://example.test/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
function gemini() {
  return Response.json({
    candidates: [
      {
        content: {
          parts: [
            { text: "private thought", thought: true },
            { text: "Light scatters." },
          ],
        },
      },
    ],
    usageMetadata: {
      promptTokenCount: 24,
      candidatesTokenCount: 12,
      totalTokenCount: 40,
      cachedContentTokenCount: 4,
    },
  });
}
function mockProvider(
  fn: (url: string, init?: RequestInit) => Response | Promise<Response>,
) {
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("upstash.io")) return Response.json({ result: [1, 0] });
    return fn(url, init);
  };
}
test("geodesic distance handles the dateline, poles and antipodes", () => {
  expect(distanceKm({ lat: 0, lon: 179 }, { lat: 0, lon: -179 })).toBeCloseTo(
    222.39,
    1,
  );
  expect(distanceKm({ lat: 90, lon: 0 }, { lat: 90, lon: 180 })).toBeCloseTo(0);
  expect(distanceKm({ lat: 0, lon: 0 }, { lat: 0, lon: 180 })).toBeCloseTo(
    20015,
    0,
  );
});
test("pin and provider select the nearest published reference", () => {
  expect(nearestSite("gemini", { lat: 1.4, lon: 103.8 }).name).toBe(
    "Singapore",
  );
  expect(nearestSite("anthropic", { lat: -37.8, lon: 145 }).name).toBe(
    "Melbourne",
  );
  expect(nearestSite("openai", { lat: -34, lon: 151 }).name).toContain(
    "Australia",
  );
  expect(nearestSite("xai", { lat: 40.7, lon: -74 }).name).toContain("East");
});
test("matched workload energy and water have correct units and explicit assumptions", () => {
  const c = compare(
    "gemini",
    DEFAULT_LOCATION,
    nearestSite("gemini", DEFAULT_LOCATION),
    null,
    3600,
    1,
  );
  expect(c.ground.energyWh).toBe(1.09);
  expect(c.space.energyWh).toBe(1.04);
  expect(c.ground.waterMl).toEqual([1.09 * 0.5 * 0.2, 1.09 * 2 * 2]);
  expect(c.space.waterMl).toEqual([0, 0]);
  expect(c.ground.powerCostUsd).toBeCloseTo((1.09 / 1000) * 0.045, 12);
  expect(c.apiCostUsd).toBeNull();
});
test("orbital network is not universally faster than nearby ground", () => {
  const site = nearestSite("gemini", DEFAULT_LOCATION);
  const c = compare("gemini", site, site, null);
  expect(c.space.rttMs).toBeGreaterThan(c.ground.rttMs);
  expect(c.ground.rttMs).toBe(10);
});
test("rejects invalid energy and token assumptions", () => {
  for (const n of [NaN, Infinity, -1])
    expect(() =>
      compare(
        "gemini",
        DEFAULT_LOCATION,
        nearestSite("gemini", DEFAULT_LOCATION),
        null,
        n,
      ),
    ).toThrow();
  expect(() =>
    compare(
      "gemini",
      DEFAULT_LOCATION,
      nearestSite("gemini", DEFAULT_LOCATION),
      null,
      50,
      0,
    ),
  ).toThrow();
});
test("ordinary technical prompts and Unicode are allowed without brittle injection regexes", () => {
  expect(assertPromptText(" What is an API key? ")).toBe("What is an API key?");
  expect(assertPromptText("你好，解释一下卫星")).toContain("卫星");
  expect(() => assertPromptText("x".repeat(2001))).toThrow();
  expect(() => assertPromptText("hello\u0000")).toThrow();
});
test("local limiter enforces burst, interval and expiry", () => {
  for (let i = 0; i < 8; i++)
    expect(takeRateToken("unit-limits", 100000 + i * 3000).ok).toBe(true);
  expect(takeRateToken("unit-limits", 124000).ok).toBe(false);
  expect(takeRateToken("unit-limits", 800000).ok).toBe(true);
  expect(takeRateToken("unit-limits", 800001).ok).toBe(false);
});
test("untrusted forwarded addresses do not bypass local limits", () => {
  expect(clientAddress(req(undefined, { "x-forwarded-for": "1.2.3.4" }))).toBe(
    "shared",
  );
  process.env.VERCEL = "1";
  expect(clientAddress(req(undefined, { "x-forwarded-for": "1.2.3.4" }))).toBe(
    "1.2.3.4",
  );
  expect(clientAddress(req(undefined, { "x-forwarded-for": "spoof" }))).toBe(
    "shared",
  );
});
test("rejects cross-site browser requests before any provider call", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return gemini();
  };
  expect(
    (await POST(req(undefined, { origin: "https://evil.test" }))).status,
  ).toBe(403);
  expect(
    (await POST(req(undefined, { "sec-fetch-site": "cross-site" }))).status,
  ).toBe(403);
  expect(calls).toBe(0);
});
test("rejects arbitrary models, tools, provider names, malformed JSON and oversized bodies", async () => {
  for (const body of [
    { prompt: "hi", provider: "gemini", model: "expensive-model" },
    { prompt: "hi", provider: "gemini", tools: [] },
    { prompt: "hi", provider: "__proto__" },
    { prompt: 42, provider: "gemini" },
  ])
    expect((await POST(req(body))).status).toBe(400);
  expect(
    (await POST(req(undefined, { "Content-Type": "text/plain" }))).status,
  ).toBe(415);
  expect(
    (await POST(req(undefined, { "Content-Length": "12001" }))).status,
  ).toBe(413);
  expect(
    (await POST(req({ provider: "gemini", prompt: "x".repeat(14000) }))).status,
  ).toBe(413);
});
test("streamed oversized request is stopped without trusting Content-Length", async () => {
  const body = new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode("x".repeat(13000)));
      c.close();
    },
  });
  const request = new Request("https://example.test/api/chat", {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json" },
    duplex: "half",
  } as RequestInit);
  expect((await POST(request)).status).toBe(413);
});
test("production fails closed when persistent limits are missing or unavailable", async () => {
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  expect(availableProviders()).toEqual([]);
  expect((await POST(req())).status).toBe(503);
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-redis";
  globalThis.fetch = async () => {
    throw new Error("Redis secret internal failure");
  };
  const response = await POST(req());
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("secret");
});
test("Redis reservation is atomic, hashes the address and includes a global budget", async () => {
  process.env.VERCEL = "1";
  globalThis.fetch = async (url, init) => {
    expect(String(url)).toBe("https://limiter.upstash.io/");
    const body = JSON.parse(String(init?.body));
    expect(body[0]).toBe("EVAL");
    expect(body[2]).toBe(3);
    expect(body[5]).toContain("spacedata:daily:");
    expect(body[6]).toBe(200);
    expect(JSON.stringify(body)).not.toContain("1.2.3.4");
    return Response.json({ result: [1, 0] });
  };
  await reserveRequest(req(undefined, { "x-forwarded-for": "1.2.3.4" }));
});
test("Redis rate rejection never reaches Gemini and includes Retry-After", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ result: [0, 127] });
  };
  const r = await POST(req());
  expect(r.status).toBe(429);
  expect(r.headers.get("Retry-After")).toBe("127");
  expect(calls).toBe(1);
});
test("Gemini makes one capped request, keeps keys server-side and preserves all token usage", async () => {
  let calls = 0;
  mockProvider((url, init) => {
    calls++;
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    );
    expect(url).not.toContain("test-secret");
    expect(new Headers(init?.headers).get("x-goog-api-key")).toBe(
      "test-secret",
    );
    const b = JSON.parse(String(init?.body));
    expect(b.generationConfig).toEqual({
      maxOutputTokens: 512,
      thinkingConfig: { thinkingBudget: 0 },
    });
    expect(b.contents[0].parts[0].text).toBe("Why is the sky blue?");
    expect(b.tools).toBeUndefined();
    expect(init?.signal).toBeDefined();
    return gemini();
  });
  const r = await POST(req());
  expect(r.status).toBe(200);
  expect(r.headers.get("Cache-Control")).toBe("no-store");
  const body = await r.json();
  expect(isChatSuccessBody(body)).toBe(true);
  expect(body.answer.text).toBe("Light scatters.");
  expect(body.answer.totalTokens).toBe(40);
  expect(body.answer.usageEstimated).toBe(false);
  expect(body.answer.cachedTokens).toBe(4);
  expect(calls).toBe(1);
  const c = compare(
    "gemini",
    DEFAULT_LOCATION,
    nearestSite("gemini", DEFAULT_LOCATION),
    body,
  );
  expect(c.apiCostUsd).toBeCloseTo((20 * 0.3 + 4 * 0.03 + 16 * 2.5) / 1e6, 12);
});
test("Gemini alias works and primary key takes precedence", () => {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = "alias";
  expect(providerKey("gemini")).toBe("test-secret");
  delete process.env.GEMINI_API_KEY;
  expect(providerKey("gemini")).toBe("alias");
  expect(availableProviders()).toContain("gemini");
});
test("Gemini missing usage is explicitly estimated and never reported as measured", async () => {
  mockProvider(() =>
    Response.json({
      candidates: [{ content: { parts: [{ text: "An answer" }] } }],
    }),
  );
  const r = await runAnswer("gemini", "question");
  expect(r.answer.usageEstimated).toBe(true);
  expect(r.answer.totalTokens).toBeGreaterThan(0);
});
test("Gemini blocked or empty answer returns a safe error rather than a fake response", async () => {
  mockProvider(() =>
    Response.json({ promptFeedback: { blockReason: "SAFETY" } }),
  );
  expect((await POST(req())).status).toBe(502);
});
for (const status of [400, 401, 429, 500])
  test(`Gemini ${status} errors do not leak details or trigger paid retries`, async () => {
    let calls = 0;
    mockProvider(() => {
      calls++;
      return Response.json(
        { error: "private test-secret provider body" },
        { status },
      );
    });
    const r = await POST(req());
    expect(r.status).toBe(502);
    expect(await r.text()).not.toContain("test-secret");
    expect(calls).toBe(1);
  });
test("abort is propagated to the provider", async () => {
  const c = new AbortController();
  c.abort();
  mockProvider((_, init) => {
    expect(init?.signal?.aborted).toBe(true);
    throw new DOMException("aborted", "AbortError");
  });
  await expect(runAnswer("gemini", "hello", c.signal)).rejects.toThrow();
});
test("missing Gemini key cannot make a paid call", async () => {
  delete process.env.GEMINI_API_KEY;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return gemini();
  };
  expect((await POST(req())).status).toBe(503);
  expect(calls).toBe(0);
});
test("OpenAI, Anthropic and xAI adapters use fixed models and parse usage", async () => {
  for (const id of PROVIDER_IDS.filter((id) => id !== "gemini")) {
    process.env[PROVIDERS[id].key] = "adapter-key";
    mockProvider((_, init) => {
      const b = JSON.parse(String(init?.body));
      expect(b.model).toBe(PROVIDERS[id].model);
      expect(b.max_tokens ?? b.max_output_tokens).toBe(512);
      if (id === "openai") {
        expect(b.store).toBe(false);
        return Response.json({
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: "OpenAI answer" }],
            },
          ],
          usage: {
            input_tokens: 10,
            output_tokens: 20,
            total_tokens: 30,
            input_tokens_details: { cached_tokens: 2 },
          },
        });
      }
      if (id === "anthropic")
        return Response.json({
          content: [{ type: "text", text: "Claude answer" }],
          usage: {
            input_tokens: 8,
            output_tokens: 20,
            cache_read_input_tokens: 2,
          },
        });
      return Response.json({
        choices: [{ message: { content: "Grok answer" } }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      });
    });
    const r = await runAnswer(id, "test prompt");
    expect(isChatSuccessBody(r)).toBe(true);
    expect(r.answer.promptTokens).toBe(10);
    expect(r.answer.totalTokens).toBe(30);
  }
});
test("response validator rejects nonfinite usage, invalid cached counts and mismatched totals", async () => {
  mockProvider(() => gemini());
  const valid = await runAnswer("gemini", "hello");
  for (const change of [
    { totalTokens: Infinity },
    { cachedTokens: 500 },
    { completionTokens: -1 },
    { totalTokens: 1 },
  ])
    expect(
      isChatSuccessBody({ ...valid, answer: { ...valid.answer, ...change } }),
    ).toBe(false);
});
test("request schema permits only explicit provider and message fields", async () => {
  expect(await acceptPrompt(req())).toEqual({
    prompt: "Why is the sky blue?",
    provider: "gemini",
  });
});

test("the shell is a 53° Walker band spread around Earth, not one edge-on plane", async () => {
  const {
    orbitalNodes,
    laserClearsEarth,
    alongTrack,
    crossRight,
    NODE_COUNT,
    PLANE_COUNT,
    SATS_PER_PLANE,
    INCLINATION_DEG,
    ALTITUDE_KM,
    ORBIT_PERIOD_MS,
  } = await import("../lib/starcloud/network");
  expect(NODE_COUNT).toBe(PLANE_COUNT * SATS_PER_PLANE);
  for (const at of [0, ORBIT_PERIOD_MS * 0.25, Date.UTC(2026, 8, 25)]) {
    const nodes = orbitalNodes(at);
    expect(nodes).toHaveLength(NODE_COUNT);
    const cells = new Map<string, number>();
    let xx = 0,
      yy = 0,
      zz = 0,
      xy = 0,
      xz = 0,
      yz = 0;
    const camLat = (8 * Math.PI) / 180,
      camLon = (-91 * Math.PI) / 180;
    const cam = [
      Math.cos(camLat) * Math.sin(camLon),
      Math.sin(camLat),
      Math.cos(camLat) * Math.cos(camLon),
    ];
    const norm = (v: number[]) => {
      const l = Math.hypot(v[0], v[1], v[2]);
      return v.map((n) => n / l);
    };
    const cross = (a: number[], b: number[]) => [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
    const right = norm(cross([0, 1, 0], cam));
    const screenUp = norm(cross(cam, right));
    let h2 = 0,
      v2 = 0,
      hx = 0,
      hy = 0;
    for (let i = 0; i < NODE_COUNT; i++) {
      const n = nodes[i];
      expect(Math.abs(n.lat)).toBeLessThanOrEqual(INCLINATION_DEG + 0.25);
      expect(n.altKm).toBeGreaterThan(ALTITUDE_KM - 6);
      expect(n.altKm).toBeLessThan(ALTITUDE_KM + 6);
      expect(laserClearsEarth(n, nodes[alongTrack[i]])).toBe(true);
      expect(laserClearsEarth(n, nodes[crossRight[i]])).toBe(true);
      const key = `${Math.round(n.lat)}:${Math.round(n.lon)}`;
      cells.set(key, (cells.get(key) ?? 0) + 1);
      const lat = (n.lat * Math.PI) / 180,
        lon = (n.lon * Math.PI) / 180;
      const x = Math.cos(lat) * Math.sin(lon),
        y = Math.sin(lat),
        z = Math.cos(lat) * Math.cos(lon);
      xx += x * x;
      yy += y * y;
      zz += z * z;
      xy += x * y;
      xz += x * z;
      yz += y * z;
      const sx = x * right[0] + y * right[1] + z * right[2];
      const sy = x * screenUp[0] + y * screenUp[1] + z * screenUp[2];
      hx += sx;
      hy += sy;
      h2 += sx * sx;
      v2 += sy * sy;
    }
    expect(Math.max(...cells.values())).toBeLessThanOrEqual(3);
    const n = NODE_COUNT;
    xx /= n;
    yy /= n;
    zz /= n;
    xy /= n;
    xz /= n;
    yz /= n;
    // A single plane through the origin collapses one axis. The shell keeps
    // spread on every axis, including the default camera's horizontal.
    expect(xx).toBeGreaterThan(0.2);
    expect(yy).toBeGreaterThan(0.2);
    expect(zz).toBeGreaterThan(0.2);
    expect(Math.abs(xy) + Math.abs(xz) + Math.abs(yz)).toBeLessThan(0.05);
    const horizontal = Math.sqrt(h2 / n - (hx / n) ** 2);
    const vertical = Math.sqrt(v2 / n - (hy / n) ** 2);
    expect(horizontal).toBeGreaterThan(0.4);
    expect(horizontal).toBeGreaterThan(vertical * 0.7);
  }
});
test("orbital routes use four line-of-sight laser hops and the same RTT as the comparison", async () => {
  const { routeAt, alongTrack, crossRight, laserClearsEarth, elevationDeg } =
    await import("../lib/starcloud/network");
  for (const origin of [
    { lat: 42.36, lon: -71.06 },
    { lat: 34.05, lon: -118.24 },
    { lat: 40.7, lon: -74 },
    { lat: -33.9, lon: 151.2 },
    { lat: 89.9, lon: 179.9 },
    { lat: 0, lon: -179.9 },
  ]) {
    const at = 1234567,
      r = routeAt(origin, at);
    expect(r.hops).toHaveLength(5);
    expect(r.hops[0]).toBe(r.ingress);
    expect(r.hops[4]).toBe(r.compute);
    for (let i = 1; i < 5; i++) {
      const prev = r.hops[i - 1],
        next = r.hops[i];
      expect(alongTrack[prev] === next || crossRight[prev] === next).toBe(
        true,
      );
      expect(laserClearsEarth(r.nodes[prev], r.nodes[next])).toBe(true);
    }
    if (Math.abs(origin.lat) < 60)
      expect(elevationDeg(origin, r.nodes[r.ingress])).toBeGreaterThanOrEqual(
        25,
      );
    expect(r.gatewayKm).toBeGreaterThanOrEqual(0);
    expect(r.laserKm).toBeGreaterThan(0);
    expect(
      compare(
        "gemini",
        origin,
        nearestSite("gemini", origin),
        null,
        256,
        1.11,
        at,
      ).space.rttMs,
    ).toBe(r.rttMs);
  }
});
test("orbital motion is periodic and moves slowly between frames", async () => {
  const { orbitalNodes, ORBIT_PERIOD_MS } =
    await import("../lib/starcloud/network");
  const a = orbitalNodes(1000),
    b = orbitalNodes(1000 + ORBIT_PERIOD_MS),
    c = orbitalNodes(1016);
  expect(distanceKm(a[0], b[0])).toBeLessThan(0.000001);
  expect(distanceKm(a[0], c[0])).toBeLessThan(0.2);
  expect(distanceKm(a[0], c[0])).toBeGreaterThan(0);
});
