import {
  PROVIDERS,
  PROVIDER_IDS,
  type ProviderId,
} from "@/lib/starcloud/catalog";
import type { ChatAnswer, ChatSuccessBody } from "@/lib/starcloud/chat-types";

export type Deployment = "ground" | "space";

const MODEL_VOICE: Record<ProviderId, string> = {
  gemini:
    "Write like Gemini: crisp, structured, helpful. Prefer short labeled sections or tight bullets when useful. Sound confident and practical.",
  openai:
    "Write like GPT: clear prose, numbered steps for procedures, careful edge cases, calm and precise. Prefer complete sentences over hype.",
  anthropic:
    "Write like Claude: thoughtful, slightly formal, careful about assumptions. Lead with the direct answer, then brief reasoning. Avoid fluff.",
  xai: "Write like Grok: witty and direct, a little irreverent, still correct. Short paragraphs. Skip corporate padding.",
};

function systemFor(id: ProviderId, deployment: Deployment) {
  const voice = MODEL_VOICE[id];
  if (deployment === "space") {
    return `${voice}
You are answering from an orbital LEO datacenter. Constraints that must shape the writing (do not lecture about them): slightly tighter token budget, favor the shortest correct path, acknowledge light-time/ISL hop cost only if latency matters to the answer. Under 120 words. No tools. Do not invent telemetry.`;
  }
  return `${voice}
You are answering from a terrestrial hyperscale datacenter. Constraints that must shape the writing (do not lecture about them): full ground context, slightly more elaborate when helpful, assume fiber RTT. Under 160 words. No tools. Do not invent telemetry.`;
}

export function providerKey(id: ProviderId) {
  const gemini =
    id === "gemini"
      ? process.env.GEMINI_API_KEY ||
        process.env.Gemini_api_Key ||
        process.env.GOOGLE_GENERATIVE_AI_API_KEY
      : "";
  return (process.env[PROVIDERS[id].key] || gemini || "").trim();
}
export function availableProviders(): ProviderId[] {
  return PROVIDER_IDS.filter((id) => Boolean(providerKey(id)));
}
type Json = Record<string, unknown>;
const obj = (v: unknown): Json =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const count = (v: unknown): number | null =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;

async function callProvider(
  id: ProviderId,
  prompt: string,
  deployment: Deployment,
  requestSignal?: AbortSignal,
): Promise<ChatAnswer> {
  const key = providerKey(id);
  if (!key) throw new Error("unconfigured");
  const model = PROVIDERS[id].model;
  const system = systemFor(id, deployment);
  const maxTokens = deployment === "space" ? 360 : 512;
  const signal = AbortSignal.any([
    AbortSignal.timeout(45_000),
    ...(requestSignal ? [requestSignal] : []),
  ]);
  let url: string, body: unknown;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (id === "gemini") {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    headers["x-goog-api-key"] = key;
    body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: maxTokens,
        thinkingConfig: { thinkingBudget: 0 },
      },
    };
  } else if (id === "anthropic") {
    url = "https://api.anthropic.com/v1/messages";
    headers["x-api-key"] = key;
    headers["anthropic-version"] = "2023-06-01";
    body = {
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: prompt }],
    };
  } else if (id === "openai") {
    url = "https://api.openai.com/v1/responses";
    headers.Authorization = `Bearer ${key}`;
    body = {
      model,
      instructions: system,
      input: prompt,
      max_output_tokens: maxTokens,
      reasoning: { effort: "minimal" },
      store: false,
    };
  } else {
    url = "https://api.x.ai/v1/chat/completions";
    headers.Authorization = `Bearer ${key}`;
    body = {
      model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      stream: false,
    };
  }
  const start = performance.now();
  // Exactly one billable call per deployment. No automatic retries.
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
    cache: "no-store",
    redirect: "error",
  });
  if (!response.ok) {
    if (id === "gemini" && response.status === 404)
      throw new Error("model-not-found");
    throw new Error("provider-error");
  }
  const data = obj(await response.json());
  const latencyMs = Math.round(performance.now() - start);
  let text = "",
    input: number | null = null,
    output: number | null = null,
    total: number | null = null,
    cached = 0;
  if (id === "gemini") {
    text = arr(obj(obj(arr(data.candidates)[0]).content).parts)
      .filter((p) => obj(p).thought !== true)
      .map((p) => (typeof obj(p).text === "string" ? obj(p).text : ""))
      .join("");
    const u = obj(data.usageMetadata);
    input = count(u.promptTokenCount);
    output = count(u.candidatesTokenCount);
    total = count(u.totalTokenCount);
    cached = count(u.cachedContentTokenCount) ?? 0;
  } else if (id === "openai") {
    text = arr(data.output)
      .flatMap((p) => arr(obj(p).content))
      .filter((p) => obj(p).type === "output_text")
      .map((p) => obj(p).text)
      .filter((t) => typeof t === "string")
      .join("");
    const u = obj(data.usage);
    input = count(u.input_tokens);
    output = count(u.output_tokens);
    total = count(u.total_tokens);
    cached = count(obj(u.input_tokens_details).cached_tokens) ?? 0;
  } else if (id === "anthropic") {
    text = arr(data.content)
      .filter((p) => obj(p).type === "text")
      .map((p) => obj(p).text)
      .filter((t) => typeof t === "string")
      .join("");
    const u = obj(data.usage);
    cached = count(u.cache_read_input_tokens) ?? 0;
    input = count(u.input_tokens);
    if (input !== null)
      input += cached + (count(u.cache_creation_input_tokens) ?? 0);
    output = count(u.output_tokens);
  } else {
    const content = obj(obj(arr(data.choices)[0]).message).content;
    text = typeof content === "string" ? content : "";
    const u = obj(data.usage);
    input = count(u.prompt_tokens);
    output = count(u.completion_tokens);
    total = count(u.total_tokens);
    cached = count(obj(u.prompt_tokens_details).cached_tokens) ?? 0;
  }
  if (!text.trim()) throw new Error("empty-answer");
  const estimated = input === null || output === null;
  input ??= Math.ceil((prompt.length + system.length) / 4);
  output ??= Math.ceil(text.length / 4);
  return {
    text: text.trim().slice(0, 8000),
    promptTokens: input,
    completionTokens: output,
    totalTokens: Math.max(total ?? 0, input + output),
    cachedTokens: Math.min(cached, input),
    usageEstimated: estimated,
    latencyMs,
  };
}

/** Two prompted answers (space vs ground) via the selected provider. */
export async function runAnswer(
  id: ProviderId,
  prompt: string,
  requestSignal?: AbortSignal,
): Promise<ChatSuccessBody> {
  const key = providerKey(id);
  if (!key) throw new Error("unconfigured");
  const model = PROVIDERS[id].model;
  const start = performance.now();
  const [ground, space] = await Promise.all([
    callProvider(id, prompt, "ground", requestSignal),
    callProvider(id, prompt, "space", requestSignal),
  ]);
  return {
    provider: id,
    model,
    ground,
    space,
    latencyMs: Math.round(performance.now() - start),
    completedAt: new Date().toISOString(),
  };
}
