/**
 * RenderTimeline against midi tracks: the clip has no asset, its sound is
 * rendered from the notes it carries, and the WAV that reaches the mix is
 * already the clip's window.
 *
 * The compositor and the media module are faked the same way
 * `timeline-composite.test.ts` fakes them, so what is under test is which
 * files the mix reads and with what filters. The fake keeps a copy of every
 * WAV the mix opens, which is how the rendered audio itself is checked, and
 * the real decoder reads the same bytes back.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { MIDI_PPQ } from "@nodetool-ai/timeline";
import { readPcm } from "@nodetool-ai/runtime/media/testing";
import {
  capturedWavs,
  fakePcm,
  fakeProbe,
  mediaArgString,
  mediaCalls,
  mixInputPaths,
  resetFakeMedia
} from "./_fixtures/fake-media.js";

vi.mock("@nodetool-ai/runtime/media", async (importOriginal) =>
  (await import("./_fixtures/fake-media.js")).fakeMediaModule(await importOriginal())
);

vi.mock("../src/nodes/timeline/compositeRender.js", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    renderTimelineComposited: async (opts: { outPath: string }) => {
      fsSync.writeFileSync(opts.outPath, Buffer.from("fake:composited"));
      return { totalFrames: 1, skippedClips: [], fontsUnavailable: [] };
    }
  };
});

const { RenderTimelineNode } = await import("../src/nodes/timeline.js");

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
    localPath: vi.fn(async () => null),
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

/** The mix graph — the one carrying a per-clip audio filter chain — and its inputs. */
function mixArgs(): string {
  const mix = mediaCalls.find(
    (call) => call.fn === "openFilterComplex" && call.graph.includes("adelay")
  );
  expect(mix).toBeDefined();
  if (mix?.fn !== "openFilterComplex") return "";
  return `${mix.inputs.map((input) => input.filePath).join(" ")} ${mix.graph}`;
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
  resetFakeMedia();
  fakeProbe.channels = 1;
  // What the sampler recording decodes to: a second of a quiet 220 Hz sine.
  fakePcm.samples = Float32Array.from(
    { length: 48000 },
    (_, i) => 0.25 * Math.sin((i * 2 * Math.PI * 220) / 48000)
  );
});

describe("RenderTimeline — midi tracks", () => {
  it("resolves sampler assets, decodes once and renders one-shot tails into the exported WAV", async () => {
    fakeProbe.channels = 2;
    const assetId = "a".repeat(32);
    await render(sequence({ tracks: [{ ...MIDI_TRACK, instrument: {
      type: "sampler", zones: [{ id: "z", name: "Drum", assetId, rootNote: 60, lowNote: 60, highNote: 60, gainDb: 0 }],
      oneShot: true, attackMs: 0, releaseMs: 50, gainDb: -6
    } }], clips: [midiClip({ notes: [{ id: "n", pitch: 60, velocity: 127, startTick: 0, durationTick: 96 }] })] }));
    const wav = capturedWavs.get("midi_clip-m.wav");
    expect(wav).toBeDefined();
    const { samples } = decodeWavPcm16(wav!);
    expect(rms(samples, 300, 800)).toBeGreaterThan(.02);
    expect(rms(samples, 1100, 1800)).toBe(0);
    expect(mediaCalls.filter((call) => call.fn === "decodeAudioToPcm")).toHaveLength(1);
    expect(mediaArgString()).toContain("pan=mono|c0=0.5*c0+0.5*c1");
  });
  it("renders a noteless arp clip from the chord track under it", async () => {
    const chordTrack = {
      id: "t-chords", type: "chord", index: 1, visible: true,
      chords: [{ id: "c", startTick: 0, durationTick: 16 * MIDI_PPQ, root: 9, quality: "min", inversion: 0 }]
    };
    await render(sequence({
      tracks: [MIDI_TRACK, chordTrack],
      clips: [midiClip({ notes: [], harmony: { style: "arp", input: "chords", rate: 0.5 } })]
    }));
    const wav = capturedWavs.get("midi_clip-m.wav");
    expect(wav).toBeDefined();
    const { samples } = decodeWavPcm16(wav as Buffer);
    // Eighth-note arp over the whole two-bar window.
    for (const beat of [0, 3, 7]) {
      expect(rms(samples, beat * QUARTER_MS + 20, beat * QUARTER_MS + 200)).toBeGreaterThan(0.01);
    }
    expect(mixArgs()).toContain("midi_clip-m.wav");
  });

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

  it("decodes back to the same onset", async () => {
    await render(sequence({ tracks: [MIDI_TRACK] }));
    const wav = capturedWavs.get("midi_clip-m.wav");
    expect(wav).toBeDefined();

    const file = path.join(
      fsSync.mkdtempSync(path.join(os.tmpdir(), "midi-decode-")),
      "clip.wav"
    );
    fsSync.writeFileSync(file, wav as Buffer);
    const { samples: decoded } = await readPcm(file, { sampleRate: SAMPLE_RATE, channels: 1 });

    expect(decoded.length).toBe(Math.round((CLIP_MS / 1000) * SAMPLE_RATE));
    expect(firstOnsetMs(decoded)).toBeGreaterThanOrEqual(0);
    expect(firstOnsetMs(decoded)).toBeLessThan(10);
    expect(rms(decoded, 0, 4 * QUARTER_MS)).toBeGreaterThan(0.01);
  });

  it("refuses a VST track instead of exporting it as silence", async () => {
    const vst = {
      type: "vst",
      plugin: { uid: "VST3-Pad", name: "Pad", vendor: "Acme", path: "/plugins/Pad.vst3" },
      state: null,
      gainDb: 0
    };
    await expect(
      render(sequence({ tracks: [{ ...MIDI_TRACK, instrument: vst }] }))
    ).rejects.toThrow(/plays a VST instrument.*desktop app/);
    // Muted, it stays out of the mix and the export goes ahead.
    await expect(
      render(sequence({ tracks: [{ ...MIDI_TRACK, instrument: vst, muted: true }, VIDEO_TRACK], clips: [midiClip(), videoClip()] }))
    ).resolves.toBeDefined();
  });

  it("leaves a muted midi track out of the mix", async () => {
    const seq = sequence({
      tracks: [{ ...MIDI_TRACK, muted: true }, VIDEO_TRACK],
      clips: [midiClip(), videoClip()]
    });
    await render(seq);

    expect(mixInputPaths().some((file) => file.includes("midi_"))).toBe(false);
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
