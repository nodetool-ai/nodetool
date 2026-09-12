import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(HERE, "directed-campaign-kit-hero.png");

const svg = String.raw`<svg width="1200" height="1200" viewBox="0 0 1200 1200" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="shade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#172022" stop-opacity="0.98"/>
      <stop offset="0.54" stop-color="#172022" stop-opacity="0.72"/>
      <stop offset="1" stop-color="#172022" stop-opacity="0.08"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="1200" fill="url(#shade)"/>
  <rect x="64" y="68" width="154" height="34" rx="17" fill="#66734f"/>
  <text x="141" y="91" text-anchor="middle" fill="#f1f3ec" font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="600" letter-spacing="1.5">MINI APP</text>
  <text x="64" y="300" fill="#f1f3ec" font-family="Arial, Helvetica, sans-serif" font-size="92" font-weight="600" letter-spacing="-3">
    <tspan x="64" dy="0">One product.</tspan>
    <tspan x="64" dy="100">One direction.</tspan>
  </text>
  <text x="68" y="500" fill="#dce3d4" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="400">
    <tspan x="68" dy="0">A campaign you can revise.</tspan>
  </text>
  <line x1="64" y1="1050" x2="1136" y2="1050" stroke="#66734f" stroke-width="3"/>
  <text x="64" y="1116" fill="#f1f3ec" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="600">Directed Campaign Kit</text>
  <text x="1136" y="1116" text-anchor="end" fill="#dce3d4" font-family="Arial, Helvetica, sans-serif" font-size="22">NodeTool</text>
</svg>`;

await sharp(source)
  .resize(1200, 1200, { fit: "cover", position: "right" })
  .composite([{ input: Buffer.from(svg) }])
  .png()
  .toFile(path.join(HERE, "directed-campaign-kit-social-square.png"));

console.log("wrote directed-campaign-kit-social-square.png");
