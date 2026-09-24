export const ROUTE_PHASES = [
  "idle",
  "uplink",
  "split",
  "pullback",
  "compare",
] as const;

export type RoutePhase = (typeof ROUTE_PHASES)[number];

/** Milliseconds. Shell timing for the camera path, not a light-time. */
export const ROUTE_PHASE_MS = {
  uplink: 1600,
  split: 2400,
  pullback: 2100,
} as const;

export const REDUCED_PHASE_MS = 160;

export function phaseDuration(phase: RoutePhase, reducedMotion: boolean): number {
  if (phase === "idle" || phase === "compare") return 0;
  return reducedMotion ? REDUCED_PHASE_MS : ROUTE_PHASE_MS[phase];
}

export function phaseFraction(
  phase: RoutePhase,
  startedAt: number,
  now: number,
  reducedMotion: boolean,
): number {
  const duration = phaseDuration(phase, reducedMotion);
  if (duration <= 0) return 1;
  return Math.min(1, Math.max(0, (now - startedAt) / duration));
}

export type TraceId = "uplink" | "space" | "ground";

/** How far each path has drawn, from 0 to 1. */
export function traceProgress(
  phase: RoutePhase,
  startedAt: number,
  now: number,
  reducedMotion: boolean,
  trace: TraceId,
): number {
  const rank = { idle: 0, uplink: 1, split: 2, pullback: 3, compare: 4 }[phase];
  if (trace === "uplink") {
    if (rank < 1) return 0;
    if (phase === "uplink") {
      return phaseFraction(phase, startedAt, now, reducedMotion);
    }
    return 1;
  }
  if (rank < 2) return 0;
  if (phase === "split") {
    return phaseFraction(phase, startedAt, now, reducedMotion);
  }
  return 1;
}
