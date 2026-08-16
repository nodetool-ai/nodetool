/**
 * What a re-assemble keeps: everything the assembling document does not own.
 */

import { describe, it, expect } from "vitest";
import { makeClip, makeTrack } from "../src/defaults.js";
import { foreignTimelineParts } from "../src/reassemble.js";
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
