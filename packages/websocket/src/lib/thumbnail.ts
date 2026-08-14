/**
 * Thumbnail generation for uploaded assets.
 *
 * Images: resized via sharp to fit within THUMB_MAX_DIM px, JPEG-encoded,
 * stored at `{assetId}_thumb.jpg`. EXIF orientation is honored. SVG is
 * excluded — the original file is the preview (JPEG cannot keep alpha).
 *
 * Videos: ffmpeg seeks one second in (or 0 for shorter clips), extracts a
 * single frame scaled to THUMB_MAX_DIM, JPEG-encoded.
 *
 * Audio: ffmpeg renders a 512x256 waveform PNG via showwavespic, JPEG-encoded.
 *
 * PDFs: first page rendered via @hyzyla/pdfium + sharp, JPEG-encoded.
 *
 * Video and audio paths require `ffmpeg` on PATH — same prerequisite as the
 * media nodes in `@nodetool-ai/base-nodes`.
 */

import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import sharp from "sharp";
import { createLogger } from "@nodetool-ai/config";
import { assetObjectKey } from "@nodetool-ai/storage";
import { getAssetAdapter } from "./storage.js";
import { retrieveAssetBytes } from "./asset-paths.js";

const log = createLogger("nodetool.thumbnail");
const execFileAsync = promisify(execFile);

const THUMB_MAX_DIM = 512;
const THUMB_QUALITY = 80;
const THUMB_CONTENT_TYPE = "image/jpeg";

export function thumbnailKey(assetId: string): string {
  return `${assetId}_thumb.jpg`;
}

function resizeAndEncode(pipeline: ReturnType<typeof sharp>): Promise<Buffer> {
  return pipeline
    .resize({
      width: THUMB_MAX_DIM,
      height: THUMB_MAX_DIM,
      fit: "inside",
      withoutEnlargement: true
    })
    .jpeg({ quality: THUMB_QUALITY, mozjpeg: true })
    .toBuffer();
}

/**
 * EXIF-rotate, trim a uniform border, resize, and JPEG-encode in a single
 * sharp pipeline — one decode and one encode of the source image.
 *
 * Trimming exists because outpaint / background-removal / segmentation results
 * are often a small subject on a large transparent (or solid) canvas; JPEG
 * can't store alpha, so that padding flattens to black and the subject ends up
 * a speck in a black tile. Trimming frames the actual content. Best-effort:
 * photos without a uniform border come back unchanged, and any trim failure
 * (e.g. a fully uniform image trimmed to nothing) falls back to a single
 * untrimmed pass.
 */
export async function generateImageThumb(bytes: Uint8Array): Promise<Buffer> {
  try {
    return await resizeAndEncode(
      sharp(bytes).rotate().trim({ threshold: 10 })
    );
  } catch {
    return await resizeAndEncode(sharp(bytes).rotate());
  }
}

async function runFfmpegThumb(
  bytes: Uint8Array,
  prefix: string,
  buildArgs: (inputPath: string, outputPath: string) => string[]
): Promise<Buffer> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const inputPath = path.join(dir, "input");
  const outputPath = path.join(dir, "thumb.jpg");
  try {
    await fs.writeFile(inputPath, bytes);
    await execFileAsync("ffmpeg", buildArgs(inputPath, outputPath), {
      maxBuffer: 16 * 1024 * 1024
    });
    return await fs.readFile(outputPath);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function generateVideoThumb(bytes: Uint8Array): Promise<Buffer> {
  const buildArgs =
    (seekSeconds: number) =>
    (input: string, output: string): string[] => [
      "-y",
      "-ss", String(seekSeconds),
      "-i", input,
      "-frames:v", "1",
      "-vf", `scale='min(${THUMB_MAX_DIM},iw)':-2`,
      "-q:v", "4",
      output
    ];
  // Seek 1s in for a representative frame, but clips shorter than that would
  // seek past EOF and yield no frame (leaving the asset thumbnail-less). Fall
  // back to the first frame so short clips still get a thumbnail.
  try {
    return await runFfmpegThumb(bytes, "nodetool-vthumb-", buildArgs(1));
  } catch {
    return await runFfmpegThumb(bytes, "nodetool-vthumb-", buildArgs(0));
  }
}

async function generatePdfThumb(bytes: Uint8Array): Promise<Buffer> {
  const { PDFiumLibrary } = await import("@hyzyla/pdfium");
  const lib = await PDFiumLibrary.init();
  let doc: Awaited<ReturnType<typeof lib.loadDocument>> | null = null;
  try {
    doc = await lib.loadDocument(Buffer.from(bytes));
    if (doc.getPageCount() === 0) {
      throw new Error("PDF has no pages");
    }
    const page = doc.getPage(0);
    const image = await page.render({
      scale: 2,
      render: async (options) =>
        sharp(options.data, {
          raw: {
            width: options.width,
            height: options.height,
            channels: 4
          }
        })
          .resize({
            width: THUMB_MAX_DIM,
            height: THUMB_MAX_DIM,
            fit: "inside",
            withoutEnlargement: true
          })
          .jpeg({ quality: THUMB_QUALITY, mozjpeg: true })
          .toBuffer()
    });
    return Buffer.from(image.data);
  } finally {
    if (doc) doc.destroy();
    lib.destroy();
  }
}

async function generateAudioThumb(bytes: Uint8Array): Promise<Buffer> {
  return runFfmpegThumb(bytes, "nodetool-athumb-", (input, output) => [
    "-y",
    "-i", input,
    "-filter_complex",
    `showwavespic=s=${THUMB_MAX_DIM}x${Math.round(THUMB_MAX_DIM / 2)}:colors=0x4a90e2,format=yuvj420p`,
    "-frames:v", "1",
    "-q:v", "4",
    output
  ]);
}

/** Largest object we'll pull back out of storage just to thumbnail it. */
export const THUMBNAIL_SOURCE_MAX_BYTES = 100 * 1024 * 1024;

const SVG_CONTENT_TYPE = "image/svg+xml";

/**
 * Whether this content type gets a stored JPEG thumbnail. SVG is shown
 * from the original file — JPEG cannot keep alpha, and the vector is
 * already small enough to paint in the grid.
 */
export function assetHasRasterThumbnail(contentType: string): boolean {
  if (contentType === SVG_CONTENT_TYPE) return false;
  return (
    contentType.startsWith("image/") ||
    contentType.startsWith("video/") ||
    contentType.startsWith("audio/") ||
    contentType === "application/pdf"
  );
}

function thumbGeneratorFor(
  contentType: string
): ((bytes: Uint8Array) => Promise<Buffer>) | null {
  if (contentType === SVG_CONTENT_TYPE) return null;
  if (contentType.startsWith("image/")) return generateImageThumb;
  if (contentType.startsWith("video/")) return generateVideoThumb;
  if (contentType.startsWith("audio/")) return generateAudioThumb;
  if (contentType === "application/pdf") return generatePdfThumb;
  return null;
}

/**
 * Generate a thumbnail for an object already in storage — the client-direct
 * upload path, where the bytes never passed through this process. Reads them
 * back once. Failures are logged and swallowed; the asset stays usable
 * without a thumbnail.
 */
export async function generateThumbnailForStoredAsset(
  userId: string,
  assetId: string,
  contentType: string
): Promise<void> {
  const generator = thumbGeneratorFor(contentType);
  if (!generator) return;

  const adapter = getAssetAdapter();
  try {
    const bytes = await retrieveAssetBytes(
      adapter,
      userId,
      assetId,
      contentType
    );
    if (!bytes) return;
    const thumb = await generator(bytes);
    await adapter.store(
      assetObjectKey(userId, thumbnailKey(assetId)),
      new Uint8Array(thumb),
      THUMB_CONTENT_TYPE
    );
  } catch (err) {
    log.warn("thumbnail generation failed", {
      assetId,
      contentType,
      error: String(err)
    });
  }
}

/**
 * Store an asset's bytes and, when applicable, generate and store a
 * thumbnail. Thumbnail failures are logged and swallowed — the original
 * upload still succeeds.
 */
export async function storeAssetWithThumbnail(
  userId: string,
  assetId: string,
  fileName: string,
  bytes: Uint8Array,
  contentType: string
): Promise<void> {
  const adapter = getAssetAdapter();
  await adapter.store(assetObjectKey(userId, fileName), bytes, contentType);

  const generator = thumbGeneratorFor(contentType);
  if (!generator) return;

  try {
    const thumb = await generator(bytes);
    await adapter.store(
      assetObjectKey(userId, thumbnailKey(assetId)),
      new Uint8Array(thumb),
      THUMB_CONTENT_TYPE
    );
  } catch (err) {
    log.warn("thumbnail generation failed", {
      assetId,
      contentType,
      error: String(err)
    });
  }
}
