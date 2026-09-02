import { ogImage, ogSize, ogContentType } from "../lib/og";

export const alt = "NodeTool — the open creative AI workspace";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage(
    "You direct. The agent builds the film.",
    "Every model. Your keys. A timeline you can still edit.",
    { image: "screen_canvas.png", accent: "blue" }
  );
}
