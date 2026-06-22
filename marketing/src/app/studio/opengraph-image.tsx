import { ogImage, ogSize, ogContentType } from "../../lib/og";

export const alt = "NodeTool Studio";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage(
    "AI that runs on your machine",
    "Local-first desktop app. Ollama, MLX, and GGUF models offline. BYOK.",
    { image: "screen_model_manager.png", accent: "emerald", eyebrow: "Studio" }
  );
}
