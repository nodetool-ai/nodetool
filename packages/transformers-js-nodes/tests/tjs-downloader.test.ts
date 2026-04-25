import { describe, expect, it } from "vitest";
import { tjsTypeToPipelineTask } from "../src/tjs-downloader.js";
import { TJS_MODEL_TYPES } from "../src/recommended-models.js";

describe("tjsTypeToPipelineTask", () => {
  it("strips the `tjs.` prefix and converts underscores to dashes", () => {
    expect(tjsTypeToPipelineTask("tjs.text_classification")).toBe(
      "text-classification"
    );
    expect(tjsTypeToPipelineTask("tjs.zero_shot_image_classification")).toBe(
      "zero-shot-image-classification"
    );
    expect(tjsTypeToPipelineTask("tjs.summarization")).toBe("summarization");
  });

  it("returns null for inputs without the `tjs.` prefix", () => {
    expect(tjsTypeToPipelineTask("text-classification")).toBeNull();
    expect(tjsTypeToPipelineTask("hf.text_generation")).toBeNull();
    expect(tjsTypeToPipelineTask("")).toBeNull();
  });

  it("returns null for the bare prefix with no task", () => {
    expect(tjsTypeToPipelineTask("tjs.")).toBeNull();
  });

  it("produces a valid task for every registered tjs.* type", () => {
    for (const type of TJS_MODEL_TYPES) {
      const task = tjsTypeToPipelineTask(type);
      expect(task, `${type} → null`).toBeTruthy();
      expect(task!).toMatch(/^[a-z]+(?:-[a-z]+)*$/);
    }
  });
});
