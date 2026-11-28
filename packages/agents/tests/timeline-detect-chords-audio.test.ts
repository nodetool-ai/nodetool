/**
 * detect_chords on an audio clip through the headless bridge, with the audio
 * made by the runtime media test helpers and decoded by the host decoder.
 */
import { encodeWav } from "@nodetool-ai/runtime/media/testing";
import { DEFAULT_TEMPO, makeClip, makeTrack } from "@nodetool-ai/timeline";
import { describe, expect, it } from "vitest";
import { isReadOnlyRecord } from "../src/capabilities/timeline-operations.js";
import { decodeMonoAudio } from "../src/analysis/media-decode.js";
import { createTimelineToolBridge } from "../src/evals/surfaces/timeline.js";

const SR = 44100;
const hz = (p: number) => 440 * 2 ** ((p - 69) / 12);

/** Stereo 16-bit WAV: C, F, G, C, one bar (2 s at 120 bpm) each. */
function progressionWav(): Uint8Array {
  const chords = [[60, 64, 67], [65, 69, 72], [67, 71, 74], [60, 64, 67]];
  const frames = chords.length * 2 * SR;
  const samples = new Float32Array(frames * 2);
  for (let i = 0; i < frames; i++) {
    const pitches = chords[Math.floor(i / (2 * SR))];
    const v = pitches.reduce((a, p) => a + Math.sin((2 * Math.PI * hz(p) * i) / SR), 0) / 6;
    samples[i * 2] = v;
    samples[i * 2 + 1] = v;
  }
  return encodeWav(samples, SR, 2);
}

describe("detect_chords on audio (headless host)", () => {
  it("decodes a WAV to mono and reads the progression", async () => {
    const wav = progressionWav();
    const bridge = createTimelineToolBridge({
      sequence: {
        tempo: { ...DEFAULT_TEMPO },
        tracks: [makeTrack({ id: "a", type: "audio", name: "Audio", index: 0 })],
        clips: [makeClip({ id: "stem", trackId: "a", name: "Keys stem", startMs: 0, durationMs: 8000, mediaType: "audio", currentAssetId: "asset_1" })]
      },
      decodeClipAudio: async () => decodeMonoAudio(wav)
    });
    const tool = bridge.tools.find((t) => t.name === "ui_timeline_detect_chords")!;
    const out = (await tool.execute({ clipIds: ["stem"] })) as { chart: string; written: boolean };
    expect(out.chart).toBe("| C | F | G | C |");
    expect(out.written).toBe(true);
  });

  it("reports a host without audio decoding", async () => {
    const bridge = createTimelineToolBridge({
      sequence: {
        tracks: [makeTrack({ id: "a", type: "audio", name: "Audio", index: 0 })],
        clips: [makeClip({ id: "stem", trackId: "a", name: "Keys stem", startMs: 0, durationMs: 2000, mediaType: "audio" })]
      }
    });
    const tool = bridge.tools.find((t) => t.name === "ui_timeline_detect_chords")!;
    await expect(tool.execute({ clipIds: ["stem"] })).rejects.toThrow(/cannot decode audio/);
  });

  it("decodes only the requested span and downmixes stereo", async () => {
    // Left channel only: the mono value is half of it.
    const frames = 4 * SR;
    const stereo = new Float32Array(frames * 2);
    for (let i = 0; i < frames; i++) stereo[i * 2] = 0.8 * Math.sin((2 * Math.PI * 440 * i) / SR);
    const wav = encodeWav(stereo, SR, 2);
    const whole = (await decodeMonoAudio(wav))!;
    const part = (await decodeMonoAudio(wav, undefined, { startSec: 2, endSec: 3 }))!;
    expect(whole.samples.length).toBeGreaterThanOrEqual(4 * SR - 2);
    expect(part.startSec).toBeCloseTo(2, 1);
    expect(part.samples.length).toBeLessThan(1.2 * SR);
    expect(part.samples.length).toBeGreaterThan(0.9 * SR);
    const peak = part.samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    expect(peak).toBeGreaterThan(0.35);
    expect(peak).toBeLessThan(0.45);
  });

  it("reads bars 2 to 3 of a long file through the range decode", async () => {
    const wav = progressionWav();
    const ranges: Array<{ startMs: number; endMs: number } | undefined> = [];
    const bridge = createTimelineToolBridge({
      sequence: {
        tempo: { ...DEFAULT_TEMPO },
        tracks: [makeTrack({ id: "a", type: "audio", name: "Audio", index: 0 })],
        clips: [makeClip({ id: "stem", trackId: "a", name: "Keys stem", startMs: 0, durationMs: 8000, mediaType: "audio", currentAssetId: "asset_1" })]
      },
      decodeClipAudio: async (_clip, range) => {
        ranges.push(range);
        const audio = await decodeMonoAudio(wav, undefined, range && { startSec: range.startMs / 1000, endSec: range.endMs / 1000 });
        return audio && { samples: audio.samples, sampleRate: audio.sampleRate, startMs: audio.startSec * 1000 };
      }
    });
    const tool = bridge.tools.find((t) => t.name === "ui_timeline_detect_chords")!;
    const out = (await tool.execute({ clipIds: ["stem"], startBar: 2, endBar: 3, write: false })) as { chart: string };
    expect(out.chart).toBe("| F | G |");
    expect(ranges[0]!.startMs).toBeGreaterThan(1500);
    expect(ranges[0]!.endMs).toBeLessThan(6500);
  });

  it("does not erase a parallel edit when a detect finishes after it", async () => {
    const wav = progressionWav();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const bridge = createTimelineToolBridge({
      sequence: {
        tempo: { ...DEFAULT_TEMPO },
        tracks: [makeTrack({ id: "a", type: "audio", name: "Audio", index: 0 })],
        clips: [makeClip({ id: "stem", trackId: "a", name: "Keys stem", startMs: 0, durationMs: 8000, mediaType: "audio", currentAssetId: "asset_1" })]
      },
      decodeClipAudio: async () => {
        await gate;
        return decodeMonoAudio(wav);
      }
    });
    const detect = bridge.tools.find((t) => t.name === "ui_timeline_detect_chords")!;
    const move = bridge.tools.find((t) => t.name === "ui_timeline_move_clip")!;
    const reading = detect.execute({ clipIds: ["stem"], write: false });
    const moving = move.execute({ target: "stem", startMs: 1000 });
    release();
    await Promise.all([reading, moving]);
    const state = (await bridge.tools.find((t) => t.name === "ui_timeline_get_state")!.execute({})) as {
      clips: Array<{ id: string; startMs?: number; start_ms?: number }>;
    };
    const clip = state.clips.find((c) => c.id === "stem")!;
    expect(clip.startMs ?? clip.start_ms).toBe(1000);
  });

  it("reads an unreadable file as no audio, with the clip named", async () => {
    const bridge = createTimelineToolBridge({
      sequence: {
        tracks: [makeTrack({ id: "a", type: "audio", name: "Audio", index: 0 })],
        clips: [makeClip({ id: "stem", trackId: "a", name: "Keys stem", startMs: 0, durationMs: 2000, mediaType: "audio", currentAssetId: "x" })]
      },
      decodeClipAudio: async () => null
    });
    const tool = bridge.tools.find((t) => t.name === "ui_timeline_detect_chords")!;
    await expect(tool.execute({ clipIds: ["stem"] })).rejects.toThrow(/Keys stem/);
  });

  it("treats a detect that wrote nothing as read-only for edit_timeline", () => {
    const detect = { op: "ui_timeline_detect_chords", input: { clipIds: ["a"] } };
    expect(isReadOnlyRecord({ ...detect, input: { ...detect.input, write: false } }, {})).toBe(true);
    expect(isReadOnlyRecord(detect, { written: false })).toBe(true);
    expect(isReadOnlyRecord(detect, { written: true })).toBe(false);
    expect(isReadOnlyRecord({ op: "ui_timeline_move_clip", input: {} }, { written: false })).toBe(false);
  });
});
