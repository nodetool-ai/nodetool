import { ogImage, ogSize, ogContentType } from "../lib/og";

export const alt = "NodeTool — the open creative AI workspace";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage(
    "The open creative AI workspace",
    "Every model. Your keys. Your canvas.",
    { image: "screen_canvas.png", accent: "blue" }
  );
}
