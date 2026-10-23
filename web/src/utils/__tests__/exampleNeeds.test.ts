import {
  exampleNeedsLabel,
  fewestNeedsFirst,
  runsAsIsFirst,
  storyboardNeeds
} from "../exampleNeeds";

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

describe("runsAsIsFirst", () => {
  const ready = { modelKinds: [], requiredSettings: [] };
  const model = { modelKinds: ["image_model"], requiredSettings: [] };
  const key = { modelKinds: [], requiredSettings: ["FAL_API_KEY"] };

  it("moves ready items ahead and keeps each group's order", () => {
    const items = [
      { id: "a", needs: model },
      { id: "b", needs: ready },
      { id: "c", needs: key },
      { id: "d", needs: ready }
    ];
    expect(runsAsIsFirst(items, (item) => item.needs).map((i) => i.id)).toEqual(
      ["b", "d", "a", "c"]
    );
  });

  it("keeps items with unknown needs after the ready ones", () => {
    const items = [
      { id: "a", needs: null },
      { id: "b", needs: ready }
    ];
    expect(runsAsIsFirst(items, (item) => item.needs).map((i) => i.id)).toEqual(
      ["b", "a"]
    );
  });
});

describe("fewestNeedsFirst", () => {
  const ready = { modelKinds: [], requiredSettings: [] };
  const one = { modelKinds: ["language_model"], requiredSettings: [] };
  const two = {
    modelKinds: ["image_model", "language_model"],
    requiredSettings: []
  };

  it("orders by how much setup an item needs, keeping ties in order", () => {
    const items = [
      { id: "ad-a", needs: two },
      { id: "ad-b", needs: two },
      { id: "arena", needs: one },
      { id: "unknown", needs: null },
      { id: "vary", needs: one },
      { id: "ready", needs: ready }
    ];
    expect(
      fewestNeedsFirst(items, (item) => item.needs).map((i) => i.id)
    ).toEqual(["ready", "arena", "vary", "ad-a", "ad-b", "unknown"]);
  });
});
