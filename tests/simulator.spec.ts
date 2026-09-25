import { test, expect } from "@playwright/test";
import {
  createEngineState,
  stepEngine,
  priceTokens,
  withUtilization,
  snapshot,
} from "../lib/starcloud/engine";
import { phaseDuration, phaseFraction } from "../lib/starcloud/route-timeline";
import { assertPromptText, takeRateToken } from "../lib/server/chat-guard";
import { isChatSuccessBody } from "../lib/starcloud/chat-types";
import { POST } from "../app/api/chat/route";

const originalFetch = globalThis.fetch;
const originalKey = process.env.GEMINI_API_KEY;
const originalAlias = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const originalModel = process.env.GEMINI_MODEL;
test.afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [name, value] of Object.entries({
    GEMINI_API_KEY: originalKey,
    GOOGLE_GENERATIVE_AI_API_KEY: originalAlias,
    GEMINI_MODEL: originalModel,
  })) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});
function request(body: unknown, ip: string, contentType = "application/json") {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": contentType, "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}
function mockGemini(text: string) {
  return Response.json({
    candidates: [{ content: { parts: [{ text }] } }],
    usageMetadata: {
      promptTokenCount: 8,
      candidatesTokenCount: 12,
      totalTokenCount: 20,
    },
  });
}

test("session energy integration is invariant under frame subdivision", () => {
  const full = stepEngine("ground", createEngineState(0.22), 10);
  let divided = createEngineState(0.22);
  for (let i = 0; i < 100; i++) divided = stepEngine("ground", divided, 0.1);
  expect(divided.itKwh).toBeCloseTo(full.itKwh, 9);
  expect(divided.waterLiters).toBeCloseTo(full.waterLiters, 9);
  expect(divided.energyCostUsd).toBeCloseTo(full.energyCostUsd, 9);
});
test("matched workloads use the same compute energy and orbit consumes no cooling water", () => {
  const space = priceTokens("space", 1e9, false);
  const ground = priceTokens("ground", 1e9, false);
  expect(space.itKwh).toBe(ground.itKwh);
  expect(space.waterLiters).toBe(0);
  expect(ground.waterLiters).toBeGreaterThan(0);
  expect(ground.energyCostUsd / space.energyCostUsd).toBeCloseTo(23.625);
});
test("canceling inference can restore idle load without losing accumulated totals", () => {
  const busy = stepEngine("space", createEngineState(0.22), 4);
  const idle = withUtilization(busy, 0.06);
  expect(idle.itKwh).toBe(busy.itKwh);
  expect(snapshot("space", idle).tokensPerSecond).toBeLessThan(
    snapshot("space", busy).tokensPerSecond,
  );
});
test("invalid token counts and utilization cannot poison the metrics", () => {
  for (const value of [NaN, Infinity, -1]) {
    expect(priceTokens("ground", value, true).energyCostUsd).toBe(0);
    expect(createEngineState(value).utilization).toBe(0);
  }
});
test("route timing has bounded progress and supports reduced motion", () => {
  expect(phaseFraction("uplink", 100, 0, false)).toBe(0);
  expect(phaseFraction("uplink", 0, 9999, false)).toBe(1);
  expect(phaseDuration("split", true)).toBeLessThan(
    phaseDuration("split", false),
  );
  expect(phaseDuration("idle", false)).toBe(0);
});
test("prompt validation handles empty, oversized, multiline and unicode input", () => {
  expect(() => assertPromptText("   ")).toThrow();
  expect(() => assertPromptText("hello ".repeat(400))).toThrow();
  expect(assertPromptText("  Why orbit?\nПоясни.  ")).toBe(
    "Why orbit?\nПоясни.",
  );
});
test("rate limits expire and give a retry interval", () => {
  expect(takeRateToken("unit-rate", 0)).toEqual({ ok: true });
  expect(takeRateToken("unit-rate", 1000)).toEqual({
    ok: false,
    retryAfterSec: 2,
  });
  expect(takeRateToken("unit-rate", 600_001)).toEqual({ ok: true });
});
test("missing server key is a clear 503, with no external request", async () => {
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  globalThis.fetch = async () => {
    throw new Error("Unexpected external call");
  };
  const response = await POST(
    request({ prompt: "Why compute in space?" }, "missing-key"),
  );
  expect(response.status).toBe(503);
  expect((await response.json()).error).toContain(
    "Live inference is unavailable",
  );
});
test("API rejects invalid requests before calling the provider", async () => {
  globalThis.fetch = async () => {
    throw new Error("Unexpected external call");
  };
  expect((await POST(request({ prompt: "" }, "empty"))).status).toBe(400);
  expect(
    (
      await POST(
        request({ prompt: "a question" }, "content-type", "text/plain"),
      )
    ).status,
  ).toBe(415);
  expect(
    (await POST(request({ prompt: "hello ".repeat(400) }, "oversized"))).status,
  ).toBe(413);
});
test("live API returns two validated answers and keeps credentials off the response", async () => {
  process.env.GEMINI_API_KEY = "local-test-placeholder";
  let calls = 0;
  globalThis.fetch = async () => mockGemini(`Answer ${++calls}`);
  const response = await POST(
    request({ prompt: "Explain orbital cooling" }, "success"),
  );
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(calls).toBe(2);
  expect(isChatSuccessBody(body)).toBe(true);
  expect(body.space.text).not.toBe(body.ground.text);
  expect(JSON.stringify(body)).not.toContain("local-test-placeholder");
});
test("provider failures become a recoverable error without leaking the provider response", async () => {
  process.env.GEMINI_API_KEY = "local-test-placeholder";
  globalThis.fetch = async () =>
    new Response("private provider details", { status: 500 });
  const response = await POST(
    request({ prompt: "Explain orbital cooling" }, "failure"),
  );
  expect(response.status).toBe(502);
  expect(JSON.stringify(await response.json())).not.toContain(
    "private provider details",
  );
});
test("model compatibility retries keep the same overall deadline", async () => {
  process.env.GEMINI_API_KEY = "local-test-placeholder";
  const signals: AbortSignal[] = [];
  let calls = 0;
  globalThis.fetch = async (_input, init) => {
    signals.push(init!.signal!);
    calls++;
    return calls <= 2
      ? new Response("", { status: 400 })
      : mockGemini("Compatible answer");
  };
  const response = await POST(
    request({ prompt: "Explain orbital cooling" }, "retry"),
  );
  expect(response.status).toBe(200);
  expect(calls).toBe(4);
  expect(new Set(signals).size).toBe(1);
});
test("invalid numeric usage is rejected by the client response contract", () => {
  const answer = {
    text: "Answer",
    promptTokens: 1,
    completionTokens: 2,
    totalTokens: Infinity,
    usageEstimated: false,
  };
  expect(
    isChatSuccessBody({
      provider: "gemini",
      model: "test",
      space: answer,
      ground: answer,
    }),
  ).toBe(false);
});
