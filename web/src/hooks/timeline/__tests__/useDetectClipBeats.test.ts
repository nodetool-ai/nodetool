import { describe, expect, it } from "@jest/globals";
import type { TimelineClip } from "@nodetool-ai/timeline";

import {
  createTimelineStore,
  timelineTemporalOf,
  type TimelineStoreApi
} from "../../../stores/timeline/TimelineStore";
import {
  canDetectClipBeats,
  detectClipBeats,
  type DecodeClipAudio
} from "../useDetectClipBeats";

const SAMPLE_RATE = 22050;

/** Short noise bursts every 500 ms: 120 BPM by construction. */
function clickTrack(seconds: number, firstMs: number): Float32Array {
  const samples = new Float32Array(seconds * SAMPLE_RATE);
  let seed = 11;
  for (let t = firstMs; t < seconds * 1000; t += 500) {
    const start = Math.round((t / 1000) * SAMPLE_RATE);
    for (let i = 0; i < 400 && start + i < samples.length; i++) {
      seed = (seed * 16807) % 2147483647;
      samples[start + i] = (seed / 2147483647 - 0.5) * Math.exp(-i / 80);
    }
  }
  return samples;
}

const decodeTo =
  (samples: Float32Array): DecodeClipAudio =>
  async () => ({ samples, sampleRate: SAMPLE_RATE });

function loadAudioClip(
  store: TimelineStoreApi,
  clip: Partial<TimelineClip> = {}
): void {
  store.getState().loadSequence({
    id: "seq-1",
    projectId: "p1",
    name: "Cut",
    fps: 30,
    width: 1920,
    height: 1080,
    durationMs: 10_000,
    tracks: [
      {
        id: "track-a",
        name: "Music",
        type: "audio",
        index: 0,
        visible: true,
        locked: false
      }
    ],
    clips: [
      {
        id: "song",
        trackId: "track-a",
        name: "Song",
        startMs: 2_000,
        durationMs: 8_000,
        mediaType: "audio",
        sourceType: "imported",
        currentAssetId: "asset-song",
        status: "generated",
        locked: false,
        versions: [],
        ...clip
      }
    ],
    markers: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  });
}

describe("detectClipBeats", () => {
  it("sets the tempo and marks every bar of the clip in one undo entry", async () => {
    const store = createTimelineStore();
    loadAudioClip(store);
    const undoDepth = timelineTemporalOf(store).pastStates.length;

    const result = await detectClipBeats(
      store,
      "song",
      decodeTo(clickTrack(8, 100))
    );

    expect(result).toMatchObject({ ok: true });
    const { tempo, markers } = store.getState();
    expect(tempo?.bpm).toBeGreaterThan(115);
    expect(tempo?.bpm).toBeLessThan(125);
    // Eight seconds of 4/4 at about 120 BPM is four bars.
    expect(markers.length).toBeGreaterThanOrEqual(3);
    expect(markers.length).toBeLessThanOrEqual(5);
    expect(markers[0].label).toBe("Bar 1");
    // The first click sits 100 ms into the clip, which starts at 2 s.
    expect(Math.abs(markers[0].timeMs - 2_100)).toBeLessThan(60);
    for (const marker of markers) {
      expect(marker.timeMs).toBeGreaterThanOrEqual(2_000);
      expect(marker.timeMs).toBeLessThan(10_000);
    }
    expect(timelineTemporalOf(store).pastStates.length).toBe(undoDepth + 1);
  });

  it("does not add a second marker where one already exists", async () => {
    const store = createTimelineStore();
    loadAudioClip(store);
    await detectClipBeats(store, "song", decodeTo(clickTrack(8, 100)));
    const count = store.getState().markers.length;

    await detectClipBeats(store, "song", decodeTo(clickTrack(8, 100)));

    expect(store.getState().markers).toHaveLength(count);
  });

  it("leaves the document alone when the clip has no steady beat", async () => {
    const store = createTimelineStore();
    loadAudioClip(store);

    const result = await detectClipBeats(
      store,
      "song",
      decodeTo(new Float32Array(8 * SAMPLE_RATE))
    );

    expect(result).toEqual({
      ok: false,
      reason: "No steady beat was found in this clip."
    });
    expect(store.getState().tempo).toBeUndefined();
    expect(store.getState().markers).toEqual([]);
  });
});

describe("canDetectClipBeats", () => {
  it("accepts audio and video clips with media and no time remap", () => {
    const store = createTimelineStore();
    loadAudioClip(store);
    const clip = store.getState().clips[0];
    expect(canDetectClipBeats(clip)).toBe(true);
    expect(canDetectClipBeats({ ...clip, mediaType: "video" })).toBe(true);
    expect(canDetectClipBeats({ ...clip, mediaType: "image" })).toBe(false);
    expect(canDetectClipBeats({ ...clip, currentAssetId: undefined })).toBe(
      false
    );
    expect(
      canDetectClipBeats({
        ...clip,
        timeRemap: { keyframes: [] } as unknown as TimelineClip["timeRemap"]
      })
    ).toBe(false);
  });
});
