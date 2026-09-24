# Starcloud Simulator

Stage 1 shell for comparing [Starcloud](https://www.starcloud.com) orbital AI datacenters with terrestrial clusters. The page is a black full-viewport canvas, a dotted world map, live metric cards, a space-versus-ground comparison, and a chat field. Prompt routing, path animation, and model calls come later.

Figures are taken from Ezra Feilden, Adi Oltean, and Philip Johnston, “Why we should train AI in space”, Lumen Orbit (now Starcloud), white paper v1.03, September 2024. They live in `lib/starcloud/constants.ts`.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run lint
npm run build
```

`npm run build` is the production check. `npm start` serves that build.

## Environment

```bash
cp .env.example .env.local
```

`XAI_API_KEY` and `OPENAI_API_KEY` are reserved for a later stage. This shell does not call either provider. Leave the values empty. Do not commit real keys.

## What this stage includes

- Next.js App Router, TypeScript, and Tailwind, ready for Vercel
- Full-viewport scene canvas (dotted map now, React Three Fiber later)
- Top bar titled Starcloud Simulator
- Live cards for PUE, energy, water, latency, and capacity factor
- Side-by-side Space (Starcloud) and Ground panels
- Chat input whose submit handler does nothing yet
- Soft blue used only on the water readouts

## Deploy

Import the GitHub repository in Vercel and leave the framework preset on Next.js. No environment variables are required for this stage. Merge from GitHub Desktop, then deploy the default branch.

## Out of scope

LLM calls, orbital-versus-ground path animation, auth, rate limits, and the Vercel deploy itself.
