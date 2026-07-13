/**
 * Thumbnail generation for uploaded assets.
 *
 * Images: resized via sharp to fit within THUMB_MAX_DIM px, JPEG-encoded,
 * stored at `{assetId}_thumb.jpg`. EXIF orientation is honored.
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
import { getAssetAdapter } from "./storage.js";

const log = createLogger("nodetool.thumbnail");
const execFileAsync = promisify(execFile);

const THUMB_MAX_DIM = 512;
const THUMB_QUALITY = 80;
const THUMB_CONTENT_TYPE = "image/jpeg";

export function thumbnailKey(assetId: string): string {
  return `${assetId}_thumb.jpg`;
}

function resizeAndEncode(pipeline: sharp.Sharp): Promise<Buffer> {
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

/**
 * Store an asset's bytes and, when applicable, generate and store a
 * thumbnail. Thumbnail failures are logged and swallowed — the original
 * upload still succeeds.
 */
export async function storeAssetWithThumbnail(
  assetId: string,
  fileName: string,
  bytes: Uint8Array,
  contentType: string
): Promise<void> {
  const adapter = getAssetAdapter();
  await adapter.store(fileName, bytes, contentType);

  const generator = contentType.startsWith("image/")
    ? generateImageThumb
    : contentType.startsWith("video/")
      ? generateVideoThumb
      : contentType.startsWith("audio/")
        ? generateAudioThumb
        : contentType === "application/pdf"
          ? generatePdfThumb
          : null;
  if (!generator) return;

  try {
    const thumb = await generator(bytes);
    await adapter.store(
      thumbnailKey(assetId),
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
