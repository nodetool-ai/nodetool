import { ogImage, ogSize, ogContentType } from "../../lib/og";

export const alt = "NodeTool node-based AI editor";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage(
    "The node-based AI editor",
    "Open source. Every model. One canvas — image, video, audio, and text.",
    { image: "connect-nodes.png", accent: "blue", eyebrow: "Node-based AI editor" }
  );
}
