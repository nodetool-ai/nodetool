/**
 * Undo and redo can change a line's current take. They used to leave the
 * timeline on the take that was undone.
 */
import type { TimelineClip } from "@nodetool-ai/timeline";
import { useScriptStore, type ScriptTake } from "../ScriptStore";
import { undoScript } from "../timelineSync";
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

const take = (id: string, assetId: string, durationMs: number): ScriptTake => ({
  id,
  assetId,
  durationMs,
  words: [],
  textSnapshot: "x",
  voiceSnapshot: null,
  createdAt: "2026-01-01T00:00:00.000Z"
});

const seed = (timelineId: string, storyboardId: string | null): void => {
  useScriptStore.setState({ scripts: {}, history: {} });
  useScriptStore.getState().loadScript("s1", {
    title: "S",
    cast: [],
    sections: [
      {
        id: "sec",
        lines: [
          { id: "l1", text: "x", takes: [take("t1", "a1", 1000)], currentTakeId: "t1" },
          { id: "l2", text: "x", takes: [take("t2", "a2", 1000)], currentTakeId: "t2" }
        ]
      }
    ],
    timelineId,
    storyboardId
  });
};

const voiceClip = (clips: TimelineClip[], lineId: string): TimelineClip =>
  clips.find((c) => c.scriptLineId === lineId) as TimelineClip;

beforeEach(() => {
  jest.clearAllMocks();
  updateMutate.mockResolvedValue({});
});

describe("undoScript", () => {
  it("brings the timeline back to the take the undo restores", async () => {
    seed("tl", null);
    useScriptStore.getState().appendTake("s1", "l1", take("t1b", "a1b", 1000));
    getQuery.mockResolvedValue({
      tracks: [],
      clips: [
        {
          id: "c1",
          trackId: "v",
          scriptId: "s1",
          scriptLineId: "l1",
          currentAssetId: "a1b",
          durationMs: 1000,
          startMs: 0
        }
      ],
      markers: [],
      updatedAt: "r1"
    });

    undoScript("s1");
    const line = useScriptStore.getState().scripts["s1"].sections[0].lines[0];
    expect(line.currentTakeId).toBe("t1");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(updateMutate).toHaveBeenCalledTimes(1);
    const clip = voiceClip(
      updateMutate.mock.calls[0][0].document.clips,
      "l1"
    );
    expect(clip.currentAssetId).toBe("a1");
  });

  it("does nothing to the timeline when no take changed", async () => {
    seed("tl", null);
    useScriptStore.getState().patchLine("s1", "l1", { text: "edited" });
    undoScript("s1");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getQuery).not.toHaveBeenCalled();
  });
});
