import { describe, it, expect } from "@jest/globals";
import type { Shot } from "@nodetool-ai/protocol";

import type { StoryboardBoard } from "../../../stores/storyboard/StoryboardStore";
import { shotTakeChanges, shotTakeMedia } from "../useLinkedShotTakes";

const shot = (id: string, assetId?: string, duration?: number): Shot => ({
  type: "shot",
  id,
  index: 0,
  action: "",
  status: assetId ? "rendered" : "planned",
  clip: assetId
    ? { type: "video", uri: `asset://${assetId}`, asset_id: assetId, duration }
    : null
});

const board = (shots: Shot[]): StoryboardBoard =>
  ({ id: "board", shots }) as unknown as StoryboardBoard;

describe("shotTakeMedia", () => {
  it("reads the asset and its length in milliseconds", () => {
    expect(shotTakeMedia(shot("a", "x", 2.5))).toEqual({
      assetId: "x",
      durationMs: 2500
    });
    expect(shotTakeMedia(shot("a", "x"))).toEqual({ assetId: "x" });
    expect(shotTakeMedia(shot("a"))).toBeNull();
  });
});

describe("shotTakeChanges", () => {
  it("reports a shot whose selected take changed", () => {
    expect(
      shotTakeChanges(
        board([shot("a", "x"), shot("b", "y")]),
        board([shot("a", "x"), shot("b", "z", 3)])
      )
    ).toEqual([{ shotId: "b", take: { assetId: "z", durationMs: 3000 } }]);
  });

  it("reports a shot's first take, as on a derived shot", () => {
    expect(
      shotTakeChanges(board([shot("a")]), board([shot("a", "x")]))
    ).toEqual([{ shotId: "a", take: { assetId: "x" } }]);
  });

  it("ignores a board loading for the first time and new or cleared shots", () => {
    expect(shotTakeChanges(undefined, board([shot("a", "x")]))).toEqual([]);
    expect(
      shotTakeChanges(board([]), board([shot("a", "x")]))
    ).toEqual([]);
    expect(
      shotTakeChanges(board([shot("a", "x")]), board([shot("a")]))
    ).toEqual([]);
  });
});
