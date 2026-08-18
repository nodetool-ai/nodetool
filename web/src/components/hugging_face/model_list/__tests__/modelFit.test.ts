import { UnifiedModel } from "../../../../stores/ApiTypes";
import {
  classifyModelFit,
  compareModelsByFit,
  estimateRequiredGb,
  goalsForModel,
  MODEL_GOALS
} from "../modelFit";

const GB = 1024 ** 3;

const model = (overrides: Partial<UnifiedModel>): UnifiedModel =>
  ({
    id: "m",
    name: "m",
    type: "language_model",
    repo_id: null,
    path: null,
    ...overrides
  }) as UnifiedModel;

describe("estimateRequiredGb", () => {
  it("converts size_on_disk to GB", () => {
    expect(estimateRequiredGb(model({ size_on_disk: 8 * GB }))).toBe(8);
  });

  it("returns null when the size is missing or zero", () => {
    expect(estimateRequiredGb(model({}))).toBeNull();
    expect(estimateRequiredGb(model({ size_on_disk: 0 }))).toBeNull();
  });
});

describe("classifyModelFit", () => {
  it("grades a sized model against the budget with headroom", () => {
    const m = model({ size_on_disk: 8 * GB });
    expect(classifyModelFit(m, 16)).toBe("fits");
    expect(classifyModelFit(m, 8)).toBe("tight");
    expect(classifyModelFit(m, 4)).toBe("over");
  });

  it("is unknown without a size or without a budget", () => {
    expect(classifyModelFit(model({}), 16)).toBe("unknown");
    expect(classifyModelFit(model({ size_on_disk: 8 * GB }), null)).toBe(
      "unknown"
    );
  });
});

describe("compareModelsByFit", () => {
  it("orders fits before tight before unknown before over, largest fitting first", () => {
    const budget = 16;
    const fitsSmall = model({ id: "fits-small", size_on_disk: 4 * GB });
    const fitsBig = model({ id: "fits-big", size_on_disk: 12 * GB });
    const tight = model({ id: "tight", size_on_disk: 15 * GB });
    const unknown = model({ id: "unknown" });
    const overClose = model({ id: "over-close", size_on_disk: 20 * GB });
    const overFar = model({ id: "over-far", size_on_disk: 80 * GB });

    const sorted = [overFar, unknown, fitsSmall, tight, overClose, fitsBig].sort(
      (a, b) => compareModelsByFit(a, b, budget)
    );
    expect(sorted.map((m) => m.id)).toEqual([
      "fits-big",
      "fits-small",
      "tight",
      "unknown",
      "over-close",
      "over-far"
    ]);
  });
});

describe("goalsForModel", () => {
  it("maps HF types and pipeline tags to goals", () => {
    expect(
      goalsForModel(model({ type: "hf.text_to_image" }))
    ).toEqual(new Set(["image-gen"]));
    expect(
      goalsForModel(model({ type: "hf.automatic_speech_recognition" }))
    ).toEqual(new Set(["transcribe"]));
    expect(
      goalsForModel(
        model({ type: "hf.text_generation", pipeline_tag: "text-generation" })
      )
    ).toEqual(new Set(["chat"]));
    expect(
      goalsForModel(model({ type: "tjs.feature_extraction" }))
    ).toEqual(new Set(["embedding"]));
    expect(
      goalsForModel(model({ type: "hf.image_text_to_text" }))
    ).toEqual(new Set(["vision"]));
  });

  it("splits llama_model into chat vs embedding by name", () => {
    expect(
      goalsForModel(model({ type: "llama_model", name: "qwen3.5:9b" }))
    ).toEqual(new Set(["chat"]));
    expect(
      goalsForModel(model({ type: "llama_model", name: "nomic-embed-text" }))
    ).toEqual(new Set(["embedding"]));
    expect(
      goalsForModel(model({ type: "llama_model", name: "bge-m3" }))
    ).toEqual(new Set(["embedding"]));
  });

  it("returns no goals for a type nothing covers", () => {
    expect(goalsForModel(model({ type: "hf.reinforcement_learning" })).size).toBe(0);
  });

  it("every goal id is unique", () => {
    const ids = MODEL_GOALS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
