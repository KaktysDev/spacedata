import { ChatRequestError, acceptPrompt } from "@/lib/server/chat-guard";
import { resolveProvider, runDualAnswers } from "@/lib/server/llm";

export const maxDuration = 60;
export const runtime = "nodejs";

const MISSING_KEY =
  "Live inference is unavailable. Set XAI_API_KEY or OPENAI_API_KEY on the server.";
const PROVIDER_ERROR = "The model provider returned an error. Try again.";

export async function POST(request: Request) {
  try {
    const prompt = await acceptPrompt(request);
    if (!resolveProvider()) {
      return Response.json({ error: MISSING_KEY }, { status: 503 });
    }
    const result = await runDualAnswers(prompt);
    return Response.json(result);
  } catch (error) {
    if (error instanceof ChatRequestError) {
      const headers = new Headers();
      if (error.retryAfterSec) {
        headers.set("Retry-After", String(error.retryAfterSec));
      }
      return Response.json(
        {
          error: error.message,
          ...(error.retryAfterSec
            ? { retryAfterSec: error.retryAfterSec }
            : {}),
        },
        { status: error.status, headers },
      );
    }
    return Response.json({ error: PROVIDER_ERROR }, { status: 502 });
  }
}
