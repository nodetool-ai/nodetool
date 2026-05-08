import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Agents on the canvas | NodeTool",
  description:
    "Drop a planning agent into your canvas. It calls models and tools to finish a multi-step task — research, browse, write, generate — and hands the result back to the next node. Open source. BYOK. Runs on your machine or in the browser.",
  keywords: [
    "AI agents",
    "creative AI workspace",
    "planning agent",
    "agent node",
    "BYOK agents",
    "open source agents",
    "node-based agents",
    "multi-step tasks",
  ],
};

export default function AgentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
