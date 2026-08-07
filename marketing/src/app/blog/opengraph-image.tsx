import { ogImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "NodeTool blog";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage(
    "Building with NodeTool",
    "Workflow builds, comparisons, and the thinking behind an agent-first workspace.",
    { image: "screen_canvas.png", accent: "blue", eyebrow: "Blog" },
  );
}
