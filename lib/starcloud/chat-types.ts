import { isProvider, type ProviderId } from "./catalog";
export type ChatProviderId = ProviderId;
export type ChatAnswer = {
  text: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens: number;
  usageEstimated: boolean;
  latencyMs: number;
};
export type ChatSuccessBody = {
  provider: ProviderId;
  model: string;
  ground: ChatAnswer;
  space: ChatAnswer;
  /** Combined wall time for both provider calls. */
  latencyMs: number;
  completedAt: string;
};
export function isChatAnswer(value: unknown): value is ChatAnswer {
  if (!value || typeof value !== "object") return false;
  const a = value as ChatAnswer;
  return (
    typeof a.text === "string" &&
    a.text.trim().length > 0 &&
    a.text.length <= 8000 &&
    [a.promptTokens, a.completionTokens, a.totalTokens, a.cachedTokens].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    ) &&
    a.cachedTokens <= a.promptTokens &&
    a.totalTokens >= a.promptTokens + a.completionTokens &&
    typeof a.usageEstimated === "boolean" &&
    Number.isFinite(a.latencyMs) &&
    a.latencyMs >= 0
  );
}
export function isChatSuccessBody(value: unknown): value is ChatSuccessBody {
  if (!value || typeof value !== "object") return false;
  const b = value as ChatSuccessBody;
  return (
    isProvider(b.provider) &&
    typeof b.model === "string" &&
    isChatAnswer(b.ground) &&
    isChatAnswer(b.space) &&
    Number.isFinite(b.latencyMs) &&
    b.latencyMs >= 0 &&
    typeof b.completedAt === "string"
  );
}
