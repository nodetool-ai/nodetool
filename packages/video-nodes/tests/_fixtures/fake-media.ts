/**
 * A stand-in for `@nodetool-ai/runtime/media` for tests of RenderTimeline's
 * orchestration: what it asks the media module for, not what libav makes of
 * it. Probes answer from `fakeProbe`, writers leave a placeholder file at their
 * output path, and every call is recorded in `mediaCalls`.
 *
 * Use it from a test file with:
 *
 *   vi.mock("@nodetool-ai/runtime/media", async (importOriginal) =>
 *     (await import("./_fixtures/fake-media.js")).fakeMediaModule(await importOriginal()));
 *
 * Tests of the video.ts editing nodes pass `{ edits: true }`: transformMedia,
 * concatCopy, openFilterGraph and openVideoFrameEncoder are then recorded too,
 * described in the CLI's terms (`-vf`, `-filter_complex`, `-c copy`), and the
 * edits fail unless `fakeEdits.fail` is false.
 */

import fs from "node:fs";
import path from "node:path";

import type {
  ConcatSegment,
  FilterComplexInput,
  StreamPlan,
  TransformInput
} from "@nodetool-ai/runtime/media";

export type MediaCall =
  | {
      fn: "concatSegments";
      outPath: string;
      fps: number;
      videoFilter: string;
      segments: ConcatSegment[];
      audioCodec: string;
    }
  | { fn: "openFilterComplex"; inputs: FilterComplexInput[]; graph: string }
  | { fn: "muxAudioWithVideoCopy"; videoPath: string; outPath: string; codec: string }
  | { fn: "decodeAudioToPcm"; filePath: string; filter?: string; sampleRate: number }
  | { fn: "probeMedia"; filePath: string }
  | { fn: "transformMedia"; args: string }
  | { fn: "concatCopy"; inputPaths: string[] }
  | { fn: "openFilterGraph"; filter: string }
  | {
      fn: "openVideoFrameEncoder";
      input: string;
      width?: number;
      height?: number;
      frames: number;
    };

export const mediaCalls: MediaCall[] = [];

/** What `probeMedia` reports for every file. */
export const fakeProbe = { durationSec: 4 as number | null, hasAudio: true, channels: 2 };

/** Bytes of every `.wav` the mix read, by file name, kept as the call is made. */
export const capturedWavs = new Map<string, Buffer>();

/** Encoders `hasEncoder` reports; `null` asks the real build. */
export const fakeEncoders: { names: string[] | null } = { names: null };

/** PCM `decodeAudioToPcm` returns, mono at the requested rate. */
export const fakePcm = { samples: new Float32Array(0) };

/**
 * With `fakeMediaModule(original, { edits: true })`: whether the faked edit
 * calls (transformMedia, concatCopy) fail, as the CLI mock that never ran
 * ffmpeg did, or write a placeholder output.
 */
export const fakeEdits = { fail: true };

export function resetFakeMedia(): void {
  fakeEdits.fail = true;
  mediaCalls.length = 0;
  fakeProbe.durationSec = 4;
  fakeProbe.hasAudio = true;
  fakeProbe.channels = 2;
  fakePcm.samples = new Float32Array(0);
  fakeEncoders.names = null;
  capturedWavs.clear();
}

/**
 * Every filter string and codec the render asked for, joined: the segment
 * filter, the frame rate and the mix graph, for `toContain` checks.
 */
export function mediaArgString(): string {
  return mediaCalls
    .map((call) => {
      switch (call.fn) {
        case "concatSegments":
          return `${call.videoFilter},fps=${call.fps} ${call.segments.map((s) => s.kind).join(" ")}`;
        case "openFilterComplex":
          return call.graph;
        case "muxAudioWithVideoCopy":
          return `-c:a ${call.codec}`;
        case "decodeAudioToPcm":
          return call.filter ?? "";
        case "probeMedia":
          return "";
        case "transformMedia":
          return call.args;
        case "concatCopy":
          return `-f concat ${call.inputPaths.join(" ")} -c copy`;
        case "openFilterGraph":
          return `-vf ${call.filter}`;
        case "openVideoFrameEncoder":
          return `-f ${call.input === "rgba" ? `rawvideo -pix_fmt rgba -s ${call.width}x${call.height}` : "image2pipe"}`;
      }
    })
    .join("\n");
}

/** The mix graph's inputs, by file path. */
export function mixInputPaths(): string[] {
  return mediaCalls.flatMap((call) =>
    call.fn === "openFilterComplex" ? call.inputs.map((input) => input.filePath) : []
  );
}

/** The rough cut's segments. */
export function concatCall(): Extract<MediaCall, { fn: "concatSegments" }> | undefined {
  return mediaCalls.find(
    (call): call is Extract<MediaCall, { fn: "concatSegments" }> => call.fn === "concatSegments"
  );
}

/** One stream plan in the CLI's terms, for `toContain` checks. */
function describePlan(kind: "v" | "a", plan: StreamPlan | null): string {
  if (!plan) return kind === "v" ? "-vn" : "-an";
  if ("copy" in plan) return `-map ${plan.copy}:${kind} -c:${kind} copy`;
  if ("graph" in plan) return `-filter_complex ${plan.graph} -map [${plan.output}]`;
  return `-map ${plan.input ?? 0}:${kind} -${kind}f ${plan.filter}`;
}

function describeInput(input: TransformInput): string {
  const seek = input.seekSec ? `-ss ${input.seekSec} ` : "";
  const to = input.toSec !== undefined ? `-to ${input.toSec} ` : "";
  return `${seek}${to}-i ${input.filePath}`;
}

/** The edit fakes `fakeMediaModule` adds with `{ edits: true }`. */
function editFakes(): Record<string, unknown> {
  return {
    transformMedia: async (opts: {
      inputs: TransformInput[];
      outPath: string;
      video: StreamPlan | null;
      audio: StreamPlan | null;
      shortest?: boolean;
    }) => {
      mediaCalls.push({
        fn: "transformMedia",
        args: [
          ...opts.inputs.map(describeInput),
          describePlan("v", opts.video),
          describePlan("a", opts.audio),
          opts.shortest ? "-shortest" : ""
        ]
          .filter(Boolean)
          .join(" ")
      });
      if (fakeEdits.fail) throw new Error("fake media: no real execution");
      fs.writeFileSync(opts.outPath, `fake:${opts.outPath}`);
    },
    concatCopy: async (opts: { inputPaths: string[]; outPath: string }) => {
      mediaCalls.push({ fn: "concatCopy", inputPaths: opts.inputPaths });
      if (fakeEdits.fail) throw new Error("fake media: no real execution");
      fs.writeFileSync(opts.outPath, `fake:${opts.outPath}`);
    },
    openFilterGraph: async (opts: { filter: string }) => {
      mediaCalls.push({ fn: "openFilterGraph", filter: opts.filter });
      return {
        // eslint-disable-next-line require-yield -- a graph that passes no frame
        async *frames() {
          return;
        },
        frameRate: () => null,
        close: async () => {}
      };
    },
    openVideoFrameEncoder: async (opts: { input: string; width?: number; height?: number; outPath: string }) => {
      const call: Extract<MediaCall, { fn: "openVideoFrameEncoder" }> = {
        fn: "openVideoFrameEncoder",
        input: opts.input,
        width: opts.width,
        height: opts.height,
        frames: 0
      };
      mediaCalls.push(call);
      return {
        write: async () => {
          call.frames += 1;
        },
        finish: async () => {
          if (fakeEdits.fail) throw new Error("fake media: no real execution");
          fs.writeFileSync(opts.outPath, `fake:${opts.outPath}`);
        },
        abort: async () => {}
      };
    }
  };
}

export function fakeMediaModule(
  original: Record<string, unknown>,
  options: { edits?: boolean } = {}
): Record<string, unknown> {
  const faked: Record<string, unknown> = {
    ...original,
    hasEncoder: async (name: string) =>
      fakeEncoders.names
        ? fakeEncoders.names.includes(name)
        : (original.hasEncoder as (name: string) => Promise<boolean>)(name),
    probeMedia: async (filePath: string) => {
      mediaCalls.push({ fn: "probeMedia", filePath });
      return {
      format: "MP4",
      durationSec: fakeProbe.durationSec,
      video: null,
      audio: fakeProbe.hasAudio
        ? { codec: "aac", sampleRate: 48000, channels: fakeProbe.channels }
        : null
      };
    },
    concatSegments: async (opts: {
      outPath: string;
      fps: number;
      videoFilter: string;
      segments: ConcatSegment[];
      audioCodec: string;
    }) => {
      mediaCalls.push({
        fn: "concatSegments",
        outPath: opts.outPath,
        fps: opts.fps,
        videoFilter: opts.videoFilter,
        segments: opts.segments,
        audioCodec: opts.audioCodec
      });
      fs.writeFileSync(opts.outPath, `fake:${opts.outPath}`);
    },
    openFilterComplex: async (opts: { inputs: FilterComplexInput[]; graph: string }) => {
      mediaCalls.push({ fn: "openFilterComplex", inputs: opts.inputs, graph: opts.graph });
      for (const input of opts.inputs) {
        if (input.filePath.endsWith(".wav") && fs.existsSync(input.filePath)) {
          capturedWavs.set(path.basename(input.filePath), fs.readFileSync(input.filePath));
        }
      }
      return {
        // eslint-disable-next-line require-yield -- an empty mix
        async *frames() {
          return;
        },
        close: async () => {}
      };
    },
    muxAudioWithVideoCopy: async (opts: {
      videoPath: string;
      outPath: string;
      codec: string;
      audio: AsyncIterable<unknown>;
    }) => {
      mediaCalls.push({
        fn: "muxAudioWithVideoCopy",
        videoPath: opts.videoPath,
        outPath: opts.outPath,
        codec: opts.codec
      });
      // Drain the fake mix.
      const mix = opts.audio[Symbol.asyncIterator]();
      while (!(await mix.next()).done);
      fs.writeFileSync(opts.outPath, `fake:${opts.outPath}`);
    },
    decodeAudioToPcm: async (
      filePath: string,
      options: { filter?: string; sampleRate: number }
    ) => {
      mediaCalls.push({
        fn: "decodeAudioToPcm",
        filePath,
        filter: options.filter,
        sampleRate: options.sampleRate
      });
      return { samples: fakePcm.samples, sampleRate: options.sampleRate, channels: 1 };
    }
  };
  return options.edits ? { ...faked, ...editFakes() } : faked;
}
