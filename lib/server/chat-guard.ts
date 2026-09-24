import { CHAT_MAX_CHARS } from "@/lib/starcloud/constants";

/**
 * In-memory chat guard for a single Node process.
 * It resets on restart and is not shared across Vercel instances.
 * A later step can replace `takeRateToken` with Upstash Redis
 * (`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`).
 */

const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 8;
const MIN_INTERVAL_MS = 3_000;
const MAX_BYTES = 12_000;
const MAX_KEYS = 2_000;

const hits = new Map<string, number[]>();

const BLOCKED: RegExp[] = [
  /ignore\s+(all\s+|any\s+|the\s+)?(previous|prior|above|earlier)\s+(instructions|prompts|rules|messages)/i,
  /disregard\s+(your|all|the|any|these)\s+(instructions|rules|system|guidelines)/i,
  /(reveal|print|show|dump|repeat|output)\s+(me\s+|your\s+|the\s+)?(system\s+prompt|hidden\s+prompt|developer\s+message|initial\s+instructions)/i,
  /(api[_-]?key|secret[_-]?key|xai_api_key|openai_api_key)/i,
  /\bsk-[a-z0-9]{16,}\b/i,
  /\bxai-[a-z0-9]{16,}\b/i,
  /\b(jailbreak|do\s+anything\s+now)\b/i,
  /<\s*\/?\s*(system|instructions)\s*>/i,
  /\[\s*system\s*\]/i,
  /###\s*(system|instructions)\b/i,
  /<\|(?:im_start|endoftext)\|>/i,
];

const CONTROL =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u202A-\u202E\u2066-\u2069]/;

export class ChatRequestError extends Error {
  readonly status: number;
  readonly retryAfterSec?: number;

  constructor(status: number, message: string, retryAfterSec?: number) {
    super(message);
    this.name = "ChatRequestError";
    this.status = status;
    this.retryAfterSec = retryAfterSec;
  }
}

export function clientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first && first.length > 0 && first.length <= 80) return first;
  }
  const real = request.headers.get("x-real-ip")?.trim();
  if (real && real.length > 0 && real.length <= 80) return real;
  return "local";
}

export function takeRateToken(
  ip: string,
  now = Date.now(),
): { ok: true } | { ok: false; retryAfterSec: number } {
  prune(now);
  const recent = (hits.get(ip) ?? []).filter((stamp) => now - stamp < WINDOW_MS);
  const last = recent.at(-1);
  if (last !== undefined && now - last < MIN_INTERVAL_MS) {
    hits.set(ip, recent);
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((MIN_INTERVAL_MS - (now - last)) / 1000)),
    };
  }
  if (recent.length >= MAX_REQUESTS) {
    hits.set(ip, recent);
    const retry = WINDOW_MS - (now - recent[0]);
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil(retry / 1000)),
    };
  }
  recent.push(now);
  hits.set(ip, recent);
  return { ok: true };
}

export async function acceptPrompt(request: Request): Promise<string> {
  const limit = takeRateToken(clientAddress(request));
  if (!limit.ok) {
    throw new ChatRequestError(
      429,
      "Too many requests. Wait a moment and try again.",
      limit.retryAfterSec,
    );
  }

  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().includes("application/json")) {
    throw new ChatRequestError(415, "Send the prompt as JSON.");
  }

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    throw new ChatRequestError(413, "Request body is too large.");
  }

  const raw = await readLimited(request, MAX_BYTES);
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new ChatRequestError(400, "Request body must be JSON.");
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ChatRequestError(400, "Prompt must be text.");
  }

  const prompt = (payload as { prompt?: unknown }).prompt;
  if (typeof prompt !== "string") {
    throw new ChatRequestError(400, "Prompt must be text.");
  }
  return assertPromptText(prompt);
}

export function assertPromptText(prompt: string): string {
  const trimmed = prompt.trim();
  if (!trimmed || !/[\p{L}\p{N}]/u.test(trimmed)) {
    throw new ChatRequestError(400, "Prompt must be text.");
  }
  if (trimmed.length > CHAT_MAX_CHARS) {
    throw new ChatRequestError(
      413,
      `Keep the prompt under ${CHAT_MAX_CHARS} characters.`,
    );
  }
  if (CONTROL.test(trimmed) || /(.)\1{119,}/u.test(trimmed)) {
    throw new ChatRequestError(400, "That prompt can't be sent.");
  }
  if (BLOCKED.some((pattern) => pattern.test(trimmed))) {
    throw new ChatRequestError(400, "That prompt can't be sent.");
  }
  return trimmed;
}

async function readLimited(request: Request, maxBytes: number): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ChatRequestError(413, "Request body is too large.");
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return text;
}

function prune(now: number) {
  if (hits.size < MAX_KEYS) return;
  for (const [ip, stamps] of hits) {
    const recent = stamps.filter((stamp) => now - stamp < WINDOW_MS);
    if (recent.length === 0) hits.delete(ip);
    else hits.set(ip, recent);
  }
  while (hits.size > MAX_KEYS) {
    const oldest = hits.keys().next().value;
    if (!oldest) break;
    hits.delete(oldest);
  }
}
