import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { isProvider, type ProviderId } from "@/lib/starcloud/catalog";

/**
 * Chat abuse limits (demo-friendly, bot-hostile).
 *
 * One HTTP /api/chat turn fans out to two provider calls (space + ground) via
 * runAnswer. The daily budget counts provider calls, so commit() charges 2 by
 * default (CHAT_DAILY_LIMIT 200 ≈ 100 user turns). Do not refund on cancel.
 * Call enforceChatQuota once per HTTP request — not once per upstream call.
 *
 * | Limit                         | Value                                      |
 * |-------------------------------|--------------------------------------------|
 * | Max prompt characters         | 2_000                                      |
 * | Max request body              | 12_000 bytes (bounded read, then cancel)   |
 * | Body read deadline            | 5 s                                        |
 * | Min interval (burst cooldown) | 3 s between accepted turns / IP            |
 * | Per-IP sustained              | 8 accepted turns / 10 min                  |
 * | Per-session/fingerprint       | 12 accepted turns / 10 min                 |
 * | High-frequency probe          | 13th attempt within 15 s / IP (12 allowed)|
 * | Identical prompt spam         | 3 identical prompts / 2 min / identity     |
 * | Concurrent in-flight          | 1 per IP and 1 per session fingerprint     |
 * | Global paid budget            | CHAT_DAILY_LIMIT provider calls / UTC day  |
 * |                               | (default 200 calls ≈ 100 turns)            |
 *
 * Storage notes:
 * - Upstash Redis (when UPSTASH_REDIS_REST_* is set) atomically enforces the
 *   per-IP cooldown/sustained window and the global daily provider-call budget
 *   across instances.
 * - Session, concurrency, identical-prompt, and high-frequency checks are
 *   in-memory best-effort and run before Redis so a local 429 does not burn
 *   IP/daily quota. Serverless instances do not share that memory; Redis + the
 *   global daily cap still bind total spend. Do not add a paid store beyond the
 *   Redis already configured.
 */

export class ChatRequestError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfterSec?: number,
  ) {
    super(message);
  }
}

/** Provider calls charged per committed chat turn (space + ground). */
export const PROVIDER_CALLS_PER_TURN = 2;

export type ChatQuotaGrant = {
  prompt: string;
  provider: ProviderId;
  /** Always call when the request finishes (success or failure). */
  release: () => void;
  /**
   * Spend rate-limit / daily-budget tokens for the provider calls about to
   * start. Call after cheap authz checks (e.g. provider key present) and
   * before any provider HTTP call. Default cost is 2 (space + ground).
   */
  commit: (providerCalls?: number) => Promise<void>;
};

const MAX_BYTES = 12_000;
const BODY_DEADLINE_MS = 5_000;
const MAX_PROMPT = 2_000;
const WINDOW_MS = 600_000;
const MIN_INTERVAL_MS = 3_000;
const IP_SUSTAINED = 8;
const SESSION_WINDOW_MS = 600_000;
const SESSION_SUSTAINED = 12;
const HIGH_FREQ_WINDOW_MS = 15_000;
const HIGH_FREQ_MAX = 12;
const IDENTICAL_WINDOW_MS = 120_000;
const IDENTICAL_MAX = 3;
const MAX_INFLIGHT = 1;
const MAX_TRACKED_KEYS = 2_000;

const ipHits = new Map<string, number[]>();
const sessionHits = new Map<string, number[]>();
const attemptHits = new Map<string, number[]>();
const identicalHits = new Map<string, { hash: string; at: number }[]>();
const inflightIp = new Map<string, number>();
const inflightSession = new Map<string, number>();

let globalDay = "";
let globalCount = 0;

export function durableProtectionConfigured() {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  );
}

/** Test-only: clear in-memory limiter state between cases. */
export function resetChatGuardStateForTests() {
  ipHits.clear();
  sessionHits.clear();
  attemptHits.clear();
  identicalHits.clear();
  inflightIp.clear();
  inflightSession.clear();
  globalDay = "";
  globalCount = 0;
}

export function assertPromptText(prompt: string) {
  const p = prompt.trim();
  if (!p || !/[\p{L}\p{N}]/u.test(p))
    throw new ChatRequestError(400, "Write a question first.");
  if (p.length > MAX_PROMPT)
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

/** Soft session key from UA + Accept-Language. Not authentication. */
export function sessionFingerprint(request: Request) {
  const ua = request.headers.get("user-agent") ?? "";
  const lang = request.headers.get("accept-language") ?? "";
  return (
    "fp:" +
    createHash("sha256")
      .update(`${ua}\0${lang}`)
      .digest("hex")
      .slice(0, 24)
  );
}

function pruneMap(
  map: Map<string, number[]>,
  now: number,
  windowMs: number,
) {
  if (map.size < MAX_TRACKED_KEYS) return;
  for (const [k, v] of map)
    if (!v.some((t) => now - t < windowMs)) map.delete(k);
}

function pruneIdenticalMap(now: number) {
  if (identicalHits.size < MAX_TRACKED_KEYS) return;
  for (const [k, v] of identicalHits)
    if (!v.some((e) => now - e.at < IDENTICAL_WINDOW_MS)) identicalHits.delete(k);
}

/**
 * Check a sliding window without writing. Call `commit()` only after durable
 * reservation succeeds so a Redis/production failure does not burn the bucket.
 */
function prepareHit(
  map: Map<string, number[]>,
  key: string,
  now: number,
  windowMs: number,
  max: number,
  minIntervalMs: number,
):
  | { ok: true; commit: () => void }
  | { ok: false; retryAfterSec: number } {
  pruneMap(map, now, windowMs);
  if (map.size >= MAX_TRACKED_KEYS && !map.has(key))
    return { ok: false, retryAfterSec: Math.ceil(windowMs / 1000) };
  const recent = (map.get(key) ?? []).filter((t) => now - t < windowMs);
  const last = recent.at(-1);
  if (last !== undefined && now - last < minIntervalMs)
    return {
      ok: false,
      retryAfterSec: Math.ceil((minIntervalMs - now + last) / 1000),
    };
  if (recent.length >= max)
    return {
      ok: false,
      retryAfterSec: Math.ceil((windowMs - now + recent[0]) / 1000),
    };
  return {
    ok: true,
    commit: () => {
      map.set(key, [...recent, now]);
    },
  };
}

export function takeRateToken(
  ip: string,
  now = Date.now(),
): { ok: true } | { ok: false; retryAfterSec: number } {
  const hit = prepareHit(
    ipHits,
    ip,
    now,
    WINDOW_MS,
    IP_SUSTAINED,
    MIN_INTERVAL_MS,
  );
  if (!hit.ok) return hit;
  hit.commit();
  return { ok: true };
}

function prepareSessionToken(
  session: string,
  now = Date.now(),
):
  | { ok: true; commit: () => void }
  | { ok: false; retryAfterSec: number } {
  // Session bucket is slightly looser than IP so NAT users are not pinned
  // as hard; still blocks scripted loops that rotate only the IP view.
  return prepareHit(
    sessionHits,
    session,
    now,
    SESSION_WINDOW_MS,
    SESSION_SUSTAINED,
    MIN_INTERVAL_MS,
  );
}

function noteAttempt(ip: string, now = Date.now()) {
  pruneMap(attemptHits, now, HIGH_FREQ_WINDOW_MS);
  if (attemptHits.size >= MAX_TRACKED_KEYS && !attemptHits.has(ip))
    throw new ChatRequestError(
      429,
      "Too many requests in a short period. Please wait and try again.",
      Math.ceil(HIGH_FREQ_WINDOW_MS / 1000),
    );
  const recent = (attemptHits.get(ip) ?? []).filter(
    (t) => now - t < HIGH_FREQ_WINDOW_MS,
  );
  recent.push(now);
  attemptHits.set(ip, recent);
  // Allow HIGH_FREQ_MAX probes, reject the next (bots hammering validation).
  if (recent.length > HIGH_FREQ_MAX)
    throw new ChatRequestError(
      429,
      "Too many requests in a short period. Please wait and try again.",
      Math.ceil((HIGH_FREQ_WINDOW_MS - now + recent[0]) / 1000),
    );
}

function noteIdentical(identity: string, prompt: string, now = Date.now()) {
  pruneIdenticalMap(now);
  if (identicalHits.size >= MAX_TRACKED_KEYS && !identicalHits.has(identity))
    throw new ChatRequestError(
      429,
      "Repeated identical messages were rate-limited. Change your question or wait.",
      Math.ceil(IDENTICAL_WINDOW_MS / 1000),
    );
  const hash = createHash("sha256").update(prompt).digest("hex");
  const recent = (identicalHits.get(identity) ?? []).filter(
    (e) => now - e.at < IDENTICAL_WINDOW_MS,
  );
  recent.push({ hash, at: now });
  identicalHits.set(identity, recent);
  const same = recent.filter((e) => e.hash === hash);
  if (same.length >= IDENTICAL_MAX)
    throw new ChatRequestError(
      429,
      "Repeated identical messages were rate-limited. Change your question or wait.",
      Math.ceil((IDENTICAL_WINDOW_MS - now + same[0].at) / 1000),
    );
}

function acquireInflight(ip: string, session: string): () => void {
  const ipCount = inflightIp.get(ip) ?? 0;
  const sessionCount = inflightSession.get(session) ?? 0;
  if (ipCount >= MAX_INFLIGHT || sessionCount >= MAX_INFLIGHT)
    throw new ChatRequestError(
      429,
      "A request is already in progress. Wait for it to finish.",
      5,
    );
  inflightIp.set(ip, ipCount + 1);
  inflightSession.set(session, sessionCount + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const nextIp = (inflightIp.get(ip) ?? 1) - 1;
    const nextSession = (inflightSession.get(session) ?? 1) - 1;
    if (nextIp <= 0) inflightIp.delete(ip);
    else inflightIp.set(ip, nextIp);
    if (nextSession <= 0) inflightSession.delete(session);
    else inflightSession.set(session, nextSession);
  };
}

const ABSURD_UA =
  /^(curl|wget|python-requests|python-urllib|scrapy|go-http-client|java\/|libwww|httpclient|axios\/|node-fetch|undici|okhttp|postmanruntime|insomnia|httpie|libcurl)/i;

/**
 * Browser-only demo: reject scripted clients with missing/absurd UA or no
 * same-origin browser signal. Real browsers send User-Agent and Origin (or
 * Sec-Fetch-Site) on POST. No captcha. Headers are spoofable — not auth.
 */
export function assertBrowserBotSignals(request: Request) {
  const ua = (request.headers.get("user-agent") ?? "").trim();
  if (!ua || ua.length < 12 || ABSURD_UA.test(ua))
    throw new ChatRequestError(
      429,
      "Automated clients are not allowed on this demo endpoint.",
      60,
    );

  const origin = request.headers.get("origin");
  const expected = process.env.APP_ORIGIN || new URL(request.url).origin;
  const site = request.headers.get("sec-fetch-site");

  if (
    site === "cross-site" ||
    (origin && origin !== expected)
  )
    throw new ChatRequestError(403, "Cross-site requests are not allowed.");

  // Empty Origin is fine only when the browser marks the request same-origin.
  if (!origin && site !== "same-origin" && site !== "none")
    throw new ChatRequestError(
      429,
      "Browser origin is required for chat requests.",
      60,
    );
}

// ARGV[1]=dailyLimit, ARGV[2]=providerCallCost. Daily counter is provider calls;
// IP sustained/cooldown still count accepted turns (INCR 1).
const RATE_SCRIPT = `
local cost=tonumber(ARGV[2])
local daily=tonumber(redis.call('GET',KEYS[3]) or '0')
if daily+cost>tonumber(ARGV[1]) then return {0,86400} end
if redis.call('EXISTS',KEYS[2])==1 then return {0,math.max(1,redis.call('TTL',KEYS[2]))} end
local requests=tonumber(redis.call('GET',KEYS[1]) or '0')
if requests>=8 then return {0,math.max(1,redis.call('TTL',KEYS[1]))} end
redis.call('SET',KEYS[2],'1','EX',3)
if redis.call('INCR',KEYS[1])==1 then redis.call('EXPIRE',KEYS[1],600) end
local newDaily=redis.call('INCRBY',KEYS[3],cost)
if newDaily==cost then redis.call('EXPIRE',KEYS[3],90000) end
return {1,0}`;

function dailyLimitValue() {
  const requested = Number(process.env.CHAT_DAILY_LIMIT ?? 200);
  return Number.isInteger(requested) && requested > 0
    ? Math.min(requested, 10000)
    : 200;
}

/**
 * Reserve IP/daily budget for `providerCalls` about to start.
 * In-memory session/cooldown gates run before Redis so a local 429
 * does not burn shared quota.
 */
export async function reserveRequest(
  request: Request,
  providerCalls = PROVIDER_CALLS_PER_TURN,
) {
  const cost =
    Number.isInteger(providerCalls) && providerCalls > 0
      ? providerCalls
      : PROVIDER_CALLS_PER_TURN;
  const ip = clientAddress(request),
    day = new Date().toISOString().slice(0, 10);
  const dailyLimit = dailyLimitValue();

  // In-memory session gate (includes min-interval) before any Redis spend.
  // Record the hit only after durable reservation succeeds.
  const session = sessionFingerprint(request);
  const sessionLimit = prepareSessionToken(session);
  if (!sessionLimit.ok)
    throw new ChatRequestError(
      429,
      "Please wait before sending another message.",
      sessionLimit.retryAfterSec,
    );

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
          cost,
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
      sessionLimit.commit();
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
    if (globalCount + cost > dailyLimit)
      throw new ChatRequestError(429, "Daily request limit reached.", 86400);
    const limit = prepareHit(
      ipHits,
      ip,
      Date.now(),
      WINDOW_MS,
      IP_SUSTAINED,
      MIN_INTERVAL_MS,
    );
    if (!limit.ok)
      throw new ChatRequestError(
        429,
        "Please wait before sending another message.",
        limit.retryAfterSec,
      );
    limit.commit();
    sessionLimit.commit();
    globalCount += cost;
  }
}

function assertDeclaredBodySize(request: Request) {
  const declared = request.headers.get("content-length");
  if (declared == null) return;
  // Decimal sizes only. Number("1e7") and Number("12_001") must not skip this.
  if (!/^\d{1,7}$/.test(declared) || Number(declared) > MAX_BYTES)
    throw new ChatRequestError(413, "Request too large.");
}

/**
 * Copy at most MAX_BYTES, then cancel. Byte-stream bodies (real HTTP
 * requests) are read with a BYOB buffer so a missing or undersized
 * Content-Length cannot pull a multi-megabyte chunk into the parser.
 */
async function readCappedBody(request: Request): Promise<string> {
  assertDeclaredBodySize(request);
  const stream = request.body;
  if (!stream) throw new ChatRequestError(400, "Missing message.");

  let reader: ReadableStreamBYOBReader | ReadableStreamDefaultReader<Uint8Array>;
  let byob = true;
  try {
    reader = stream.getReader({ mode: "byob" });
  } catch {
    byob = false;
    reader = stream.getReader();
  }

  const decoder = new TextDecoder();
  let raw = "";
  let bytes = 0;
  const deadline = Date.now() + BODY_DEADLINE_MS;
  const drop = () => {
    void reader.cancel().catch(() => {});
  };

  try {
    while (true) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        drop();
        throw new ChatRequestError(408, "Request body timed out.");
      }

      const readPromise: Promise<ReadableStreamReadResult<Uint8Array>> = byob
        ? (reader as ReadableStreamBYOBReader).read(
            new Uint8Array(MAX_BYTES + 1 - bytes),
          )
        : (reader as ReadableStreamDefaultReader<Uint8Array>).read();

      let timer: ReturnType<typeof setTimeout> | undefined;
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await Promise.race([
          readPromise,
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              reject(new ChatRequestError(408, "Request body timed out."));
            }, remaining);
          }),
        ]);
      } catch (err) {
        void readPromise.catch(() => {});
        drop();
        throw err;
      } finally {
        clearTimeout(timer);
      }

      if (result.done) break;
      const chunk = result.value;
      if (!chunk || chunk.byteLength === 0) continue;
      if (bytes + chunk.byteLength > MAX_BYTES) {
        drop();
        throw new ChatRequestError(413, "Request too large.");
      }
      bytes += chunk.byteLength;
      raw += decoder.decode(chunk, { stream: true });
    }
    raw += decoder.decode();
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // cancel() may already have released the reader.
    }
  }

  if (bytes > MAX_BYTES || raw.length > MAX_BYTES)
    throw new ChatRequestError(413, "Request too large.");
  return raw;
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
  const raw = await readCappedBody(request);
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

/**
 * Single entry for chat routes that spend provider budget.
 * Charges PROVIDER_CALLS_PER_TURN (2) provider calls per committed turn.
 *
 * Call `commit()` once after confirming the request will hit providers
 * (e.g. API key present). Call `release()` in `finally`.
 */
export async function enforceChatQuota(
  request: Request,
): Promise<ChatQuotaGrant> {
  const ip = clientAddress(request);
  const session = sessionFingerprint(request);
  assertBrowserBotSignals(request);
  const { prompt, provider } = await acceptPrompt(request);
  // After bot + body checks so curl floods cannot poison the high-freq bucket.
  noteAttempt(ip);
  const release = acquireInflight(ip, session);
  let committed = false;
  try {
    noteIdentical(`${ip}|${session}`, prompt);
    return {
      prompt,
      provider,
      release,
      async commit(providerCalls = PROVIDER_CALLS_PER_TURN) {
        if (committed) return;
        await reserveRequest(request, providerCalls);
        committed = true;
      },
    };
  } catch (e) {
    release();
    throw e;
  }
}
