import { ogImage, ogSize, ogContentType } from "../../lib/og";

export const alt = "NodeTool for marketing teams";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage(
    "AI production at campaign scale",
    "Product videos, ad creative, and brand assets — every model, your keys.",
    { image: "smartwatch.png", accent: "amber", eyebrow: "Marketing" }
  );
}
