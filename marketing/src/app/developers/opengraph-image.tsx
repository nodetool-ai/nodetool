import { ogImage, ogSize, ogContentType } from "../../lib/og";

export const alt = "NodeTool for Developers";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage(
    "NodeTool for Developers",
    "TypeScript SDK, REST API, custom nodes. Open source."
  );
}
