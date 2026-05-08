import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NodeTool Studio — The open creative AI workspace, on your machine",
  description:
    "NodeTool Studio is the desktop edition of the open creative AI workspace. Every major model from every major provider on one node-based canvas — call them with your own keys at provider prices, or run open-weight models locally with Ollama, MLX, and GGUF. macOS, Windows, Linux. AGPL-3.0.",
  keywords: [
    "NodeTool Studio",
    "creative AI workspace",
    "BYOK desktop app",
    "ComfyUI alternative",
    "Weavy alternative desktop",
    "open source AI canvas",
    "Ollama desktop",
    "MLX Apple Silicon",
    "GGUF local model",
    "node-based AI canvas",
  ],
};

export default function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
