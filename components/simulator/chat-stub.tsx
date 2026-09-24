"use client";

import { type FormEvent, useState } from "react";

export function ChatStub() {
  const [draft, setDraft] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Compare a prompt across orbit and ground"
          autoComplete="off"
          className="min-h-11 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/40"
        />
        <button
          type="submit"
          className="min-h-11 shrink-0 border border-white px-4 text-[11px] tracking-[0.18em] text-white uppercase hover:bg-white hover:text-black focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Send
        </button>
      </div>
    </form>
  );
}
