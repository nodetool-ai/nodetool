/**
 * RenderTimeline against midi tracks: the clip has no asset, its sound is
 * rendered from the notes it carries, and the WAV that reaches ffmpeg is
 * already the clip's window.
 *
 * The compositor and child_process are faked the same way
 * `timeline-composite.test.ts` fakes them, so what is under test is which
 * files the mix reads and with what filters. The fake ffmpeg keeps a copy of
 * every WAV handed to it, which is how the rendered audio itself is checked
 * without a binary — an installed ffmpeg additionally decodes the same bytes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { MIDI_PPQ } from "@nodetool-ai/timeline";

let execFileCalls: Array<{ cmd: string; args: string[] }> = [];
/** Bytes of every `*.wav` an ffmpeg call read, by file name. */
let capturedWavs = new Map<string, Buffer>();

function captureWavInputs(args: string[]): void {
  for (const arg of args) {
    if (!arg.endsWith(".wav") || !fsSync.existsSync(arg)) continue;
    capturedWavs.set(path.basename(arg), fsSync.readFileSync(arg));
  }
}

function mockResponse(
  cmd: string,
  args: string[]
): { stdout: string; stderr: string } {
  if (cmd === "ffprobe") {
    const argsStr = args.join(" ");
    if (argsStr.includes("codec_type")) return { stdout: "audio\n", stderr: "" };
    if (argsStr.includes("format=duration")) {
      return { stdout: "4\n", stderr: "" };
    }
    return { stdout: "", stderr: "" };
  }
  captureWavInputs(args);
  const outputPath = args[args.length - 1];
  fsSync.writeFileSync(outputPath, Buffer.from(`fake:${outputPath}`));
  return { stdout: "", stderr: "" };
}

vi.mock("node:child_process", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  const mockExecFile = (
    cmd: string,
    args: string[],
    optionsOrCb: unknown,
    maybeCb?: unknown
  ) => {
    execFileCalls.push({ cmd, args: [...args] });
    const cb =
      typeof optionsOrCb === "function"
        ? (optionsOrCb as (e: Error | null, o: string, s: string) => void)
        : typeof maybeCb === "function"
          ? (maybeCb as (e: Error | null, o: string, s: string) => void)
          : null;
    if (!cb) return;
    const resp = mockResponse(cmd, args);
    cb(null, resp.stdout, resp.stderr);
  };
  (mockExecFile as unknown as Record<symbol, unknown>)[
    Symbol.for("nodejs.util.promisify.custom")
  ] = (cmd: string, args: string[]) => {
    execFileCalls.push({ cmd, args: [...args] });
    return Promise.resolve(mockResponse(cmd, args));
  };
  return { ...original, execFile: mockExecFile };
});

vi.mock("../src/nodes/timeline/compositeRender.js", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    renderTimelineComposited: async (opts: { outPath: string }) => {
      fsSync.writeFileSync(opts.outPath, Buffer.from("fake:composited"));
      return { totalFrames: 1, skippedClips: [] };
    }
  };
});

const { RenderTimelineNode } = await import("../src/nodes/timeline.js");

/** Real ffmpeg, reached past the module mock, when the host has one. */
const realExecFileSync = (
  await vi.importActual<typeof import("node:child_process")>(
    "node:child_process"
  )
).execFileSync;

const ffmpegAvailable = ((): boolean => {
  try {
    realExecFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

const SAMPLE_RATE = 48000;
const BPM = 120;
/** A quarter note at 120 BPM. */
const QUARTER_MS = 500;
/** Two 4/4 bars. */
const CLIP_MS = 8 * QUARTER_MS;
const CLIP_START_MS = 1000;

const MIDI_TRACK = {
  id: "t-midi",
  type: "midi",
  index: 0,
  visible: true
};
const VIDEO_TRACK = { id: "t-video", type: "video", index: 1, visible: true };

/** Four quarter notes on beats one to four of the first bar. */
function quarterNotes() {
  return [0, 1, 2, 3].map((beat) => ({
    id: `n${beat}`,
    pitch: 60 + beat,
    velocity: 100,
    startTick: beat * MIDI_PPQ,
    durationTick: MIDI_PPQ
  }));
}

function midiClip(overrides: Record<string, unknown> = {}) {
  return {
    id: "clip-m",
    trackId: "t-midi",
    name: "Bass",
    startMs: CLIP_START_MS,
    durationMs: CLIP_MS,
    mediaType: "midi",
    sourceType: "generated",
    notes: quarterNotes(),
    ...overrides
  };
}

function videoClip(overrides: Record<string, unknown> = {}) {
  return {
    id: "clip-v",
    trackId: "t-video",
    name: "Shot",
    startMs: 0,
    durationMs: 4000,
    mediaType: "video",
    currentAssetId: "asset-v",
    ...overrides
  };
}

function sequence(overrides: Record<string, unknown> = {}) {
  return {
    id: "seq-midi",
    name: "Midi test",
    width: 1280,
    height: 720,
    fps: 30,
    durationMs: CLIP_START_MS + CLIP_MS,
    tracks: [MIDI_TRACK, VIDEO_TRACK],
    clips: [midiClip()],
    transcript: [],
    ...overrides
  };
}

function contextFor(seq: unknown) {
  return {
    getTimelineSequence: vi.fn().mockResolvedValue(seq),
    resolveAssetBytes: vi
      .fn()
      .mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]) }),
    postMessage: vi.fn(),
    workflowId: "wf-midi",
    signal: new AbortController().signal
  };
}

async function render(seq: unknown, props: Record<string, unknown> = {}) {
  const node = new RenderTimelineNode();
  Object.assign(node, {
    timeline: { type: "timeline", id: "seq-midi" },
    __node_id: "node-1",
    ...props
  });
  return node.process(contextFor(seq) as never);
}

function ffmpegArgs(): string[] {
  return execFileCalls
    .filter((c) => c.cmd === "ffmpeg")
    .map((c) => c.args.join(" "));
}

/** The mix command — the one carrying a per-clip audio filter chain. */
function mixArgs(): string {
  const mix = ffmpegArgs().find((a) => a.includes("adelay"));
  expect(mix).toBeDefined();
  return mix as string;
}

/** 16-bit PCM mono, as `encodeWavPcm16` writes it: 44-byte header, no chunks. */
function decodeWavPcm16(bytes: Buffer): {
  sampleRate: number;
  samples: Float32Array;
} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sampleRate = view.getUint32(24, true);
  const count = (bytes.byteLength - 44) / 2;
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    samples[i] = view.getInt16(44 + i * 2, true) / 32768;
  }
  return { sampleRate, samples };
}

/** First sample above `threshold`, in milliseconds. -1 when there is none. */
function firstOnsetMs(samples: Float32Array, threshold = 0.01): number {
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) > threshold) return (i / SAMPLE_RATE) * 1000;
  }
  return -1;
}

function rms(samples: Float32Array, fromMs: number, toMs: number): number {
  const from = Math.round((fromMs / 1000) * SAMPLE_RATE);
  const to = Math.min(samples.length, Math.round((toMs / 1000) * SAMPLE_RATE));
  let sum = 0;
  for (let i = from; i < to; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / Math.max(1, to - from));
}

beforeEach(() => {
  execFileCalls = [];
  capturedWavs = new Map();
});

describe("RenderTimeline — midi tracks", () => {
  it("renders a midi-only timeline and mixes the clip's rendered WAV in", async () => {
    const seq = sequence({ tracks: [MIDI_TRACK] });
    await expect(render(seq)).resolves.toBeDefined();

    const mix = mixArgs();
    expect(mix).toContain("midi_clip-m.wav");
    // The WAV is the window already: trim from zero, delay to the clip start.
    expect(mix).toContain(`atrim=start=0:end=${CLIP_MS / 1000}`);
    expect(mix).toContain(`adelay=${CLIP_START_MS}|${CLIP_START_MS}`);
  });

  it("renders the notes: onset at the clip start, sound through the bar", async () => {
    await render(sequence({ tracks: [MIDI_TRACK] }));

    const wav = capturedWavs.get("midi_clip-m.wav");
    expect(wav).toBeDefined();
    const { sampleRate, samples } = decodeWavPcm16(wav as Buffer);
    expect(sampleRate).toBe(SAMPLE_RATE);
    // The buffer is the clip window, not the notes' extent.
    expect(samples.length).toBe(Math.round((CLIP_MS / 1000) * SAMPLE_RATE));

    expect(firstOnsetMs(samples)).toBeGreaterThanOrEqual(0);
    expect(firstOnsetMs(samples)).toBeLessThan(10);
    // Each of the four quarter notes sounds.
    for (const beat of [0, 1, 2, 3]) {
      expect(
        rms(samples, beat * QUARTER_MS + 50, (beat + 1) * QUARTER_MS - 50)
      ).toBeGreaterThan(0.01);
    }
  });

  it.runIf(ffmpegAvailable)(
    "decodes through ffmpeg to the same onset",
    async () => {
      await render(sequence({ tracks: [MIDI_TRACK] }));
      const wav = capturedWavs.get("midi_clip-m.wav");
      expect(wav).toBeDefined();

      const file = path.join(
        fsSync.mkdtempSync(path.join(os.tmpdir(), "midi-decode-")),
        "clip.wav"
      );
      fsSync.writeFileSync(file, wav as Buffer);
      const raw = realExecFileSync(
        "ffmpeg",
        [
          "-v", "error",
          "-i", file,
          "-f", "f32le",
          "-ac", "1",
          "-ar", String(SAMPLE_RATE),
          "-"
        ],
        { maxBuffer: 256 * 1024 * 1024 }
      ) as Buffer;
      const decoded = new Float32Array(
        raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)
      );

      expect(decoded.length).toBe(Math.round((CLIP_MS / 1000) * SAMPLE_RATE));
      expect(firstOnsetMs(decoded)).toBeGreaterThanOrEqual(0);
      expect(firstOnsetMs(decoded)).toBeLessThan(10);
      expect(rms(decoded, 0, 4 * QUARTER_MS)).toBeGreaterThan(0.01);
    }
  );

  it("leaves a muted midi track out of the mix", async () => {
    const seq = sequence({
      tracks: [{ ...MIDI_TRACK, muted: true }, VIDEO_TRACK],
      clips: [midiClip(), videoClip()]
    });
    await render(seq);

    expect(ffmpegArgs().some((a) => a.includes("midi_"))).toBe(false);
  });

  it("refuses a timeline whose only midi track is muted", async () => {
    const seq = sequence({ tracks: [{ ...MIDI_TRACK, muted: true }] });
    await expect(render(seq)).rejects.toThrow(/no renderable clips/);
  });

  it("renders the whole window of a trimmed clip and does not trim it again", async () => {
    const seq = sequence({
      tracks: [MIDI_TRACK],
      clips: [midiClip({ inPointMs: 500 })]
    });
    await render(seq);

    const { samples } = decodeWavPcm16(
      capturedWavs.get("midi_clip-m.wav") as Buffer
    );
    // `durationMs` of audio, starting 500 ms into the notes — not 500 ms less.
    expect(samples.length).toBe(Math.round((CLIP_MS / 1000) * SAMPLE_RATE));
    expect(mixArgs()).toContain(`atrim=start=0:end=${CLIP_MS / 1000}`);
    expect(mixArgs()).not.toContain("atrim=start=0.5");
  });

  it("reads the tempo the document was authored at", async () => {
    const seq = sequence({
      tracks: [MIDI_TRACK],
      tempo: { bpm: BPM, offsetMs: 0, timeSignature: { beatsPerBar: 4, beatUnit: 4 } }
    });
    await render(seq);

    const { samples } = decodeWavPcm16(
      capturedWavs.get("midi_clip-m.wav") as Buffer
    );
    // The four quarter notes end one bar in; the second bar is silent.
    expect(rms(samples, 0, 4 * QUARTER_MS)).toBeGreaterThan(0.01);
    expect(rms(samples, 4 * QUARTER_MS + 200, CLIP_MS)).toBeLessThan(0.001);
  });
});
