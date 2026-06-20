import { ogImage, ogSize, ogContentType } from "../../lib/og";

export const alt = "NodeTool for creatives";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage(
    "NodeTool for creatives",
    "Image, music & video in one open studio. Every model, your keys."
  );
}
