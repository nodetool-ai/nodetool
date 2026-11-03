import { useStoryboardStore, type StoryboardBoard } from "../../../stores/storyboard/StoryboardStore";
import { applyTransformResultToShot } from "../applyTransformResult";

const seed = (): string => {
  const board: Omit<StoryboardBoard, "id" | "updatedAt"> = {
    screenplay: null,
    shots: [],
    title: "B",
    brief: "",
    style: "",
    entityIds: [],
    aspectRatio: "16:9",
    setupStage: "done",
    genre: "",
    directorModel: null,
    imageModel: null,
    videoModel: null,
    activeShotId: null,
    timelineId: null
  };
  useStoryboardStore.getState().loadBoard("board-1", board);
  const shotId = useStoryboardStore.getState().addShot("board-1");
  if (!shotId) {
    throw new Error("addShot returned null");
  }
  return shotId;
};

const shot = (shotId: string) =>
  useStoryboardStore.getState().boards["board-1"].shots.find((s) => s.id === shotId)!;

beforeEach(() => {
  useStoryboardStore.setState({ boards: {}, serverRevisions: {}, history: {} });
});

describe("applyTransformResultToShot", () => {
  it("sets the first clip on a shot that has none", () => {
    const shotId = seed();
    expect(applyTransformResultToShot("board-1", shotId, { assetId: "a1", kind: "video" })).toBe(
      "selected"
    );
    expect(shot(shotId).clip?.asset_id).toBe("a1");
  });

  it("adds a clip as a candidate take and keeps the selected clip", () => {
    const shotId = seed();
    applyTransformResultToShot("board-1", shotId, { assetId: "a1", kind: "video" });
    expect(applyTransformResultToShot("board-1", shotId, { assetId: "a2", kind: "video" })).toBe(
      "candidate"
    );
    const s = shot(shotId);
    expect(s.clip?.asset_id).toBe("a1");
    expect(s.clip_versions?.map((v) => v.asset_id)).toEqual(["a1", "a2"]);
  });

  it("adds a still as a candidate and keeps the selected still", () => {
    const shotId = seed();
    applyTransformResultToShot("board-1", shotId, { assetId: "k1", kind: "image" });
    expect(applyTransformResultToShot("board-1", shotId, { assetId: "k2", kind: "image" })).toBe(
      "candidate"
    );
    const s = shot(shotId);
    expect(s.keyframe?.asset_id).toBe("k1");
    expect(s.keyframe_versions?.map((v) => v.asset_id)).toEqual(["k1", "k2"]);
  });

  it("ignores an unknown shot", () => {
    seed();
    expect(applyTransformResultToShot("board-1", "nope", { assetId: "a", kind: "video" })).toBe(
      "ignored"
    );
  });
});
