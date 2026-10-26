/**
 * libavfilter graphs over decoded files, on node-av. The graph strings are the
 * ones the ffmpeg CLI took in `-vf`, `-af` and `-filter_complex`, unchanged.
 */

import {
  AVERROR_EOF,
  AVMEDIA_TYPE_AUDIO,
  FFmpegError,
  AVMEDIA_TYPE_VIDEO,
  FilterAPI,
  FilterComplexAPI,
  type Frame
} from "node-av";

import { abortError, throwIfAborted } from "./av.js";
import { openDecodedStream, type DecodedStream, type MediaKind } from "./decode.js";

/** Filtered frames from an open graph. Each frame is the caller's to free. */
export interface FilterRun {
  frames(): AsyncGenerator<Frame>;
  /** Stop the run and free the graph and every decoder. */
  close(): Promise<void>;
}

/** Decoded frames followed by the end-of-stream marker a filter needs to flush. */
async function* withEndOfStream(frames: AsyncIterable<Frame>): AsyncGenerator<Frame | null> {
  yield* frames;
  yield null;
}

function filterRun(
  produce: () => AsyncGenerator<Frame | null>,
  release: () => Promise<void>,
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
    graph = FilterAPI.create(opts.filter, { signal: opts.signal });
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
    opts.signal
  );
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
    const graph = FilterComplexAPI.create(opts.graph, {
      inputs: opts.inputs.map((input) => ({ label: input.label })),
      outputs: [
        {
          label: opts.output,
          mediaType: opts.outputKind === "audio" ? AVMEDIA_TYPE_AUDIO : AVMEDIA_TYPE_VIDEO
        }
      ],
      signal: opts.signal
    });
    const sources: Record<string, AsyncIterable<Frame | null>> = {};
    for (const [index, input] of opts.inputs.entries()) {
      sources[input.label] = withEndOfStream(decoded[index].frames());
    }
    return filterRun(
      () => graph.frames(opts.output, sources),
      async () => {
        for (const stream of decoded) await stream.close();
        graph.close();
      },
      opts.signal
    );
  } catch (error) {
    for (const stream of decoded) await stream.close();
    throw error;
  }
}
