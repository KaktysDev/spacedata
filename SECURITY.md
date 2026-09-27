# Security review — September 24, 2026

Scope: the public prompt endpoint, provider adapters, browser rendering, shared spending controls, dependencies and configuration. This is a code review with deterministic negative tests, not a third-party penetration test or a guarantee that abuse is impossible.

## Controls implemented

- Keys stay in server environment variables and authorization headers. Only provider availability reaches the browser. No keys, prompts, provider bodies or hidden reasoning are logged by application code.
- Each accepted chat turn runs two provider calls (space + ground) via `runAnswer` / `Promise.all`, fixed model allowlist, at most 2,000 input characters and 512 generated tokens (360 for space). There are no tools, arbitrary URLs, conversation histories, client-supplied system messages, or automatic paid retries.
- JSON schema rejects unknown fields, non-object JSON, unsupported providers, oversized streamed bodies and control characters. The body reader copies at most 12,000 bytes and cancels the remainder, including when `Content-Length` is missing or smaller than the bytes on the wire. A `Content-Length` that is above 12,000 bytes or not a short decimal integer is rejected before the body is read. Request bodies have a five-second read deadline. Provider calls have a 45-second deadline and cancellation propagation.
- Browser cross-site requests are rejected. Scripted clients with missing/absurd User-Agent or no same-origin Origin/`Sec-Fetch-Site` signal get 429. This is a CSRF + light bot filter, not authentication: forged browser headers (Mozilla UA + Origin + Sec-Fetch-Site) still pass the soft check.
- `enforceChatQuota` (`lib/server/chat-guard.ts`) gates `/api/chat` once per HTTP turn. Internal space/ground fan-out must not call the guard again. `commit(2)` charges the daily budget for two provider calls after the provider key check so missing keys do not burn budget. Reservations are not refunded after cancel or provider error.
- Shared Redis Lua reservation (when configured) atomically checks a three-second cooldown, eight accepted turns per ten minutes per client IP, and a global cap of `CHAT_DAILY_LIMIT` **provider calls** per UTC day (default 200 calls ≈ 100 user turns). In-memory best-effort session/cooldown gates run **before** Redis so a local 429 does not burn IP/daily quota. Memory also adds per-session/fingerprint sustained limits (12/10 min), one in-flight request per IP and session, identical-prompt spam (3/2 min), and high-frequency probes (13th attempt in 15 s, recorded only after browser + body checks pass). Serverless instances do not share memory; Redis + the global daily cap still bind spend. Redis failures fail closed. Production requires Redis; development-only memory limits are not represented as deployment protection. Attempt/identical maps are capped like other in-memory trackers (`MAX_TRACKED_KEYS`).
- Only Vercel's overwritten forwarded-IP header is trusted on Vercel. Other hosts share one bucket rather than trusting arbitrary headers. Client addresses are hashed with a daily salt and counters expire; prompts and locations are not stored in Redis. Session identity is a soft UA + Accept-Language fingerprint only — no client-supplied session cookie is treated as auth. The global call cap also limits distributed/IP-rotation abuse. This is a bounded request budget, not an exact dollar cap.
- Model output is rendered as React text, with no raw HTML or executable Markdown. Response/error JSON is not cached. Provider bodies are never forwarded as errors.
- Geography is local. Origin pin coordinates remain in the browser; only the message and selected provider ID go to the backend.

Production dependency audit: `npm audit --omit=dev` reported zero known vulnerabilities. Thirty automated tests passed, and the app was checked in the browser at desktop, 390px and 320px widths.

## Negative tests

The automated suite covers cross-site requests, unsupported content types, arbitrary model/tool injection, prototype-key providers, oversized and slow streams (including multi-megabyte bodies with a missing or undersized `Content-Length`), hidden prompts, reject paths that must not spend the daily budget, invalid token accounting, trusted-address handling, per-client cooldown/expiry, atomic global reservation (2 calls per turn), session failure without Redis spend, soft bot-check residual spoof risk, unavailable Redis, missing keys, Gemini failures and empty/safety-blocked responses. Adapter tests use mocks and verify request caps, secret placement, cancellation and absence of automatic retries. UI checks cover plain-text output and accessible modal behavior.

## Deployment requirements and residual risks

Set `GEMINI_API_KEY`, `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in each intended Vercel environment, then redeploy. Set provider-account spend limits and alerting in each vendor dashboard. Optional `CHAT_DAILY_LIMIT` is clamped to a maximum of 10,000 provider calls; the default is 200. Other applications sharing a provider key are outside this app's cap.

**Outside this repo:** configure a Vercel Firewall rate limit on `POST /api/chat` (this application does not ship firewall config files). Also set hard billing caps in the LLM provider dashboards. Application Redis limits alone are not flood protection for traffic that never reaches Node. The 12,000-byte copy limit does not shrink bytes a proxy already buffered, and a Node stream may still push one high-water-mark chunk before cancel.

Unauthenticated visitors can consume the shared daily allowance and deny other visitors access until reset. IP limits can group people behind one NAT and IPv6 address rotation can bypass individual buckets; the global cap remains. Add authentication or a managed challenge in front of the endpoint if demand justifies it. A provider may bill work already started when the user cancels. Redis credentials, retention and eviction policy must be managed so counters are not unexpectedly reset.

AI safety filtering is provider-dependent. A system prompt and phrase blacklist are not spend controls or a security boundary. No local regex is presented as a jailbreak-proof filter. Provider text has no access to application credentials or execution tools. Provider data-retention policies apply to submitted messages; the UI does not promise provider-side zero retention.

No secrets were added to the repository. Live account authorization, quota, billing and Vercel environment contents are separate operational checks; mocked tests do not verify those.
