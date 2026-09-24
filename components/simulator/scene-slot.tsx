"use client";

import dynamic from "next/dynamic";
import { Component, type ReactNode } from "react";

const OrbitalScene = dynamic(
  () =>
    import("@/components/simulator/orbital-scene").then(
      (mod) => mod.OrbitalScene,
    ),
  { ssr: false },
);

type BoundaryProps = { children: ReactNode };
type BoundaryState = { failed: boolean };

class SceneBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

export function SceneSlot() {
  return (
    <div className="relative min-h-[38vh] flex-1 md:min-h-[26vh]">
      <div className="absolute inset-0">
        <SceneBoundary>
          <OrbitalScene />
        </SceneBoundary>
      </div>
    </div>
  );
}
