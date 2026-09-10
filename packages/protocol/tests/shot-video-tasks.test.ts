import { describe, expect, it } from "vitest";
import { requiredVideoTasksForShots } from "../src/creative.js";

describe("requiredVideoTasksForShots", () => {
  it("requires all tasks on a board with keyframe, direct, and reference shots", () => {
    expect(requiredVideoTasksForShots([
      { render_mode: "keyframe" },
      { render_mode: "direct" },
      { render_mode: "reference" },
      { render_mode: "direct" }
    ])).toEqual(["image_to_video", "text_to_video", "reference_to_video"]);
  });

  it("treats legacy shots as keyframes", () => {
    expect(requiredVideoTasksForShots([{}, { render_mode: "reference" }]))
      .toEqual(["image_to_video", "reference_to_video"]);
  });

  it("does not require a task for an empty board", () => {
    expect(requiredVideoTasksForShots([])).toEqual([]);
  });
});
