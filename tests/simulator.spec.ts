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
  "Gemini_api_Key",
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
test("a configured Gemini key answers without Redis, and a Redis outage still fails closed", async () => {
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  expect(availableProviders()).toContain("gemini");
  mockProvider(() => gemini());
  const ok = await POST(req());
  expect(ok.status).toBe(200);
  expect((await ok.json()).answer.text).toBe("Light scatters.");
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
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
    );
    expect(url).not.toContain("test-secret");
    expect(new Headers(init?.headers).get("x-goog-api-key")).toBe(
      "test-secret",
    );
    const b = JSON.parse(String(init?.body));
    expect(b.generationConfig).toEqual({ maxOutputTokens: 512 });
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
  process.env.Gemini_api_Key = "cased-key";
  expect(providerKey("gemini")).toBe("test-secret");
  delete process.env.GEMINI_API_KEY;
  expect(providerKey("gemini")).toBe("cased-key");
  delete process.env.Gemini_api_Key;
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
