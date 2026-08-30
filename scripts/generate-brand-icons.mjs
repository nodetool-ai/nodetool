// Every app icon and favicon in the repo, derived from one master mark.
//
// The mark lives at marketing/public/logo.png. Before this script the derived
// icons had drifted three generations apart: the web and marketing favicons
// carried a white-on-black mark, web's apple-touch/android-chrome icons carried
// the teal one, the Chrome extension shipped three PNGs with corrupt IDAT
// chunks, and mobile still had Expo's placeholder grid. Deriving them all from
// one file is what stops that happening again — change the master, run this,
// and every surface moves together.
//
// Usage:
//   node scripts/generate-brand-icons.mjs
//   node scripts/generate-brand-icons.mjs --check    # fail on drift, write nothing
//   node scripts/generate-brand-icons.mjs --only web/public/favicon.ico

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MASTER = path.join(ROOT, "marketing", "public", "logo.png");

/**
 * The mark occupies ~89% of the master's canvas, and the icons that were
 * already current (electron/resources/icon.png, marketing's apple-touch icon)
 * keep that framing. `inset` adds padding on top of it, as a fraction of the
 * target canvas per side — Android's adaptive mask and a splash screen both
 * need the mark smaller than the frame.
 */
const targets = [
  // web/public — declared in web/index.html and the two manifests.
  { file: "web/public/favicon.ico", ico: [16, 32, 48] },
  { file: "web/public/favicon-16x16.png", size: 16 },
  { file: "web/public/favicon-32x32.png", size: 32 },
  { file: "web/public/apple-touch-icon.png", size: 180 },
  { file: "web/public/logo192.png", size: 192 },
  { file: "web/public/android-chrome-192x192.png", size: 192 },
  { file: "web/public/android-chrome-512x512.png", size: 512 },
  { file: "web/public/nodetool_icon.png", size: 278 },
  { file: "web/public/nodetool_48px.png", size: 48 },

  // marketing/public — the rest of this set was already current.
  { file: "marketing/public/favicon.ico", ico: [16, 32, 48] },
  { file: "marketing/public/favicon-16x16.png", size: 16 },
  { file: "marketing/public/favicon-32x32.png", size: 32 },

  // Electron tray. The app icons (icon.png/.ico/.icns, linux_icons) are already
  // the current mark and are built by electron-builder, not from here.
  { file: "electron/assets/tray-icon.png", size: 16 },
  { file: "electron/assets/tray-icon.ico", ico: [16, 24, 32, 48, 64, 72, 96, 128, 256] },

  // Chrome extension — manifest.json action + icons.
  { file: "chrome-extension/assets/icons/icon16.png", size: 16 },
  { file: "chrome-extension/assets/icons/icon48.png", size: 48 },
  { file: "chrome-extension/assets/icons/icon128.png", size: 128 },

  // Expo. iOS rejects an app icon with an alpha channel, so that one is
  // flattened; the adaptive and splash images get their background from
  // mobile/app.json and stay transparent.
  { file: "mobile/assets/icon.png", size: 1024, background: "#ffffff" },
  { file: "mobile/assets/adaptive-icon.png", size: 1024, inset: 0.129 },
  { file: "mobile/assets/splash-icon.png", size: 1024, inset: 0.25 },
  { file: "mobile/assets/favicon.png", size: 48 },

  { file: "examples/workflow_runner/nodetool_logo.png", size: 512 }
];

/** The mark at `size`², padded by `inset` per side, PNG-encoded. */
async function png(master, size, { inset = 0, background } = {}) {
  const box = Math.round(size * (1 - inset * 2));
  const pad = Math.round((size - box) / 2);
  let img = sharp(master)
    .resize(box, box, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: "lanczos3"
    })
    .extend({
      top: pad,
      bottom: size - box - pad,
      left: pad,
      right: size - box - pad,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    });
  if (background) {
    img = img.flatten({ background });
  }
  // A 256-colour palette with dithering is indistinguishable from RGBA at 1:1
  // on this mark and a quarter of the bytes, which is worth having on the
  // 512px and 1024px outputs. Below that the saving is noise.
  return img
    .png({ compressionLevel: 9, palette: size >= 256, dither: 1 })
    .toBuffer();
}

/**
 * One 32bpp BGRA DIB, bottom-up, with the 1bpp AND mask an ICO directory entry
 * still requires. All-zero mask means "every pixel opaque"; the alpha channel
 * is what actually cuts the icon out.
 */
async function dib(master, size) {
  const rgba = await sharp(master)
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: "lanczos3"
    })
    .raw()
    .ensureAlpha()
    .toBuffer();

  const maskStride = Math.ceil(Math.ceil(size / 8) / 4) * 4;
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8); // image + mask
  header.writeUInt16LE(1, 12); // planes
  header.writeUInt16LE(32, 14); // bpp
  header.writeUInt32LE(size * size * 4 + maskStride * size, 20);

  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    const src = y * size * 4;
    const dst = (size - 1 - y) * size * 4;
    for (let x = 0; x < size; x++) {
      pixels[dst + x * 4] = rgba[src + x * 4 + 2];
      pixels[dst + x * 4 + 1] = rgba[src + x * 4 + 1];
      pixels[dst + x * 4 + 2] = rgba[src + x * 4];
      pixels[dst + x * 4 + 3] = rgba[src + x * 4 + 3];
    }
  }
  return Buffer.concat([header, pixels, Buffer.alloc(maskStride * size)]);
}

/** Windows dropped the 256px DIB in favour of an embedded PNG; follow suit. */
async function ico(master, sizes) {
  const images = await Promise.all(
    sizes.map((size) => (size >= 256 ? png(master, size) : dib(master, size)))
  );
  const header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((size, i) => {
    const at = 6 + i * 16;
    header[at] = size >= 256 ? 0 : size;
    header[at + 1] = size >= 256 ? 0 : size;
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(images[i].length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += images[i].length;
  });
  return Buffer.concat([header, ...images]);
}

async function main() {
  const check = process.argv.includes("--check");
  const onlyAt = process.argv.indexOf("--only");
  const only = onlyAt === -1 ? null : process.argv[onlyAt + 1];

  const master = await readFile(MASTER);
  const drifted = [];

  for (const target of targets) {
    if (only && target.file !== only) {
      continue;
    }
    const bytes = target.ico
      ? await ico(master, target.ico)
      : await png(master, target.size, target);
    const dest = path.join(ROOT, target.file);

    if (check) {
      const current = await readFile(dest).catch(() => null);
      if (!current?.equals(bytes)) {
        drifted.push(target.file);
      }
      continue;
    }
    await writeFile(dest, bytes);
    console.log(`wrote ${target.file} (${bytes.length} bytes)`);
  }

  if (check) {
    if (drifted.length > 0) {
      console.error(
        `${drifted.length} icon(s) differ from the master mark:\n  ${drifted.join("\n  ")}\n` +
          "Run: node scripts/generate-brand-icons.mjs"
      );
      process.exitCode = 1;
      return;
    }
    console.log(`${targets.length} icons match the master mark.`);
  }
}

await main();
