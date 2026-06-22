import { ogImage, ogSize, ogContentType } from "../../../lib/og";

export const alt = "NodeTool vs Weavy";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage(
    "NodeTool vs Weavy",
    "Open source and BYOK — no credits, no curated roster, no lock-in.",
    { image: "screen_canvas.png", accent: "violet", eyebrow: "Comparison" }
  );
}
