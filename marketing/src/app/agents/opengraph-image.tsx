import { ogImage, ogSize, ogContentType } from "../../lib/og";

export const alt = "Agents for creative work";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage(
    "An art director that never sleeps",
    "Drop an agent on the canvas, hand it a brief, watch it ship the work.",
    { image: "screen_workflow.png", accent: "rose", eyebrow: "Agents" }
  );
}
