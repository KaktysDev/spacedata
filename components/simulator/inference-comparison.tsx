"use client";
import type { ChatSuccessBody } from "@/lib/starcloud/chat-types";
import { Modal } from "./modal";
export function InferenceComparison({
  result,
  onClose,
}: {
  result: ChatSuccessBody | null;
  onClose: () => void;
}) {
  return (
    <Modal title="Answer" quiet onClose={onClose}>
      <p className="answer-body">
        {result?.answer.text || "No answer came back."}
      </p>
      {result ? (
        <p className="answer-meta">
          {(result.latencyMs / 1000).toFixed(1)} s
        </p>
      ) : null}
    </Modal>
  );
}
