// web/src/components/chat/composer/__tests__/imageModelOptions.test.tsx
import type { ImageModel } from "../../../../stores/ApiTypes";
import {
  IMAGE_ASPECT_RATIOS,
  IMAGE_RESOLUTIONS
} from "../../../../stores/MediaGenerationStore";
import {
  buildImageModelOptions,
  imageModelConstraints
} from "../imageModelOptions";

function makeImageModel(overrides: Partial<ImageModel>): ImageModel {
  return {
    type: "image_model",
    id: "test-model",
    name: "Test Model",
    provider: "empty",
    ...overrides
  };
}

describe("buildImageModelOptions", () => {
  it("falls back to the full aspect and resolution sets for a null model", () => {
    const { aspectOptions, resolutionOptions } = buildImageModelOptions(null);
    expect(aspectOptions.map((a) => a.id)).toEqual(
      IMAGE_ASPECT_RATIOS.map((a) => a.id)
    );
    expect(resolutionOptions.map((r) => r.id)).toEqual(IMAGE_RESOLUTIONS);
  });

  it("restricts aspect options to the model's allowed ratios", () => {
    const { aspectOptions } = buildImageModelOptions({
      aspectRatios: ["16:9", "1:1"]
    });
    expect(aspectOptions.map((a) => a.id)).toEqual(["16:9", "1:1"]);
  });

  it("restricts resolution options to the model's allowed resolutions", () => {
    const { resolutionOptions } = buildImageModelOptions({
      resolutions: ["1K", "2K"]
    });
    expect(resolutionOptions.map((r) => r.id)).toEqual(["1K", "2K"]);
  });

  it("parses a custom W:H ratio not in the static list", () => {
    const { aspectOptions } = buildImageModelOptions({
      aspectRatios: ["7:3"]
    });
    expect(aspectOptions.map((a) => a.id)).toContain("7:3");
    expect(aspectOptions.find((a) => a.id === "7:3")).toMatchObject({
      id: "7:3",
      width: 7,
      height: 3
    });
  });
});

describe("imageModelConstraints", () => {
  it("reads snake_case aspect_ratios and resolutions", () => {
    expect(
      imageModelConstraints(
        makeImageModel({
          aspect_ratios: ["16:9", "1:1"],
          resolutions: ["1K", "4K"]
        })
      )
    ).toEqual({
      aspectRatios: ["16:9", "1:1"],
      resolutions: ["1K", "4K"]
    });
  });

  it("returns undefined for missing constraint lists", () => {
    expect(imageModelConstraints(makeImageModel({}))).toEqual({
      aspectRatios: undefined,
      resolutions: undefined
    });
  });

  it("returns undefined for empty constraint lists", () => {
    expect(
      imageModelConstraints(
        makeImageModel({ aspect_ratios: [], resolutions: [] })
      )
    ).toEqual({ aspectRatios: undefined, resolutions: undefined });
  });
});
