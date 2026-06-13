/**
 * clipboardOps unit tests — copy/paste building for timeline clips.
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { makeTrack, makeClip } from "@nodetool-ai/timeline";
import {
  buildPastedClips,
  clearClipClipboard,
  copyClipsToClipboard,
  hasClipboardClips
} from "../clipboardOps";

describe("clipboardOps", () => {
  beforeEach(() => {
    clearClipClipboard();
  });

  it("hasClipboardClips reflects the buffer state", () => {
    expect(hasClipboardClips()).toBe(false);
    const track = makeTrack({ type: "video", name: "V1" });
    copyClipsToClipboard([
      makeClip({ trackId: track.id, name: "a", startMs: 0, durationMs: 1000 })
    ]);
    expect(hasClipboardClips()).toBe(true);
  });

  it("pastes the earliest clip at the anchor and keeps relative offsets", () => {
    const track = makeTrack({ type: "video", name: "V1" });
    const a = makeClip({
      trackId: track.id,
      name: "a",
      startMs: 2000,
      durationMs: 1000
    });
    const b = makeClip({
      trackId: track.id,
      name: "b",
      startMs: 5000,
      durationMs: 1000
    });
    copyClipsToClipboard([a, b]);

    const pasted = buildPastedClips([track], 10_000);
    expect(pasted).toHaveLength(2);
    const byName = new Map(pasted.map((c) => [c.name, c]));
    expect(byName.get("a")!.startMs).toBe(10_000);
    expect(byName.get("b")!.startMs).toBe(13_000);
  });

  it("assigns fresh ids and keeps the source track", () => {
    const track = makeTrack({ type: "video", name: "V1" });
    const a = makeClip({
      trackId: track.id,
      name: "a",
      startMs: 0,
      durationMs: 1000
    });
    copyClipsToClipboard([a]);

    const pasted = buildPastedClips([track], 0);
    expect(pasted[0].id).not.toBe(a.id);
    expect(pasted[0].trackId).toBe(track.id);
  });

  it("falls back to the first compatible track when the source track is gone", () => {
    const oldAudio = makeTrack({ type: "audio", name: "A1" });
    const a = makeClip({
      trackId: oldAudio.id,
      name: "a",
      startMs: 0,
      durationMs: 1000,
      mediaType: "audio"
    });
    copyClipsToClipboard([a]);

    const video = makeTrack({ type: "video", name: "V1" });
    const newAudio = makeTrack({ type: "audio", name: "A2" });
    const pasted = buildPastedClips([video, newAudio], 0);
    expect(pasted).toHaveLength(1);
    expect(pasted[0].trackId).toBe(newAudio.id);
  });

  it("skips clips with no compatible target track", () => {
    const oldAudio = makeTrack({ type: "audio", name: "A1" });
    const a = makeClip({
      trackId: oldAudio.id,
      name: "a",
      startMs: 0,
      durationMs: 1000,
      mediaType: "audio"
    });
    copyClipsToClipboard([a]);

    const video = makeTrack({ type: "video", name: "V1" });
    expect(buildPastedClips([video], 0)).toHaveLength(0);
  });

  it("clamps pasted start times at 0", () => {
    const track = makeTrack({ type: "video", name: "V1" });
    copyClipsToClipboard([
      makeClip({ trackId: track.id, name: "a", startMs: 0, durationMs: 1000 })
    ]);
    const pasted = buildPastedClips([track], -500);
    expect(pasted[0].startMs).toBe(0);
  });

  it("copies are snapshots — later source edits don't affect the paste", () => {
    const track = makeTrack({ type: "video", name: "V1" });
    const a = makeClip({
      trackId: track.id,
      name: "a",
      startMs: 0,
      durationMs: 1000
    });
    copyClipsToClipboard([a]);
    a.name = "mutated";
    const pasted = buildPastedClips([track], 0);
    expect(pasted[0].name).toBe("a");
  });
});
