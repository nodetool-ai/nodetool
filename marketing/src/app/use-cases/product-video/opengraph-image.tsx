import { ogImage, ogSize, ogContentType } from "../../../lib/og";

export const alt = "AI Product Video Generator";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage(
    "AI Product Video Generator",
    "A campaign brief and one product photo become a cinematic 16:9 video.",
    { image: "smartwatch.png", accent: "cyan", eyebrow: "Use case · Marketing" }
  );
}
