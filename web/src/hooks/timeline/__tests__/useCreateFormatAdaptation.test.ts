/** F35/F36: partial failures leave no orphans; camera and materializations carry over. */
const create = jest.fn();
const update = jest.fn();
const del = jest.fn();

jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    timeline: {
      create: { mutate: (a: unknown) => create(a) },
      update: { mutate: (a: unknown) => update(a) },
      delete: { mutate: (a: unknown) => del(a) }
    }
  }
}));
jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  useWorkspaceTabsStore: { getState: () => ({ openTab: jest.fn() }) }
}));
jest.mock("../../../stores/storyboard/timelineSync", () => ({
  invalidateTimelineGetQuery: jest.fn()
}));
jest.mock("../../../stores/timeline/TimelineStore", () => ({
  useTimelineStoreApi: jest.fn()
}));

import { makeClip, makeTrack } from "@nodetool-ai/timeline";
import type { TimelineSequence } from "@nodetool-ai/timeline";
import { persistFormatAdaptationsDetailed } from "../useCreateFormatAdaptation";

const track = makeTrack({ id: "t1", name: "V", index: 0 });
const clip = makeClip({
  id: "c1",
  trackId: "t1",
  name: "Shot",
  mediaType: "video",
  sourceType: "imported",
  currentAssetId: "a1",
  startMs: 0,
  durationMs: 1000
});
const source = {
  id: "s1",
  projectId: "p1",
  name: "Cut",
  fps: 30,
  width: 1920,
  height: 1080,
  durationMs: 1000,
  tracks: [track],
  clips: [clip],
  markers: [],
  createdAt: "",
  updatedAt: ""
} as TimelineSequence;
const camera2d = { keyframes: [] } as unknown as TimelineSequence["camera2d"];
const storyboardMaterializations = [
  { id: "m1" }
] as unknown as TimelineSequence["storyboardMaterializations"];
const state = {
  fps: 30,
  width: 1920,
  height: 1080,
  durationMs: 1000,
  tracks: [track],
  trackFolders: [],
  clips: [clip],
  markers: [],
  mediaTracks: [],
  transcript: undefined,
  scriptEnabled: undefined,
  tempo: undefined,
  setup: null,
  camera2d,
  storyboardMaterializations
} as never;
const options = {
  aspectRatios: ["9:16", "1:1"],
  strategy: "center" as const,
  safeMargin: 0.1
};

beforeEach(() => {
  jest.clearAllMocks();
  create.mockImplementation(async (a: { id: string }) => ({
    id: a.id,
    projectId: "p1"
  }));
  update.mockResolvedValue({});
  del.mockResolvedValue({});
});

describe("persistFormatAdaptationsDetailed", () => {
  it("carries camera2d and storyboardMaterializations (F36)", async () => {
    await persistFormatAdaptationsDetailed(source, state, options);
    const doc = update.mock.calls[0][0].document;
    expect(doc.camera2d).toBe(camera2d);
    expect(doc.storyboardMaterializations).toBe(storyboardMaterializations);
    expect(doc.templateId).toBe("s1");
  });

  it("deletes a sequence whose document update failed and keeps going (F35)", async () => {
    update.mockRejectedValueOnce(new Error("boom"));
    const out = await persistFormatAdaptationsDetailed(source, state, options);
    expect(del).toHaveBeenCalledTimes(1);
    expect(del.mock.calls[0][0].id).toBe(create.mock.calls[0][0].id);
    expect(out.failures).toEqual([{ aspectRatio: "9:16", message: "boom" }]);
    expect(out.createdAspectRatios).toEqual(["1:1"]);
    expect(out.createdIds).toHaveLength(1);
  });
});
