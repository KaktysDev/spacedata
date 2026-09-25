import { SimulatorProvider } from "@/components/simulator/simulator-provider";
import { Simulator } from "@/components/simulator/simulator";
import { geminiConfig } from "@/lib/server/llm";

// Runtime configuration stays on the server; only availability reaches the UI.
export const dynamic = "force-dynamic";
export default function Home() {
  return (
    <SimulatorProvider liveAvailable={Boolean(geminiConfig())}>
      <Simulator />
    </SimulatorProvider>
  );
}
