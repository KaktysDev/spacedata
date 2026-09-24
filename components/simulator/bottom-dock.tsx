"use client";

import { ComparisonPanels } from "@/components/simulator/comparison-panels";
import { InferenceComparison } from "@/components/simulator/inference-comparison";
import { useSimulator } from "@/components/simulator/simulator-provider";
import type { RoutePhase } from "@/lib/starcloud/route-timeline";

const ROUTE_COPY: Partial<Record<RoutePhase, string>> = {
  uplink: "Uplink · prompt to the ground antenna",
  split: "Routing · orbital path and terrestrial path",
  pullback: "Pulling back · both datacenters",
};

export function BottomDock() {
  const { phase, prompt, reducedMotion } = useSimulator();
  const label = ROUTE_COPY[phase];

  if (label) {
    const quoted =
      prompt && prompt.length > 90 ? `${prompt.slice(0, 87)}…` : prompt;
    return (
      <p
        className="border border-white bg-black px-4 py-3 text-[11px] tracking-[0.16em] text-white/80 uppercase"
        aria-live="polite"
      >
        {reducedMotion ? "Routing" : label}
        {quoted ? <span className="mt-1 block normal-case tracking-normal text-white/50">“{quoted}”</span> : null}
      </p>
    );
  }

  if (phase === "compare") {
    return <InferenceComparison />;
  }

  return <ComparisonPanels />;
}
