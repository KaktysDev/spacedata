import { isProvider } from "./catalog.mjs";
export function isChatAnswer(value) {
    if (!value || typeof value !== "object")
        return false;
    const a = value;
    return (typeof a.text === "string" &&
        a.text.trim().length > 0 &&
        a.text.length <= 8000 &&
        [a.promptTokens, a.completionTokens, a.totalTokens, a.cachedTokens].every((n) => Number.isSafeInteger(n) && n >= 0) &&
        a.cachedTokens <= a.promptTokens &&
        a.totalTokens >= a.promptTokens + a.completionTokens &&
        typeof a.usageEstimated === "boolean" &&
        Number.isFinite(a.latencyMs) &&
        a.latencyMs >= 0);
}
export function isChatSuccessBody(value) {
    if (!value || typeof value !== "object")
        return false;
    const b = value;
    return (isProvider(b.provider) &&
        typeof b.model === "string" &&
        isChatAnswer(b.ground) &&
        isChatAnswer(b.space) &&
        Number.isFinite(b.latencyMs) &&
        b.latencyMs >= 0 &&
        typeof b.completedAt === "string");
}
