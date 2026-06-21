import { ogImage, ogSize, ogContentType } from "../../lib/og";

export const alt = "NodeTool Studio";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage(
    "NodeTool Studio",
    "AI workflows that run on your machine. Local-first, BYOK."
  );
}
