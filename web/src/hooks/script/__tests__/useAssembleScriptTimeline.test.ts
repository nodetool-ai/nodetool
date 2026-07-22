import { renderHook } from "@testing-library/react";
import { act } from "react";
import { makeClip, makeTrack } from "@nodetool-ai/timeline";
import type { TimelineClip } from "@nodetool-ai/timeline";
import { useAssembleScriptTimeline } from "../useAssembleScriptTimeline";
import { useScriptStore, type ScriptTake } from "../../../stores/script/ScriptStore";
import { useWorkspaceTabsStore } from "../../../stores/WorkspaceTabsStore";
import { trpcClient } from "../../../trpc/client";

jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    timeline: {
      get: { query: jest.fn() },
      create: { mutate: jest.fn() },
      update: { mutate: jest.fn() }
    }
  }
}));

const getQuery = trpcClient.timeline.get.query as jest.Mock;
const createMutate = trpcClient.timeline.create.mutate as jest.Mock;
const updateMutate = trpcClient.timeline.update.mutate as jest.Mock;

const take = (assetId: string): ScriptTake => ({
  id: `${assetId}-take`,
  assetId,
  durationMs: 1000,
  words: [],
  textSnapshot: "hi",
  voiceSnapshot: null,
  createdAt: "2026-01-01T00:00:00.000Z"
});

const seedVoicedScript = (id: string, timelineId: string | null): void => {
  const t = take("asset-a");
  useScriptStore.getState().loadScript(id, {
    title: "My script",
    cast: [],
    sections: [
      { id: "s1", lines: [{ id: "line-a", text: "hi", takes: [t], currentTakeId: t.id }] }
    ],
    timelineId
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  useScriptStore.setState({
    scripts: {},
    serverRevisions: {},
    saveStatus: {},
    voicingLineIds: {}
  });
  jest.spyOn(useWorkspaceTabsStore.getState(), "openTab").mockImplementation(
    () => undefined as never
  );
});

describe("useAssembleScriptTimeline", () => {
  it("creates a sequence, links the script, and opens the tab", async () => {
    seedVoicedScript("script-1", null);
    createMutate.mockResolvedValue({ id: "tl-new" });
    updateMutate.mockResolvedValue({});

    const { result } = renderHook(() => useAssembleScriptTimeline());
    let out: Awaited<ReturnType<typeof result.current.assemble>>;
    await act(async () => {
      out = await result.current.assemble("script-1");
    });

    expect(out!.sequenceId).toBe("tl-new");
    expect(out!.clipCount).toBe(1);
    expect(out!.reassembled).toBe(false);
    expect(useScriptStore.getState().getScript("script-1")?.timelineId).toBe(
      "tl-new"
    );
    expect(getQuery).not.toHaveBeenCalled();
  });

  it("throws when no line is voiced", async () => {
    useScriptStore.getState().loadScript("script-2", {
      title: "Empty",
      cast: [],
      sections: [{ id: "s1", lines: [{ id: "l", text: "hi", takes: [] }] }],
      timelineId: null
    });
    const { result } = renderHook(() => useAssembleScriptTimeline());
    await act(async () => {
      await expect(result.current.assemble("script-2")).rejects.toThrow(
        /No voiced lines/
      );
    });
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("re-assembles in place, dropping the old voiceover track but keeping foreign tracks", async () => {
    seedVoicedScript("script-1", "tl-1");
    const oldVoTrack = makeTrack({ type: "audio", name: "Voiceover", index: 0 });
    const musicTrack = makeTrack({ type: "audio", name: "Music", index: 1 });
    const oldVoClip: TimelineClip = makeClip({
      trackId: oldVoTrack.id,
      scriptId: "script-1",
      scriptLineId: "line-a",
      currentAssetId: "asset-old"
    });
    const musicClip: TimelineClip = makeClip({
      trackId: musicTrack.id,
      mediaType: "audio",
      currentAssetId: "music-1"
    });
    getQuery.mockResolvedValue({
      id: "tl-1",
      updatedAt: "rev-1",
      tracks: [oldVoTrack, musicTrack],
      clips: [oldVoClip, musicClip],
      markers: []
    });
    updateMutate.mockResolvedValue({});

    const { result } = renderHook(() => useAssembleScriptTimeline());
    let out: Awaited<ReturnType<typeof result.current.assemble>>;
    await act(async () => {
      out = await result.current.assemble("script-1");
    });

    expect(out!.reassembled).toBe(true);
    expect(out!.sequenceId).toBe("tl-1");
    expect(createMutate).not.toHaveBeenCalled();
    const doc = updateMutate.mock.calls[0][0].document;
    // Old voiceover track/clip dropped, music track/clip kept, new VO added.
    expect(doc.tracks.map((t: { name: string }) => t.name)).toEqual([
      "Voiceover",
      "Music"
    ]);
    expect(doc.tracks.some((t: { id: string }) => t.id === oldVoTrack.id)).toBe(
      false
    );
    expect(doc.clips.some((c: TimelineClip) => c.currentAssetId === "music-1")).toBe(
      true
    );
    expect(doc.clips.some((c: TimelineClip) => c.currentAssetId === "asset-old")).toBe(
      false
    );
    expect(doc.clips.some((c: TimelineClip) => c.currentAssetId === "asset-a")).toBe(
      true
    );
  });
});
