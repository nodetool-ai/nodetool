/**
 * The export hears the synth parts the preview plays.
 *
 * A midi clip has no asset, so the old audible-clip filter (which required
 * `currentAssetId`) dropped it silently and the exported soundtrack was missing
 * the music with nothing to show for it. These cases pin the two halves that
 * fixed it: midi tracks join the audible set, and a midi clip is rendered onto
 * the offline context rather than fetched.
 */
import type { TimelineClip, TimelineTrack } from "@nodetool-ai/timeline";
import { clearSamplerAudioCache } from "../../preview/samplerAudio";
import { renderTimelineAudio } from "../renderAudio";

interface Scheduled {
  clipId: string;
  buffer: unknown;
  assetUrl?: string;
}

const scheduled: Scheduled[] = [];

jest.mock("../../preview/AudioGraph", () => ({
  AudioGraph: class {
    scheduleClips(clips: Array<{ clip: { id: string } } & Scheduled>) {
      for (const c of clips) {
        scheduled.push({
          clipId: c.clip.id,
          buffer: c.buffer,
          assetUrl: c.assetUrl
        });
      }
      return Promise.resolve();
    }
  }
}));

class MockOfflineAudioContext {
  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number
  ) {}
  createBuffer(_channels: number, length: number) {
    const channel = new Float32Array(length);
    return { length, getChannelData: () => channel, channel };
  }
  decodeAudioData() {
    return Promise.resolve({ length: this.sampleRate, duration: 1, sampleRate: this.sampleRate, numberOfChannels: 1,
      getChannelData: () => Float32Array.from({ length: this.sampleRate }, (_, i) => .25 * Math.sin(i * .03)) });
  }
  startRendering() {
    return Promise.resolve({ length: this.length } as AudioBuffer);
  }
}

const midiTrack: TimelineTrack = {
  id: "t-midi",
  name: "Bass",
  type: "midi",
  index: 0,
  visible: true,
  locked: false
};

const midiClip: TimelineClip = {
  id: "m1",
  trackId: "t-midi",
  name: "Riff",
  startMs: 0,
  durationMs: 2000,
  mediaType: "midi",
  sourceType: "imported",
  status: "generated",
  locked: false,
  versions: [],
  notes: [
    { id: "n1", pitch: 60, velocity: 100, startTick: 0, durationTick: 480 }
  ]
};

describe("renderTimelineAudio — midi", () => {
  it("loads a sampler recording and schedules its rendered tail in the offline mix", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
    const resolveUrl = jest.fn().mockResolvedValue("https://example.test/drum.wav");
    try {
      await renderTimelineAudio({ clips: [midiClip], tracks: [{ ...midiTrack, instrument: {
        type: "sampler", zones: [{ id: "z", name: "Hit", assetId: "a".repeat(32), rootNote: 60, lowNote: 60, highNote: 60, gainDb: 0 }],
        oneShot: true, attackMs: 0, releaseMs: 50, gainDb: -6
      } }], durationMs: 2000, resolveUrl });
      expect(resolveUrl).toHaveBeenCalledWith("a".repeat(32));
      const buffer = scheduled[0].buffer as { channel: Float32Array };
      expect(buffer.channel.slice(24000, 36000).some(x => Math.abs(x) > .01)).toBe(true);
    } finally { globalThis.fetch = originalFetch; }
  });
  beforeEach(() => {
    clearSamplerAudioCache();
    scheduled.length = 0;
    (
      globalThis as unknown as { OfflineAudioContext: unknown }
    ).OfflineAudioContext = MockOfflineAudioContext;
  });

  const render = (clips: TimelineClip[], tracks: TimelineTrack[]) =>
    renderTimelineAudio({
      clips,
      tracks,
      durationMs: 4000,
      resolveUrl: async () => undefined
    });

  it("mixes a midi clip from a rendered buffer, fetching nothing", async () => {
    const result = await render([midiClip], [midiTrack]);
    expect(result).not.toBeNull();
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].clipId).toBe("m1");
    expect(scheduled[0].assetUrl).toBeUndefined();
    expect(scheduled[0].buffer).toBeDefined();
  });

  it("skips a midi clip with no notes", async () => {
    const result = await render([{ ...midiClip, notes: [] }], [midiTrack]);
    expect(result).toBeNull();
    expect(scheduled).toHaveLength(0);
  });

  it("skips a muted midi track", async () => {
    const result = await render(
      [midiClip],
      [{ ...midiTrack, muted: true }]
    );
    expect(result).toBeNull();
  });

  it("respects solo across audio and midi tracks alike", async () => {
    const result = await render(
      [midiClip],
      [
        midiTrack,
        {
          id: "t-audio",
          name: "VO",
          type: "audio",
          index: 1,
          visible: true,
          locked: false,
          solo: true
        }
      ]
    );
    expect(result).toBeNull();
  });

  it("stops with an AbortError when cancelled while assets resolve (F33)", async () => {
    const controller = new AbortController();
    const audioClip: TimelineClip = {
      ...midiClip,
      id: "a1",
      mediaType: "audio",
      notes: undefined,
      currentAssetId: "asset-1"
    };
    const audioTrack: TimelineTrack = { ...midiTrack, id: "t-midi", type: "audio" };
    const resolveUrl = jest.fn(() => new Promise<string | undefined>(() => {}));
    const pending = renderTimelineAudio({
      clips: [audioClip],
      tracks: [audioTrack],
      durationMs: 1000,
      resolveUrl,
      signal: controller.signal
    });
    await Promise.resolve();
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(scheduled).toEqual([]);
  });

  it("rejects immediately when already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      renderTimelineAudio({
        clips: [midiClip],
        tracks: [midiTrack],
        durationMs: 1000,
        resolveUrl: async () => undefined,
        signal: controller.signal
      })
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
