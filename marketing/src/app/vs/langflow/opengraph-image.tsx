import { ogImage, ogSize, ogContentType } from "../../../lib/og";

export const alt = "NodeTool vs Langflow";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage(
    "NodeTool vs Langflow",
    "Agents plus native image, video, and music generation — on one canvas.",
    { image: "screen_workflow.png", accent: "emerald", eyebrow: "Comparison" }
  );
}
