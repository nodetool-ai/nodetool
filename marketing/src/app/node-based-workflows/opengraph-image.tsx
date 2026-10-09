import { ogImage, ogSize, ogContentType } from "../../lib/og";

export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage(
    "Node-based workflows",
    "Typed ports, a check before every run, batches, and any model on your own keys. One open-source canvas for image, video, audio, and text.",
    {
      image: "hero-nodes-card.jpg",
      accent: "blue",
      eyebrow: "Node-based workflows",
    }
  );
}
