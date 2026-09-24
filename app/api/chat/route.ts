import { CHAT_MAX_CHARS } from "@/lib/starcloud/constants";
import { resolveProvider, runDualAnswers } from "@/lib/server/llm";

export const maxDuration = 60;
export const runtime = "nodejs";

const MISSING_KEY =
  "Live inference is unavailable. Set XAI_API_KEY or OPENAI_API_KEY on the server.";

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { error: "Request body must be JSON." },
      { status: 400 },
    );
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return Response.json({ error: "Prompt must be text." }, { status: 400 });
  }

  const prompt = (payload as { prompt?: unknown }).prompt;
  if (typeof prompt !== "string") {
    return Response.json({ error: "Prompt must be text." }, { status: 400 });
  }

  const trimmed = prompt.trim();
  if (!trimmed) {
    return Response.json({ error: "Prompt must be text." }, { status: 400 });
  }
  if (trimmed.length > CHAT_MAX_CHARS) {
    return Response.json(
      { error: `Keep the prompt under ${CHAT_MAX_CHARS} characters.` },
      { status: 413 },
    );
  }

  if (!resolveProvider()) {
    return Response.json({ error: MISSING_KEY }, { status: 503 });
  }

  try {
    const result = await runDualAnswers(trimmed);
    return Response.json(result);
  } catch {
    return Response.json(
      { error: "The model provider returned an error. Try again." },
      { status: 502 },
    );
  }
}
