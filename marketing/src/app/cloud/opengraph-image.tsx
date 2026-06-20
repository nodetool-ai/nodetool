import { ogImage, ogSize, ogContentType } from "../../lib/og";

export const alt = "NodeTool Cloud";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage(
    "NodeTool Cloud",
    "Visual AI workflows in your browser. Zero setup, BYOK."
  );
}
