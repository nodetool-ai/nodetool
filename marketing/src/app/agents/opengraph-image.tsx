import { ogImage, ogSize, ogContentType } from "../../lib/og";

export const alt = "Agents for creative work";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage(
    "Agents for creative work",
    "An art director that never sleeps, on your canvas."
  );
}
