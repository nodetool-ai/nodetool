/**
 * Back-sync from a storyboard shot into its assembled timeline, and — with
 * `buildLinkedTimeline` — into a *jointly* assembled one, where every
 * voiceover clip carries both linkage families. Design §2.4 claims both
 * back-sync modules patch that sequence unchanged; these cases hold them to it.
 */

import { buildLinkedTimeline, makeClip, makeTrack } from "@nodetool-ai/timeline";
import type { TimelineClip } from "@nodetool-ai/timeline";
import type { Shot } from "@nodetool-ai/protocol";
import { useStoryboardStore, type StoryboardBoard } from "../StoryboardStore";
import { syncShotClipToTimeline } from "../timelineSync";
import {
  useScriptStore,
  type ScriptSection,
  type ScriptTake
} from "../../script/ScriptStore";
import { syncLineClipToTimeline } from "../../script/timelineSync";
import { trpcClient } from "../../../trpc/client";

jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    timeline: {
      get: { query: jest.fn() },
      update: { mutate: jest.fn() }
    }
  }
}));

const getQuery = trpcClient.timeline.get.query as jest.Mock;
const updateMutate = trpcClient.timeline.update.mutate as jest.Mock;

const track = makeTrack({ type: "video", name: "Shots", index: 0 });

const shotClip = (overrides: Partial<TimelineClip> = {}): TimelineClip =>
  makeClip({
    trackId: track.id,
    mediaType: "video",
    sourceType: "imported",
    status: "generated",
    storyboardBoardId: "board-1",
    storyboardShotId: "shot-1",
    currentAssetId: "old-clip",
    durationMs: 4000,
    ...overrides
  });

const board = (timelineId: string | null): StoryboardBoard => ({
  id: "board-1",
  screenplay: null,
  shots: [],
  title: "B",
  brief: "",
  style: "",
  entityIds: [],
  aspectRatio: "16:9",
  directorModel: null,
  imageModel: null,
  videoModel: null,
  activeShotId: null,
  timelineId,
  updatedAt: 0
});

const seedBoard = (timelineId: string | null): void => {
  const { id: _id, updatedAt: _updatedAt, ...rest } = board(timelineId);
  useStoryboardStore.getState().loadBoard("board-1", rest);
};

beforeEach(() => {
  jest.clearAllMocks();
  useStoryboardStore.setState({ boards: {}, serverRevisions: {}, history: {} });
  useScriptStore.setState({
    scripts: {},
    serverRevisions: {},
    saveStatus: {},
    voicingLineIds: {}
  });
});

describe("syncShotClipToTimeline", () => {
  it("no-ops when the board has no linked timeline", async () => {
    seedBoard(null);
    const result = await syncShotClipToTimeline("board-1", "shot-1", "new-clip");
    expect(result).toBe(false);
    expect(getQuery).not.toHaveBeenCalled();
  });

  it("patches the linked clip with the new asset", async () => {
    seedBoard("tl-1");
    getQuery.mockResolvedValue({
      id: "tl-1",
      updatedAt: "rev-1",
      tracks: [track],
      clips: [shotClip(), shotClip({ storyboardShotId: "shot-2" })],
      markers: []
    });
    updateMutate.mockResolvedValue({});

    const result = await syncShotClipToTimeline("board-1", "shot-1", "new-clip");

    expect(result).toBe(true);
    expect(updateMutate).toHaveBeenCalledTimes(1);
    const arg = updateMutate.mock.calls[0][0];
    expect(arg.id).toBe("tl-1");
    expect(arg.baseUpdatedAt).toBe("rev-1");
    const clips = arg.document.clips as TimelineClip[];
    const patched = clips.find((c) => c.storyboardShotId === "shot-1");
    expect(patched?.currentAssetId).toBe("new-clip");
    expect(patched?.status).toBe("generated");
    const other = clips.find((c) => c.storyboardShotId === "shot-2");
    expect(other?.currentAssetId).toBe("old-clip");
  });

  it("leaves clips of another board alone", async () => {
    seedBoard("tl-1");
    getQuery.mockResolvedValue({
      id: "tl-1",
      updatedAt: "rev-1",
      tracks: [track],
      clips: [shotClip({ storyboardBoardId: "board-2" })],
      markers: []
    });

    const result = await syncShotClipToTimeline("board-1", "shot-1", "new-clip");

    expect(result).toBe(false);
    expect(updateMutate).not.toHaveBeenCalled();
  });

  it("skips the update when the clip already has the asset", async () => {
    seedBoard("tl-1");
    getQuery.mockResolvedValue({
      id: "tl-1",
      updatedAt: "rev-1",
      tracks: [track],
      clips: [shotClip({ currentAssetId: "new-clip" })],
      markers: []
    });

    const result = await syncShotClipToTimeline("board-1", "shot-1", "new-clip");

    expect(result).toBe(false);
    expect(updateMutate).not.toHaveBeenCalled();
  });

  it("swallows errors and returns false", async () => {
    seedBoard("tl-1");
    getQuery.mockRejectedValue(new Error("boom"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const result = await syncShotClipToTimeline("board-1", "shot-1", "new-clip");
    expect(result).toBe(false);
    warn.mockRestore();
  });
});

// ── Joint assembly: both back-sync paths against one sequence ────────────────

const voicedLine = (id: string, durationMs: number) => ({
  id,
  speakerId: "speaker-1",
  text: `text of ${id}`,
  currentTakeId: `take-${id}`,
  takes: [
    {
      id: `take-${id}`,
      assetId: `asset-${id}`,
      durationMs,
      words: [{ word: id, startMs: 0, endMs: durationMs }],
      textSnapshot: `text of ${id}`,
      voiceSnapshot: null,
      createdAt: "2026-01-01T00:00:00.000Z"
    }
  ]
});

const renderedShot = (id: string, index: number, lineIds: string[]): Shot => ({
  type: "shot",
  id,
  index,
  action: `action of ${id}`,
  status: "rendered",
  clip: { type: "video", asset_id: `clip-${id}` },
  script_line_ids: lineIds
});

const sections: ScriptSection[] = [
  {
    id: "section-1",
    title: "Act one",
    lines: [voicedLine("line-1", 2000), voicedLine("line-2", 3000)]
  }
];

const cast = [
  {
    id: "speaker-1",
    name: "Ada",
    voice: { provider: "elevenlabs", model: "v3", voice: "rachel" }
  }
];

/** The document both modules are pointed at: one board, one script, one cut. */
const jointSequence = () => {
  const assembled = buildLinkedTimeline({
    boardId: "board-1",
    shots: [
      renderedShot("shot-1", 0, ["line-1"]),
      renderedShot("shot-2", 1, ["line-2"])
    ],
    script: { scriptId: "script-1", cast, sections }
  });
  return {
    id: "tl-1",
    updatedAt: "rev-1",
    tracks: assembled.tracks,
    clips: assembled.clips,
    markers: []
  };
};

const seedJoint = (): void => {
  seedBoard("tl-1");
  useScriptStore.getState().loadScript("script-1", {
    title: "S",
    cast,
    sections,
    timelineId: "tl-1",
    storyboardId: "board-1"
  });
};

const newTake: ScriptTake = {
  id: "take-line-1-b",
  assetId: "asset-line-1-b",
  durationMs: 5000,
  words: [{ word: "again", startMs: 0, endMs: 400 }],
  textSnapshot: "text of line-1",
  voiceSnapshot: null,
  createdAt: "2026-02-01T00:00:00.000Z"
};

describe("back-sync into a jointly assembled sequence", () => {
  it("stamps both linkage families onto every voiceover clip", () => {
    const sequence = jointSequence();
    const voice = sequence.clips.filter((c) => c.mediaType === "audio");
    expect(voice).toHaveLength(2);
    for (const clip of voice) {
      expect(clip.scriptId).toBe("script-1");
      expect(clip.scriptLineId).toBeTruthy();
      expect(clip.storyboardBoardId).toBe("board-1");
      expect(clip.storyboardShotId).toBeTruthy();
    }
  });

  it("re-voicing a line patches its voiceover clip and shifts the later one", async () => {
    seedJoint();
    getQuery.mockResolvedValue(jointSequence());
    updateMutate.mockResolvedValue({});

    const result = await syncLineClipToTimeline("script-1", "line-1", newTake);

    expect(result).toBe(true);
    const clips = updateMutate.mock.calls[0][0].document.clips as TimelineClip[];
    const patched = clips.find((c) => c.scriptLineId === "line-1");
    expect(patched?.currentAssetId).toBe("asset-line-1-b");
    expect(patched?.durationMs).toBe(5000);
    expect(patched?.caption?.words).toEqual([
      { word: "again", startMs: 0, endMs: 400 }
    ]);
    // The other line's clip keeps its take but slides by the delta (5000-2000).
    const later = clips.find((c) => c.scriptLineId === "line-2");
    expect(later?.currentAssetId).toBe("asset-line-2");
    expect(later?.startMs).toBe(2000 + 3000);
  });

  it("re-voicing does not touch the storyboard's shot clips", async () => {
    seedJoint();
    const sequence = jointSequence();
    getQuery.mockResolvedValue(sequence);
    updateMutate.mockResolvedValue({});

    await syncLineClipToTimeline("script-1", "line-1", newTake);

    const before = sequence.clips.filter((c) => c.mediaType === "video");
    const after = (
      updateMutate.mock.calls[0][0].document.clips as TimelineClip[]
    ).filter((c) => c.mediaType === "video");
    expect(after).toEqual(before);
  });

  it("revising a shot patches its shot clip in the same sequence", async () => {
    seedJoint();
    getQuery.mockResolvedValue(jointSequence());
    updateMutate.mockResolvedValue({});

    const result = await syncShotClipToTimeline("board-1", "shot-1", "clip-1-b");

    expect(result).toBe(true);
    const clips = updateMutate.mock.calls[0][0].document.clips as TimelineClip[];
    const patched = clips.find(
      (c) => c.mediaType === "video" && c.storyboardShotId === "shot-1"
    );
    expect(patched?.currentAssetId).toBe("clip-1-b");
    const other = clips.find(
      (c) => c.mediaType === "video" && c.storyboardShotId === "shot-2"
    );
    expect(other?.currentAssetId).toBe("clip-shot-2");
  });

  it("revising a shot does not touch the script's voiceover clips", async () => {
    seedJoint();
    const sequence = jointSequence();
    getQuery.mockResolvedValue(sequence);
    updateMutate.mockResolvedValue({});

    await syncShotClipToTimeline("board-1", "shot-1", "clip-1-b");

    const before = sequence.clips.filter((c) => c.mediaType === "audio");
    const after = (
      updateMutate.mock.calls[0][0].document.clips as TimelineClip[]
    ).filter((c) => c.mediaType === "audio");
    expect(after).toEqual(before);
  });
});
