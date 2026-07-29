import { ogImage, ogSize, ogContentType } from "../../lib/og";

export const alt = "NodeTool Studio";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage(
    "AI that runs on your machine",
    "Desktop app. Runs Ollama and MLX models offline. Your own keys.",
    { image: "screen_assets.png", accent: "emerald", eyebrow: "Studio" }
  );
}
