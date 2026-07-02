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
    name: "🔗 Snap nodes together",
    description: (
      <>
        Drag any model into your canvas — image, video, audio, text, agents,
        or custom code. Connect with one click and run.
      </>
    ),
    icon: CodeBracketIcon,
    href: "#",
    gif: "/connect-nodes.png",
    width: 600,
    height: 400,
  },
  {
    name: "☁️ Every model, your keys",
    description: (
      <>
        One canvas, every major provider. Video with Seedance, Kling, Veo, and
        Runway; music with Suno; images with Flux and Ideogram via FAL or KIE;
        plus OpenAI, Anthropic, Gemini — and local models via MLX, Ollama, and GGUF.
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
        Ship workflows to RunPod with one command. GPU acceleration,
        auto-scaling, multi-region, and custom Docker images — for workflows
        that outgrow your laptop.
      </>
    ),
    icon: CloudArrowUpIcon,
    href: "#",
    gif: "/runpod.png",
    width: 600,
    height: 400,
  },
  {
    name: "💬 Chat interface",
    description:
      "Trigger and re-run any workflow through a chat interface — same nodes, different surface.",
    icon: ChatBubbleBottomCenterTextIcon,
    href: "#",
    gif: "/chat.png",
    width: 600,
    height: 400,
  },
  {
    name: "🤖 Agent nodes",
    description:
      "Drop in a planning agent that calls models and tools to finish a multi-step task. Used as a node, not a separate framework.",
    icon: PuzzlePieceIcon,
    href: "#",
    gif: "/agents.png",
    width: 600,
    height: 400,
  },
  {
    name: "📁 Vector store & RAG",
    description:
      "Built-in SQLite-vec embedded vector store. Build assistants that know your documents — no extra database to run.",
    icon: FolderIcon,
    href: "#",
    gif: "/vector-db.jpg",
    width: 600,
    height: 400,
  },
];
