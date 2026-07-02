import { ogImage, ogSize, ogContentType } from "../../../lib/og";

export const alt = "NodeTool vs n8n";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage(
    "NodeTool vs n8n",
    "Workflows that create, not just connect — native generation and agents.",
    { image: "screen_canvas.png", accent: "cyan", eyebrow: "Comparison" }
  );
}
