import { exampleNeedsLabel, storyboardNeeds } from "../exampleNeeds";

describe("exampleNeedsLabel", () => {
  it("says Runs as is when nothing is needed", () => {
    expect(exampleNeedsLabel({ modelKinds: [], requiredSettings: [] })).toEqual({
      label: "Runs as is",
      runsAsIs: true
    });
  });

  it("names the one kind of model", () => {
    expect(
      exampleNeedsLabel({ modelKinds: ["image_model"], requiredSettings: [] })
        .label
    ).toBe("Needs an image model");
    expect(
      exampleNeedsLabel({ modelKinds: ["language_model", "llama_model"], requiredSettings: [] })
        .label
    ).toBe("Needs a language model");
  });

  it("says Needs models for several kinds and a model for an unknown kind", () => {
    expect(
      exampleNeedsLabel({
        modelKinds: ["image_model", "video_model"],
        requiredSettings: []
      }).label
    ).toBe("Needs models");
    expect(
      exampleNeedsLabel({ modelKinds: ["3d_model"], requiredSettings: [] }).label
    ).toBe("Needs a model");
  });

  it("says Needs an API key when only a key is declared", () => {
    expect(
      exampleNeedsLabel({ modelKinds: [], requiredSettings: ["OPENAI_API_KEY"] })
    ).toEqual({ label: "Needs an API key", runsAsIs: false });
  });
});

describe("storyboardNeeds", () => {
  it("needs a video model while any shot lacks a clip", () => {
    expect(storyboardNeeds({ shotCount: 4, clipCount: 0 }).modelKinds).toEqual([
      "video_model"
    ]);
    expect(storyboardNeeds({ shotCount: 4, clipCount: 4 }).modelKinds).toEqual([]);
  });
});
