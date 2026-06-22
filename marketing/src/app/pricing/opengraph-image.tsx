import { ogImage, ogSize, ogContentType } from "../../lib/og";

export const alt = "NodeTool Pricing — free Studio, BYOK to every provider";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage(
    "Free to download. Pay providers, not us.",
    "Studio is free and open source. BYOK to every provider — no markup.",
    { image: "screen_canvas.png", accent: "amber", eyebrow: "Pricing" }
  );
}
