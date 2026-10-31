/**
 * Thumbnail generation for uploaded assets.
 *
 * Images: resized via sharp to fit within THUMB_MAX_DIM px, JPEG-encoded,
 * stored at `{assetId}_thumb.jpg`. EXIF orientation is honored. SVG is
 * excluded — the original file is the preview (JPEG cannot keep alpha).
 *
 * Videos: the frame one second in (or the first frame of a shorter clip),
 * scaled to THUMB_MAX_DIM, JPEG-encoded.
 *
 * Audio: a 512x256 waveform drawn by libavfilter's showwavespic, JPEG-encoded.
 *
 * PDFs: first page rendered via @hyzyla/pdfium + sharp, JPEG-encoded.
 *
 * Video and audio decode in process through `@nodetool-ai/runtime/media`.
 *
 * A source is either bytes or a file on this host. From a file, the decoder and
 * sharp read in place — the demuxer seeks by path — so there is no size cap. Bytes
 * pulled back out of storage stay capped at THUMBNAIL_SOURCE_MAX_BYTES.
 */

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { Sharp } from "sharp";
import { loadMediaModule, loadSharpOrThrow } from "@nodetool-ai/runtime";
import { createLogger } from "@nodetool-ai/config";
import {
  assetKeyCandidates,
  assetObjectKey,
  FileStorageAdapter,
  type StorageAdapter
} from "@nodetool-ai/storage";
import { getAssetAdapter } from "./storage.js";
import { assetFileNameCandidates, localAssetPath } from "./asset-paths.js";
import type { RgbaFrame } from "@nodetool-ai/runtime/media";
import { withTaskSpan } from "@nodetool-ai/runtime/tracing";

const log = createLogger("nodetool.thumbnail");

const THUMB_MAX_DIM = 512;
const THUMB_QUALITY = 80;
const THUMB_CONTENT_TYPE = "image/jpeg";

export function thumbnailKey(assetId: string): string {
  return `${assetId}_thumb.jpg`;
}

/** What a thumbnail is made from: bytes in memory, or a file on this host. */
export type ThumbnailSource = { bytes: Uint8Array } | { path: string };

function resizeAndEncode(pipeline: Sharp): Promise<Buffer> {
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
export function generateImageThumb(
  input: Uint8Array | string
): Promise<Buffer> {
  return withTaskSpan("cpu", "image.thumbnail", {}, async () => {
    const sharp = await loadSharpOrThrow();
    try {
      return await resizeAndEncode(
        sharp(input).rotate().trim({ threshold: 10 })
      );
    } catch {
      return await resizeAndEncode(sharp(input).rotate());
    }
  });
}

/** JPEG-encode straight RGBA pixels, as the image thumbnails are encoded. */
async function encodeRgbaJpeg(rgba: Uint8Array, width: number, height: number): Promise<Buffer> {
  const sharp = await loadSharpOrThrow();
  return sharp(rgba, { raw: { width, height, channels: 4 } })
    .jpeg({ quality: THUMB_QUALITY, mozjpeg: true })
    .toBuffer();
}

/**
 * Run `render` on a path to the source. A file is read in place; bytes are
 * written to a temp input first because the demuxer needs a seekable file.
 */
async function withSourcePath<T>(
  source: ThumbnailSource,
  prefix: string,
  render: (inputPath: string) => Promise<T>
): Promise<T> {
  if ("path" in source) return render(source.path);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    const inputPath = path.join(dir, "input");
    await fs.writeFile(inputPath, source.bytes);
    return await render(inputPath);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

/** The first frame at or after `seekSeconds`, scaled down to the thumbnail width. */
async function videoFrame(inputPath: string, seekSeconds: number): Promise<RgbaFrame | null> {
  const { openRgbaFrameReader } = await loadMediaModule();
  const reader = await openRgbaFrameReader({
    filePath: inputPath,
    filter: `scale='min(${THUMB_MAX_DIM},iw)':-2,format=rgba`,
    seekSec: seekSeconds,
    readAhead: 1
  });
  if (!reader) return null;
  try {
    return await reader.next();
  } finally {
    await reader.close();
  }
}

async function generateVideoThumb(source: ThumbnailSource): Promise<Buffer> {
  return withTaskSpan("cpu", "video.thumbnail", {}, () =>
    withSourcePath(source, "nodetool-vthumb-", async (inputPath) => {
      // Seek 1s in for a representative frame. A clip shorter than that has
      // no frame there, so it gets its first frame instead.
      let frame: RgbaFrame | null = null;
      try {
        frame = await videoFrame(inputPath, 1);
      } catch {
        // Retried from the start below.
      }
      frame ??= await videoFrame(inputPath, 0);
      if (!frame) throw new Error("The video has no frame to thumbnail");
      return encodeRgbaJpeg(frame.rgba, frame.width, frame.height);
    })
  );
}

/**
 * PDFium parses a whole document from memory, so a PDF on disk is read in
 * and keeps the byte cap.
 */
async function generatePdfThumb(source: ThumbnailSource): Promise<Buffer> {
  let bytes: Uint8Array;
  if ("path" in source) {
    const { size } = await fs.stat(source.path);
    if (size > THUMBNAIL_SOURCE_MAX_BYTES) {
      throw new Error(`PDF too large to thumbnail: ${size} bytes`);
    }
    bytes = await fs.readFile(source.path);
  } else {
    bytes = source.bytes;
  }
  const sharp = await loadSharpOrThrow();
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

async function generateAudioThumb(source: ThumbnailSource): Promise<Buffer> {
  return withTaskSpan("cpu", "audio.thumbnail", {}, () =>
    withSourcePath(source, "nodetool-athumb-", async (inputPath) => {
      const { openFilterComplex } = await loadMediaModule();
      const run = await openFilterComplex({
        inputs: [{ filePath: inputPath, kind: "audio", label: "0:a" }],
        graph: `[0:a]showwavespic=s=${THUMB_MAX_DIM}x${Math.round(THUMB_MAX_DIM / 2)}:colors=0x4a90e2,format=rgba[out]`,
        output: "out",
        outputKind: "video"
      });
      try {
        for await (const frame of run.frames()) {
          try {
            return await encodeRgbaJpeg(
              new Uint8Array(frame.toBuffer()),
              frame.width,
              frame.height
            );
          } finally {
            frame.free();
          }
        }
        throw new Error("The waveform filter drew nothing");
      } finally {
        await run.close();
      }
    })
  );
}

/**
 * Largest object we'll pull back out of storage into memory just to thumbnail
 * it. A source with a local file has no cap.
 */
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

type ThumbGenerator = (source: ThumbnailSource) => Promise<Buffer>;

function thumbGeneratorFor(contentType: string): ThumbGenerator | null {
  if (contentType === SVG_CONTENT_TYPE) return null;
  if (contentType.startsWith("image/")) {
    return (source) =>
      generateImageThumb("path" in source ? source.path : source.bytes);
  }
  if (contentType.startsWith("video/")) return generateVideoThumb;
  if (contentType.startsWith("audio/")) return generateAudioThumb;
  if (contentType === "application/pdf") return generatePdfThumb;
  return null;
}

/**
 * Generate and store the thumbnail. Failures are logged and swallowed; the
 * asset stays usable without a thumbnail.
 */
async function storeThumbnail(
  adapter: StorageAdapter,
  userId: string,
  assetId: string,
  contentType: string,
  generator: ThumbGenerator,
  source: () => Promise<ThumbnailSource | null>
): Promise<void> {
  try {
    const resolved = await source();
    if (!resolved) return;
    const thumb = await generator(resolved);
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
 * Where a stored asset's thumbnail is made from: its local file when the
 * backend has one (managed or external), else its bytes when they are within
 * THUMBNAIL_SOURCE_MAX_BYTES. Null when the object is missing or too large to
 * pull back into memory.
 */
async function storedThumbnailSource(
  adapter: StorageAdapter,
  userId: string,
  assetId: string,
  contentType: string
): Promise<ThumbnailSource | null> {
  const local = await localAssetPath(adapter, userId, assetId, contentType);
  if (local) return { path: local };
  for (const fileName of assetFileNameCandidates(assetId, contentType)) {
    for (const key of assetKeyCandidates(userId, fileName)) {
      const uri = adapter.uriForKey(key);
      const stat = await adapter.stat(uri);
      if (!stat) continue;
      if (stat.size > THUMBNAIL_SOURCE_MAX_BYTES) return null;
      const bytes = await adapter.retrieve(uri);
      return bytes ? { bytes } : null;
    }
  }
  return null;
}

/**
 * Generate a thumbnail for an object already in storage: a staged local
 * upload, a client-direct upload whose bytes never passed through this
 * process, or an external asset referenced in place. A local file is read in
 * place at any size. Otherwise the bytes are read back once, up to
 * THUMBNAIL_SOURCE_MAX_BYTES. Failures are logged and swallowed; the asset
 * stays usable without a thumbnail.
 */
export async function generateThumbnailForStoredAsset(
  userId: string,
  assetId: string,
  contentType: string
): Promise<void> {
  const generator = thumbGeneratorFor(contentType);
  if (!generator) return;
  const adapter = getAssetAdapter();
  await storeThumbnail(adapter, userId, assetId, contentType, generator, () =>
    storedThumbnailSource(adapter, userId, assetId, contentType)
  );
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
  await storeThumbnail(adapter, userId, assetId, contentType, generator, () =>
    Promise.resolve({ bytes })
  );
}

/**
 * Store an asset from a file on this host and thumbnail it from that file.
 * The local file store copies it with a bounded streaming copy; other backends
 * take its bytes. Thumbnail failures are logged and swallowed.
 */
export async function storeAssetFileWithThumbnail(
  userId: string,
  assetId: string,
  fileName: string,
  filePath: string,
  contentType: string
): Promise<void> {
  const adapter = getAssetAdapter();
  const key = assetObjectKey(userId, fileName);
  if (adapter instanceof FileStorageAdapter) {
    await adapter.storeFile(key, filePath);
  } else {
    await adapter.store(
      key,
      new Uint8Array(await fs.readFile(filePath)),
      contentType
    );
  }

  const generator = thumbGeneratorFor(contentType);
  if (!generator) return;
  await storeThumbnail(adapter, userId, assetId, contentType, generator, () =>
    Promise.resolve({ path: filePath })
  );
}
