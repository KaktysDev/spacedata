import { PROVIDER_IDS, type ProviderId } from "@/lib/starcloud/catalog";
import { providerKey } from "@/lib/server/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Which providers have a server-side key. Never returns the secret. */
export function GET(request: Request) {
  // Touch the request so this GET is not prerendered with a build-time env.
  void request.headers.get("accept");
  const providers = PROVIDER_IDS.map((id) => ({
    id,
    configured: Boolean(providerKey(id)),
  }));
  return Response.json(
    { providers },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export type ProviderStatus = {
  id: ProviderId;
  configured: boolean;
};
