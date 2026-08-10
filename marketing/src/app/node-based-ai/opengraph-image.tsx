import { ogImage, ogSize, ogContentType } from "../../lib/og";

export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage(
    "Node-based AI",
    "Build AI workflows with nodes, not prompts — image, video, audio, and text on one open-source canvas.",
    {
      image: "screen_canvas.png",
      accent: "blue",
      eyebrow: "Node-based AI",
    }
  );
}
