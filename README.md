# Starcloud Simulator

Interactive simulator comparing a [Starcloud](https://www.starcloud.com) orbital AI datacenter with a terrestrial cluster. The homepage is the simulator: a black full-viewport canvas, a dotted world map, live metrics, a space-versus-ground path, and a chat field.

Figures that come from the white paper live in `lib/starcloud/constants.ts`. Source: Ezra Feilden, Adi Oltean, and Philip Johnston, “Why we should train AI in space”, Lumen Orbit (now Starcloud), white paper v1.03, September 2024. Stand-ins are labeled in that file and in the interface. They are not paper measurements.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run lint
npm run build
```

`npm run build` is the production check. `npm start` serves that build.

## Live chat

Keys are server-only. Do not prefix them with `NEXT_PUBLIC_` and do not commit real values.

| Variable | Role |
| --- | --- |
| `XAI_API_KEY` | Preferred. Calls Grok on the xAI API. |
| `XAI_MODEL` | Optional. Defaults to `grok-4.7`. |
| `OPENAI_API_KEY` | Used only when `XAI_API_KEY` is empty. |
| `OPENAI_MODEL` | Optional. Defaults to `gpt-4.1-mini`. |

Without either key, Send still plays the uplink animation and then shows an error. The page does not invent an answer.

Both columns are separate samples of the same model. Energy, water, and cost come from the local engines, not from the model.

## What is simulated

The live session integrates the paper’s 40 MW cluster at a shell idle duty cycle (`SIMULATION` in `constants.ts`). Sending a prompt raises both venues to a higher shell duty cycle until the request finishes, so the counters speed up. Capacity factor is shown, not multiplied into that load: the ~24% figure is terrestrial solar, and the ground cluster is priced on the grid.

Token rate uses a ground baseline where the paper is silent: SemiAnalysis InferenceMAX, about 900,000 tokens per second per all-in provisioned megawatt for an HGX H100 running gpt-oss 120B at FP4. That megawatt is utility power. The simulator maps it onto the paper’s compute megawatts and labels the mapping as a high stand-in. Both venues share it.

Reply cost uses that same joules-per-token figure. Space is charged the paper’s $0.002/kWh. Ground is the US wholesale $0.045/kWh plus the paper’s 5% chiller share. Water is 0 L/kWh in orbit and ~0.5 L/kWh on the ground, applied to IT energy. PUE and the absolute latency milliseconds are shell stand-ins. The vacuum-versus-fiber ratio (about 35%) is from the paper.

## Chat limits

`POST /api/chat` accepts `{ "prompt": string }` up to 2,000 characters.

- JSON only, with a small body cap
- Control characters, key-shaped strings, and simple prompt-injection phrases are rejected
- In-memory limit: 8 requests per 10 minutes per address, at least 3 seconds apart

The limit lives in the Node process (`lib/server/chat-guard.ts`). It resets on restart and does not span multiple Vercel instances. A later step can replace `takeRateToken` with Upstash Redis using `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Those variables are not read yet. No sign-in is required.

Errors returned to the browser are short and do not include provider bodies or keys.

## Deploy

Import the GitHub repository in Vercel and leave the framework preset on Next.js. Add `XAI_API_KEY` or `OPENAI_API_KEY` in the project settings if you want live answers. Merge from GitHub Desktop, then deploy the default branch.
