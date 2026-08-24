import { renderHook } from "@testing-library/react";
import { act } from "react";
import { makeClip, makeTrack } from "@nodetool-ai/timeline";
import type { TimelineClip } from "@nodetool-ai/timeline";
import type { Shot } from "@nodetool-ai/protocol";
import { useAssembleTimeline } from "../useAssembleTimeline";
import {
  useStoryboardStore,
  type StoryboardBoard
} from "../../../stores/storyboard/StoryboardStore";
import {
  useScriptStore,
  type ScriptTake
} from "../../../stores/script/ScriptStore";
import { useWorkspaceTabsStore } from "../../../stores/WorkspaceTabsStore";
import { trpcClient } from "../../../trpc/client";

jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    timeline: {
      get: { query: jest.fn() },
      create: { mutate: jest.fn() },
      update: { mutate: jest.fn() }
    },
    scripts: { get: { query: jest.fn() } },
    storyboards: { get: { query: jest.fn() } }
  }
}));

const getQuery = trpcClient.timeline.get.query as jest.Mock;
const createMutate = trpcClient.timeline.create.mutate as jest.Mock;
const updateMutate = trpcClient.timeline.update.mutate as jest.Mock;
const scriptQuery = trpcClient.scripts.get.query as jest.Mock;

const renderedShot = (id: string, extra: Partial<Shot> = {}): Shot => ({
  type: "shot",
  id,
  index: 0,
  action: "A lighthouse at dusk",
  status: "rendered",
  clip: { type: "video", asset_id: `clip-${id}`, uri: `asset://${id}` },
  duration_seconds: 30,
  ...extra
});

const seedBoard = (
  boardId: string,
  overrides: Partial<StoryboardBoard> = {}
): void => {
  useStoryboardStore.getState().loadBoard(boardId, {
    screenplay: null,
    shots: [renderedShot("shot-a")],
    title: "My film",
    brief: "",
    style: "",
    entityIds: [],
    aspectRatio: "16:9",
    directorModel: null,
    imageModel: null,
    videoModel: null,
    activeShotId: null,
    timelineId: null,
    ...overrides
  });
};

const take = (): ScriptTake => ({
  id: "take-a",
  assetId: "voice-a",
  durationMs: 2000,
  words: [],
  textSnapshot: "Hello",
  voiceSnapshot: null,
  createdAt: "2026-01-01T00:00:00.000Z"
});

const seedScript = (scriptId: string): void => {
  useScriptStore.getState().loadScript(scriptId, {
    title: "My script",
    cast: [],
    sections: [
      {
        id: "s1",
        lines: [
          { id: "line-a", text: "Hello", takes: [take()], currentTakeId: "take-a" }
        ]
      }
    ],
    timelineId: null,
    storyboardId: null
  });
};

/** A board whose single rendered shot covers the seeded script's only line. */
const seedLinkedPair = (boardId: string, scriptId: string): void => {
  seedScript(scriptId);
  seedBoard(boardId, {
    shots: [renderedShot("shot-a", { script_line_ids: ["line-a"] })],
    screenplay: {
      type: "screenplay",
      id: "sp-1",
      title: "My film",
      shots: [],
      script_id: scriptId,
      narration: "The light had always obeyed her."
    }
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  useStoryboardStore.setState({ boards: {}, serverRevisions: {} });
  useScriptStore.setState({
    scripts: {},
    serverRevisions: {},
    saveStatus: {},
    voicingLineIds: {}
  });
  jest
    .spyOn(useWorkspaceTabsStore.getState(), "openTab")
    .mockImplementation(() => undefined as never);
});

describe("useAssembleTimeline", () => {
  it("creates a sequence, links the board, and opens the tab", async () => {
    seedBoard("board-1");
    createMutate.mockResolvedValue({ id: "tl-new" });
    updateMutate.mockResolvedValue({});

    const { result } = renderHook(() => useAssembleTimeline());
    let out: Awaited<ReturnType<typeof result.current.assemble>>;
    await act(async () => {
      out = await result.current.assemble("board-1");
    });

    expect(out!.sequenceId).toBe("tl-new");
    expect(out!.clipCount).toBe(1);
    expect(out!.reassembled).toBe(false);
    expect(out!.skippedLineIds).toEqual([]);
    expect(
      useStoryboardStore.getState().getBoard("board-1")?.timelineId
    ).toBe("tl-new");
    expect(scriptQuery).not.toHaveBeenCalled();
  });

  it("throws when no shot is rendered", async () => {
    seedBoard("board-2", {
      shots: [
        {
          type: "shot",
          id: "shot-a",
          index: 0,
          action: "A lighthouse at dusk",
          status: "planned"
        }
      ]
    });
    const { result } = renderHook(() => useAssembleTimeline());
    await act(async () => {
      await expect(result.current.assemble("board-2")).rejects.toThrow(
        /No rendered shots/
      );
    });
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("cuts the linked script's takes in with the shots", async () => {
    seedLinkedPair("board-1", "script-1");
    createMutate.mockResolvedValue({ id: "tl-new" });
    updateMutate.mockResolvedValue({});

    const { result } = renderHook(() => useAssembleTimeline());
    await act(async () => {
      await result.current.assemble("board-1");
    });

    const doc = updateMutate.mock.calls[0][0].document;
    expect(doc.tracks.map((t: { name: string }) => t.name)).toEqual([
      "Shots",
      "Shot Audio",
      "Voiceover"
    ]);
    const voice = doc.clips.filter((c: TimelineClip) => c.scriptLineId);
    expect(voice).toHaveLength(1);
    expect(voice[0].scriptId).toBe("script-1");
    expect(voice[0].storyboardShotId).toBe("shot-a");
    // Audio-led: the shot is the length of its line's take, not its 30s target.
    const shotClip = doc.clips.find(
      (c: TimelineClip) => c.mediaType === "video"
    );
    expect(shotClip.durationMs).toBe(2000);
  });

  it("assembles unlinked when the linked script is gone", async () => {
    seedLinkedPair("board-1", "script-1");
    // Nothing in the store, and the server no longer has it.
    useScriptStore.setState({ scripts: {} });
    scriptQuery.mockRejectedValue(new Error("Script not found"));
    createMutate.mockResolvedValue({ id: "tl-new" });
    updateMutate.mockResolvedValue({});

    const { result } = renderHook(() => useAssembleTimeline());
    let out: Awaited<ReturnType<typeof result.current.assemble>>;
    await act(async () => {
      out = await result.current.assemble("board-1");
    });

    expect(out!.sequenceId).toBe("tl-new");
    const doc = updateMutate.mock.calls[0][0].document;
    expect(doc.tracks.map((t: { name: string }) => t.name)).toEqual([
      "Shots",
      "Shot Audio",
      "Narration"
    ]);
    expect(doc.clips.some((c: TimelineClip) => c.scriptLineId)).toBe(false);
  });

  it("re-assembles in place, dropping its own clips but keeping foreign tracks", async () => {
    seedBoard("board-1", { timelineId: "tl-1" });
    const oldShotTrack = makeTrack({ type: "video", name: "Shots", index: 0 });
    const foreignTrack = makeTrack({ type: "audio", name: "Score", index: 1 });
    const oldShotClip: TimelineClip = makeClip({
      trackId: oldShotTrack.id,
      storyboardBoardId: "board-1",
      storyboardShotId: "shot-a",
      currentAssetId: "clip-old"
    });
    const foreignClip: TimelineClip = makeClip({
      trackId: foreignTrack.id,
      mediaType: "audio",
      currentAssetId: "score-1"
    });
    getQuery.mockResolvedValue({
      id: "tl-1",
      updatedAt: "rev-1",
      tracks: [oldShotTrack, foreignTrack],
      clips: [oldShotClip, foreignClip],
      markers: []
    });
    updateMutate.mockResolvedValue({});

    const { result } = renderHook(() => useAssembleTimeline());
    let out: Awaited<ReturnType<typeof result.current.assemble>>;
    await act(async () => {
      out = await result.current.assemble("board-1");
    });

    expect(out!.reassembled).toBe(true);
    expect(out!.sequenceId).toBe("tl-1");
    expect(createMutate).not.toHaveBeenCalled();
    const doc = updateMutate.mock.calls[0][0].document;
    expect(doc.tracks.map((t: { name: string }) => t.name)).toEqual([
      "Shots",
      "Shot Audio",
      "Score"
    ]);
    expect(
      doc.tracks.some((t: { id: string }) => t.id === oldShotTrack.id)
    ).toBe(false);
    expect(
      doc.clips.some((c: TimelineClip) => c.currentAssetId === "clip-old")
    ).toBe(false);
    expect(
      doc.clips.some((c: TimelineClip) => c.currentAssetId === "score-1")
    ).toBe(true);
    expect(
      doc.clips.some((c: TimelineClip) => c.currentAssetId === "clip-shot-a")
    ).toBe(true);
  });

  it("replaces its own draft music clip instead of stacking a second one", async () => {
    seedBoard("board-1", {
      timelineId: "tl-1",
      screenplay: {
        type: "screenplay",
        id: "sp-1",
        title: "My film",
        shots: [],
        music_prompt: "slow maritime score"
      }
    });
    const shotTrack = makeTrack({ type: "video", name: "Shots", index: 0 });
    const musicTrack = makeTrack({ type: "audio", name: "Music", index: 1 });
    getQuery.mockResolvedValue({
      id: "tl-1",
      updatedAt: "rev-1",
      tracks: [shotTrack, musicTrack],
      clips: [
        makeClip({
          trackId: shotTrack.id,
          storyboardBoardId: "board-1",
          storyboardShotId: "shot-a"
        }),
        // Written by the previous assemble, so it carries the board's stamp.
        makeClip({
          trackId: musicTrack.id,
          mediaType: "audio",
          storyboardBoardId: "board-1",
          prompt: "slow maritime score"
        })
      ],
      markers: []
    });
    updateMutate.mockResolvedValue({});

    const { result } = renderHook(() => useAssembleTimeline());
    await act(async () => {
      await result.current.assemble("board-1");
    });

    const doc = updateMutate.mock.calls[0][0].document;
    expect(
      doc.tracks.filter((t: { name: string }) => t.name === "Music")
    ).toHaveLength(1);
    expect(
      doc.clips.filter((c: TimelineClip) => c.prompt === "slow maritime score")
    ).toHaveLength(1);
  });
});
