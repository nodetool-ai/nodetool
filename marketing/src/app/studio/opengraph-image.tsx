import { ogImage, ogSize, ogContentType } from "../../lib/og";

export const alt = "NodeTool Studio — the agent builds the film on your hardware";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage(
    "You direct the vision. The agent builds the film on your hardware.",
    "Open weights via Ollama and MLX, offline. Your keys. A timeline you can still edit.",
    { image: "screen_assets.png", accent: "emerald", eyebrow: "Studio" }
  );
}
