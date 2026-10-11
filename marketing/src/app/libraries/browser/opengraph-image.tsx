import { ogImage, ogSize, ogContentType } from "../../../lib/og";

export const alt = "@nodetool-ai/browser";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage(
    "Drive the Chrome you are signed in to",
    "One CDP action loop, headless or in your own tab. MIT licensed.",
    { accent: "emerald", eyebrow: "@nodetool-ai/browser" }
  );
}
