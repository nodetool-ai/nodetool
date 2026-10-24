/**
 * Two ways a take reaches an assembled timeline that used to miss:
 *
 * - In a cut assembled with the storyboard, each line sits inside the shot
 *   that covers it and each shot runs as long as its lines. A re-voice used to
 *   move only the later voice clips, so they started after their shots ended.
 * - Undo and redo can change a line's current take. They used to leave the
 *   timeline on the take that was undone.
 */
import { buildLinkedTimeline } from "@nodetool-ai/timeline";
import type { TimelineClip } from "@nodetool-ai/timeline";
import type { Shot } from "@nodetool-ai/protocol";
import { useScriptStore, type ScriptTake } from "../ScriptStore";
import { syncLineClipToTimeline, undoScript } from "../timelineSync";
import { trpcClient } from "../../../trpc/client";
import { loadLinkedBoard } from "../../../lib/linkedAssembly";

jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    timeline: {
      get: { query: jest.fn() },
      update: { mutate: jest.fn() }
    }
  }
}));

jest.mock("../../../lib/linkedAssembly", () => ({
  loadLinkedBoard: jest.fn()
}));

const getQuery = trpcClient.timeline.get.query as jest.Mock;
const updateMutate = trpcClient.timeline.update.mutate as jest.Mock;
const loadBoard = loadLinkedBoard as jest.Mock;

const take = (id: string, assetId: string, durationMs: number): ScriptTake => ({
  id,
  assetId,
  durationMs,
  words: [],
  textSnapshot: "x",
  voiceSnapshot: null,
  createdAt: "2026-01-01T00:00:00.000Z"
});

const shot = (id: string, index: number, lineId: string): Shot =>
  ({
    id,
    index,
    script_line_ids: [lineId],
    duration_seconds: 1,
    clip: { type: "video", asset_id: `clip-${id}`, duration: 5 }
  }) as unknown as Shot;

const SHOTS = [shot("sh1", 0, "l1"), shot("sh2", 1, "l2")];

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
const shotClip = (clips: TimelineClip[], shotId: string): TimelineClip =>
  clips.find(
    (c) => c.storyboardShotId === shotId && c.mediaType === "video"
  ) as TimelineClip;

beforeEach(() => {
  jest.clearAllMocks();
  updateMutate.mockResolvedValue({});
});

describe("syncLineClipToTimeline in a storyboard-linked cut", () => {
  it("lays the cut out again so every line stays inside its shot", async () => {
    seed("tl", "b1");
    const script = useScriptStore.getState().scripts["s1"];
    const cut = buildLinkedTimeline({
      boardId: "b1",
      shots: SHOTS,
      script: { scriptId: "s1", cast: [], sections: script.sections }
    });
    getQuery.mockResolvedValue({
      tracks: cut.tracks,
      clips: cut.clips,
      markers: [],
      updatedAt: "r1"
    });
    loadBoard.mockResolvedValue({ boardId: "b1", shots: SHOTS });

    // Line 1 is re-voiced into a 3 s take, which voiceLine appends first.
    const longer = take("t1b", "a1b", 3000);
    useScriptStore.getState().appendTake("s1", "l1", longer);
    expect(await syncLineClipToTimeline("s1", "l1", longer)).toBe(true);

    const next = updateMutate.mock.calls[0][0].document.clips as TimelineClip[];
    const sh1 = shotClip(next, "sh1");
    const sh2 = shotClip(next, "sh2");
    expect(voiceClip(next, "l1").currentAssetId).toBe("a1b");
    expect(sh1.durationMs).toBe(3000);
    expect(sh2.startMs).toBe(3000);
    expect(voiceClip(next, "l2").startMs).toBe(sh2.startMs);
    expect(updateMutate.mock.calls[0][0].baseUpdatedAt).toBe("r1");
  });
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
