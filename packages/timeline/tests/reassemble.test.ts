/**
 * What a re-assemble keeps: everything the assembling document does not own.
 */

import { describe, it, expect } from "vitest";
import { makeClip, makeTrack } from "../src/defaults.js";
import { foreignTimelineParts, refillShotClips } from "../src/reassemble.js";
import type { TimelineClip } from "../src/types.js";

const track = (name: string, index: number) =>
  makeTrack({ type: "audio", name, index });

const clip = (trackId: string, overrides: Partial<TimelineClip> = {}) =>
  makeClip({
    trackId,
    name: "clip",
    startMs: 0,
    durationMs: 1000,
    mediaType: "audio",
    sourceType: "imported",
    versions: [],
    ...overrides
  });

describe("foreignTimelineParts", () => {
  it("drops the owner's clips and the tracks that only held them", () => {
    const mine = track("Voiceover", 0);
    const theirs = track("Music", 1);
    const previous = {
      tracks: [mine, theirs],
      clips: [
        clip(mine.id, { scriptId: "sc-1" }),
        clip(theirs.id, { scriptId: "sc-2" })
      ]
    };

    const foreign = foreignTimelineParts(
      previous,
      (c) => c.scriptId === "sc-1"
    );

    expect(foreign.tracks.map((t) => t.name)).toEqual(["Music"]);
    expect(foreign.clips.map((c) => c.scriptId)).toEqual(["sc-2"]);
  });

  it("keeps a track that carries both an owned and a foreign clip", () => {
    const shared = track("Shared", 0);
    const previous = {
      tracks: [shared],
      clips: [
        clip(shared.id, { scriptId: "sc-1" }),
        clip(shared.id, { scriptId: "sc-2" })
      ]
    };

    const foreign = foreignTimelineParts(
      previous,
      (c) => c.scriptId === "sc-1"
    );

    expect(foreign.tracks).toHaveLength(1);
    expect(foreign.clips).toHaveLength(1);
  });

  it("keeps an empty track the editor added", () => {
    const mine = track("Voiceover", 0);
    const empty = track("Room tone", 1);
    const previous = {
      tracks: [mine, empty],
      clips: [clip(mine.id, { scriptId: "sc-1" })]
    };

    const foreign = foreignTimelineParts(
      previous,
      (c) => c.scriptId === "sc-1"
    );

    expect(foreign.tracks.map((t) => t.name)).toEqual(["Room tone"]);
    expect(foreign.clips).toEqual([]);
  });

  it("keeps everything when the owner has nothing in the sequence", () => {
    const other = track("Music", 0);
    const previous = { tracks: [other], clips: [clip(other.id)] };

    const foreign = foreignTimelineParts(previous, () => false);

    expect(foreign).toEqual(previous);
  });
});

describe("refillShotClips", () => {
  const shots = track("Shots", 0);
  const music = track("Music", 1);
  const shotClip = (
    shotId: string,
    overrides: Partial<TimelineClip> = {}
  ): TimelineClip =>
    clip(shots.id, {
      mediaType: "video",
      storyboardBoardId: "board",
      storyboardShotId: shotId,
      ...overrides
    });

  const owns = (c: TimelineClip) => c.storyboardBoardId === "board";

  it("is the assembly itself when there is no previous cut", () => {
    const assembled = {
      tracks: [shots],
      clips: [shotClip("shot-1"), shotClip("shot-2", { startMs: 1000 })]
    };

    const merged = refillShotClips({ tracks: [], clips: [] }, assembled, {
      owns,
      liveShotIds: new Set(["shot-1", "shot-2"])
    });

    expect(merged).toEqual(assembled);
  });

  it("keeps the placement and trim of a clip and swaps only its media", () => {
    const previous = {
      tracks: [shots],
      clips: [
        shotClip("shot-1", {
          startMs: 1500,
          durationMs: 1000,
          inPointMs: 2000,
          outPointMs: 3000,
          opacity: 0.5,
          currentAssetId: "old",
          thumbnailAssetId: "old-thumb"
        })
      ]
    };
    const assembled = {
      tracks: [track("Shots", 0)],
      clips: [shotClip("shot-1", { durationMs: 4000, currentAssetId: "new" })]
    };

    const merged = refillShotClips(previous, assembled, {
      owns,
      liveShotIds: new Set(["shot-1"])
    });

    expect(merged.clips).toHaveLength(1);
    expect(merged.clips[0]).toMatchObject({
      startMs: 1500,
      durationMs: 1000,
      inPointMs: 2000,
      outPointMs: 3000,
      opacity: 0.5,
      currentAssetId: "new"
    });
    // The thumbnail was of the media that just went away.
    expect(merged.clips[0].thumbnailAssetId).toBeUndefined();
    // One shots track: the assembly's replacement is not added beside it.
    expect(merged.tracks.map((t) => t.id)).toEqual([shots.id]);
  });

  it("drops the clip of a deleted shot and appends an added one after the cut", () => {
    const previous = {
      tracks: [shots],
      clips: [
        shotClip("shot-1", { startMs: 1500, durationMs: 1000 }),
        shotClip("shot-2", { startMs: 4000, durationMs: 2000 })
      ]
    };
    const assembled = {
      tracks: [track("Shots", 0)],
      clips: [
        shotClip("shot-1", { durationMs: 3000, currentAssetId: "a" }),
        shotClip("shot-3", {
          startMs: 3000,
          durationMs: 3000,
          currentAssetId: "b"
        })
      ]
    };

    const merged = refillShotClips(previous, assembled, {
      owns,
      liveShotIds: new Set(["shot-1", "shot-3"])
    });

    expect(merged.clips.map((c) => c.storyboardShotId)).toEqual([
      "shot-1",
      "shot-3"
    ]);
    expect(merged.clips[1]).toMatchObject({
      startMs: 2500,
      durationMs: 3000,
      currentAssetId: "b",
      trackId: shots.id
    });
  });

  it("holds the place of a shot the assembly could not resolve", () => {
    const previous = {
      tracks: [shots],
      clips: [shotClip("shot-1", { startMs: 4000, currentAssetId: "old" })]
    };

    const merged = refillShotClips(
      previous,
      { tracks: [], clips: [] },
      { owns, liveShotIds: new Set(["shot-1"]) }
    );

    expect(merged.clips[0]).toMatchObject({
      startMs: 4000,
      currentAssetId: "old"
    });
  });

  it("keeps foreign clips and the empty track the editor added", () => {
    const empty = track("Room tone", 2);
    const previous = {
      tracks: [shots, music, empty],
      clips: [shotClip("shot-1"), clip(music.id, { currentAssetId: "bed" })]
    };
    const assembled = {
      tracks: [track("Shots", 0)],
      clips: [shotClip("shot-1", { currentAssetId: "new" })]
    };

    const merged = refillShotClips(previous, assembled, {
      owns,
      liveShotIds: new Set(["shot-1"])
    });

    expect(merged.clips.map((c) => c.currentAssetId)).toEqual(["new", "bed"]);
    expect(merged.tracks.map((t) => t.name)).toEqual([
      "Shots",
      "Music",
      "Room tone"
    ]);
  });
});
