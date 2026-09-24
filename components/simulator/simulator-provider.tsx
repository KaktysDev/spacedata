"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  createEngineState,
  snapshot,
  stepEngine,
  type VenueSnapshot,
} from "@/lib/starcloud/engine";

type SimulatorValue = {
  space: VenueSnapshot;
  ground: VenueSnapshot;
  running: boolean;
};

const SimulatorContext = createContext<SimulatorValue | null>(null);

function initialValue(): SimulatorValue {
  return {
    space: snapshot("space", createEngineState()),
    ground: snapshot("ground", createEngineState()),
    running: false,
  };
}

export function SimulatorProvider({ children }: { children: ReactNode }) {
  const engines = useRef({
    space: createEngineState(),
    ground: createEngineState(),
  });
  const [value, setValue] = useState<SimulatorValue>(initialValue);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let acc = 0;

    const loop = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      const current = engines.current;
      current.space = stepEngine("space", current.space, dt);
      current.ground = stepEngine("ground", current.ground, dt);
      acc += dt;
      if (acc >= 0.1) {
        acc = 0;
        setValue({
          space: snapshot("space", current.space),
          ground: snapshot("ground", current.ground),
          running: true,
        });
      }
      frame = requestAnimationFrame(loop);
    };

    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <SimulatorContext.Provider value={value}>
      {children}
    </SimulatorContext.Provider>
  );
}

export function useSimulator(): SimulatorValue {
  const value = useContext(SimulatorContext);
  if (!value) {
    throw new Error("useSimulator must be used inside SimulatorProvider");
  }
  return value;
}
