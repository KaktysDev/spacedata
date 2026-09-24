"use client";

import type { ChatAnswer } from "@/lib/starcloud/chat-types";
import { PAPER } from "@/lib/starcloud/constants";
import {
  priceTokens,
  venueRates,
  type ReplyCost,
} from "@/lib/starcloud/engine";
import {
  formatCompactCount,
  formatMilliliters,
  formatReplyUsd,
  formatWattHours,
} from "@/lib/starcloud/format";
import { useSimulator } from "@/components/simulator/simulator-provider";

const BILLION = 1_000_000_000;

function formatMultiple(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}×`;
}

function Delta({
  value,
  label,
  water,
}: {
  value: string;
  label: string;
  water?: boolean;
}) {
  return (
    <div className="bg-black px-3 py-3 sm:px-4">
      <p
        className={`font-mono text-2xl leading-none tracking-tight tabular-nums ${water ? "text-water" : "text-white"}`}
      >
        {value}
      </p>
      <p className="mt-2 text-[10px] tracking-[0.16em] text-white/55 uppercase">
        {label}
      </p>
    </div>
  );
}

function AnswerColumn({
  kicker,
  title,
  answer,
  cost,
}: {
  kicker: string;
  title: string;
  answer: ChatAnswer;
  cost: ReplyCost;
}) {
  return (
    <article className="flex min-w-0 flex-col border border-white bg-black px-4 py-3 sm:px-5">
      <p className="text-[10px] tracking-[0.22em] text-white/60 uppercase">
        {kicker}
      </p>
      <h2 className="mt-1 text-lg leading-tight font-medium tracking-tight">
        {title}
      </h2>
      <p className="mt-3 max-h-40 overflow-y-auto text-sm leading-6 text-white">
        {answer.text}
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-white/40 pt-3 font-mono text-[12px] tabular-nums">
        <div>
          <dt className="text-[10px] tracking-[0.16em] text-white/50 uppercase">
            Tokens
          </dt>
          <dd>{formatCompactCount(cost.tokens)}</dd>
        </div>
        <div>
          <dt className="text-[10px] tracking-[0.16em] text-white/50 uppercase">
            Energy
          </dt>
          <dd>{formatWattHours(cost.itKwh)}</dd>
        </div>
        <div>
          <dt className="text-[10px] tracking-[0.16em] text-white/50 uppercase">
            Cost
          </dt>
          <dd>{formatReplyUsd(cost.energyCostUsd)}</dd>
        </div>
        <div>
          <dt className="text-[10px] tracking-[0.16em] text-water uppercase">
            Water
          </dt>
          <dd className="text-water">{formatMilliliters(cost.waterLiters)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-[10px] tracking-[0.16em] text-white/50 uppercase">
            Latency
          </dt>
          <dd>{cost.latencyMs.toFixed(1)} ms shell</dd>
        </div>
      </dl>
    </article>
  );
}

export function InferenceComparison() {
  const { prompt, result, error, showBaseline } = useSimulator();
  const quoted =
    prompt && prompt.length > 160 ? `${prompt.slice(0, 157)}…` : prompt;

  if (!result) {
    return (
      <section aria-label="Inference result" className="border border-white bg-black px-4 py-4 sm:px-5">
        <p className="text-[10px] tracking-[0.22em] text-white/60 uppercase">
          Inference
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white">
          {error ?? "The model response was incomplete."}
        </p>
        {quoted ? (
          <p className="mt-3 text-[12px] leading-5 text-white/50">“{quoted}”</p>
        ) : null}
        <button
          type="button"
          onClick={showBaseline}
          className="mt-4 min-h-11 border border-white px-4 text-[11px] tracking-[0.18em] uppercase hover:bg-white hover:text-black focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          40 MW baseline
        </button>
      </section>
    );
  }

  const spaceCost = priceTokens(
    "space",
    result.space.totalTokens,
    result.space.usageEstimated,
  );
  const groundCost = priceTokens(
    "ground",
    result.ground.totalTokens,
    result.ground.usageEstimated,
  );
  const rates = {
    space: venueRates("space"),
    ground: venueRates("ground"),
  };
  const priceMultiple = rates.ground.costUsdPerItKwh / rates.space.costUsdPerItKwh;
  const waterDelta = groundCost.waterLiters - spaceCost.waterLiters;
  const latencyDelta = groundCost.latencyMs - spaceCost.latencyMs;
  const tokenDelta = groundCost.tokens - spaceCost.tokens;
  const perBillionSpace = priceTokens("space", BILLION, false);
  const perBillionGround = priceTokens("ground", BILLION, false);
  const usageEstimated =
    result.space.usageEstimated || result.ground.usageEstimated;

  return (
    <section aria-label="Prompt comparison" className="grid gap-3">
      <div className="border border-white bg-black px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[10px] tracking-[0.22em] text-white/60 uppercase">
            This prompt
          </p>
          <p className="font-mono text-[10px] tracking-[0.14em] text-white/45 uppercase">
            {result.provider === "xai" ? "Grok" : "OpenAI"} · {result.model}
          </p>
        </div>
        {quoted ? (
          <p className="mt-2 text-sm leading-6 text-white/80">“{quoted}”</p>
        ) : null}
        <div className="mt-4 grid grid-cols-2 gap-px border border-white bg-white sm:grid-cols-4">
          <Delta value={formatMultiple(priceMultiple)} label="Energy cost" />
          <Delta
            value={`+${formatMilliliters(waterDelta)}`}
            label="Ground water"
            water
          />
          <Delta
            value={`+${latencyDelta.toFixed(1)} ms`}
            label="Shell latency"
          />
          <Delta
            value={
              tokenDelta === 0 ? "Matched" : formatCompactCount(tokenDelta)
            }
            label="Token delta"
          />
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <AnswerColumn
          kicker="Space"
          title="Starcloud"
          answer={result.space}
          cost={spaceCost}
        />
        <AnswerColumn
          kicker="Ground"
          title="Terrestrial"
          answer={result.ground}
          cost={groundCost}
        />
      </div>
      <p className="max-w-3xl text-[11px] leading-5 text-white/50">
        Per 1 billion tokens at the H100 stand-in: space{" "}
        {formatReplyUsd(perBillionSpace.energyCostUsd)}, ground{" "}
        {formatReplyUsd(perBillionGround.energyCostUsd)}, water{" "}
        <span className="text-water">
          {perBillionGround.waterLiters.toFixed(0)} L
        </span>
        . Reply joules use SemiAnalysis InferenceMAX (~900k tok/s per
        provisioned MW), mapped onto compute megawatts. Latency milliseconds
        are a shell stub times the paper’s 1.35 vacuum/fiber ratio.{" "}
        {usageEstimated ? "Token counts were estimated from length. " : ""}
        {PAPER.organization}, “{PAPER.title}”, {PAPER.version}.
      </p>
      <div>
        <button
          type="button"
          onClick={showBaseline}
          className="min-h-11 border border-white px-4 text-[11px] tracking-[0.18em] uppercase hover:bg-white hover:text-black focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          40 MW baseline
        </button>
      </div>
    </section>
  );
}
