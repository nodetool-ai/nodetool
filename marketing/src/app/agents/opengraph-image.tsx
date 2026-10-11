import { ogImage, ogSize, ogContentType } from "../../lib/og";

export const alt = "NodeTool, the open-source creative harness";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage(
    "The open-source creative harness",
    "Your agent gets the generation tools and the editors. You keep the work.",
    { image: "screen_canvas.png", accent: "rose", eyebrow: "Creative harness" }
  );
}
