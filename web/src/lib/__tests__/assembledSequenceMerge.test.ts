import { makeClip, makeTrack } from "@nodetool-ai/timeline";
import type { TimelineClip, TimelineTrack } from "@nodetool-ai/timeline";
import {
  isOwnedClip,
  mergeIntoSequence,
  stampBoardProvenance
} from "../assembledSequenceMerge";

const BOARD = "board-1";
const SCRIPT = "script-1";
const OTHER_BOARD = "board-2";

const videoTrack = (name: string, index: number): TimelineTrack =>
  makeTrack({ type: "video", name, index });

const audioTrack = (name: string, index: number): TimelineTrack =>
  makeTrack({ type: "audio", name, index });

const clipOn = (
  track: TimelineTrack,
  name: string,
  provenance: Pick<TimelineClip, "storyboardBoardId" | "scriptId"> = {}
): TimelineClip =>
  makeClip({
    trackId: track.id,
    name,
    startMs: 0,
    durationMs: 1000,
    mediaType: "video",
    sourceType: "imported",
    status: "generated",
    versions: [],
    ...provenance
  });

describe("isOwnedClip", () => {
  it.each([
    ["board matches", BOARD, undefined, BOARD, null, true],
    ["script matches", undefined, SCRIPT, null, SCRIPT, true],
    ["either side matches", BOARD, SCRIPT, null, SCRIPT, true],
    ["neither matches", OTHER_BOARD, undefined, BOARD, SCRIPT, false],
    ["clip has no provenance", undefined, undefined, BOARD, SCRIPT, false],
    ["owner names nothing", BOARD, SCRIPT, null, null, false],
    // An empty id is not an id: it must not sweep up every unstamped clip.
    ["empty owner board", undefined, undefined, "", null, false],
    ["empty owner board vs empty clip board", "", undefined, "", null, false]
  ])(
    "%s",
    (
      _label,
      storyboardBoardId: string | undefined,
      scriptId: string | undefined,
      ownerBoardId: string | null,
      ownerScriptId: string | null,
      expected: boolean
    ) => {
      const clip = makeClip({ storyboardBoardId, scriptId });
      expect(
        isOwnedClip(clip, { boardId: ownerBoardId, scriptId: ownerScriptId })
      ).toBe(expected);
    }
  );
});

describe("stampBoardProvenance", () => {
  it("stamps only the clips that carry no board", () => {
    const kept = makeClip({ storyboardBoardId: OTHER_BOARD });
    const draft = makeClip({});
    const [a, b] = stampBoardProvenance([kept, draft], BOARD);
    expect(a).toBe(kept);
    expect(b.storyboardBoardId).toBe(BOARD);
  });
});

describe("mergeIntoSequence", () => {
  describe("track retention", () => {
    it("drops a track these documents filled and no one else uses", () => {
      const old = videoTrack("Shots", 0);
      const built = { tracks: [videoTrack("Shots", 0)], clips: [] };
      const merged = mergeIntoSequence(
        built,
        {
          tracks: [old],
          clips: [clipOn(old, "shot", { storyboardBoardId: BOARD })]
        },
        { boardId: BOARD, scriptId: null }
      );
      expect(merged.tracks.map((t) => t.id)).toEqual([built.tracks[0].id]);
    });

    it("keeps a track that also carries a foreign clip", () => {
      const old = videoTrack("Shots", 0);
      const built = { tracks: [videoTrack("Shots", 0)], clips: [] };
      const merged = mergeIntoSequence(
        built,
        {
          tracks: [old],
          clips: [
            clipOn(old, "shot", { storyboardBoardId: BOARD }),
            clipOn(old, "my footage")
          ]
        },
        { boardId: BOARD, scriptId: null }
      );
      expect(merged.tracks.map((t) => t.id)).toEqual([
        built.tracks[0].id,
        old.id
      ]);
      expect(merged.clips.map((c) => c.name)).toEqual(["my footage"]);
    });

    it("keeps an empty track and a track the editor added", () => {
      const empty = audioTrack("Empty", 0);
      const editor = videoTrack("Overlay", 1);
      const merged = mergeIntoSequence(
        { tracks: [videoTrack("Shots", 0)], clips: [] },
        { tracks: [empty, editor], clips: [clipOn(editor, "overlay")] },
        { boardId: BOARD, scriptId: null }
      );
      expect(merged.tracks.map((t) => t.name)).toEqual([
        "Shots",
        "Empty",
        "Overlay"
      ]);
    });

    it("keeps a track owned by a board that is not being re-assembled", () => {
      const other = videoTrack("Other board", 0);
      const merged = mergeIntoSequence(
        { tracks: [videoTrack("Shots", 0)], clips: [] },
        {
          tracks: [other],
          clips: [clipOn(other, "theirs", { storyboardBoardId: OTHER_BOARD })]
        },
        { boardId: BOARD, scriptId: null }
      );
      expect(merged.tracks.map((t) => t.name)).toEqual(["Shots", "Other board"]);
    });
  });

  describe("track index", () => {
    // Two visual tracks sharing an index composite in an undefined order,
    // which `validateTimelineSequence` reports as `duplicate_track_index`.
    it("re-indexes kept tracks so no two visual tracks share an index", () => {
      // The user dropped their own footage onto the Shots track the first
      // assemble created, so that track survives the re-assemble — at the same
      // index the fresh Shots track claims.
      const old = videoTrack("Shots", 0);
      const merged = mergeIntoSequence(
        { tracks: [videoTrack("Shots", 0)], clips: [] },
        {
          tracks: [old],
          clips: [
            clipOn(old, "shot", { storyboardBoardId: BOARD }),
            clipOn(old, "my footage")
          ]
        },
        { boardId: BOARD, scriptId: null }
      );

      const visualIndexes = merged.tracks
        .filter((t) => t.type !== "audio")
        .map((t) => t.index);
      expect(new Set(visualIndexes).size).toBe(visualIndexes.length);
    });

    it("makes every track's index its position in the merged array", () => {
      const editorA = videoTrack("Overlay", 7);
      const editorB = audioTrack("Music", 7);
      const merged = mergeIntoSequence(
        {
          tracks: [videoTrack("Shots", 0), audioTrack("Narration", 1)],
          clips: []
        },
        {
          tracks: [editorA, editorB],
          clips: [clipOn(editorA, "overlay"), clipOn(editorB, "music")]
        },
        { boardId: BOARD, scriptId: SCRIPT }
      );
      expect(merged.tracks.map((t) => t.index)).toEqual([0, 1, 2, 3]);
      expect(merged.tracks.map((t) => t.name)).toEqual([
        "Shots",
        "Narration",
        "Overlay",
        "Music"
      ]);
    });

    it("keeps the relative order of the tracks the editor added", () => {
      const first = videoTrack("Top", 0);
      const second = videoTrack("Bottom", 1);
      const merged = mergeIntoSequence(
        { tracks: [videoTrack("Shots", 0)], clips: [] },
        {
          tracks: [first, second],
          clips: [clipOn(first, "a"), clipOn(second, "b")]
        },
        { boardId: BOARD, scriptId: null }
      );
      expect(merged.tracks.map((t) => [t.name, t.index])).toEqual([
        ["Shots", 0],
        ["Top", 1],
        ["Bottom", 2]
      ]);
    });
  });

  it("writes the fresh clips first and keeps every foreign clip", () => {
    const old = videoTrack("Shots", 0);
    const editor = videoTrack("Overlay", 1);
    const built = {
      tracks: [videoTrack("Shots", 0)],
      clips: [makeClip({ name: "fresh", storyboardBoardId: BOARD })]
    };
    const merged = mergeIntoSequence(
      built,
      {
        tracks: [old, editor],
        clips: [
          clipOn(old, "stale", { storyboardBoardId: BOARD }),
          clipOn(editor, "overlay")
        ]
      },
      { boardId: BOARD, scriptId: null }
    );
    expect(merged.clips.map((c) => c.name)).toEqual(["fresh", "overlay"]);
  });
});
