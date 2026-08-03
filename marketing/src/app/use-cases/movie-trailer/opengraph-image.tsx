import { ogImage, ogSize, ogContentType } from "../../../lib/og";

export const alt = "AI Movie Trailer Generator";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage(
    "AI Movie Trailer Generator",
    "One logline becomes a storyboard, key art, and a cut trailer.",
    { image: "trailer-shot-1.png", accent: "amber", eyebrow: "Use case · Film" }
  );
}
