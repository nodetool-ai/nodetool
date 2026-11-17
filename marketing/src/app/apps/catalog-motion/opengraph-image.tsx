import { ogImage, ogSize, ogContentType } from "../../../lib/og";

export const alt = "Catalog Motion: your product catalog as product videos";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage(
    "Your product catalog, as product videos",
    "One CSV in, one clip per product out, with the same look across the range.",
    { image: "apps/catalog-motion/og-poster.jpg", accent: "emerald", eyebrow: "Mini app · E-commerce" }
  );
}
