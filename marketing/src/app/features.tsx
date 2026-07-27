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
    name: "🔗 Snap blocks together",
    description: (
      <>
        Drag any model onto your canvas: image, video, audio, text, agents, or
        your own code. Connect them with one click and press run.
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
        One canvas, every major provider. Video from Seedance, Kling, Veo, and
        Runway, music from Suno, images from Flux and Ideogram through FAL or
        KIE, plus OpenAI, Anthropic, and Gemini. Local models run through MLX,
        Ollama, and GGUF.
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
        Send a workflow to RunPod with one command and it runs on rented GPUs,
        adding capacity as demand rises. For work that has outgrown your
        laptop.
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
      "Start and repeat any workflow from a chat window, using the same workflow behind the scenes.",
    icon: ChatBubbleBottomCenterTextIcon,
    href: "#",
    gif: "/chat.png",
    width: 600,
    height: 400,
  },
  {
    name: "🤖 Agent nodes",
    description:
      "Add an agent that plans a multi-step job and calls the models and tools it needs. It is a block on the canvas, not a separate system to learn.",
    icon: PuzzlePieceIcon,
    href: "#",
    gif: "/agents.png",
    width: 600,
    height: 400,
  },
  {
    name: "📁 Answers from your documents",
    description:
      "Store your documents inside NodeTool and build assistants that can answer from them. There is no separate database to set up.",
    icon: FolderIcon,
    href: "#",
    gif: "/vector-db.jpg",
    width: 600,
    height: 400,
  },
];
