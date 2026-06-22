import { ogImage, ogSize, ogContentType } from "../../../lib/og";

export const alt = "AI Movie Poster Generator";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage(
    "AI Movie Poster Generator",
    "A title, genre, and audience become a batch of cinematic key art.",
    { image: "poster-singularity-1.png", accent: "rose", eyebrow: "Use case · Design" }
  );
}
