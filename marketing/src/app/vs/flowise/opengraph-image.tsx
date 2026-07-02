import { ogImage, ogSize, ogContentType } from "../../../lib/og";

export const alt = "NodeTool vs Flowise";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage(
    "NodeTool vs Flowise",
    "RAG chatbots plus native image, video, and music generation.",
    { image: "screen_workflow.png", accent: "violet", eyebrow: "Comparison" }
  );
}
