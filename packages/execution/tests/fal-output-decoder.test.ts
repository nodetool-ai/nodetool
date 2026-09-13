import { describe, expect, it } from "vitest";
import {
  decodeFalOutputs,
  deterministicFalStorageKey
} from "../src/fal-output-decoder.js";

describe("decodeFalOutputs", () => {
  it.each(["image", "video", "model_glb", "model_mesh"])(
    "decodes singular %s media envelopes",
    (key) => {
      const [output] = decodeFalOutputs({
        [key]: { url: `https://fal.media/${key}` }
      });

      expect(output).toMatchObject({
        outputKey: key,
        outputType: "media",
        providerRef: `https://fal.media/${key}`
      });
    }
  );

  it("retains structured fields beside every media output", () => {
    const outputs = decodeFalOutputs({
      images: [
        { url: "https://fal.media/one.png" },
        { url: "https://fal.media/two.png" }
      ],
      seed: 42
    });

    expect(outputs).toHaveLength(3);
    expect(outputs[2]).toMatchObject({
      outputKey: "structured",
      outputType: "structured",
      rawResult: { seed: 42 }
    });
  });

  it("builds stable storage keys for one output identity", () => {
    expect(deterministicFalStorageKey("g", "a", "images", 1, "PNG")).toBe(
      deterministicFalStorageKey("g", "a", "images", 1, "png")
    );
    expect(deterministicFalStorageKey("g", "a", "images", 0, "png")).not.toBe(
      deterministicFalStorageKey("g", "a", "images", 1, "png")
    );
  });
});
