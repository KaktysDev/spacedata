import {
  acceptPrompt,
  ChatRequestError,
  reserveRequest,
} from "@/lib/server/chat-guard";
import { providerKey, runAnswer } from "@/lib/server/llm";
export const maxDuration = 60;
export const runtime = "nodejs";
export async function POST(request: Request) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  try {
    const { prompt, provider } = await acceptPrompt(request);
    if (!providerKey(provider))
      throw new ChatRequestError(
        503,
        "This model is not connected yet. Choose another model or preview the route.",
      );
    await reserveRequest(request);
    return Response.json(await runAnswer(provider, prompt, request.signal), {
      headers,
    });
  } catch (e) {
    const known = e instanceof ChatRequestError;
    if (known && e.retryAfterSec)
      headers.set("Retry-After", String(e.retryAfterSec));
    return Response.json(
      {
        error: known
          ? e.message
          : "The AI provider could not complete this request. Please try again later.",
      },
      { status: known ? e.status : 502, headers },
    );
  }
}
