import { ogImage, ogSize, ogContentType } from "../../../lib/og";

export const alt = "AI Documentary Teaser Generator";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage(
    "AI Documentary Teaser Generator",
    "One sentence becomes a storyboard, stills, and a cut teaser.",
    {
      image: "deep-shot-3.jpg",
      accent: "cyan",
      eyebrow: "Use case · Documentary",
    }
  );
}
