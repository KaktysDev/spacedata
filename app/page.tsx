import { BottomDock } from "@/components/simulator/bottom-dock";
import { ChatPanel } from "@/components/simulator/chat-panel";
import { SceneCanvas } from "@/components/simulator/scene-canvas";
import { SceneSlot } from "@/components/simulator/scene-slot";
import { SimulatorProvider } from "@/components/simulator/simulator-provider";
import { TopBar } from "@/components/simulator/top-bar";

export default function Home() {
  return (
    <main className="relative h-dvh overflow-hidden bg-black text-white">
      <SceneCanvas />
      <SimulatorProvider>
        <div className="relative z-10 flex h-full min-h-0 min-w-0 flex-col">
          <TopBar />
          <SceneSlot />
          <div className="mx-auto flex w-full min-w-0 max-w-5xl shrink-0 flex-col gap-3 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
            <BottomDock />
            <ChatPanel />
          </div>
        </div>
      </SimulatorProvider>
    </main>
  );
}
