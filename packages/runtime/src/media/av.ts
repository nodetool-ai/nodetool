/**
 * node-av plumbing shared by the media module: logging, encoder lookup,
 * container names and a file muxer that does not leak descriptors.
 */

import { open, type FileHandle } from "node:fs/promises";
import path from "node:path";

import {
  AV_LOG_ERROR,
  AVSEEK_CUR,
  AVSEEK_END,
  AVSEEK_SET,
  AVSEEK_SIZE,
  Codec,
  Log,
  Muxer,
  type AVSeekWhence,
  type FFEncoderCodec
} from "node-av";

let logLevelSet = false;

/**
 * Keep libav quiet unless something failed. Its default level prints every
 * encoder's settings banner to stderr, once per open.
 */
export function quietLibav(): void {
  if (logLevelSet) return;
  logLevelSet = true;
  Log.setLevel(AV_LOG_ERROR);
}

export { abortError, throwIfAborted } from "./abort.js";

/** The encoder named `name`, or `null` when this build has none. */
export function findEncoder(name: string): Codec | null {
  // SAFETY: `FFEncoderCodec` is node-av's list of known encoder names. A name
  // outside it is a lookup that returns null, which is what callers test for.
  return Codec.findEncoderByName(name as FFEncoderCodec);
}

/** Container short names for the extensions the server writes. */
const FORMAT_BY_EXTENSION: Record<string, string> = {
  ".mp4": "mp4",
  ".m4a": "ipod",
  ".mov": "mov",
  ".webm": "webm",
  ".mkv": "matroska",
  ".wav": "wav",
  ".mp3": "mp3",
  ".ogg": "ogg",
  ".opus": "opus",
  ".flac": "flac"
};

/** The libav muxer name for `filePath`, from its extension. */
export function muxerFormatFor(filePath: string): string {
  const format = FORMAT_BY_EXTENSION[path.extname(filePath).toLowerCase()];
  if (!format) {
    throw new Error(`No muxer is configured for ${path.basename(filePath)}`);
  }
  return format;
}

/** A muxer writing to a file, with the handle this module owns. */
export interface FileMuxer {
  muxer: Muxer;
  /** Write the trailer, then close the file. Safe to call more than once. */
  close(): Promise<void>;
}

/**
 * Open a muxer over a file handle this module owns.
 *
 * `Muxer.open(path)` leaks one file descriptor and a few hundred kilobytes on
 * every open and close in node-av 6.1.1 (see risk R6 in
 * docs/ffmpeg-in-process-plan.md), so a server that renders all day runs out of
 * descriptors. Custom IO closes cleanly. The callbacks read and write at an
 * explicit position because MP4 and MOV seek back to rewrite their headers.
 */
export async function openFileMuxer(
  filePath: string,
  options: { format?: string; signal?: AbortSignal; muxerOptions?: Record<string, string> } = {}
): Promise<FileMuxer> {
  const handle: FileHandle = await open(filePath, "w+");
  let position = 0;
  let size = 0;
  let muxer: Muxer;
  try {
    muxer = await Muxer.open(
      {
        write: async (buffer: Buffer): Promise<number> => {
          const { bytesWritten } = await handle.write(buffer, 0, buffer.length, position);
          position += bytesWritten;
          size = Math.max(size, position);
          return bytesWritten;
        },
        // `movflags=+faststart` reads the finished file back to move its index
        // to the front.
        read: async (size: number): Promise<Buffer | null> => {
          const buffer = Buffer.alloc(size);
          const { bytesRead } = await handle.read(buffer, 0, size, position);
          if (bytesRead === 0) return null;
          position += bytesRead;
          return buffer.subarray(0, bytesRead);
        },
        seek: (offset: bigint, whence: AVSeekWhence): number => {
          const delta = Number(offset);
          if (whence === AVSEEK_SIZE) return size;
          if (whence === AVSEEK_SET) position = delta;
          else if (whence === AVSEEK_CUR) position += delta;
          else if (whence === AVSEEK_END) position = size + delta;
          else return -1;
          return position;
        }
      },
      {
        format: options.format ?? muxerFormatFor(filePath),
        signal: options.signal,
        options: options.muxerOptions,
        // MOV's `+faststart` re-opens the output by name to read it back.
        configure: (context) => {
          context.url = filePath;
        }
      }
    );
  } catch (error) {
    await handle.close();
    throw error;
  }
  let closing: Promise<void> | null = null;
  return {
    muxer,
    close(): Promise<void> {
      closing ??= (async () => {
        try {
          await muxer.close();
        } finally {
          await handle.close();
        }
      })();
      return closing;
    }
  };
}

/** Seconds from a format or stream start time, or 0 when libav has none. */
export function startTimeSeconds(startTime: bigint, timeBase: { num: number; den: number }): number {
  // AV_NOPTS_VALUE is INT64_MIN.
  if (startTime <= -(2n ** 62n)) return 0;
  return (Number(startTime) * timeBase.num) / timeBase.den;
}

/** A rational for `value`, exact for integer and NTSC-style rates. */
export function rationalFor(value: number): { num: number; den: number } {
  if (Number.isInteger(value)) return { num: value, den: 1 };
  const ntsc = Math.round(value * 1001);
  if (Math.abs(ntsc / 1001 - value) < 1e-9) return { num: ntsc, den: 1001 };
  const scaled = Math.round(value * 1000);
  return { num: scaled, den: 1000 };
}
