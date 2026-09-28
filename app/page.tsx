import { connection } from "next/server";
import { Simulator } from "@/components/simulator/simulator";
import { availableProviders } from "@/lib/server/llm";
export const dynamic = "force-dynamic";
export default async function Home() {
  await connection();
  return <Simulator available={availableProviders()} />;
}
