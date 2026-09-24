export type ChatProviderId = "gemini";

export type ChatAnswer = {
  text: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  usageEstimated: boolean;
};

export type ChatSuccessBody = {
  provider: ChatProviderId;
  model: string;
  space: ChatAnswer;
  ground: ChatAnswer;
};

export function isChatAnswer(value: unknown): value is ChatAnswer {
  if (!value || typeof value !== "object") return false;
  const answer = value as Partial<ChatAnswer>;
  return (
    typeof answer.text === "string" &&
    answer.text.trim().length > 0 &&
    typeof answer.promptTokens === "number" &&
    typeof answer.completionTokens === "number" &&
    typeof answer.totalTokens === "number" &&
    typeof answer.usageEstimated === "boolean"
  );
}

export function isChatSuccessBody(value: unknown): value is ChatSuccessBody {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<ChatSuccessBody>;
  return (
    body.provider === "gemini" &&
    typeof body.model === "string" &&
    isChatAnswer(body.space) &&
    isChatAnswer(body.ground)
  );
}
