import { ogImage, ogSize, ogContentType } from "../../lib/og";

export const alt = "NodeTool for Developers";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage(
    "Extend the workspace",
    "TypeScript SDK, REST API, custom nodes in TS or Python. Open source.",
    { image: "screen_nodemenu.png", accent: "blue", eyebrow: "For developers" }
  );
}
