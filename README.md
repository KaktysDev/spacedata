# Starcloud Simulator

Interactive simulator comparing a [Starcloud](https://www.starcloud.com) orbital AI datacenter with a terrestrial cluster. The homepage follows a prompt from New York to an illustrative constellation above a curved Earth and to a Nevada ground datacenter. An SVG geographic scene animates uplink, relay, and return paths without requiring WebGL. The prompt composer, modeled metrics, and answer comparison remain in normal document flow.

Figures that come from the white paper live in `lib/starcloud/constants.ts`. Source: Ezra Feilden, Adi Oltean, and Philip Johnston, “Why we should train AI in space”, Lumen Orbit (now Starcloud), white paper v1.03, September 2024. Stand-ins are labeled in that file. The live shell keeps them behind Sources.

## Run locally

```bash
npm ci
# Optional for local live AI: copy .env.example to .env.local and add your key.
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run lint
npm test
npm run build
```

`npm run build` uses Next.js’s supported webpack compiler for a reliable production check. `npm start` serves that build. Geist fonts and Natural Earth map data are bundled locally; rendering and builds do not fetch remote fonts or map tiles.

## Live chat

Keys are server-only. Do not prefix them with `NEXT_PUBLIC_` and do not commit real values.

| Variable | Role |
| --- | --- |
| `GEMINI_API_KEY` | Calls Google Gemini. |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Alias, used only when `GEMINI_API_KEY` is empty. |
| `GEMINI_MODEL` | Optional. Defaults to `gemini-2.5-flash`. |

With a server key (including one configured in Vercel), the app defaults to Live AI. Without a key, it defaults to Simulation: Send completes the entire route and shows the modeled comparison without calling an AI or inventing answers. You can switch to Simulation even when a key is configured. A boolean availability flag is the only configuration sent to the browser.

Both live answer columns are separate samples of the same Gemini model, not requests to physical orbital hardware. Energy, water, and network latency come from local engines. Prompts are preserved after success, cancellation, and errors. Cancel stops the active browser request and resets the journey. Provider retries share one 45-second deadline; the client has a 55-second limit.

## What is simulated

The live session integrates the paper’s 40 MW cluster at a shell idle duty cycle (`SIMULATION` in `constants.ts`). Sending a prompt raises both venues to a higher shell duty cycle until the request finishes, so cost and water speed up. Capacity factor is cited, not multiplied into that load: the ~24% figure is terrestrial solar, and the ground cluster is priced on the grid.

Token rate uses a ground baseline where the paper is silent: SemiAnalysis InferenceMAX, about 900,000 tokens per second per all-in provisioned megawatt for an HGX H100 running gpt-oss 120B at FP4. That megawatt is utility power. The simulator maps it onto the paper’s compute megawatts. Both venues share it.

Reply cost uses that same joules-per-token figure. Space is charged the paper’s $0.002/kWh. Ground is the US wholesale $0.045/kWh plus the paper’s 5% chiller share. Water is 0 L/kWh in orbit and ~0.5 L/kWh on the ground, applied to IT energy. The absolute latency milliseconds are a shell stand-in. The vacuum-versus-fiber ratio (about 35%) is from the paper.

## Chat limits

`POST /api/chat` accepts `{ "prompt": string }` up to 2,000 characters.

- JSON only, with a small body cap
- Control characters, key-shaped strings, and simple prompt-injection phrases are rejected
- In-memory limit: 8 requests per 10 minutes per address, at least 3 seconds apart

The limit lives in the Node process (`lib/server/chat-guard.ts`). It resets on restart and does not span multiple Vercel instances. A later step can replace `takeRateToken` with Upstash Redis using `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Those variables are not read yet. No sign-in is required.

Errors returned to the browser are short and do not include provider bodies or keys.

## Deploy

Import the GitHub repository in Vercel and leave the framework preset on Next.js. Add `GEMINI_API_KEY` in the project settings if you want live answers. Merge from GitHub Desktop, then deploy the default branch.

## UI verification

`npm test` runs deterministic model and API contract tests with mocked provider responses; no real API key or paid requests are needed. Browser checks cover desktop and mobile layout, sending and repeating prompts, cancellation, the explanation dialog, route filters, and motion controls.

- Enter sends; Shift+Enter adds a line. IME composition does not submit accidentally.
- The map keeps a stable height when results arrive; long answers wrap in the document.
- Motion can be disabled with the scene control and respects the OS reduced-motion preference.
- Satellite positions, network timing, and route geometry are illustrative, with assumptions explained in the dialog.
- The Gemini key already configured in Vercel remains server-only; no client-side key is needed.
