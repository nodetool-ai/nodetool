import { makeClip, makeTrack } from "@nodetool-ai/timeline";
import type { TimelineClip } from "@nodetool-ai/timeline";
import { useScriptStore, type ScriptTake } from "../ScriptStore";
import { syncLineClipToTimeline } from "../timelineSync";
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

const track = makeTrack({ type: "audio", name: "Voiceover", index: 0 });

const linkedClip = (overrides: Partial<TimelineClip> = {}): TimelineClip =>
  makeClip({
    trackId: track.id,
    mediaType: "audio",
    sourceType: "imported",
    status: "generated",
    scriptId: "script-1",
    scriptLineId: "line-1",
    currentAssetId: "old-asset",
    durationMs: 1000,
    ...overrides
  });

const take = (overrides: Partial<ScriptTake> = {}): ScriptTake => ({
  id: "take-2",
  assetId: "new-asset",
  durationMs: 2500,
  words: [{ word: "hi", startMs: 0, endMs: 300 }],
  textSnapshot: "hi",
  voiceSnapshot: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...overrides
});

beforeEach(() => {
  jest.clearAllMocks();
  useScriptStore.setState({ scripts: {}, serverRevisions: {}, voicingLineIds: {} });
});

const seedScript = (timelineId: string | null): void => {
  useScriptStore.getState().loadScript("script-1", {
    title: "S",
    cast: [],
    sections: [],
    timelineId
  });
};

describe("syncLineClipToTimeline", () => {
  it("no-ops when the script has no linked timeline", async () => {
    seedScript(null);
    const result = await syncLineClipToTimeline("script-1", "line-1", take());
    expect(result).toBe(false);
    expect(getQuery).not.toHaveBeenCalled();
  });

  it("patches the linked clip's asset, duration, and caption via CAS update", async () => {
    seedScript("tl-1");
    getQuery.mockResolvedValue({
      id: "tl-1",
      updatedAt: "rev-1",
      tracks: [track],
      clips: [linkedClip(), linkedClip({ id: "other", scriptLineId: "line-2" })],
      markers: []
    });
    updateMutate.mockResolvedValue({});

    const result = await syncLineClipToTimeline("script-1", "line-1", take());

    expect(result).toBe(true);
    expect(updateMutate).toHaveBeenCalledTimes(1);
    const arg = updateMutate.mock.calls[0][0];
    expect(arg.id).toBe("tl-1");
    expect(arg.baseUpdatedAt).toBe("rev-1");
    const patched = arg.document.clips.find(
      (c: TimelineClip) => c.scriptLineId === "line-1"
    );
    expect(patched.currentAssetId).toBe("new-asset");
    expect(patched.durationMs).toBe(2500);
    expect(patched.caption.words).toEqual([{ word: "hi", startMs: 0, endMs: 300 }]);
    // Unrelated clip untouched.
    const untouched = arg.document.clips.find(
      (c: TimelineClip) => c.scriptLineId === "line-2"
    );
    expect(untouched.currentAssetId).toBe("old-asset");
  });

  it("skips the update when the linked clip already has the take", async () => {
    seedScript("tl-1");
    getQuery.mockResolvedValue({
      id: "tl-1",
      updatedAt: "rev-1",
      tracks: [track],
      clips: [linkedClip({ currentAssetId: "new-asset", durationMs: 2500 })],
      markers: []
    });

    const result = await syncLineClipToTimeline("script-1", "line-1", take());

    expect(result).toBe(false);
    expect(updateMutate).not.toHaveBeenCalled();
  });

  it("swallows errors and returns false", async () => {
    seedScript("tl-1");
    getQuery.mockRejectedValue(new Error("boom"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const result = await syncLineClipToTimeline("script-1", "line-1", take());
    expect(result).toBe(false);
    warn.mockRestore();
  });
});
