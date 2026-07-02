import { ogImage, ogSize, ogContentType } from "../../../lib/og";

export const alt = "NodeTool vs Dify";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage(
    "NodeTool vs Dify",
    "Agents and RAG, plus native image, video, and music generation.",
    { image: "screen_llms.png", accent: "amber", eyebrow: "Comparison" }
  );
}
