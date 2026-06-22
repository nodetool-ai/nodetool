import { ogImage, ogSize, ogContentType } from "../../lib/og";

export const alt = "NodeTool Cloud";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage(
    "Visual AI workflows in your browser",
    "Zero setup, no GPU. Bring your own keys to every provider.",
    { image: "screen_chat.png", accent: "cyan", eyebrow: "Cloud — Alpha" }
  );
}
