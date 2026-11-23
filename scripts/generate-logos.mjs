#!/usr/bin/env node
// Regenerates every NodeTool logo and app icon from the master logo,
// brand/nodetool-logo.svg. Edit the master, then run:
//
//   npm run generate:logos
//   npm run generate:logos -- --only electron/   (targets whose path contains the text)
//   npm run generate:logos -- --list             (print targets, write nothing)
//
// Each target names its canvas size and how much of the canvas the mark
// fills. The mark is cropped to its edges first, so the fill is the mark's
// share of the canvas whatever padding the master's viewBox has. Every size is
// rendered from the vector, never scaled down from a larger raster, so a
// 16 px favicon is as sharp as librsvg can draw it.
//
// .ico and .icns files hold PNG entries, which Windows Vista and later and
// macOS 10.7 and later read.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MASTER = path.join(ROOT, "brand/nodetool-logo.svg");

/**
 * The mark's share of an app icon. Small icons give up padding so the mark
 * stays legible. These match the icons the master replaced.
 */
const appIconFill = (size) =>
  size <= 24 ? 0.94 : size <= 32 ? 0.91 : size <= 48 ? 0.9 : 0.88;

const appIcon = (file, size) => ({ file, width: size, height: size, fill: appIconFill(size) });

/** Wordmark-free logo shown small inside a page, with wide margins. */
const inlineLogo = (file, width, height) => ({ file, width, height, fill: 0.48 });

const TARGETS = [
  // Web app (web/index.html, web/public/manifest.json, Login, ErrorBoundary, Logo)
  appIcon("web/public/favicon-16x16.png", 16),
  appIcon("web/public/favicon-32x32.png", 32),
  { file: "web/public/favicon.ico", ico: [16, 32, 48] },
  appIcon("web/public/apple-touch-icon.png", 180),
  appIcon("web/public/android-chrome-192x192.png", 192),
  appIcon("web/public/android-chrome-512x512.png", 512),
  appIcon("web/public/logo192.png", 192),
  appIcon("web/public/nodetool_48px.png", 48),
  appIcon("web/public/nodetool_icon.png", 278),
  { file: "web/public/logo.png", width: 1033, height: 1024, fill: 0.96 },

  // Marketing site (marketing/src/app/layout.tsx, site.webmanifest, header, footer)
  appIcon("marketing/public/favicon-16x16.png", 16),
  appIcon("marketing/public/favicon-32x32.png", 32),
  { file: "marketing/public/favicon.ico", ico: [16, 32, 48] },
  appIcon("marketing/public/apple-touch-icon.png", 180),
  appIcon("marketing/public/android-chrome-192x192.png", 192),
  appIcon("marketing/public/android-chrome-512x512.png", 512),
  { file: "marketing/public/logo.png", width: 1121, height: 1104, fill: 0.88 },
  inlineLogo("marketing/public/logo_small.png", 320, 315),
  inlineLogo("marketing/public/logo_small.webp", 96, 94),

  // Docs site (docs/_config.yml, docs/_layouts/default.html)
  inlineLogo("docs/assets/logo.png", 320, 315),

  // Electron: app icons (electron-builder, flatpak), tray, boot screen
  appIcon("electron/resources/icon.png", 512),
  { file: "electron/resources/icon.ico", ico: [16, 24, 32, 48, 64, 128, 256] },
  { file: "electron/resources/icon.icns", icns: true },
  ...[16, 24, 32, 48, 64, 128, 256, 512].map((size) =>
    appIcon(`electron/resources/linux_icons/icon_${size}x${size}.png`, size)
  ),
  appIcon("electron/assets/tray-icon.png", 16),
  { file: "electron/assets/tray-icon.ico", ico: [16, 24, 32, 48, 64, 72, 96, 128, 256] },
  inlineLogo("electron/src/assets/logo.png", 2080, 2048),

  // Mobile (mobile/app.json, BrandMark). iOS rejects icons with transparency,
  // so the app icon is opaque and the OS rounds the corners.
  { file: "mobile/assets/icon.png", width: 1024, height: 1024, fill: 0.8, background: "#ffffff" },
  { file: "mobile/assets/adaptive-icon.png", width: 1024, height: 1024, fill: 0.66 },
  { file: "mobile/assets/splash-icon.png", width: 1024, height: 1024, fill: 0.44 },
  { file: "mobile/assets/brand-mark.png", width: 240, height: 240, fill: 0.93 },
  appIcon("mobile/assets/favicon.png", 48),

  // Native editor rail
  appIcon("native/node-editor/resources/nodetool_48px.png", 48),

  // Chrome extension (chrome-extension/manifest.json)
  appIcon("chrome-extension/assets/icons/icon16.png", 16),
  appIcon("chrome-extension/assets/icons/icon48.png", 48),
  appIcon("chrome-extension/assets/icons/icon128.png", 128),

  // ChatGPT plugin and the workflow runner example
  appIcon("plugins/chatgpt/nodetool/assets/icon.png", 278),
  { file: "plugins/chatgpt/nodetool/assets/logo.png", width: 1033, height: 1024, fill: 0.96 },
  appIcon("examples/workflow_runner/nodetool_logo.png", 512)
];

/** icns entry types, each a PNG of the given pixel size. */
const ICNS_ENTRIES = [
  ["icp4", 16],
  ["icp5", 32],
  ["ic11", 32],
  ["ic12", 64],
  ["ic07", 128],
  ["ic13", 256],
  ["ic08", 256],
  ["ic14", 512],
  ["ic09", 512],
  ["ic10", 1024]
];

function parseViewBox(svg) {
  const match = svg.match(/<svg\b[^>]*\bviewBox="([^"]+)"/);
  if (!match) {
    throw new Error(`${path.relative(ROOT, MASTER)} has no viewBox on its <svg> element`);
  }
  const [x, y, width, height] = match[1].trim().split(/[\s,]+/).map(Number);
  return { x, y, width, height };
}

/** The master with its root element sized to width x height over viewBox `box`. */
function sizedSvg(svg, box, width, height) {
  return svg.replace(/<svg\b[^>]*>/, (tag) => {
    const attrs = tag
      .replace(/\s(width|height|viewBox|preserveAspectRatio)="[^"]*"/g, "")
      .replace(/>$/, "");
    return `${attrs} width="${width}" height="${height}" viewBox="${box.x} ${box.y} ${box.width} ${box.height}" preserveAspectRatio="xMidYMid meet">`;
  });
}

/** The mark's bounding box in viewBox units, measured from a large render. */
async function measureMark(svg) {
  const view = parseViewBox(svg);
  const probe = 4000;
  const scale = probe / Math.max(view.width, view.height);
  const { info } = await sharp(
    Buffer.from(sizedSvg(svg, view, Math.round(view.width * scale), Math.round(view.height * scale)))
  )
    .trim({ threshold: 0 })
    .toBuffer({ resolveWithObject: true });
  if (!info.width || !info.height) {
    throw new Error("The master logo rendered empty");
  }
  return {
    x: view.x - info.trimOffsetLeft / scale,
    y: view.y - info.trimOffsetTop / scale,
    width: info.width / scale,
    height: info.height / scale
  };
}

/** One PNG: the mark centered on a width x height canvas, filling `fill` of it. */
async function renderPng(svg, mark, { width, height, fill, background }) {
  const scale = Math.min((width * fill) / mark.width, (height * fill) / mark.height);
  const markWidth = Math.max(1, Math.round(mark.width * scale));
  const markHeight = Math.max(1, Math.round(mark.height * scale));
  const markPng = await sharp(Buffer.from(sizedSvg(svg, mark, markWidth, markHeight))).png().toBuffer();
  return sharp({
    create: { width, height, channels: 4, background: background ?? { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .composite([
      {
        input: markPng,
        left: Math.round((width - markWidth) / 2),
        top: Math.round((height - markHeight) / 2)
      }
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

const square = (svg, mark, size) => renderPng(svg, mark, { width: size, height: size, fill: appIconFill(size) });

function encodeIco(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, i) => {
    const entry = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map((image) => image.png)]);
}

function encodeIcns(entries) {
  const chunks = entries.map(([type, png]) => {
    const head = Buffer.alloc(8);
    head.write(type, 0, "ascii");
    head.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([head, png]);
  });
  const head = Buffer.alloc(8);
  head.write("icns", 0, "ascii");
  head.writeUInt32BE(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 4);
  return Buffer.concat([head, ...chunks]);
}

async function build(svg, mark, target) {
  if (target.ico) {
    const images = await Promise.all(
      target.ico.map(async (size) => ({ size, png: await square(svg, mark, size) }))
    );
    return encodeIco(images);
  }
  if (target.icns) {
    const entries = await Promise.all(
      ICNS_ENTRIES.map(async ([type, size]) => [type, await square(svg, mark, size)])
    );
    return encodeIcns(entries);
  }
  const png = await renderPng(svg, mark, target);
  if (target.file.endsWith(".webp")) {
    return sharp(png).webp({ lossless: true }).toBuffer();
  }
  return png;
}

function describe(target) {
  if (target.ico) {
    return `ico ${target.ico.join(", ")}`;
  }
  if (target.icns) {
    return `icns ${[...new Set(ICNS_ENTRIES.map(([, size]) => size))].join(", ")}`;
  }
  const background = target.background ? ` on ${target.background}` : "";
  return `${target.width}x${target.height}, mark ${Math.round(target.fill * 100)}%${background}`;
}

async function main() {
  const args = process.argv.slice(2);
  const onlyIndex = args.indexOf("--only");
  const only = onlyIndex >= 0 ? args[onlyIndex + 1] : undefined;
  if (onlyIndex >= 0 && !only) {
    throw new Error("--only needs a path fragment, such as --only web/public");
  }
  const targets = only ? TARGETS.filter((target) => target.file.includes(only)) : TARGETS;
  if (targets.length === 0) {
    throw new Error(`No logo target path contains "${only}"`);
  }

  if (args.includes("--list")) {
    for (const target of targets) {
      console.log(`${target.file}  (${describe(target)})`);
    }
    return;
  }

  const svg = await readFile(MASTER, "utf8");
  const mark = await measureMark(svg);
  for (const target of targets) {
    await writeFile(path.join(ROOT, target.file), await build(svg, mark, target));
    console.log(`wrote ${target.file}  (${describe(target)})`);
  }
  console.log(`${targets.length} logo files written from ${path.relative(ROOT, MASTER)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
