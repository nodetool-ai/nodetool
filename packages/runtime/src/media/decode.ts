/**
 * Demux and decode one stream of a file with node-av, with the timestamp
 * handling the ffmpeg CLI applies to an input: the container's start time is
 * subtracted, so the first frame of a file sits near zero.
 */

import {
  AV_NOPTS_VALUE,
  AVSEEK_FLAG_BACKWARD,
  Decoder,
  Demuxer,
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

/**
 * Open `filePath` and decode its first `kind` stream. `seekSec` seeks to the
 * keyframe at or before that source time; the frames before it are still
 * decoded, as the CLI's `-ss` before `-i` decodes them, and the caller trims.
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
    const activeDecoder = decoder;
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
        yield frame;
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
        activeDecoder.close();
        await demuxer.close();
      }
    };
  } catch (error) {
    decoder?.close();
    await demuxer.close();
    throw error;
  }
}
