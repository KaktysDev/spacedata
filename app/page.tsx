import { ChatStub } from "@/components/simulator/chat-stub";
import { ComparisonPanels } from "@/components/simulator/comparison-panels";
import { MetricStrip } from "@/components/simulator/metric-strip";
import { SceneCanvas } from "@/components/simulator/scene-canvas";
import { TopBar } from "@/components/simulator/top-bar";

export default function Home() {
  return (
    <main className="relative h-dvh overflow-hidden bg-black text-white">
      <SceneCanvas />
      <div className="relative z-10 flex h-full flex-col">
        <TopBar />
        <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-5 overflow-y-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 md:gap-6 md:px-8 md:py-6">
          <MetricStrip />
          <div className="min-h-[22vh] flex-1" aria-hidden="true" />
          <ComparisonPanels />
          <ChatStub />
        </div>
      </div>
    </main>
  );
}
