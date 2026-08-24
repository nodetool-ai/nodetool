import { ogImage, ogSize, ogContentType } from "../lib/og";

export const alt = "NodeTool — the open creative AI workspace";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage(
    "From prompt to final cut on one canvas",
    "Every model. Your keys. One workspace.",
    { image: "screen_canvas.png", accent: "blue" }
  );
}
