import {
  FolderIcon,
  PuzzlePieceIcon,
  CodeBracketIcon,
  ChatBubbleBottomCenterTextIcon,
  CloudArrowUpIcon,
} from "@heroicons/react/20/solid";


export type Feature = {
  name: string;
  description: React.ReactNode;
  icon: React.ComponentType<any>;
  href: string;
  gif?: string;
  width: number;
  height: number;
};

export const features = [
  {
    name: "🔗 Snap Nodes Together",
    description: (
      <>
        Drag any model into your canvas—LLMs, diffusion, agents, or custom code.
        Connect with one click and watch your AI workflow come alive.
      </>
    ),
    icon: CodeBracketIcon,
    href: "#",
    gif: "/connect-nodes.png",
    width: 600,
    height: 400,
  },
  {
    name: "☁️ Access World-Class Models",
    description: (
      <>
        One API for every top model. Generate video with Seedance 2.0, Kling 3.0, Luma & Runway,
        music with Suno, and images with Flux & Ideogram via Kie.ai. Plus
        support for local execution and major providers like OpenAI & Anthropic.
      </>
    ),
    icon: FolderIcon,
    href: "#",
    gif: "/providers.jpg",
    width: 600,
    height: 400,
  },
  {
    name: "🚀 Deploy to RunPod",
    description: (
      <>
        Ship AI workflows to RunPod with one command. Scale from local
        development to production with GPU acceleration, auto-scaling, and
        enterprise features. Support for CPU and GPU compute, multiple data
        centers, and custom Docker images.
      </>
    ),
    icon: CloudArrowUpIcon,
    href: "#",
    gif: "/runpod.png",
    width: 600,
    height: 400,
  },
  {
    name: "💬 Chat Interface",
    description:
      "Access and trigger AI workflows through a unified chat interface.",
    icon: ChatBubbleBottomCenterTextIcon,
    href: "#",
    gif: "/chat.png",
    width: 600,
    height: 400,
  },
  {
    name: "🤖 AI Agent Orchestration",
    description:
      "Build intelligent agents that coordinate multiple AI models. Chain reasoning, planning, and execution across complex multi-step workflows.",
    icon: PuzzlePieceIcon,
    href: "#",
    gif: "/agents.png",
    width: 600,
    height: 400,
  },
  {
    name: "📁 Vector Storage & RAG",
    description:
      "Built-in SQLite-vec embedded vector store. Create smart assistants that know your documents—no extra database to run.",
    icon: FolderIcon,
    href: "#",
    gif: "/vector-db.jpg",
    width: 600,
    height: 400,
  },
];
