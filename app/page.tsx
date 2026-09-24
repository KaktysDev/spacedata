import { BottomDock } from "@/components/simulator/bottom-dock";
import { ChatPanel } from "@/components/simulator/chat-panel";
import { MetricStrip } from "@/components/simulator/metric-strip";
import { SceneCanvas } from "@/components/simulator/scene-canvas";
import { SceneSlot } from "@/components/simulator/scene-slot";
import { SimulatorProvider } from "@/components/simulator/simulator-provider";
import { TopBar } from "@/components/simulator/top-bar";

export default function Home() {
  return (
    <main className="relative h-dvh overflow-hidden bg-black text-white">
      <SceneCanvas />
      <SimulatorProvider>
        <div className="relative z-10 flex h-full flex-col">
          <TopBar />
          <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 md:px-8 md:pt-4 md:pb-3">
            <MetricStrip />
            <SceneSlot />
            <BottomDock />
            <ChatPanel />
          </div>
        </div>
      </SimulatorProvider>
    </main>
  );
}
