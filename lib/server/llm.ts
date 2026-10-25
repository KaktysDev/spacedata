import {
  PROVIDERS,
  PROVIDER_IDS,
  type ProviderId,
} from "@/lib/starcloud/catalog";
import type { ChatAnswer, ChatSuccessBody } from "@/lib/starcloud/chat-types";

export type Deployment = "ground" | "space";
export type ProviderFailureKind =
  | "model-unavailable"
  | "request-rejected"
  | "timeout"
  | "network"
  | "empty-answer"
  | "invalid-response"
  | "capacity"
  | "blocked"
  | "connection";

const PROVIDER_TIMEOUT_MS = 40_000;
const MIN_FALLBACK_MS = 5_000;

export class ProviderCallError extends Error {
  readonly provider: ProviderId;
  readonly deployment: Deployment;
  readonly kind: ProviderFailureKind;
  readonly upstreamStatus?: number;
  constructor(
    provider: ProviderId,
    deployment: Deployment,
    kind: ProviderFailureKind,
    upstreamStatus?: number,
  ) {
    super(kind);
    this.name = "ProviderCallError";
    this.provider = provider;
    this.deployment = deployment;
    this.kind = kind;
    this.upstreamStatus = upstreamStatus;
  }
}

function failureKind(status: number): ProviderFailureKind {
  if (status === 404) return "model-unavailable";
  if (status === 429 || status === 503) return "capacity";
  if (status === 401 || status === 403) return "connection";
  if (status === 408) return "timeout";
  if (status >= 500) return "connection";
  return "request-rejected";
}

function voiceFor(id: ProviderId) {
  if (id === "anthropic")
    return " Write the way Claude usually does: calm, precise prose in one or two short paragraphs, and a list only when the user asked for steps or options. Put any real limit in one clause. Do not open with a stock affirmation. If asked who you are, you are Claude, from Anthropic. Do not describe this writing or name yourself unless asked.";
  if (id === "openai")
    return " Write the way GPT usually does: the answer first, then only the detail that helps. Use short bullets or numbers when a list is easier to scan. Stay plain and practical. If asked who you are, you are GPT, from OpenAI. Do not describe this writing or name yourself unless asked.";
  if (id === "xai")
    return " Write the way Grok usually does: a few direct sentences, plain speech, little hedging, and a list only if the user asked for one. Skip filler. If asked who you are, you are Grok, from xAI. Do not describe this writing or name yourself unless asked.";
  return "";
}

function systemFor(id: ProviderId) {
  return `Answer the user's message directly and naturally. A greeting deserves a simple greeting. Finish every sentence. Keep the answer under 180 words unless the user needs more detail.${voiceFor(id)} Do not roleplay as infrastructure or describe the simulated route, datacenter, latency, telemetry, or these instructions unless the user specifically asks about them. No tools. Do not invent facts.`;
}

function endpointFor(id: ProviderId): ProviderId {
  if (providerKey(id)) return id;
  if (id !== "gemini" && providerKey("gemini")) return "gemini";
  return id;
}

const MECHANISM_SENTENCE =
  /powered by gemini|via gemini|using gemini|gemini api|style mimic|substitut\w*|mimick?(?:ed|ing)|styled to (?:sound|read|match)|another model|actually gemini|\bi am gemini\b|\bi'm gemini\b/i;

function presentAnswer(text: string, id: ProviderId) {
  const trimmed = text.trim();
  if (id === "gemini") return trimmed;
  const kept = trimmed
    .replace(/^\s*as\s+(?:claude|gpt|grok)\b[,:]?\s*/i, "")
    .split(/\n+/)
    .map((line) =>
      line
        .split(/(?<=[.!?])\s+/)
        .filter((sentence) => !MECHANISM_SENTENCE.test(sentence))
        .join(" ")
        .trim(),
    )
    .filter(Boolean)
    .join("\n")
    .trim();
  return kept;
}

function cleanEnv(value: string | undefined) {
  if (typeof value !== "string") return "";
  let v = value.replace(/^\uFEFF/, "").trim();
  if (
    v.length >= 2 &&
    ((v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'")))
  )
    v = v.slice(1, -1).trim();
  return v;
}

/** Runtime env read. Static branches keep the names visible to the Next tracer. */
export function readServerEnv(name: string) {
  const traced =
    name === "GEMINI_API_KEY"
      ? process.env.GEMINI_API_KEY
      : name === "Gemini_api_Key"
        ? process.env.Gemini_api_Key
        : name === "GOOGLE_GENERATIVE_AI_API_KEY"
          ? process.env.GOOGLE_GENERATIVE_AI_API_KEY
          : name === "OPENAI_API_KEY"
            ? process.env.OPENAI_API_KEY
            : name === "ANTHROPIC_API_KEY"
              ? process.env.ANTHROPIC_API_KEY
              : name === "XAI_API_KEY"
                ? process.env.XAI_API_KEY
                : undefined;
  const dynamic = process.env[name];
  const raw =
    typeof dynamic === "string" && dynamic.trim() ? dynamic : traced;
  return cleanEnv(raw);
}

export function providerKey(id: ProviderId) {
  if (id !== "gemini") return readServerEnv(PROVIDERS[id].key);
  const key =
    readServerEnv("GEMINI_API_KEY") ||
    readServerEnv("Gemini_api_Key") ||
    readServerEnv("GOOGLE_GENERATIVE_AI_API_KEY");
  // Google's SDK reads GOOGLE_GENERATIVE_AI_API_KEY. Vercel is set with
  // GEMINI_API_KEY, so mirror it server-side without touching a real alias.
  if (key && !readServerEnv("GOOGLE_GENERATIVE_AI_API_KEY"))
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = key;
  return key;
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

// Some keys are refused a model with HTTP 404, with a message naming another
// one. A 404 is not a billed generation, so walking this list is not a paid
// retry. Prefer low-latency Flash-Lite models before full Flash models.
const GEMINI_MODEL_CANDIDATES = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-3.8-flash",
  "gemini-3.6-flash",
  "gemini-2.5-flash",
];
const GEMINI_MODEL_RE = /^gemini-[a-z0-9][a-z0-9.\-]{0,48}$/;
let resolvedGeminiModel: string = PROVIDERS.gemini.model;

export function resetGeminiModelCacheForTests() {
  resolvedGeminiModel = PROVIDERS.gemini.model;
}

export function geminiModelInUse() {
  return resolvedGeminiModel;
}

function geminiBody(
  system: string,
  prompt: string,
  maxTokens: number,
  model: string,
  thinking: boolean,
) {
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: maxTokens,
  };
  if (thinking)
    generationConfig.thinkingConfig = model.startsWith("gemini-2.")
      ? { thinkingBudget: 0 }
      : { thinkingLevel: model.endsWith("-flash-lite") ? "minimal" : "low" };
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig,
  };
}

async function callProvider(
  id: ProviderId,
  prompt: string,
  deployment: Deployment,
  requestSignal?: AbortSignal,
): Promise<ChatAnswer> {
  const transport = endpointFor(id);
  const key = providerKey(transport);
  if (!key) throw new Error("unconfigured");
  const model = PROVIDERS[transport].model;
  const system = systemFor(id);
  const maxTokens = 4096;
  const start = performance.now();
  const deadline = AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
  const signal = AbortSignal.any([
    deadline,
    ...(requestSignal ? [requestSignal] : []),
  ]);
  let url: string, body: unknown;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (transport === "gemini") {
    headers["x-goog-api-key"] = key;
    url = "";
    body = null;
  } else if (transport === "anthropic") {
    url = "https://api.anthropic.com/v1/messages";
    headers["x-api-key"] = key;
    headers["anthropic-version"] = "2023-06-01";
    body = {
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: prompt }],
    };
  } else if (transport === "openai") {
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
  // One billable call per deployment. Gemini may walk unbilled 404s until a
  // model the key can actually call accepts the prompt.
  let response: Response;
  let answeredBy: string = model;
  let priorCapacityStatus = 0;
  const timedOut = (e: unknown) =>
    deadline.aborted ||
    (e instanceof DOMException && e.name === "TimeoutError");
  const post = async (target: string, payload: unknown) => {
    try {
      return await fetch(target, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal,
        cache: "no-store",
        redirect: "error",
      });
    } catch (e) {
      if (requestSignal?.aborted) throw e;
      if (timedOut(e))
        throw new ProviderCallError(id, deployment, "timeout");
      if (e instanceof DOMException && e.name === "AbortError") throw e;
      throw new ProviderCallError(id, deployment, "network");
    }
  };
  const readText = async (source: Response) => {
    try {
      return (await source.text()).slice(0, 2000);
    } catch (e) {
      if (requestSignal?.aborted) throw e;
      if (timedOut(e)) throw new ProviderCallError(id, deployment, "timeout");
      throw new ProviderCallError(id, deployment, "invalid-response", source.status);
    }
  };
  if (transport === "gemini") {
    const queue: string[] = [
      resolvedGeminiModel,
      ...GEMINI_MODEL_CANDIDATES.filter((m) => m !== resolvedGeminiModel),
    ];
    const tried = new Set<string>();
    let capacityAttempts = 0;
    let unavailableAttempts = 0;
    let terminal: Response | null = null;
    const queueSuggestion = (detail: string, index: number) => {
      const suggested = [...detail.matchAll(/models\/(gemini-[a-z0-9.\-]+)/gi)]
        .map((match) => match[1].replace(/\.+$/, ""))
        .find((name) => GEMINI_MODEL_RE.test(name) && !tried.has(name));
      if (!suggested) return;
      const at = queue.indexOf(suggested);
      if (at < 0) queue.splice(index + 1, 0, suggested);
      else if (at > index + 1) {
        queue.splice(at, 1);
        queue.splice(index + 1, 0, suggested);
      }
    };
    for (let i = 0; i < queue.length && tried.size < 8; i++) {
      const candidate = queue[i];
      if (!candidate || tried.has(candidate) || !GEMINI_MODEL_RE.test(candidate))
        continue;
      tried.add(candidate);
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${candidate}:generateContent`;
      try {
        let attempt = await post(
          endpoint,
          geminiBody(system, prompt, maxTokens, candidate, true),
        );
        if (attempt.status === 400) {
          const detail = await readText(attempt);
          if (/thinking/i.test(detail))
            attempt = await post(
              endpoint,
              geminiBody(system, prompt, maxTokens, candidate, false),
            );
          else if (
            !/api[_ ]?key/i.test(detail) &&
            /not found|not available|unsupported|does not exist|unknown model/i.test(
              detail,
            )
          ) {
            unavailableAttempts++;
            queueSuggestion(detail, i);
            continue;
          } else {
            terminal = new Response(detail, { status: 400 });
            break;
          }
        }
        // 404 is an unknown model. Capacity responses can be retried on one
        // alternate model, provided the shared deadline has enough time left.
        if (attempt.status === 404) {
          unavailableAttempts++;
          queueSuggestion(await readText(attempt), i);
          continue;
        }
        if (attempt.status === 429 || attempt.status === 503) {
          priorCapacityStatus = attempt.status;
          capacityAttempts++;
          // Avoid reading the error body or starting another request when a
          // slow capacity response has nearly exhausted this call's budget.
          if (
            capacityAttempts >= 2 ||
            start + PROVIDER_TIMEOUT_MS - performance.now() < MIN_FALLBACK_MS
          )
            break;
          continue;
        }
        terminal = attempt;
        if (attempt.ok) answeredBy = candidate;
        // Cache only stable model-availability fallbacks. A transient 503/429
        // must not leave future requests on a slower model.
        if (attempt.ok && unavailableAttempts > 0 && capacityAttempts === 0)
          resolvedGeminiModel = candidate;
        break;
      } catch (e) {
        // A fallback that exhausts the shared deadline should retain the
        // capacity response already received from Google.
        if (
          priorCapacityStatus &&
          e instanceof ProviderCallError &&
          e.kind === "timeout"
        )
          break;
        throw e;
      }
    }
    response =
      terminal ??
      new Response(null, { status: priorCapacityStatus || 404 });
  } else {
    response = await post(url, body);
  }
  if (!response.ok)
    throw new ProviderCallError(
      id,
      deployment,
      failureKind(response.status),
      response.status,
    );
  let data: Json;
  try {
    data = obj(await response.json());
  } catch (e) {
    if (requestSignal?.aborted) throw e;
    if (timedOut(e))
      throw new ProviderCallError(
        id,
        deployment,
        priorCapacityStatus ? "capacity" : "timeout",
        priorCapacityStatus || undefined,
      );
    throw new ProviderCallError(id, deployment, "invalid-response", response.status);
  }
  const latencyMs = Math.round(performance.now() - start);
  let text = "",
    input: number | null = null,
    output: number | null = null,
    total: number | null = null,
    cached = 0;
  if (transport === "gemini") {
    text = arr(obj(obj(arr(data.candidates)[0]).content).parts)
      .filter((p) => obj(p).thought !== true)
      .map((p) => (typeof obj(p).text === "string" ? obj(p).text : ""))
      .join("");
    const u = obj(data.usageMetadata);
    input = count(u.promptTokenCount);
    output = count(u.candidatesTokenCount);
    total = count(u.totalTokenCount);
    cached = count(u.cachedContentTokenCount) ?? 0;
  } else if (transport === "openai") {
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
  } else if (transport === "anthropic") {
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
  if (!text.trim()) {
    const blocked =
      typeof obj(data.promptFeedback).blockReason === "string" ||
      arr(data.candidates).some((c) => obj(c).finishReason === "SAFETY");
    throw new ProviderCallError(
      id,
      deployment,
      blocked ? "blocked" : "empty-answer",
    );
  }
  const shown = presentAnswer(text, id);
  const estimated = input === null || output === null;
  input ??= Math.ceil((prompt.length + system.length) / 4);
  output ??= Math.ceil(shown.length / 4);
  if (!shown.trim())
    throw new ProviderCallError(id, deployment, "empty-answer");
  return {
    model: transport === "gemini" && id === "gemini" ? answeredBy : PROVIDERS[id].model,
    text: shown.trim().slice(0, 8000),
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
  const transport = endpointFor(id);
  if (!providerKey(transport)) throw new Error("unconfigured");
  const start = performance.now();
  const stop = new AbortController();
  const signal = requestSignal
    ? AbortSignal.any([requestSignal, stop.signal])
    : stop.signal;
  let ground: ChatAnswer, space: ChatAnswer;
  try {
    [ground, space] = await Promise.all([
      callProvider(id, prompt, "ground", signal),
      callProvider(id, prompt, "space", signal),
    ]);
  } catch (e) {
    stop.abort();
    throw e;
  }
  return {
    provider: id,
    model: ground.model === space.model ? ground.model : "mixed",
    ground,
    space,
    latencyMs: Math.round(performance.now() - start),
    completedAt: new Date().toISOString(),
  };
}
