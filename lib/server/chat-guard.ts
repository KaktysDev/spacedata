import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { isProvider, type ProviderId } from "@/lib/starcloud/catalog";
export class ChatRequestError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfterSec?: number,
  ) {
    super(message);
  }
}
const MAX_BYTES = 12000,
  WINDOW = 600000;
const hits = new Map<string, number[]>();
let globalDay = "",
  globalCount = 0;
export function durableProtectionConfigured() {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  );
}
export function assertPromptText(prompt: string) {
  const p = prompt.trim();
  if (!p || !/[\p{L}\p{N}]/u.test(p))
    throw new ChatRequestError(400, "Write a question first.");
  if (p.length > 2000)
    throw new ChatRequestError(
      413,
      "Keep your message under 2,000 characters.",
    );
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(p))
    throw new ChatRequestError(400, "Unsupported characters in your message.");
  return p;
}
export function clientAddress(request: Request) {
  // Vercel overwrites this header. Elsewhere, never trust caller-supplied IP headers.
  const raw =
    process.env.VERCEL === "1"
      ? request.headers.get("x-forwarded-for")?.split(",")[0].trim()
      : undefined;
  return raw && isIP(raw) ? raw : "shared";
}
export function takeRateToken(
  ip: string,
  now = Date.now(),
): { ok: true } | { ok: false; retryAfterSec: number } {
  if (hits.size >= 2000) {
    for (const [k, v] of hits)
      if (!v.some((t) => now - t < WINDOW)) hits.delete(k);
    if (hits.size >= 2000 && !hits.has(ip))
      return { ok: false, retryAfterSec: 600 };
  }
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW);
  const last = recent.at(-1);
  if (last !== undefined && now - last < 3000)
    return { ok: false, retryAfterSec: Math.ceil((3000 - now + last) / 1000) };
  if (recent.length >= 8)
    return {
      ok: false,
      retryAfterSec: Math.ceil((WINDOW - now + recent[0]) / 1000),
    };
  hits.set(ip, [...recent, now]);
  return { ok: true };
}
const RATE_SCRIPT = `
local daily=tonumber(redis.call('GET',KEYS[3]) or '0')
if daily>=tonumber(ARGV[1]) then return {0,86400} end
if redis.call('EXISTS',KEYS[2])==1 then return {0,math.max(1,redis.call('TTL',KEYS[2]))} end
local requests=tonumber(redis.call('GET',KEYS[1]) or '0')
if requests>=8 then return {0,math.max(1,redis.call('TTL',KEYS[1]))} end
redis.call('SET',KEYS[2],'1','EX',3)
if redis.call('INCR',KEYS[1])==1 then redis.call('EXPIRE',KEYS[1],600) end
if redis.call('INCR',KEYS[3])==1 then redis.call('EXPIRE',KEYS[3],90000) end
return {1,0}`;
export async function reserveRequest(request: Request) {
  const ip = clientAddress(request),
    day = new Date().toISOString().slice(0, 10);
  const requested = Number(process.env.CHAT_DAILY_LIMIT ?? 200);
  const dailyLimit =
    Number.isInteger(requested) && requested > 0
      ? Math.min(requested, 10000)
      : 200;
  if (durableProtectionConfigured()) {
    try {
      const url = new URL(process.env.UPSTASH_REDIS_REST_URL!);
      if (url.protocol !== "https:") throw new Error("url");
      const hash = createHash("sha256")
        .update(day + ":" + ip)
        .digest("hex")
        .slice(0, 32);
      const r = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          "EVAL",
          RATE_SCRIPT,
          3,
          `spacedata:ip:${hash}`,
          `spacedata:cooldown:${hash}`,
          `spacedata:daily:${day}`,
          dailyLimit,
        ]),
        signal: AbortSignal.timeout(4000),
        cache: "no-store",
        redirect: "error",
      });
      if (!r.ok) throw new Error("redis");
      const data = await r.json();
      if (
        !Array.isArray(data.result) ||
        data.result.length !== 2 ||
        ![0, 1].includes(data.result[0])
      )
        throw new Error("redis");
      if (data.result[0] !== 1)
        throw new ChatRequestError(
          429,
          "The request limit has been reached. Please try again later.",
          Number(data.result[1]) || 600,
        );
    } catch (e) {
      if (e instanceof ChatRequestError) throw e;
      throw new ChatRequestError(
        503,
        "Live requests are paused while abuse protection is unavailable.",
      );
    }
  } else {
    if (globalDay !== day) {
      globalDay = day;
      globalCount = 0;
    }
    if (globalCount >= dailyLimit)
      throw new ChatRequestError(429, "Daily request limit reached.", 86400);
    const limit = takeRateToken(ip);
    if (!limit.ok)
      throw new ChatRequestError(
        429,
        "Please wait before sending another message.",
        limit.retryAfterSec,
      );
    globalCount++;
  }
}
export async function acceptPrompt(
  request: Request,
): Promise<{ prompt: string; provider: ProviderId }> {
  const origin = request.headers.get("origin");
  const expected = process.env.APP_ORIGIN || new URL(request.url).origin;
  if (
    request.headers.get("sec-fetch-site") === "cross-site" ||
    (origin && origin !== expected)
  )
    throw new ChatRequestError(403, "Cross-site requests are not allowed.");
  if (
    (request.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase() !== "application/json"
  )
    throw new ChatRequestError(415, "Send JSON.");
  if (Number(request.headers.get("content-length")) > MAX_BYTES)
    throw new ChatRequestError(413, "Request too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new ChatRequestError(400, "Missing message.");
  let bytes = 0,
    raw = "";
  const decoder = new TextDecoder();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      void reader.cancel().catch(() => {});
      reject(new ChatRequestError(408, "Request body timed out."));
    }, 5000);
  });
  try {
    await Promise.race([
      (async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > MAX_BYTES) {
            void reader.cancel();
            throw new ChatRequestError(413, "Request too large.");
          }
          raw += decoder.decode(value, { stream: true });
        }
        raw += decoder.decode();
      })(),
      timedOut,
    ]);
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new ChatRequestError(400, "Invalid JSON.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new ChatRequestError(400, "Invalid message.");
  const b = body as Record<string, unknown>;
  if (
    Object.keys(b).some((k) => !["prompt", "provider"].includes(k)) ||
    typeof b.prompt !== "string" ||
    !isProvider(b.provider)
  )
    throw new ChatRequestError(
      400,
      "Choose a supported model and enter a message.",
    );
  return { prompt: assertPromptText(b.prompt), provider: b.provider };
}
