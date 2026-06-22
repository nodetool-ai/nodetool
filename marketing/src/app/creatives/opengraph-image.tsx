import { ogImage, ogSize, ogContentType } from "../../lib/og";

export const alt = "NodeTool for creatives";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage(
    "One open studio for every medium",
    "Image, music & video on one canvas. Every model, your keys.",
    { image: "creatives_workflow.png", accent: "violet", eyebrow: "For creatives" }
  );
}
