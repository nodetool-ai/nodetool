import { ogImage, ogSize, ogContentType } from "../../../lib/og";

export const alt = "NodeTool vs ComfyUI";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage(
    "NodeTool vs ComfyUI",
    "The studio around the node editor — every modality, every provider."
  );
}
