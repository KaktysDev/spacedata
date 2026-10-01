import {
  enforceChatQuota,
  ChatRequestError,
} from "@/lib/server/chat-guard";
import { ProviderCallError, providerKey, runAnswer } from "@/lib/server/llm";
export const maxDuration = 60;
export const runtime = "nodejs";
export async function POST(request: Request) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  let release: (() => void) | undefined;
  try {
    const grant = await enforceChatQuota(request);
    release = grant.release;
    const callable =
      providerKey(grant.provider) ||
      (grant.provider !== "gemini" && providerKey("gemini"));
    if (!callable)
      throw new ChatRequestError(503, "The AI provider is unavailable.");
    // Space + ground = 2 provider calls; daily budget counts calls not turns.
    await grant.commit(2);
    return Response.json(
      await runAnswer(grant.provider, grant.prompt, request.signal),
      { headers },
    );
  } catch (e) {
    if (e instanceof ProviderCallError) {
      console.warn("Chat provider failure", {
        provider: e.provider,
        deployment: e.deployment,
        kind: e.kind,
        upstreamStatus: e.upstreamStatus,
      });
      const messages = {
        "model-unavailable":
          "The selected AI model is unavailable to this connection.",
        connection: "The selected AI connection is unavailable.",
        capacity: "The AI provider is busy. Please try again shortly.",
        "request-rejected":
          "The AI provider rejected the app's request. Please try another model.",
        timeout: "The AI provider took too long to respond. Please try again.",
        network: "Could not connect to the AI provider. Please try again.",
        blocked: "The AI provider declined this prompt.",
        "empty-answer": "The AI provider returned no answer. Please try again.",
        "invalid-response":
          "The AI provider returned an invalid response. Please try again.",
      } as const;
      const status =
        e.kind === "timeout"
          ? 504
          : e.kind === "capacity" || e.kind === "connection"
            ? 503
            : e.kind === "blocked"
              ? 422
              : 502;
      return Response.json(
        { error: messages[e.kind], code: e.kind },
        { status, headers },
      );
    }
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
  } finally {
    release?.();
  }
}
