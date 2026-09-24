"use client";

import { InferenceComparison } from "@/components/simulator/inference-comparison";
import { MetricStrip } from "@/components/simulator/metric-strip";
import { useSimulator } from "@/components/simulator/simulator-provider";
import type { RoutePhase } from "@/lib/starcloud/route-timeline";

const ROUTE_COPY: Partial<Record<RoutePhase, string>> = {
  uplink: "Sending the prompt to the antenna.",
  split: "Splitting the path between orbit and ground.",
  pullback: "Pulling back to both datacenters.",
};

export function BottomDock() {
  const { phase, reducedMotion } = useSimulator();

  if (phase === "compare") {
    return (
      <div
        data-phase={phase}
        className="max-h-[min(48dvh,32rem)] overflow-y-auto"
      >
        <InferenceComparison />
      </div>
    );
  }

  const label = ROUTE_COPY[phase];

  return (
    <div className="grid gap-2" data-phase={phase}>
      {label ? (
        <p className="text-[13px] text-white/70" aria-live="polite">
          {reducedMotion ? "Routing the prompt." : label}
        </p>
      ) : null}
      <MetricStrip />
    </div>
  );
}
