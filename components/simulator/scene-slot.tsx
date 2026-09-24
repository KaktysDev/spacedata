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
type BoundaryState = { failed: boolean; message?: string };

class SceneBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    this.setState({ failed: true, message: error.message });
  }

  render() {
    if (this.state.failed) {
      return (
        <p data-scene-error={this.state.message ?? "unknown"} className="sr-only">
          Scene unavailable
        </p>
      );
    }
    return this.props.children;
  }
}

export function SceneSlot() {
  return (
    <div className="relative min-h-0 flex-1">
      <div className="absolute inset-0">
        <SceneBoundary>
          <OrbitalScene />
        </SceneBoundary>
      </div>
    </div>
  );
}
