# Security review — September 24, 2026

Scope: the public prompt endpoint, provider adapters, browser rendering, shared spending controls, dependencies and configuration. This is a code review with deterministic negative tests, not a third-party penetration test or a guarantee that abuse is impossible.

## Controls implemented

- Keys stay in server environment variables and authorization headers. Only provider availability reaches the browser. No keys, prompts, provider bodies or hidden reasoning are logged by application code.
- Exactly one provider call per submission, fixed model allowlist, at most 2,000 input characters and 512 generated tokens. There are no tools, arbitrary URLs, conversation histories, client-supplied system messages, or automatic paid retries.
- JSON schema rejects unknown fields, unsupported providers, oversized streamed bodies and control characters. Request bodies have a five-second read deadline. Provider calls have a 45-second deadline and cancellation propagation.
- Browser cross-site requests are rejected. This is a CSRF defense, not authentication: command-line clients can omit or forge an Origin header.
- A shared Redis Lua reservation atomically checks a three-second cooldown, eight requests per ten minutes per client, and a global cap of 200 paid requests per UTC day by default. Reservations are not refunded after provider failure or cancellation, preventing refund/retry bypasses. Redis failures fail closed. Production requires Redis; development-only memory limits are not represented as deployment protection.
- Only Vercel's overwritten forwarded-IP header is trusted on Vercel. Other hosts share one bucket rather than trusting arbitrary headers. Client addresses are hashed with a daily salt and counters expire; prompts and locations are not stored in Redis. The global cap also limits distributed/IP-rotation abuse. This is a bounded request budget, not an exact dollar cap.
- Model output is rendered as React text, with no raw HTML or executable Markdown. Response/error JSON is not cached. Provider bodies are never forwarded as errors.
- Geography is local. Origin pin coordinates remain in the browser; only the message and selected provider ID go to the backend.

Production dependency audit: `npm audit --omit=dev` reported zero known vulnerabilities. Thirty automated tests passed, and the app was checked in the browser at desktop, 390px and 320px widths.

## Negative tests

The automated suite covers cross-site requests, unsupported content types, arbitrary model/tool injection, prototype-key providers, oversized streams, invalid token accounting, trusted-address handling, per-client cooldown/expiry, atomic global reservation, unavailable Redis, missing keys, Gemini failures and empty/safety-blocked responses. Adapter tests use mocks and verify request caps, secret placement, cancellation and absence of automatic retries. UI checks cover plain-text output and accessible modal behavior.

## Deployment requirements and residual risks

Set `GEMINI_API_KEY`, `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in each intended Vercel environment, then redeploy. Set provider-account spend limits and alerting. Optional `CHAT_DAILY_LIMIT` is clamped to a maximum of 10,000; the default is 200. Other applications sharing a provider key are outside this app's cap.

Unauthenticated visitors can consume the shared daily allowance and deny other visitors access until reset. IP limits can group people behind one NAT and IPv6 address rotation can bypass individual buckets; the global cap remains. Add authentication or a managed challenge in front of the endpoint if demand justifies it. Vercel Firewall should cover request floods that arrive before application limits, including malformed input and Redis traffic. A provider may bill work already started when the user cancels. Redis credentials, retention and eviction policy must be managed so counters are not unexpectedly reset.

AI safety filtering is provider-dependent. A system prompt and phrase blacklist are not spend controls or a security boundary. No local regex is presented as a jailbreak-proof filter. Provider text has no access to application credentials or execution tools. Provider data-retention policies apply to submitted messages; the UI does not promise provider-side zero retention.

No secrets were added to the repository. Live account authorization, quota, billing and Vercel environment contents are separate operational checks; mocked tests do not verify those.
