// Writes the resized WebP copies that pages display in place of large source
// stills. The sources stay in public/ for share cards and downloads.
//
//   node scripts/generate-web-images.mjs          write missing copies
//   node scripts/generate-web-images.mjs --check  fail if a copy is missing
//
// Delete a copy to regenerate it after its source changes.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const publicDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "public"
);

const campaign = "recipes/runs/2026-09-14-directed-campaign-kit-gpt25";
const commercial = "recipes/runs/2026-09-14-photographic-commercial";
const ugc = "recipes/runs/2026-09-14-emotional-support-cup";
const sku = "recipes/runs/2026-09-10-marketing-recipes-01/ecommerce-sku-visual-factory";

// Width is the output width in pixels. Each copy is about twice the largest
// CSS width the page shows it at.
export const webImages = [
  { source: "preview.png", output: "preview.webp", width: 1200 },
  ...[1, 2, 3, 4, 5].map((n) => ({
    source: `poster-singularity-${n}.png`,
    output: `poster-singularity-${n}-800.webp`,
    width: 800
  })),
  { source: `${campaign}/hero.png`, output: `${campaign}/hero-1280.webp`, width: 1280 },
  { source: `${campaign}/social-square.png`, output: `${campaign}/social-square-800.webp`, width: 800 },
  { source: `${campaign}/story.png`, output: `${campaign}/story-720.webp`, width: 720 },
  { source: `${commercial}/card.jpg`, output: `${commercial}/card-1280.webp`, width: 1280 },
  { source: `${commercial}/poster.webp`, output: `${commercial}/poster-1280.webp`, width: 1280 },
  { source: `${ugc}/hero.jpg`, output: `${ugc}/hero-720.webp`, width: 720 },
  { source: `${sku}/source-to-set.webp`, output: `${sku}/source-to-set-1280.webp`, width: 1280 }
];

const check = process.argv.includes("--check");
const missing = [];
for (const { source, output, width } of webImages) {
  const src = path.join(publicDir, source);
  const out = path.join(publicDir, output);
  if (existsSync(out)) {
    continue;
  }
  if (check) {
    missing.push(output);
    continue;
  }
  const info = await sharp(src)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(out);
  console.log(`${output} ${info.width}x${info.height} ${Math.round(info.size / 1024)} KB`);
}
if (missing.length > 0) {
  console.error(`Missing web images, run npm run gen:web-images:\n${missing.join("\n")}`);
  process.exit(1);
}
