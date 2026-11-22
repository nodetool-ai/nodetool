/**
 * SQ1 Fix Round Wave 5 — TimelineStore pattern defects (F20, F22).
 */
import { describe, expect, it } from "@jest/globals";
import {
  DEFAULT_MIDI_INSTRUMENT,
  DEFAULT_TEMPO,
  makeClip,
  patternFromText
} from "@nodetool-ai/timeline";
import { createTimelineStore } from "../TimelineStore";

describe("SQ1 Fix Round — TimelineStore step patterns (Wave 5)", () => {
  it("F20: trimClipStart passes document BPM to trimClip when computing patternPhaseTicks", () => {
    const store = createTimelineStore();
    store.getState().setTempo({ ...DEFAULT_TEMPO, bpm: 90 });
    store.getState().addTrack("midi", "Drums");
    const trackId = store.getState().tracks[0]!.id;
    const beatMs90 = 60000 / 90;
    const clip = makeClip({
      id: "p1",
      trackId,
      name: "Groove",
      startMs: 0,
      durationMs: 4 * beatMs90,
      mediaType: "midi",
      sourceType: "imported",
      status: "generated",
      pattern: patternFromText("Kick: x... x... x... x...")
    });
    store.getState().addClip(clip);

    // Trim 1 beat inward at 90 BPM -> must be 960 ticks (not 1280 at default 120 BPM).
    store.getState().trimClipStart("p1", -beatMs90);
    const trimmed = store.getState().clips.find((c) => c.id === "p1")!;
    expect(trimmed.patternPhaseTicks).toBe(960);
  });

  it("F22: duplicateClip and regenerateAsCopy clone pattern, and removeScene rejoins split pattern halves", async () => {
    const store = createTimelineStore();
    store.getState().setTempo(DEFAULT_TEMPO);
    store.getState().addTrack("midi", "Drums");
    const trackId = store.getState().tracks[0]!.id;
    store.getState().setTrackInstrument(trackId, DEFAULT_MIDI_INSTRUMENT);

    const pat = patternFromText("Kick: x... x... x... x...");
    store.getState().addClip(
      makeClip({
        id: "p-src",
        trackId,
        name: "Beat",
        startMs: 0,
        durationMs: 4000,
        mediaType: "midi",
        sourceType: "imported",
        status: "generated",
        pattern: pat
      })
    );

    // 1. duplicateClip deep-clones pattern so edits to copy never mutate source.
    const dupId = await store.getState().duplicateClip("p-src");
    const srcClip = store.getState().clips.find((c) => c.id === "p-src")!;
    const dupClip = store.getState().clips.find((c) => c.id === dupId)!;
    expect(dupClip.pattern).toEqual(srcClip.pattern);
    expect(dupClip.pattern).not.toBe(srcClip.pattern);
    expect(dupClip.pattern!.rows).not.toBe(srcClip.pattern!.rows);

    // 2. regenerateAsCopy deep-clones pattern.
    const regenId = store.getState().regenerateAsCopy("p-src");
    const regenClip = store.getState().clips.find((c) => c.id === regenId)!;
    expect(regenClip.pattern).toEqual(srcClip.pattern);
    expect(regenClip.pattern).not.toBe(srcClip.pattern);

    // 3. addScene splits pattern clip at bar 2 (2000ms) and removeScene rejoins it cleanly.
    const sceneStore = createTimelineStore();
    sceneStore.getState().setTempo(DEFAULT_TEMPO);
    sceneStore.getState().addTrack("midi", "Drums");
    const sTrackId = sceneStore.getState().tracks[0]!.id;
    sceneStore.getState().addClip(
      makeClip({
        id: "p-scene",
        trackId: sTrackId,
        name: "Beat",
        startMs: 0,
        durationMs: 4000,
        mediaType: "midi",
        sourceType: "imported",
        status: "generated",
        pattern: patternFromText("Kick: x... x... x... x...")
      })
    );
    sceneStore.getState().addScene(2000, "Verse");
    expect(sceneStore.getState().clips).toHaveLength(2);
    expect(sceneStore.getState().clips[1]!.patternPhaseTicks).toBe(3840);
    const markerId = sceneStore.getState().markers[0]!.id;
    sceneStore.getState().removeScene(markerId);
    expect(sceneStore.getState().clips).toHaveLength(1);
    expect(sceneStore.getState().clips[0]!.durationMs).toBe(4000);
    expect(sceneStore.getState().clips[0]!.patternPhaseTicks ?? 0).toBe(0);
  });
});
