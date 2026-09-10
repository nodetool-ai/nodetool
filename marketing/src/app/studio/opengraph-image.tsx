import { ogImage, ogSize, ogContentType } from "../../lib/og";

export const alt = "NodeTool | Open-source agent-first creative workspace";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage(
    "Open-source agent-first creative workspace",
    "Agents build and revise. You inspect and edit.",
    { image: "screen_assets.png", accent: "emerald", eyebrow: "Studio" }
  );
}
