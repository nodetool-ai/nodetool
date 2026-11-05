/**
 * Demux and decode one stream of a file with node-av, with the timestamp
 * handling the ffmpeg CLI applies to an input: the container's start time is
 * subtracted, so the first frame of a file sits near zero.
 */

import { endianness } from "node:os";

import {
  AV_FRAME_DATA_DISPLAYMATRIX,
  AV_NOPTS_VALUE,
  AV_PKT_DATA_DISPLAYMATRIX,
  AVSEEK_FLAG_BACKWARD,
  Decoder,
  Demuxer,
  FilterAPI,
  type Frame,
  type Stream
} from "node-av";

import { abortError, quietLibav, startTimeSeconds, throwIfAborted } from "./av.js";

export type MediaKind = "audio" | "video";

/** One decoded stream of an open file. */
export interface DecodedStream {
  readonly stream: Stream;
  /** Seconds subtracted from every frame: the container start time plus the seek. */
  readonly offsetSec: number;
  /**
   * Decoded frames in presentation order, timestamps already shifted by
   * {@link offsetSec}. The caller owns each frame and frees it.
   */
  frames(): AsyncGenerator<Frame>;
  /** Free the decoder and the demuxer. Waits for an iteration in progress. */
  close(): Promise<void>;
}

const AV_TIME_BASE_Q = { num: 1, den: 1_000_000 };

function displayTransform(stream: Stream): string | null {
  const matrix = stream.codecpar.getCodedSideData(AV_PKT_DATA_DISPLAYMATRIX);
  if (!matrix || matrix.length < 36) {
    return null;
  }
  // libav exposes native int32 values, unlike the big-endian MP4 track header.
  const read = (index: number): number =>
    endianness() === "LE" ? matrix.readInt32LE(index * 4) : matrix.readInt32BE(index * 4);
  const [a, b, c, d] = [read(0), read(1), read(3), read(4)];
  const angle = ((Math.atan2(b, a) * 180 / Math.PI) + 360) % 360;
  const filters: string[] = [];
  if (a * d - b * c < 0) {
    filters.push("vflip");
  }
  if (Math.abs(angle - 90) < 0.001) {
    filters.push("transpose=clock");
  } else if (Math.abs(angle - 180) < 0.001) {
    filters.push("hflip", "vflip");
  } else if (Math.abs(angle - 270) < 0.001) {
    filters.push("transpose=cclock");
  } else if (angle > 0.001 && angle < 359.999) {
    const radians = angle * Math.PI / 180;
    filters.push(`rotate=${radians}:ow=rotw(${radians}):oh=roth(${radians})`);
  }
  return filters.length > 0 ? filters.join(",") : null;
}

/**
 * Open `filePath` and decode its first `kind` stream. `seekSec` seeks to the
 * keyframe at or before that source time; the frames before it are still
 * decoded, as the CLI's `-ss` before `-i` decodes them, and the caller trims.
 * Video frames have the stream's display rotation applied before callers filter
 * or encode them. Packet-copy paths retain their original matrix instead.
 * Returns `null` when the file has no stream of that kind.
 */
export async function openDecodedStream(
  filePath: string,
  kind: MediaKind,
  options: { seekSec?: number; signal?: AbortSignal } = {}
): Promise<DecodedStream | null> {
  const { signal } = options;
  quietLibav();
  throwIfAborted(signal);
  const demuxer = await Demuxer.open(filePath, { signal });
  let decoder: Decoder | null = null;
  let orientation: FilterAPI | null = null;
  try {
    const found = kind === "audio" ? demuxer.audio() : demuxer.video();
    if (!found) {
      await demuxer.close();
      return null;
    }
    const stream = found;
    const formatStartSec = startTimeSeconds(demuxer.getFormatContext().startTime, AV_TIME_BASE_Q);
    const seekSec = options.seekSec && options.seekSec > 0 ? options.seekSec : 0;
    if (seekSec > 0) {
      // A failed seek leaves the demuxer at the start, which is still correct:
      // the caller trims everything before the requested time.
      await demuxer.seek(formatStartSec + seekSec, -1, AVSEEK_FLAG_BACKWARD);
    }
    decoder = await Decoder.create(stream, { signal });
    const transform = kind === "video" ? displayTransform(stream) : null;
    if (transform) {
      orientation = FilterAPI.create(transform, { signal });
    }
    const activeDecoder = decoder;
    const activeOrientation = orientation;
    const offsetSec = formatStartSec + seekSec;
    let active: AsyncGenerator<Frame> | null = null;
    let closed = false;

    async function* decodeFrames(): AsyncGenerator<Frame> {
      for await (const frame of activeDecoder.frames(demuxer.packets(stream.index))) {
        if (!frame) continue;
        if (closed || signal?.aborted) {
          frame.free();
          if (signal?.aborted) throw abortError(signal);
          return;
        }
        if (offsetSec !== 0 && frame.pts !== AV_NOPTS_VALUE) {
          const timeBase = frame.timeBase.den > 0 ? frame.timeBase : stream.timeBase;
          frame.pts -= BigInt(Math.round((offsetSec * timeBase.den) / timeBase.num));
        }
        if (!activeOrientation) {
          yield frame;
          continue;
        }
        try {
          // The pixels will carry this transform, so output metadata must not
          // ask players to apply it a second time.
          frame.removeSideData(AV_FRAME_DATA_DISPLAYMATRIX);
          await activeOrientation.process(frame);
        } finally {
          frame.free();
        }
        for (let out = await activeOrientation.receive(); out; out = await activeOrientation.receive()) {
          yield out;
        }
      }
      if (activeOrientation) {
        yield* activeOrientation.flushFrames();
      }
    }

    return {
      stream,
      offsetSec,
      frames(): AsyncGenerator<Frame> {
        if (active) throw new Error("A decoded stream can be iterated once");
        active = decodeFrames();
        return active;
      },
      async close(): Promise<void> {
        if (closed) return;
        closed = true;
        // `return()` waits for a pull in progress, so native calls finish
        // before the decoder and demuxer they use are freed.
        if (active) await active.return(undefined);
        activeOrientation?.close();
        activeDecoder.close();
        await demuxer.close();
      }
    };
  } catch (error) {
    orientation?.close();
    decoder?.close();
    await demuxer.close();
    throw error;
  }
}
