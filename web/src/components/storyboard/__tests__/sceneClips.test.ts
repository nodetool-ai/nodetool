import type { SceneClipDirection, Shot } from "@nodetool-ai/protocol";
import {
  newSceneClipShotIds,
  sceneClipParts,
  sceneClipRangeLabel,
  sceneClipStatus
} from "../sceneClips";
import { upsertSceneClip } from "../../../stores/storyboard/StoryboardStore";

const shot = (id: string, index: number, extra: Partial<Shot> = {}): Shot => ({
  type: "shot",
  id,
  index,
  action: "",
  duration_seconds: 2,
  status: "planned",
  ...extra
});

const shots = ["a", "b", "c", "d", "e", "f", "g"].map((id, i) => shot(id, i));
const clip = (id: string, shotIds: string[]): SceneClipDirection => ({
  id,
  prompt: "",
  shot_ids: shotIds
});

describe("sceneClipStatus", () => {
  it("reads rendered only when the first shot's clip covers the rest", () => {
    const run = clip("x", ["a", "b"]);
    expect(sceneClipStatus(shots, run)).toBe("planned");
    const rendered = [
      shot("a", 0, { clip: { type: "video", asset_id: "take" } }),
      shot("b", 1, { covered_by: { shot_id: "a" } })
    ];
    expect(sceneClipStatus(rendered, run)).toBe("rendered");
    expect(
      sceneClipStatus(
        [shot("a", 0, { status: "clip_generating" }), shot("b", 1)],
        run
      )
    ).toBe("rendering");
    expect(sceneClipStatus(shots, clip("x", ["a", "c"]))).toBe("broken");
  });
});

describe("sceneClipParts", () => {
  it("gives each shot of a run its position and window", () => {
    const parts = sceneClipParts(shots, [clip("x", ["b", "c", "d"])]);
    expect(parts.get("c")).toEqual({
      clipId: "x",
      position: 2,
      count: 3,
      window: "2-4s"
    });
    expect(parts.has("a")).toBe(false);
  });
});

describe("newSceneClipShotIds", () => {
  it("starts at the first free shots, five at most", () => {
    expect(newSceneClipShotIds(shots, [])).toEqual(["a", "b", "c", "d", "e"]);
    expect(newSceneClipShotIds(shots, [clip("x", ["a", "b", "c"])])).toEqual([
      "d",
      "e",
      "f",
      "g"
    ]);
    expect(newSceneClipShotIds(shots.slice(0, 1), [])).toEqual([]);
  });
});

describe("sceneClipRangeLabel", () => {
  it("numbers the shots within the scene", () => {
    expect(sceneClipRangeLabel(shots, clip("x", ["c", "d", "e"]))).toBe(
      "Shots 3–5"
    );
  });
});

describe("upsertSceneClip", () => {
  it("replaces by id and takes overlapping shots from other clips", () => {
    const first = clip("one", ["a", "b", "c"]);
    const second = clip("two", ["d", "e"]);
    expect(
      upsertSceneClip([first, second], { ...first, prompt: "again" })
    ).toEqual([{ ...first, prompt: "again" }, second]);
    // "three" takes c and d: "one" keeps a-b, "two" drops below two shots.
    expect(upsertSceneClip([first, second], clip("three", ["c", "d"]))).toEqual(
      [clip("one", ["a", "b"]), clip("three", ["c", "d"])]
    );
  });
});
