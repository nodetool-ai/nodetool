/**
 * libavfilter graphs over decoded files, on node-av. The graph strings are the
 * ones the ffmpeg CLI took in `-vf`, `-af` and `-filter_complex`, unchanged.
 */

import {
  AV_NOPTS_VALUE,
  AVERROR_EOF,
  AVMEDIA_TYPE_AUDIO,
  AVMEDIA_TYPE_VIDEO,
  FFmpegError,
  FilterAPI,
  FilterComplexAPI,
  Frame,
  type IRational,
  type Stream
} from "node-av";

import { abortError, throwIfAborted } from "./av.js";
import { openDecodedStream, type DecodedStream, type MediaKind } from "./decode.js";

/** Filtered frames from an open graph. Each frame is the caller's to free. */
export interface FilterRun {
  frames(): AsyncGenerator<Frame>;
  /** The output's frame rate once a frame has come out, or null when it has none. */
  frameRate(): IRational | null;
  /** Stop the run and free the graph and every decoder. */
  close(): Promise<void>;
}

/**
 * A video stream's frame rate, the hint the CLI gave its buffer source so
 * the encoder learns the output rate. Null for audio or an unknown rate.
 */
export function streamFrameRate(stream: Stream): IRational | null {
  for (const rate of [stream.avgFrameRate, stream.rFrameRate]) {
    if (rate.num > 0 && rate.den > 0) return { num: rate.num, den: rate.den };
  }
  return null;
}

/** Decoded frames followed by the end-of-stream marker a filter needs to flush. */
async function* withEndOfStream(frames: AsyncIterable<Frame>): AsyncGenerator<Frame | null> {
  yield* frames;
  yield null;
}

function filterRun(
  produce: () => AsyncGenerator<Frame | null>,
  release: () => Promise<void>,
  frameRate: () => IRational | null,
  signal: AbortSignal | undefined
): FilterRun {
  let active: AsyncGenerator<Frame> | null = null;
  let closed = false;
  async function* frames(): AsyncGenerator<Frame> {
    try {
      for await (const frame of produce()) {
        if (!frame) continue;
        if (signal?.aborted) {
          frame.free();
          throw abortError(signal);
        }
        yield frame;
      }
    } catch (error) {
      // A graph that ends itself (`atrim=end=`, `trim`) refuses the next
      // input with EOF. Everything it produced was already received.
      if (error instanceof FFmpegError && error.code === AVERROR_EOF) return;
      throw error;
    }
  }
  return {
    frames(): AsyncGenerator<Frame> {
      if (active) throw new Error("A filter run can be iterated once");
      active = frames();
      return active;
    },
    frameRate(): IRational | null {
      const rate = frameRate();
      return rate && rate.num > 0 && rate.den > 0 ? rate : null;
    },
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      if (active) await active.return(undefined);
      await release();
    }
  };
}

/**
 * Run `filter` (a `-vf` or `-af` chain) over the first `kind` stream of
 * `filePath`. Returns `null` when the file has no such stream.
 */
export async function openFilterGraph(opts: {
  filePath: string;
  kind: MediaKind;
  filter: string;
  seekSec?: number;
  signal?: AbortSignal;
}): Promise<FilterRun | null> {
  const decoded = await openDecodedStream(opts.filePath, opts.kind, {
    seekSec: opts.seekSec,
    signal: opts.signal
  });
  if (!decoded) return null;
  let graph: FilterAPI;
  try {
    graph = FilterAPI.create(opts.filter, {
      framerate: opts.kind === "video" ? (streamFrameRate(decoded.stream) ?? undefined) : undefined,
      signal: opts.signal
    });
  } catch (error) {
    await decoded.close();
    throw error;
  }
  return filterRun(
    () => graph.frames(withEndOfStream(decoded.frames())),
    async () => {
      await decoded.close();
      graph.close();
    },
    () => graph.frameRate,
    opts.signal
  );
}

interface PendingInput {
  label: string;
  frames: AsyncIterator<Frame>;
  next: Frame | null;
  done: boolean;
}

function frameSeconds(frame: Frame): number {
  const { timeBase } = frame;
  if (frame.pts === AV_NOPTS_VALUE || !(timeBase.den > 0)) return Number.NEGATIVE_INFINITY;
  return (Number(frame.pts) * timeBase.num) / timeBase.den;
}

/**
 * Feed a filter_complex graph the way the ffmpeg CLI does: always the input
 * whose next frame is earliest, each input ended on its own when it runs out,
 * output collected after every frame.
 *
 * node-av's `FilterComplexAPI.frames()` reads one frame from every input in
 * lockstep and finalizes the whole graph as soon as any one input ends, so a
 * mix of a short clip and a long one stops at the short one (and an `apad`
 * after it never ends). Every input gets its first frame before any is
 * ended, because the graph only configures once each input has a format.
 */
async function* driveFilterComplex(
  graph: FilterComplexAPI,
  output: string,
  inputs: FilterComplexInput[],
  decoded: DecodedStream[]
): AsyncGenerator<Frame> {
  const pending: PendingInput[] = inputs.map((input, index) => ({
    label: input.label,
    frames: decoded[index]!.frames()[Symbol.asyncIterator](),
    next: null,
    done: false
  }));
  let ended = false;
  async function* drain(): AsyncGenerator<Frame> {
    for (;;) {
      const out = await graph.receive(output);
      if (out === null) return;
      if (!(out instanceof Frame)) {
        ended = true;
        return;
      }
      yield out;
    }
  }
  /**
   * Send `input`'s pending frame. A branch that ends itself (`atrim=end=`)
   * refuses further frames with EOF: that input is finished, the graph is not.
   */
  const send = async (input: PendingInput): Promise<void> => {
    const frame = input.next!;
    input.next = null;
    try {
      await graph.process(input.label, frame);
    } catch (error) {
      if (!(error instanceof FFmpegError && error.code === AVERROR_EOF)) throw error;
      input.done = true;
    } finally {
      frame.free();
    }
  };
  const advance = async (input: PendingInput): Promise<void> => {
    if (input.done) {
      // Its branch ended; release what is left of the decode.
      await input.frames.return?.(undefined);
      return;
    }
    const result = await input.frames.next();
    if (result.done) {
      input.done = true;
      input.next = null;
    } else {
      input.next = result.value;
    }
  };

  for (const input of pending) {
    await advance(input);
    if (input.done) throw new Error(`[${input.label}] decoded to no frames`);
  }
  for (const input of pending) {
    await send(input);
    const ended = input.done;
    await advance(input);
    // A one-frame input runs out here; the graph only learns that from a flush.
    if (input.done && !ended) await graph.flush(input.label);
  }
  yield* drain();

  for (;;) {
    let earliest: PendingInput | null = null;
    for (const input of pending) {
      if (input.done || !input.next) continue;
      if (!earliest || frameSeconds(input.next) < frameSeconds(earliest.next!)) earliest = input;
    }
    if (!earliest) break;
    await send(earliest);
    yield* drain();
    if (ended) return;
    const wasDone = earliest.done;
    await advance(earliest);
    if (earliest.done && !wasDone) {
      await graph.flush(earliest.label);
      yield* drain();
      if (ended) return;
    }
  }
  // Every input has ended; the graph runs out (or pads forever, for the
  // caller to stop).
  while (!ended) {
    let produced = false;
    for await (const frame of drain()) {
      produced = true;
      yield frame;
    }
    if (!produced) return;
  }
}

/** One input of a filter_complex graph: a file stream bound to a link label. */
export interface FilterComplexInput {
  filePath: string;
  kind: MediaKind;
  /** The graph's link label without brackets, e.g. `1:a`. */
  label: string;
}

/**
 * Run a `-filter_complex` graph with one output. Every input is a file stream
 * the graph names by label, as `[1:a]` named the CLI's second input; a file
 * may appear more than once under different labels. Throws when an input has
 * no stream of its kind, as the CLI did for a stream specifier that matched
 * nothing.
 */
export async function openFilterComplex(opts: {
  inputs: FilterComplexInput[];
  graph: string;
  /** The output link label without brackets, e.g. `aout`. */
  output: string;
  outputKind: MediaKind;
  signal?: AbortSignal;
}): Promise<FilterRun> {
  throwIfAborted(opts.signal);
  const decoded: DecodedStream[] = [];
  try {
    for (const input of opts.inputs) {
      const stream = await openDecodedStream(input.filePath, input.kind, {
        signal: opts.signal
      });
      if (!stream) {
        throw new Error(`${input.filePath} has no ${input.kind} stream for [${input.label}]`);
      }
      decoded.push(stream);
    }
    const firstVideo = opts.inputs.findIndex((input) => input.kind === "video");
    const graph = FilterComplexAPI.create(opts.graph, {
      framerate: firstVideo >= 0 ? (streamFrameRate(decoded[firstVideo]!.stream) ?? undefined) : undefined,
      inputs: opts.inputs.map((input) => ({ label: input.label })),
      outputs: [
        {
          label: opts.output,
          mediaType: opts.outputKind === "audio" ? AVMEDIA_TYPE_AUDIO : AVMEDIA_TYPE_VIDEO
        }
      ],
      signal: opts.signal
    });
    const output = opts.output;
    return filterRun(
      () => driveFilterComplex(graph, output, opts.inputs, decoded),
      async () => {
        for (const stream of decoded) await stream.close();
        graph.close();
      },
      () => graph.frameRate,
      opts.signal
    );
  } catch (error) {
    for (const stream of decoded) await stream.close();
    throw error;
  }
}
