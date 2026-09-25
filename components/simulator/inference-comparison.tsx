"use client";

import { useEffect, useRef } from "react";

import type { ChatAnswer } from "@/lib/starcloud/chat-types";
import { priceTokens, venueRates } from "@/lib/starcloud/engine";
import { formatLiters, formatUsdPlain } from "@/lib/starcloud/format";
import { SourcesNote } from "@/components/simulator/sources-note";
import { useSimulator } from "@/components/simulator/simulator-provider";

const BILLION = 1_000_000_000;

function formatMultiple(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}×`;
}

function DeltaTile({
  value,
  detail,
  label,
  water,
}: {
  value: string;
  detail: string;
  label: string;
  water?: boolean;
}) {
  return (
    <div className="min-w-0 px-4 py-3.5 sm:px-5">
      <p
        className={`font-mono text-2xl leading-none tracking-tight tabular-nums ${water ? "text-water" : "text-white"}`}
      >
        {value}
      </p>
      <p className="mt-2 font-mono text-[12px] text-white/50 tabular-nums">
        {detail}
      </p>
      <p className="mt-2 text-[11px] tracking-[0.16em] text-white/45 uppercase">
        {label}
      </p>
    </div>
  );
}

function AnswerColumn({
  kicker,
  title,
  answer,
}: {
  kicker: string;
  title: string;
  answer: ChatAnswer;
}) {
  return (
    <article className="min-w-0 px-4 py-4 sm:px-5">
      <p className="text-[11px] tracking-[0.16em] text-white/45 uppercase">
        {kicker}
      </p>
      <h3 className="mt-1 text-base font-medium tracking-tight">{title}</h3>
      <p className="mt-3 max-h-40 overflow-y-auto text-[15px] leading-7 whitespace-pre-wrap text-white">
        {answer.text}
      </p>
    </article>
  );
}

export function InferenceComparison() {
  const { prompt, result, error, showBaseline, reducedMotion } = useSimulator();
  const panelRef = useRef<HTMLElement>(null);
  const quoted =
    prompt && prompt.length > 160 ? `${prompt.slice(0, 157)}…` : prompt;

  useEffect(() => {
    const node = panelRef.current;
    const scroller = node?.parentElement;
    if (!scroller) return;
    scroller.scrollTo({
      top: 0,
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, [reducedMotion, result, error, prompt]);

  const priceMultiple =
    venueRates("ground").costUsdPerItKwh / venueRates("space").costUsdPerItKwh;
  const perBillionSpace = priceTokens("space", BILLION, false);
  const perBillionGround = priceTokens("ground", BILLION, false);
  const latencyGap = perBillionGround.latencyMs - perBillionSpace.latencyMs;

  return (
    <section ref={panelRef} aria-label="Prompt comparison" className="grid gap-3">
      <div className="border border-white bg-black">
        <div className="px-4 pt-4 sm:px-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-[11px] tracking-[0.16em] text-white/45 uppercase">
              This prompt
            </p>
            {result ? (
              <p className="font-mono text-[11px] text-white/40">
                Gemini · {result.model}
              </p>
            ) : null}
          </div>
          <h2 className="mt-3 text-[1.65rem] leading-none font-medium tracking-tight sm:text-3xl">
            Ground costs {formatMultiple(priceMultiple)} more
          </h2>
          <p className="mt-3 text-sm leading-6 text-white/55">
            Cost and water are for one billion tokens.
          </p>
          {quoted ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/70">
              “{quoted}”
            </p>
          ) : null}
        </div>
        <div className="mt-4 grid divide-y divide-white/25 border-t border-white/25 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <DeltaTile
            value={formatUsdPlain(perBillionGround.energyCostUsd)}
            detail={`${formatUsdPlain(perBillionSpace.energyCostUsd)} in orbit`}
            label="Energy cost"
          />
          <DeltaTile
            value={`${formatLiters(perBillionGround.waterLiters)} L`}
            detail="Orbit stays at 0"
            label="Water"
            water
          />
          <DeltaTile
            value={`+${latencyGap.toFixed(1)} ms`}
            detail={`${perBillionSpace.latencyMs.toFixed(1)} → ${perBillionGround.latencyMs.toFixed(1)}`}
            label="Latency"
          />
        </div>
      </div>

      {result ? (
        <div className="grid divide-y divide-white/25 border border-white bg-black md:grid-cols-2 md:divide-x md:divide-y-0">
          <AnswerColumn kicker="Space" title="Starcloud" answer={result.space} />
          <AnswerColumn
            kicker="Ground"
            title="Terrestrial"
            answer={result.ground}
          />
        </div>
      ) : (
        <p className="border border-white bg-black px-4 py-4 text-[15px] leading-7 text-white sm:px-5">
          {error ?? "The model response was incomplete."}
        </p>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3 px-1">
        <SourcesNote />
        <button
          type="button"
          onClick={showBaseline}
          className="min-h-11 shrink-0 border border-white px-4 text-[11px] tracking-[0.16em] uppercase hover:bg-white hover:text-black focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Back
        </button>
      </div>
    </section>
  );
}
