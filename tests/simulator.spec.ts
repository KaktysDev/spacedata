import { test, expect } from "@playwright/test";
import {
  distanceKm,
  nearestSite,
  PROVIDERS,
  PROVIDER_IDS,
  DEFAULT_LOCATION,
} from "../lib/starcloud/catalog";
import { compare } from "../lib/starcloud/comparison";
import { imageForSite } from "../lib/starcloud/site-images";
import {
  acceptPrompt,
  assertBrowserBotSignals,
  assertPromptText,
  ChatRequestError,
  clientAddress,
  enforceChatQuota,
  resetChatGuardStateForTests,
  sessionFingerprint,
  takeRateToken,
  reserveRequest,
} from "../lib/server/chat-guard";
import {
  runAnswer,
  availableProviders,
  providerKey,
  resetGeminiModelCacheForTests,
} from "../lib/server/llm";
import { isChatSuccessBody } from "../lib/starcloud/chat-types";
import { POST } from "../app/api/chat/route";
import { GET as providerStatus } from "../app/api/providers/route";
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
const browserHeaders = {
  "Content-Type": "application/json",
  Origin: "https://example.test",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  "Sec-Fetch-Site": "same-origin",
};
test.beforeEach(() => {
  resetGeminiModelCacheForTests();
  resetChatGuardStateForTests();
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
  resetChatGuardStateForTests();
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
    headers: { ...browserHeaders, ...headers },
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
test("results photos follow the modeled site and label regional fallbacks", () => {
  const chile = imageForSite("gemini", nearestSite("gemini", { lat: -33.4, lon: -70.7 }));
  const hamina = imageForSite("gemini", nearestSite("gemini", { lat: 60.6, lon: 27.2 }));
  const virginia = imageForSite("gemini", nearestSite("gemini", DEFAULT_LOCATION));
  expect(chile.caption).toContain("Quilicura");
  expect(chile.siteSpecific).toBe(true);
  expect(hamina.caption).toContain("Hamina");
  expect(hamina.url).not.toBe(chile.url);
  expect(virginia.siteSpecific).toBe(false);
  expect(virginia.regionSpecific).toBe(true);
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
  expect(c.space.energyWh).toBeCloseTo((2808 * 1 * 1.04) / 3600, 10);
  expect(c.ground.waterMl).toBeCloseTo(1.09 * 1.1, 10);
  expect(c.space.waterMl).toBe(0);
  expect(c.ground.powerCostUsd).toBeCloseTo((1.09 / 1000) * 0.045, 12);
  expect(c.apiCostUsd).toBeNull();
});
test("orbital network is not universally faster than nearby ground", () => {
  const site = nearestSite("gemini", DEFAULT_LOCATION);
  const c = compare("gemini", site, site, null);
  expect(c.space.rttMs).toBeGreaterThan(c.ground.rttMs);
  expect(c.ground.rttMs).toBe(0);
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
    (await POST(req(undefined, { Origin: "https://evil.test" }))).status,
  ).toBe(403);
  expect(
    (await POST(req(undefined, { "Sec-Fetch-Site": "cross-site" }))).status,
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
    headers: { ...browserHeaders },
    duplex: "half",
  } as RequestInit);
  expect((await POST(request)).status).toBe(413);
});
test("bot signals reject missing UA, scripted UA and empty browser origin", () => {
  expect(() =>
    assertBrowserBotSignals(
      req(undefined, { "User-Agent": "", Origin: "https://example.test" }),
    ),
  ).toThrow();
  expect(() =>
    assertBrowserBotSignals(
      req(undefined, {
        "User-Agent": "curl/8.0.0",
        Origin: "https://example.test",
      }),
    ),
  ).toThrow();
  expect(() =>
    assertBrowserBotSignals(
      new Request("https://example.test/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": browserHeaders["User-Agent"],
        },
      }),
    ),
  ).toThrow();
  expect(() => assertBrowserBotSignals(req())).not.toThrow();
});
test("session fingerprint is UA+lang only and ignores client sd_sid cookies", () => {
  const withCookie = sessionFingerprint(
    req(undefined, { Cookie: "sd_sid=abcdefghijklmnopqrstuvwxyz012345" }),
  );
  const plain = sessionFingerprint(req());
  expect(withCookie).toBe(plain);
  expect(plain.startsWith("fp:")).toBe(true);
  expect(plain).not.toContain("sid:");
});

test("forged Mozilla UA + Origin + Sec-Fetch-Site still passes soft bot check (headers are not auth)", () => {
  // Residual risk: scripted clients can spoof browser signals and reach commit.
  expect(() =>
    assertBrowserBotSignals(
      req(undefined, {
        "User-Agent":
          "Mozilla/5.0 (compatible; ForgedBot/1.0) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        Origin: "https://example.test",
        "Sec-Fetch-Site": "same-origin",
      }),
    ),
  ).not.toThrow();
});

test("curl floods that fail the browser check do not consume noteAttempt budget", async () => {
  let redisCalls = 0;
  globalThis.fetch = async () => {
    redisCalls++;
    return Response.json({ result: [1, 0] });
  };
  for (let i = 0; i < 20; i++) {
    const r = await POST(
      req(undefined, {
        "User-Agent": "curl/8.0.0",
        Origin: "https://example.test",
      }),
    );
    expect(r.status).toBe(429);
  }
  expect(redisCalls).toBe(0);
  mockProvider(() => gemini());
  const ok = await POST(req());
  expect(ok.status).toBe(200);
});

test("session cooldown failure does not call Redis", async () => {
  let redisCalls = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("upstash.io")) {
      redisCalls++;
      return Response.json({ result: [1, 0] });
    }
    return gemini();
  };
  const g1 = await enforceChatQuota(req());
  await g1.commit(2);
  g1.release();
  expect(redisCalls).toBe(1);
  const g2 = await enforceChatQuota(
    req({ prompt: "A different follow-up about orbits?", provider: "gemini" }),
  );
  await expect(g2.commit(2)).rejects.toBeInstanceOf(ChatRequestError);
  g2.release();
  expect(redisCalls).toBe(1);
});
test("enforceChatQuota caps concurrent in-flight requests per identity", async () => {
  mockProvider(() => gemini());
  const grant = await enforceChatQuota(req());
  await grant.commit();
  let blocked: unknown;
  try {
    await enforceChatQuota(
      req({ prompt: "Another question about orbits?", provider: "gemini" }),
    );
  } catch (e) {
    blocked = e;
  }
  expect(blocked).toBeInstanceOf(ChatRequestError);
  expect((blocked as ChatRequestError).status).toBe(429);
  expect((blocked as ChatRequestError).message).toMatch(/already in progress/i);
  expect((blocked as ChatRequestError).retryAfterSec).toBeTruthy();
  grant.release();
});
test("identical prompt spam is rejected with Retry-After before the model", async () => {
  let providerCalls = 0;
  mockProvider(() => {
    providerCalls++;
    return gemini();
  });
  const body = {
    prompt: "Identical spam message number one",
    provider: "gemini" as const,
  };
  const g1 = await enforceChatQuota(req(body));
  await g1.commit();
  g1.release();
  // Second pass notes the duplicate then fails the 3s cooldown — still counts.
  const g2 = await enforceChatQuota(req(body));
  await expect(g2.commit()).rejects.toBeInstanceOf(ChatRequestError);
  g2.release();
  providerCalls = 0;
  mockProvider(() => {
    providerCalls++;
    return gemini();
  });
  let blocked: unknown;
  try {
    await enforceChatQuota(req(body));
  } catch (e) {
    blocked = e;
  }
  expect(blocked).toBeInstanceOf(ChatRequestError);
  expect((blocked as ChatRequestError).status).toBe(429);
  expect((blocked as ChatRequestError).message).toMatch(/identical/i);
  expect((blocked as ChatRequestError).retryAfterSec).toBeTruthy();
  expect(providerCalls).toBe(0);
});
test("POST surfaces 429 JSON and Retry-After for scripted clients", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return gemini();
  };
  const r = await POST(
    req(undefined, {
      "User-Agent": "python-requests/2.31.0",
      Origin: "https://example.test",
    }),
  );
  expect(r.status).toBe(429);
  expect(r.headers.get("Retry-After")).toBeTruthy();
  expect((await r.json()).error).toMatch(/automated/i);
  expect(calls).toBe(0);
});
test("a configured Gemini key answers without Redis, and a Redis outage still fails closed", async () => {
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  expect(availableProviders()).toContain("gemini");
  mockProvider(() => gemini());
  const ok = await POST(req());
  expect(ok.status).toBe(200);
  const okBody = await ok.json();
  expect(okBody.ground.text).toBe("Light scatters.");
  expect(okBody.space.text).toBe("Light scatters.");
  // The successful turn above spends the in-memory cooldown. Clear it so the
  // next request reaches Redis and can fail closed on an outage.
  resetChatGuardStateForTests();
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-redis";
  globalThis.fetch = async () => {
    throw new Error("Redis secret internal failure");
  };
  const response = await POST(req());
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("secret");
});
test("Redis reservation is atomic, hashes the address and charges 2 provider calls", async () => {
  process.env.VERCEL = "1";
  globalThis.fetch = async (url, init) => {
    expect(String(url)).toBe("https://limiter.upstash.io/");
    const body = JSON.parse(String(init?.body));
    expect(body[0]).toBe("EVAL");
    expect(body[2]).toBe(3);
    expect(body[5]).toContain("spacedata:daily:");
    expect(body[6]).toBe(200);
    expect(body[7]).toBe(2);
    expect(String(body[1])).toContain("INCRBY");
    expect(JSON.stringify(body)).not.toContain("1.2.3.4");
    return Response.json({ result: [1, 0] });
  };
  await reserveRequest(req(undefined, { "x-forwarded-for": "1.2.3.4" }), 2);
});

test("daily budget accounts for 2 provider calls per committed turn", async () => {
  process.env.CHAT_DAILY_LIMIT = "2";
  let redisEvals = 0;
  const costs: number[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("upstash.io")) {
      redisEvals++;
      const body = JSON.parse(String(init?.body));
      costs.push(body[7]);
      // First commit spends 2; second would exceed limit of 2.
      if (redisEvals === 1) return Response.json({ result: [1, 0] });
      return Response.json({ result: [0, 86400] });
    }
    return gemini();
  };
  const g1 = await enforceChatQuota(req());
  await g1.commit(2);
  g1.release();
  expect(costs).toEqual([2]);
  resetChatGuardStateForTests();
  const g2 = await enforceChatQuota(
    req({ prompt: "Second turn after daily spend?", provider: "gemini" }),
  );
  await expect(g2.commit(2)).rejects.toMatchObject({ status: 429 });
  g2.release();
  expect(costs).toEqual([2, 2]);
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
test("Gemini makes two capped requests (ground + space), keeps keys server-side and preserves token usage", async () => {
  let calls = 0;
  const maxTokens: number[] = [];
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
    maxTokens.push(b.generationConfig.maxOutputTokens);
    expect(b.generationConfig.thinkingConfig).toEqual({ thinkingLevel: "low" });
    expect(b.contents[0].parts[0].text).toBe("Why is the sky blue?");
    expect(b.systemInstruction.parts[0].text).toContain("Answer the user's message directly");
    expect(b.systemInstruction.parts[0].text).not.toMatch(/You are answering from|orbital uplink active|Write the way/i);
    expect(b.tools).toBeUndefined();
    expect(init?.signal).toBeDefined();
    return gemini();
  });
  const r = await POST(req());
  expect(r.status).toBe(200);
  expect(r.headers.get("Cache-Control")).toBe("no-store");
  const body = await r.json();
  expect(isChatSuccessBody(body)).toBe(true);
  expect(body.ground.text).toBe("Light scatters.");
  expect(body.space.text).toBe("Light scatters.");
  expect(body.ground.totalTokens).toBe(40);
  expect(body.space.totalTokens).toBe(40);
  expect(body.ground.usageEstimated).toBe(false);
  expect(calls).toBe(2);
  expect(maxTokens).toEqual([4096, 4096]);
  const c = compare(
    "gemini",
    DEFAULT_LOCATION,
    nearestSite("gemini", DEFAULT_LOCATION),
    body,
  );
  expect(c.apiCostUsd).toBeCloseTo(
    (2 * (20 * 0.3 + 4 * 0.03 + 16 * 2.5)) / 1e6,
    12,
  );
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
test("GEMINI_API_KEY alone is enough and is mirrored for the Google SDK name", () => {
  delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  delete process.env.Gemini_api_Key;
  process.env.GEMINI_API_KEY = '"test-secret"';
  expect(providerKey("gemini")).toBe("test-secret");
  expect(process.env.GOOGLE_GENERATIVE_AI_API_KEY).toBe("test-secret");
  expect(availableProviders()).toEqual(["gemini"]);
});
test("provider status reports Gemini configured without returning the key", async () => {
  const r = providerStatus(
    new Request("https://example.test/api/providers"),
  );
  expect(r.headers.get("Cache-Control")).toBe("no-store");
  const body = await r.json();
  expect(body).toEqual({
    providers: [
      { id: "gemini", configured: true },
      { id: "openai", configured: false },
      { id: "anthropic", configured: false },
      { id: "xai", configured: false },
    ],
  });
  expect(JSON.stringify(body)).not.toContain("test-secret");
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  delete process.env.Gemini_api_Key;
  const missing = await providerStatus(
    new Request("https://example.test/api/providers"),
  ).json();
  expect(missing.providers.find((p: { id: string }) => p.id === "gemini")).toEqual({
    id: "gemini",
    configured: false,
  });
});
test("a 404 on gemini-3.8-flash falls forward instead of reporting the model unavailable", async () => {
  const urls: string[] = [];
  mockProvider((url) => {
    urls.push(String(url));
    if (String(url).includes("gemini-3.8-flash"))
      return Response.json(
        {
          error: {
            message:
              "models/gemini-3.8-flash is not available. Please update your code to use models/gemini-3.6-flash.",
          },
        },
        { status: 404 },
      );
    return gemini();
  });
  const r = await POST(req());
  expect(r.status).toBe(200);
  const body = await r.json();
  expect(body.error).toBeUndefined();
  expect(body.model).toBe("gemini-3.6-flash");
  expect(urls.some((url) => url.includes("gemini-3.8-flash"))).toBe(true);
  expect(urls.some((url) => url.includes("gemini-3.6-flash"))).toBe(true);
  expect(JSON.stringify(body)).not.toMatch(/unavailable/i);
});
test("a 429 on gemini-3.8-flash falls through instead of saying the provider is busy", async () => {
  const urls: string[] = [];
  mockProvider((url) => {
    urls.push(String(url));
    if (String(url).includes("gemini-3.8-flash"))
      return Response.json(
        { error: { status: "RESOURCE_EXHAUSTED", message: "overloaded" } },
        { status: 429 },
      );
    return gemini();
  });
  const r = await POST(req());
  expect(r.status).toBe(200);
  const body = await r.json();
  expect(body.model).toBe("gemini-2.5-flash");
  expect(JSON.stringify(body)).not.toMatch(/busy/i);
  expect(urls.some((url) => url.includes("gemini-2.5-flash"))).toBe(true);
});
test("every Gemini model returning 429 is the busy message", async () => {
  let calls = 0;
  mockProvider(() => {
    calls++;
    return Response.json({ error: { message: "quota" } }, { status: 429 });
  });
  const busy = await POST(req());
  expect(busy.status).toBe(503);
  const busyText = await busy.text();
  expect(busyText).toContain("The AI provider is busy");
  expect(busyText).not.toContain("test-secret");
  expect(calls).toBeGreaterThan(2);
});
test("an invalid Gemini key is rejected and is not described as busy", async () => {
  let calls = 0;
  mockProvider(() => {
    calls++;
    return Response.json(
      { error: { message: "API key not valid" } },
      { status: 400 },
    );
  });
  const rejected = await POST(
    req({ prompt: "How does a ring orbit look?", provider: "gemini" }),
  );
  expect(rejected.status).toBe(502);
  const rejectedText = await rejected.text();
  expect(rejectedText).not.toMatch(/busy/i);
  expect(rejectedText).toContain("rejected");
  expect(calls).toBe(2);
});
test("Gemini missing usage is explicitly estimated and never reported as measured", async () => {
  mockProvider(() =>
    Response.json({
      candidates: [{ content: { parts: [{ text: "An answer" }] } }],
    }),
  );
  const r = await runAnswer("gemini", "question");
  expect(r.ground.usageEstimated).toBe(true);
  expect(r.space.usageEstimated).toBe(true);
  expect(r.ground.totalTokens).toBeGreaterThan(0);
});
test("Gemini blocked or empty answer returns a safe error rather than a fake response", async () => {
  mockProvider(() =>
    Response.json({ promptFeedback: { blockReason: "SAFETY" } }),
  );
  expect((await POST(req())).status).toBe(422);
  expect(await (await POST(req())).text()).not.toContain("SAFETY");
});
for (const [status, expected] of [
  [400, 502],
  [401, 503],
  [500, 503],
] as const)
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
    expect(r.status).toBe(expected);
    expect(await r.text()).not.toContain("test-secret");
    expect(calls).toBe(2);
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
test("chat accepts a listed model when only the Gemini key is set", async () => {
  mockProvider((url) => {
    expect(String(url)).toContain("generativelanguage.googleapis.com");
    return gemini();
  });
  const response = await POST(
    req({ prompt: "Why is the sky blue?", provider: "anthropic" }),
  );
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.provider).toBe("anthropic");
  expect(body.model).toBe(PROVIDERS.anthropic.model);
  expect(body.ground.text).toBe("Light scatters.");
  expect(JSON.stringify(body)).not.toMatch(
    /not connected|substitut|mimic|powered by|gemini-3/i,
  );
});
test("a listed model without its own key still answers", async () => {
  for (const [id, phrase] of [
    ["anthropic", "Claude"],
    ["openai", "GPT"],
    ["xai", "Grok"],
  ] as const) {
    const systems: string[] = [];
    mockProvider((url, init) => {
      expect(String(url)).toContain("generativelanguage.googleapis.com");
      expect(String(url)).not.toContain("api.openai.com");
      expect(String(url)).not.toContain("api.anthropic.com");
      expect(String(url)).not.toContain("api.x.ai");
      const body = JSON.parse(String(init?.body));
      systems.push(body.systemInstruction.parts[0].text);
      return gemini();
    });
    const result = await runAnswer(id, "Why is the sky blue?");
    expect(result.provider).toBe(id);
    expect(result.model).toBe(PROVIDERS[id].model);
    expect(result.ground.text).toBe("Light scatters.");
    expect(result.space.text).toBe("Light scatters.");
    expect(systems[0]).toContain(`Write the way ${phrase}`);
    expect(systems[0]).not.toMatch(/substitut|mimic|powered by|style mimic/i);
    expect(JSON.stringify(result)).not.toMatch(
      /gemini-3|generativelanguage|substitut|mimic|powered by/i,
    );
  }
});
test("mechanism phrasing is left out of the reply", async () => {
  mockProvider(() =>
    Response.json({
      candidates: [
        {
          content: {
            parts: [
              {
                text: "Sure. Powered by Gemini, here is the answer. The sky looks blue.",
              },
            ],
          },
        },
      ],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 8,
        totalTokenCount: 18,
      },
    }),
  );
  const result = await runAnswer("xai", "why blue");
  expect(result.ground.text).toBe("Sure. The sky looks blue.");
  expect(result.ground.text).not.toMatch(/gemini|powered by/i);
  expect(result.space.text).toBe("Sure. The sky looks blue.");
});
test("a model with no callable key does not spend a request", async () => {
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  delete process.env.Gemini_api_Key;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return gemini();
  };
  const response = await POST(
    req({ prompt: "Hello there", provider: "openai" }),
  );
  expect(response.status).toBe(503);
  const text = await response.text();
  expect(text).not.toMatch(/connected|gemini|substitut|mimic/i);
  expect(calls).toBe(0);
});
test("OpenAI, Anthropic and xAI adapters use fixed models and parse usage", async () => {
  for (const id of PROVIDER_IDS.filter((id) => id !== "gemini")) {
    process.env[PROVIDERS[id].key] = "adapter-key";
    mockProvider((_, init) => {
      const b = JSON.parse(String(init?.body));
      expect(b.model).toBe(PROVIDERS[id].model);
      expect(b.max_tokens ?? b.max_output_tokens).toBe(4096);
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
    expect(r.ground.promptTokens).toBe(10);
    expect(r.ground.totalTokens).toBe(30);
    expect(r.space.totalTokens).toBe(30);
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
      isChatSuccessBody({
        ...valid,
        ground: { ...valid.ground, ...change },
      }),
    ).toBe(false);
});
test("request schema permits only explicit provider and message fields", async () => {
  expect(await acceptPrompt(req())).toEqual({
    prompt: "Why is the sky blue?",
    provider: "gemini",
  });
});

const forgedBrowser = {
  "User-Agent":
    "Mozilla/5.0 (compatible; ForgedBot/1.0) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  Origin: "https://example.test",
  "Sec-Fetch-Site": "same-origin",
};

/** Byte source that only fills a BYOB view, otherwise enqueues 1 MiB. */
function bombStream() {
  let pulled = 0;
  const stream = new ReadableStream({
    type: "bytes",
    pull(controller) {
      const byob = controller.byobRequest;
      if (byob?.view && byob.view.byteLength > 0) {
        const n = byob.view.byteLength;
        pulled += n;
        new Uint8Array(
          byob.view.buffer,
          byob.view.byteOffset,
          byob.view.byteLength,
        ).fill(0x78);
        byob.respond(n);
        return;
      }
      const n = 1024 * 1024;
      pulled += n;
      controller.enqueue(new Uint8Array(n));
    },
  });
  return { stream, pulled: () => pulled };
}

function postStream(
  stream: ReadableStream,
  headers: Record<string, string> = {},
) {
  return new Request("https://example.test/api/chat", {
    method: "POST",
    headers: { ...browserHeaders, ...headers },
    body: stream,
    duplex: "half",
  } as RequestInit);
}

test("oversized bodies are rejected before they are parsed or spent", async () => {
  let redisCalls = 0;
  let providerCalls = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("upstash.io")) {
      redisCalls++;
      return Response.json({ result: [1, 0] });
    }
    providerCalls++;
    return gemini();
  };

  const justOver = await POST(
    new Request("https://example.test/api/chat", {
      method: "POST",
      headers: browserHeaders,
      body: "x".repeat(12_001),
    }),
  );
  expect(justOver.status).toBe(413);
  expect((await justOver.json()).error).toBe("Request too large.");

  const atCap = await POST(
    new Request("https://example.test/api/chat", {
      method: "POST",
      headers: browserHeaders,
      body: "x".repeat(12_000),
    }),
  );
  expect(atCap.status).toBe(400);

  const multiMeg = await POST(
    new Request("https://example.test/api/chat", {
      method: "POST",
      headers: browserHeaders,
      body: "x".repeat(2_000_000),
    }),
  );
  expect(multiMeg.status).toBe(413);
  expect((await multiMeg.json()).error).toBe("Request too large.");

  const bomb = bombStream();
  const missingLength = await POST(postStream(bomb.stream));
  expect(missingLength.status).toBe(413);
  expect(bomb.pulled()).toBeLessThanOrEqual(12_001);

  const lied = bombStream();
  const liedLength = await POST(
    postStream(lied.stream, { "Content-Length": "10" }),
  );
  expect(liedLength.status).toBe(413);
  expect(lied.pulled()).toBeLessThanOrEqual(12_001);

  const declared = bombStream();
  const declaredHuge = await POST(
    postStream(declared.stream, { "Content-Length": "12001" }),
  );
  expect(declaredHuge.status).toBe(413);
  expect(declared.pulled()).toBe(0);

  const weird = bombStream();
  const weirdLength = await POST(
    postStream(weird.stream, { "Content-Length": "12_001" }),
  );
  expect(weirdLength.status).toBe(413);
  expect(weird.pulled()).toBe(0);

  const scientific = bombStream();
  const scientificLength = await POST(
    postStream(scientific.stream, { "Content-Length": "1e7" }),
  );
  expect(scientificLength.status).toBe(413);
  expect(scientific.pulled()).toBe(0);

  expect(redisCalls).toBe(0);
  expect(providerCalls).toBe(0);
});

test("a chunked multi-megabyte node stream stops at the body cap", async () => {
  const { Readable } = await import("node:stream");
  let pushed = 0;
  const node = new Readable({
    highWaterMark: 64 * 1024,
    read(size) {
      if (pushed >= 2_000_000) {
        this.push(null);
        return;
      }
      const n = Math.min(size || 64 * 1024, 64 * 1024);
      pushed += n;
      this.push(Buffer.alloc(n, 0x78));
    },
  });
  const response = await POST(
    new Request("https://example.test/api/chat", {
      method: "POST",
      headers: browserHeaders,
      body: node,
      duplex: "half",
    } as unknown as RequestInit),
  );
  expect(response.status).toBe(413);
  const afterReject = pushed;
  await new Promise((r) => setTimeout(r, 40));
  expect(pushed).toBe(afterReject);
  expect(pushed).toBeLessThan(128 * 1024);
});

test("a slow streamed body hits the 5s deadline without calling providers", async () => {
  test.setTimeout(15_000);
  let providerCalls = 0;
  let redisCalls = 0;
  globalThis.fetch = async (input) => {
    if (String(input).includes("upstash.io")) {
      redisCalls++;
      return Response.json({ result: [1, 0] });
    }
    providerCalls++;
    return gemini();
  };
  let stop: (() => void) | undefined;
  const stream = new ReadableStream({
    type: "bytes",
    pull() {
      return new Promise((resolve) => {
        const timer = setTimeout(resolve, 8_000);
        stop = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    },
    cancel() {
      stop?.();
    },
  });
  const started = Date.now();
  const response = await POST(postStream(stream));
  expect(Date.now() - started).toBeLessThan(7_500);
  expect(response.status).toBe(408);
  expect((await response.json()).error).toMatch(/timed out/i);
  expect(providerCalls).toBe(0);
  expect(redisCalls).toBe(0);
});

test("hidden, nested, array, and oversized-unicode prompts never reach the model", async () => {
  let providerCalls = 0;
  let redisCalls = 0;
  const seen: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("upstash.io")) {
      redisCalls++;
      return Response.json({ result: [1, 0] });
    }
    providerCalls++;
    seen.push(String(init?.body));
    return gemini();
  };

  const hidden = "Z".repeat(1800);
  const extra = await POST(
    req({
      prompt: "How do I reverse a string in Python?",
      provider: "gemini",
      note: hidden,
      messages: [{ role: "user", content: hidden }],
      context: { prompt: hidden },
    }),
  );
  expect(extra.status).toBe(400);

  expect((await POST(req([{ prompt: hidden, provider: "gemini" }]))).status).toBe(
    400,
  );
  expect(
    (await POST(req({ prompt: [hidden, hidden], provider: "gemini" }))).status,
  ).toBe(400);
  expect(
    (
      await POST(
        req({ data: { prompt: hidden, provider: "gemini" } }),
      )
    ).status,
  ).toBe(400);
  expect((await POST(req("not-json-object"))).status).toBe(400);
  expect((await POST(req(null))).status).toBe(400);

  const tooLong = await POST(
    req({ prompt: "A".repeat(2001), provider: "gemini" }),
  );
  expect(tooLong.status).toBe(413);
  expect((await tooLong.json()).error).toMatch(/2,000/);

  const emoji = await POST(
    req({ prompt: "A" + "😀".repeat(1001), provider: "gemini" }),
  );
  expect(emoji.status).toBe(413);

  const astral = "Q" + String.fromCodePoint(0x10ffff).repeat(1000);
  expect(astral.length).toBeGreaterThan(2000);
  expect(
    (await POST(req({ prompt: astral, provider: "gemini" }))).status,
  ).toBe(413);

  expect(
    (await POST(req({ prompt: "hello\u0000world", provider: "gemini" }))).status,
  ).toBe(400);

  const escaped = `{"prompt":"${"\\u0041".repeat(2100)}","provider":"gemini"}`;
  expect(Buffer.byteLength(escaped)).toBeGreaterThan(12_000);
  const escapedRes = await POST(
    new Request("https://example.test/api/chat", {
      method: "POST",
      headers: browserHeaders,
      body: escaped,
    }),
  );
  expect(escapedRes.status).toBe(413);
  expect((await escapedRes.json()).error).toBe("Request too large.");

  expect(providerCalls).toBe(0);
  expect(redisCalls).toBe(0);
  expect(seen.join("")).not.toContain(hidden);
});

test("a parallel burst cannot exceed one in-flight turn or the cooldown", async () => {
  let redisCalls = 0;
  let providerCalls = 0;
  let releaseHold = () => {};
  const hold = new Promise<void>((resolve) => {
    releaseHold = resolve;
  });
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("upstash.io")) {
      redisCalls++;
      return Response.json({ result: [1, 0] });
    }
    providerCalls++;
    await hold;
    return gemini();
  };

  try {
    const pending = Array.from({ length: 8 }, (_, i) =>
      POST(
        req({
          prompt: `Explain orbital latency case ${i} briefly`,
          provider: "gemini",
        }),
      ),
    );
    const started = Date.now();
    while (providerCalls < 2 && Date.now() - started < 2_000)
      await new Promise((r) => setTimeout(r, 10));
    expect(providerCalls).toBe(2);
    expect(redisCalls).toBe(1);
    releaseHold();
    const responses = await Promise.all(pending);
    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 429)).toHaveLength(7);

    const follow = await POST(
      req({
        prompt: "A later question about fiber RTT?",
        provider: "gemini",
      }),
    );
    expect(follow.status).toBe(429);
    expect(redisCalls).toBe(1);
    expect(providerCalls).toBe(2);
  } finally {
    releaseHold();
  }
});

test("identical prompts are limited and near-duplicates are not collapsed", async () => {
  let redisCalls = 0;
  let providerCalls = 0;
  globalThis.fetch = async (input) => {
    if (String(input).includes("upstash.io")) {
      redisCalls++;
      return Response.json({ result: [1, 0] });
    }
    providerCalls++;
    return gemini();
  };
  const body = {
    prompt: "Repeat this identical coding question",
    provider: "gemini" as const,
  };
  expect((await POST(req(body))).status).toBe(200);
  const second = await POST(req(body));
  expect(second.status).toBe(429);
  expect((await second.json()).error).toMatch(/wait/i);
  const third = await POST(req(body));
  expect(third.status).toBe(429);
  expect((await third.json()).error).toMatch(/identical/i);
  expect(redisCalls).toBe(1);
  expect(providerCalls).toBe(2);

  resetChatGuardStateForTests();
  redisCalls = 0;
  const first = await enforceChatQuota(
    req({ prompt: "How does TCP slow start work?", provider: "gemini" }),
  );
  await first.commit();
  first.release();
  const near = await enforceChatQuota(
    req({ prompt: "How does TCP slow start work!", provider: "gemini" }),
  );
  expect(near.prompt).toBe("How does TCP slow start work!");
  await expect(near.commit()).rejects.toMatchObject({
    status: 429,
    message: expect.stringMatching(/wait/i),
  });
  near.release();
  expect(redisCalls).toBe(1);
});

test("forged browser headers still cannot upload a huge body", async () => {
  let redisCalls = 0;
  let providerCalls = 0;
  globalThis.fetch = async (input) => {
    if (String(input).includes("upstash.io")) {
      redisCalls++;
      return Response.json({ result: [1, 0] });
    }
    providerCalls++;
    return gemini();
  };
  const bomb = bombStream();
  const response = await POST(
    postStream(bomb.stream, {
      ...forgedBrowser,
      "Content-Length": "10",
    }),
  );
  expect(response.status).toBe(413);
  expect(bomb.pulled()).toBeLessThanOrEqual(12_001);
  expect(redisCalls).toBe(0);
  expect(providerCalls).toBe(0);
});

test("rapid rejects do not burn the daily budget, then one coding question succeeds", async () => {
  let redisCalls = 0;
  let providerCalls = 0;
  const prompts: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("upstash.io")) {
      redisCalls++;
      const script = JSON.parse(String(init?.body));
      expect(script[0]).toBe("EVAL");
      expect(script[7]).toBe(2);
      return Response.json({ result: [1, 0] });
    }
    providerCalls++;
    prompts.push(String(init?.body));
    return gemini();
  };

  for (let i = 0; i < 6; i++) {
    expect(
      (
        await POST(
          req(undefined, { "Content-Length": "12001" }),
        )
      ).status,
    ).toBe(413);
    expect(
      (await POST(req({ prompt: "B".repeat(2001), provider: "gemini" }))).status,
    ).toBe(413);
    expect(
      (
        await POST(
          req({
            prompt: "short question",
            provider: "gemini",
            extra: "C".repeat(40),
          }),
        )
      ).status,
    ).toBe(400);
    const bomb = bombStream();
    expect((await POST(postStream(bomb.stream, forgedBrowser))).status).toBe(
      413,
    );
    expect(bomb.pulled()).toBeLessThanOrEqual(12_001);
  }
  expect(redisCalls).toBe(0);
  expect(providerCalls).toBe(0);

  const prompt = "How do I reverse a string in Python? 你好";
  const ok = await POST(req({ prompt, provider: "gemini" }));
  expect(ok.status).toBe(200);
  expect(ok.headers.get("Cache-Control")).toBe("no-store");
  const body = await ok.json();
  expect(isChatSuccessBody(body)).toBe(true);
  expect(redisCalls).toBe(1);
  expect(providerCalls).toBe(2);
  expect(prompts.join("")).toContain(prompt);
});
