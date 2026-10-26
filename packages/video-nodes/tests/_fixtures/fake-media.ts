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
 */

import fs from "node:fs";
import path from "node:path";

import type {
  ConcatSegment,
  FilterComplexInput
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
  | { fn: "probeMedia"; filePath: string };

export const mediaCalls: MediaCall[] = [];

/** What `probeMedia` reports for every file. */
export const fakeProbe = { durationSec: 4 as number | null, hasAudio: true, channels: 2 };

/** Bytes of every `.wav` the mix read, by file name, kept as the call is made. */
export const capturedWavs = new Map<string, Buffer>();

/** Encoders `hasEncoder` reports; `null` asks the real build. */
export const fakeEncoders: { names: string[] | null } = { names: null };

/** PCM `decodeAudioToPcm` returns, mono at the requested rate. */
export const fakePcm = { samples: new Float32Array(0) };

export function resetFakeMedia(): void {
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

export function fakeMediaModule(original: Record<string, unknown>): Record<string, unknown> {
  return {
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
      for await (const _ of opts.audio) {
        // Drain the fake mix.
      }
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
}
