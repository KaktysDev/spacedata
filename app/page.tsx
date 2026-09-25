import { Simulator } from "@/components/simulator/simulator";
import { availableProviders } from "@/lib/server/llm";
export const dynamic = "force-dynamic";
export default function Home() {
  return <Simulator available={availableProviders()} />;
}
