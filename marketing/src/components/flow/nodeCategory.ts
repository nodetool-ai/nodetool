/**
 * Node card accent and icon for a node type, shared by the workflow diagram
 * and the compact node chains on hub cards.
 */
import {
  Type,
  Image as ImageIcon,
  Film,
  AudioLines,
  Sparkles,
  Wand2,
  MessageSquare,
  GitBranch,
  Globe,
  ListTree,
  Download,
  Braces,
  Box as BoxIcon,
} from "lucide-react";

/**
 * Category for a node type, from its keywords. Most shipped graphs carry
 * `any`-typed edges, so the card accent comes from what a node *does* rather
 * than from the data type on its wire — otherwise every card is the same grey.
 */
const CATEGORIES = [
  { match: ["comment"], icon: MessageSquare, color: "#64748B" },
  { match: [".output.", "preview"], icon: Download, color: "#34D399" },
  { match: ["stringinput", "textinput", ".input."], icon: Type, color: "#FFA808" },
  { match: ["texttoimage", "image"], icon: ImageIcon, color: "#E838FF" },
  { match: ["video"], icon: Film, color: "#9460FF" },
  { match: ["audio", "speech", "tts"], icon: AudioLines, color: "#08B8FF" },
  { match: ["prompt", "formatter", "template"], icon: Wand2, color: "#F59E0B" },
  { match: ["agent", "generator", "llm", "chat"], icon: Sparkles, color: "#38BDF8" },
  { match: ["reroute", "control", "if", "loop"], icon: GitBranch, color: "#FBBF24" },
  { match: ["http", "fetch", "search", "browser"], icon: Globe, color: "#60A5FA" },
  { match: ["list", "collector", "dataframe"], icon: ListTree, color: "#FFD612" },
  { match: ["code", "python", "javascript"], icon: Braces, color: "#A78BFA" },
] as const;

export function categoryFor(type: string) {
  const t = type.toLowerCase();
  return (
    CATEGORIES.find((c) => c.match.some((k) => t.includes(k))) ?? {
      icon: BoxIcon,
      color: "#7C8DA6",
    }
  );
}

