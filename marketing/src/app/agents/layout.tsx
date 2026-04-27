import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Agents & Automation | NodeTool",
  description:
    "Build intelligent AI agents that reason, plan, and execute complex tasks. Create autonomous automation workflows with a visual drag-and-drop interface. Open-source, privacy-first, no code required.",
  keywords: [
    "AI agents",
    "automation",
    "autonomous agents",
    "workflow automation",
    "LLM agents",
    "ReAct agents",
    "no-code AI",
    "visual AI builder",
    "AI automation",
    "intelligent agents",
  ],
};

export default function AgentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
