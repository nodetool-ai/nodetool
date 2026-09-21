import { SIZE_PRESETS, sizePresetsForAspectRatios } from "../sizes";

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
