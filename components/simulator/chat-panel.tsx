"use client";

import { type FormEvent, useState } from "react";

import { CHAT_MAX_CHARS } from "@/lib/starcloud/constants";
import { useSimulator } from "@/components/simulator/simulator-provider";

export function ChatPanel() {
  const { busy, submitPrompt } = useSimulator();
  const [draft, setDraft] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = draft.trim();
    if (!prompt || busy) return;
    submitPrompt(prompt);
    setDraft("");
  }

  return (
    <form onSubmit={handleSubmit} className="border border-white bg-black">
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
          placeholder="Compare a prompt across orbit and ground"
          autoComplete="off"
          maxLength={CHAT_MAX_CHARS}
          disabled={busy}
          className="min-h-11 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/40 disabled:text-white/50"
        />
        <button
          type="submit"
          disabled={busy || draft.trim().length === 0}
          className="min-h-11 shrink-0 border border-white px-4 text-[11px] tracking-[0.18em] text-white uppercase hover:bg-white hover:text-black focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-white"
        >
          {busy ? "Routing" : "Send"}
        </button>
      </div>
    </form>
  );
}
