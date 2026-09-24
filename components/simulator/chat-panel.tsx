"use client";

import { type FormEvent, useState } from "react";

import { CHAT_MAX_CHARS } from "@/lib/starcloud/constants";
import { useSimulator } from "@/components/simulator/simulator-provider";

export function ChatPanel() {
  const { busy, submitPrompt } = useSimulator();
  const [draft, setDraft] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = draft.trim();
    if (!prompt || busy) return;
    const accepted = await submitPrompt(prompt);
    if (accepted) setDraft("");
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-busy={busy}
      className="border border-white bg-black focus-within:outline focus-within:outline-1 focus-within:outline-offset-2 focus-within:outline-white"
    >
      <div className="flex items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4">
        <label htmlFor="simulator-prompt" className="sr-only">
          Prompt
        </label>
        <input
          id="simulator-prompt"
          name="prompt"
          value={draft}
          onChange={(event) =>
            setDraft(event.target.value.slice(0, CHAT_MAX_CHARS))
          }
          placeholder="Ask both datacenters"
          autoComplete="off"
          maxLength={CHAT_MAX_CHARS}
          disabled={busy}
          className="min-h-11 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/40 disabled:text-white/50"
        />
        <button
          type="submit"
          disabled={busy || draft.trim().length === 0}
          className="min-h-11 shrink-0 border border-white px-4 text-[11px] tracking-[0.16em] text-white uppercase hover:bg-white hover:text-black focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-white"
        >
          {busy ? "Sending" : "Send"}
        </button>
      </div>
    </form>
  );
}
