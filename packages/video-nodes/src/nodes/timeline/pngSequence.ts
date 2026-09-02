/**
 * The `png_sequence` output: one PNG per composited frame, streamed into a
 * single zip alongside a `manifest.json`.
 *
 * PNG is the only format here that carries straight alpha with no chroma
 * subsampling, which is what makes it the reference an alpha render is checked
 * against. The frames go through `@napi-rs/canvas` rather than ffmpeg — the
 * compositor already hands over RGBA8, so an ffmpeg round trip would only add a
 * process per frame and a second colour conversion.
 *
 * The zip is written entry by entry with no compression: a PNG is already
 * deflate-compressed, so a second pass costs CPU and saves nothing. Writing as
 * it goes is what keeps a thousand-frame render off the heap — only the frame
 * being encoded is in memory.
 */

import { createCanvas } from "@napi-rs/canvas";
import { createWriteStream, type WriteStream } from "node:fs";
import { crc32 } from "node:zlib";

import type { FrameEncoder } from "./rawFrames.js";

/** What a reader needs to turn the entries back into a sequence. */
export interface PngSequenceManifest {
  format: "png_sequence";
  fps: number;
  width: number;
  height: number;
  /** Frames written, which is also the number of `frame_*.png` entries. */
  count: number;
  /** Whether the frames carry a transparency channel. */
  alpha: boolean;
  /** `printf`-style pattern of the entry names, for ffmpeg's image2 demuxer. */
  pattern: string;
}

/** Encode straight-alpha RGBA8 pixels as PNG bytes. */
export function encodeRgbaPng(
  rgba: Uint8Array,
  width: number,
  height: number
): Buffer {
  const expected = width * height * 4;
  if (rgba.length < expected) {
    throw new Error(
      `PNG encode got ${rgba.length} bytes for a ${width}x${height} frame (expected ${expected})`
    );
  }
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(width, height);
  image.data.set(rgba.subarray(0, expected));
  // `putImageData` is defined on straight alpha and bypasses compositing, so
  // the pixels land exactly as the compositor un-premultiplied them.
  ctx.putImageData(image, 0, 0);
  return canvas.toBuffer("image/png");
}

/** Six-digit frame name, so the entries sort the way they play. */
function frameName(index: number): string {
  return `frame_${String(index + 1).padStart(6, "0")}.png`;
}

/**
 * Store-only zip writer.
 *
 * Stored entries need the CRC and the size before the data, and both are known
 * per frame, so nothing has to be buffered to the end but the central
 * directory. ZIP64 is not implemented: an archive that would cross 4 GiB is
 * refused by name rather than written with truncated offsets that no reader
 * would open.
 */
const ZIP_MAX_BYTES = 0xffffffff;

interface ZipEntry {
  name: Buffer;
  crc: number;
  size: number;
  offset: number;
}

class StoredZipWriter {
  private readonly entries: ZipEntry[] = [];
  private offset = 0;
  private pending: Promise<void> = Promise.resolve();

  constructor(private readonly stream: WriteStream) {}

  add(name: string, data: Buffer): void {
    const nameBytes = Buffer.from(name, "utf8");
    const entry: ZipEntry = {
      name: nameBytes,
      crc: crc32(data),
      size: data.length,
      offset: this.offset
    };
    const header = Buffer.alloc(30 + nameBytes.length);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4); // version needed
    header.writeUInt16LE(0, 6); // flags
    header.writeUInt16LE(0, 8); // method: stored
    header.writeUInt16LE(0, 10); // mod time
    header.writeUInt16LE(0x0021, 12); // mod date: 1980-01-01, a fixed stamp
    header.writeUInt32LE(entry.crc, 14);
    header.writeUInt32LE(entry.size, 18);
    header.writeUInt32LE(entry.size, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    header.writeUInt16LE(0, 28); // extra length
    nameBytes.copy(header, 30);

    this.write(header);
    this.write(data);
    this.offset += header.length + data.length;
    if (this.offset > ZIP_MAX_BYTES) {
      throw new Error(
        "The PNG sequence exceeds the 4 GiB a zip archive can address. " +
          "Render a shorter range, a smaller frame, or a video format."
      );
    }
    this.entries.push(entry);
  }

  async finish(): Promise<void> {
    const parts: Buffer[] = [];
    for (const entry of this.entries) {
      const record = Buffer.alloc(46 + entry.name.length);
      record.writeUInt32LE(0x02014b50, 0);
      record.writeUInt16LE(20, 4); // version made by
      record.writeUInt16LE(20, 6); // version needed
      record.writeUInt16LE(0, 8);
      record.writeUInt16LE(0, 10);
      record.writeUInt16LE(0, 12);
      record.writeUInt16LE(0x0021, 14);
      record.writeUInt32LE(entry.crc, 16);
      record.writeUInt32LE(entry.size, 20);
      record.writeUInt32LE(entry.size, 24);
      record.writeUInt16LE(entry.name.length, 28);
      record.writeUInt16LE(0, 30); // extra
      record.writeUInt16LE(0, 32); // comment
      record.writeUInt16LE(0, 34); // disk
      record.writeUInt16LE(0, 36); // internal attrs
      record.writeUInt32LE(0, 38); // external attrs
      record.writeUInt32LE(entry.offset, 42);
      entry.name.copy(record, 46);
      parts.push(record);
    }
    const central = Buffer.concat(parts);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(this.entries.length, 8);
    end.writeUInt16LE(this.entries.length, 10);
    end.writeUInt32LE(central.length, 12);
    end.writeUInt32LE(this.offset, 16);
    end.writeUInt16LE(0, 20);

    this.write(central);
    this.write(end);
    await this.pending;
    await new Promise<void>((resolve, reject) => {
      this.stream.end(() => resolve());
      this.stream.once("error", reject);
    });
  }

  /** Queue a chunk, keeping the backpressure wait off the caller's hot path. */
  private write(chunk: Buffer): void {
    this.pending = this.pending.then(
      () =>
        new Promise<void>((resolve, reject) => {
          this.stream.write(chunk, (error) =>
            error ? reject(error) : resolve()
          );
        })
    );
  }
}

/**
 * Open a {@link FrameEncoder} that writes each frame as a PNG into the zip at
 * `outPath`, and closes with a `manifest.json` naming the rate, the size and
 * the frame count.
 */
export function openPngSequenceEncoder(opts: {
  outPath: string;
  width: number;
  height: number;
  fps: number;
  alpha: boolean;
}): FrameEncoder {
  const { outPath, width, height, fps, alpha } = opts;
  const stream = createWriteStream(outPath);
  const zip = new StoredZipWriter(stream);
  let count = 0;
  let aborted = false;

  return {
    async write(rgba: Uint8Array): Promise<void> {
      if (aborted) return;
      zip.add(frameName(count), encodeRgbaPng(rgba, width, height));
      count += 1;
    },
    async finish(): Promise<void> {
      const manifest: PngSequenceManifest = {
        format: "png_sequence",
        fps,
        width,
        height,
        count,
        alpha,
        pattern: "frame_%06d.png"
      };
      zip.add(
        "manifest.json",
        Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8")
      );
      await zip.finish();
    },
    abort(): void {
      aborted = true;
      stream.destroy();
    }
  };
}
