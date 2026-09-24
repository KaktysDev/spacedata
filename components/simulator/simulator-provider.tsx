"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

import { isChatSuccessBody, type ChatSuccessBody } from "@/lib/starcloud/chat-types";
import { CHAT_MAX_CHARS, SIMULATION } from "@/lib/starcloud/constants";
import {
  createEngineState,
  snapshot,
  stepEngine,
  withUtilization,
  type VenueSnapshot,
} from "@/lib/starcloud/engine";
import {
  phaseDuration,
  type RoutePhase,
} from "@/lib/starcloud/route-timeline";

export type RouteClock = {
  space: ReturnType<typeof createEngineState>;
  ground: ReturnType<typeof createEngineState>;
  phase: RoutePhase;
  phaseStarted: number;
  reducedMotion: boolean;
  fetchSettled: boolean;
  busy: boolean;
  prompt: string | null;
  result: ChatSuccessBody | null;
  error: string | null;
};

type SimulatorValue = {
  space: VenueSnapshot;
  ground: VenueSnapshot;
  phase: RoutePhase;
  busy: boolean;
  prompt: string | null;
  result: ChatSuccessBody | null;
  error: string | null;
  reducedMotion: boolean;
  submitPrompt: (prompt: string) => void;
  showBaseline: () => void;
};

const SimulatorContext = createContext<SimulatorValue | null>(null);
const ClockContext = createContext<RefObject<RouteClock> | null>(null);

function createClock(): RouteClock {
  return {
    space: createEngineState(),
    ground: createEngineState(),
    phase: "idle",
    phaseStarted: 0,
    reducedMotion: false,
    fetchSettled: true,
    busy: false,
    prompt: null,
    result: null,
    error: null,
  };
}

function publish(clock: RouteClock): Omit<
  SimulatorValue,
  "submitPrompt" | "showBaseline"
> {
  return {
    space: snapshot("space", clock.space),
    ground: snapshot("ground", clock.ground),
    phase: clock.phase,
    busy: clock.busy,
    prompt: clock.prompt,
    result: clock.result,
    error: clock.error,
    reducedMotion: clock.reducedMotion,
  };
}

function advance(clock: RouteClock, now: number): boolean {
  if (
    clock.phase !== "uplink" &&
    clock.phase !== "split" &&
    clock.phase !== "pullback"
  ) {
    return false;
  }
  const duration = phaseDuration(clock.phase, clock.reducedMotion);
  if (now - clock.phaseStarted < duration) return false;
  if (clock.phase === "uplink") {
    clock.phase = "split";
    clock.phaseStarted = now;
    return true;
  }
  if (clock.phase === "split") {
    clock.phase = "pullback";
    clock.phaseStarted = now;
    return true;
  }
  if (!clock.fetchSettled) return false;
  clock.phase = "compare";
  clock.phaseStarted = now;
  clock.busy = false;
  return true;
}

export function SimulatorProvider({ children }: { children: ReactNode }) {
  const clockRef = useRef<RouteClock>(createClock());
  const abortRef = useRef<AbortController | null>(null);
  const [slice, setSlice] = useState(() => publish(createClock()));

  useEffect(() => {
    const clock = clockRef.current;
    if (!clock) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const applyMotion = () => {
      clock.reducedMotion = media.matches;
    };
    applyMotion();
    media.addEventListener("change", applyMotion);

    let frame = 0;
    let last = performance.now();
    let acc = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      clock.space = stepEngine("space", clock.space, dt);
      clock.ground = stepEngine("ground", clock.ground, dt);
      const changed = advance(clock, now);
      acc += dt;
      if (acc >= 0.1 || changed) {
        acc = 0;
        setSlice(publish(clock));
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      media.removeEventListener("change", applyMotion);
      abortRef.current?.abort();
    };
  }, []);

  const submitPrompt = useCallback((raw: string) => {
    const clock = clockRef.current;
    if (!clock || clock.busy) return;
    const prompt = raw.trim();
    if (!prompt) return;
    if (prompt.length > CHAT_MAX_CHARS) {
      clock.prompt = prompt.slice(0, 180);
      clock.result = null;
      clock.error = `Keep the prompt under ${CHAT_MAX_CHARS} characters.`;
      clock.phase = "compare";
      clock.busy = false;
      clock.fetchSettled = true;
      setSlice(publish(clock));
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    clock.busy = true;
    clock.fetchSettled = false;
    clock.prompt = prompt;
    clock.result = null;
    clock.error = null;
    clock.phase = "uplink";
    clock.phaseStarted = performance.now();
    clock.space = withUtilization(
      clock.space,
      SIMULATION.inferenceUtilization,
    );
    clock.ground = withUtilization(
      clock.ground,
      SIMULATION.inferenceUtilization,
    );
    setSlice(publish(clock));

    void (async () => {
      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
          signal: controller.signal,
        });
        const body: unknown = await response.json().catch(() => null);
        if (controller.signal.aborted) return;
        if (!response.ok) {
          const message =
            body &&
            typeof body === "object" &&
            "error" in body &&
            typeof (body as { error?: unknown }).error === "string"
              ? (body as { error: string }).error
              : "The model request failed.";
          clock.result = null;
          clock.error = message;
        } else if (!isChatSuccessBody(body)) {
          clock.result = null;
          clock.error = "The model response was incomplete.";
        } else {
          clock.result = body;
          clock.error = null;
        }
      } catch {
        if (controller.signal.aborted) return;
        clock.result = null;
        clock.error = "The model request failed.";
      }
      if (controller.signal.aborted) return;
      clock.space = withUtilization(clock.space, SIMULATION.idleUtilization);
      clock.ground = withUtilization(clock.ground, SIMULATION.idleUtilization);
      clock.fetchSettled = true;
      setSlice(publish(clock));
    })();
  }, []);

  const showBaseline = useCallback(() => {
    const clock = clockRef.current;
    if (!clock || clock.busy) return;
    clock.phase = "idle";
    clock.error = null;
    setSlice(publish(clock));
  }, []);

  const value: SimulatorValue = {
    ...slice,
    submitPrompt,
    showBaseline,
  };

  return (
    <ClockContext.Provider value={clockRef}>
      <SimulatorContext.Provider value={value}>
        {children}
      </SimulatorContext.Provider>
    </ClockContext.Provider>
  );
}

export function useSimulator(): SimulatorValue {
  const value = useContext(SimulatorContext);
  if (!value) {
    throw new Error("useSimulator must be used inside SimulatorProvider");
  }
  return value;
}

export function useRouteClock(): RefObject<RouteClock> {
  const value = useContext(ClockContext);
  if (!value) {
    throw new Error("useRouteClock must be used inside SimulatorProvider");
  }
  return value;
}
