import { IMAGE_USE_CASES } from "../useCases";

import {
  SIZE_PRESETS,
  sizePresetFor,
  sizePresetsForAspectRatios
} from "../sizes";

describe("sizePresetsForAspectRatios", () => {
  it("offers only sizes supported by the selected model", () => {
    expect(
      sizePresetsForAspectRatios(["1:1", "3:2"]).map(
        (preset) => preset.aspectRatio
      )
    ).toEqual(["1:1", "3:2"]);
  });

  it("keeps the guided defaults when the model declares no constraints", () => {
    expect(sizePresetsForAspectRatios(undefined)).toEqual(SIZE_PRESETS);
    expect(sizePresetsForAspectRatios(null)).toEqual(SIZE_PRESETS);
    expect(sizePresetsForAspectRatios([])).toEqual(SIZE_PRESETS);
  });
});

describe("use case sizes", () => {
  it("select the size tile for their own aspect ratio", () => {
    for (const useCase of IMAGE_USE_CASES) {
      expect(
        sizePresetFor(useCase.defaultSize.width, useCase.defaultSize.height)
          ?.aspectRatio
      ).toBe(useCase.defaultAspectRatio);
    }
  });
});
