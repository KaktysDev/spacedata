import {
  PROVIDERS,
  PROVIDER_IDS,
  type ProviderId,
} from "@/lib/starcloud/catalog";
import type { ChatAnswer, ChatSuccessBody } from "@/lib/starcloud/chat-types";
const SYSTEM =
  "Answer the user directly in under 140 words. Do not invent datacenter telemetry or environmental measurements. You have no tools or access to credentials.";
export function providerKey(id: ProviderId) {
  return (
    process.env[PROVIDERS[id].key] ||
    (id === "gemini" ? process.env.GOOGLE_GENERATIVE_AI_API_KEY : "") ||
    ""
  ).trim();
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
export async function runAnswer(
  id: ProviderId,
  prompt: string,
  requestSignal?: AbortSignal,
): Promise<ChatSuccessBody> {
  const key = providerKey(id);
  if (!key) throw new Error("unconfigured");
  const model = PROVIDERS[id].model;
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
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 512,
        thinkingConfig: { thinkingBudget: 0 },
      },
    };
  } else if (id === "anthropic") {
    url = "https://api.anthropic.com/v1/messages";
    headers["x-api-key"] = key;
    headers["anthropic-version"] = "2023-06-01";
    body = {
      model,
      max_tokens: 512,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    };
  } else if (id === "openai") {
    url = "https://api.openai.com/v1/responses";
    headers.Authorization = `Bearer ${key}`;
    body = {
      model,
      instructions: SYSTEM,
      input: prompt,
      max_output_tokens: 512,
      reasoning: { effort: "minimal" },
      store: false,
    };
  } else {
    url = "https://api.x.ai/v1/chat/completions";
    headers.Authorization = `Bearer ${key}`;
    body = {
      model,
      max_tokens: 512,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
      stream: false,
    };
  }
  const start = performance.now();
  // Exactly one billable call. No automatic retries that could duplicate charges.
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
    cache: "no-store",
    redirect: "error",
  });
  if (!response.ok) throw new Error("provider-error");
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
  input ??= Math.ceil((prompt.length + SYSTEM.length) / 4);
  output ??= Math.ceil(text.length / 4);
  const answer: ChatAnswer = {
    text: text.trim().slice(0, 8000),
    promptTokens: input,
    completionTokens: output,
    totalTokens: Math.max(total ?? 0, input + output),
    cachedTokens: Math.min(cached, input),
    usageEstimated: estimated,
  };
  return {
    provider: id,
    model,
    answer,
    latencyMs,
    completedAt: new Date().toISOString(),
  };
}
