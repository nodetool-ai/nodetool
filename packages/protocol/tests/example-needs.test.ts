import { describe, expect, it } from "vitest";
import { exampleRunsAsIs, scanExampleNeeds } from "../src/example-needs.js";

describe("scanExampleNeeds", () => {
  it("finds unselected and selected model fields by type", () => {
    const graph = {
      nodes: [
        {
          type: "nodetool.image.TextToImage",
          data: { model: { type: "image_model", provider: "empty", id: "" } }
        },
        {
          type: "nodetool.agents.Agent",
          data: { model: { type: "language_model", provider: "openai", id: "gpt" } }
        }
      ]
    };
    const needs = scanExampleNeeds(graph);
    expect(needs).toEqual({
      modelKinds: ["image_model", "language_model"],
      requiredSettings: []
    });
    expect(exampleRunsAsIs(needs)).toBe(false);
  });

  it("reads the keys a node declares through the lookup", () => {
    const graph = {
      nodes: [
        { type: "openai.audio.Transcribe", data: { model: "whisper-1" } },
        { type: "nodetool.image.Blur", data: { size: 12 } }
      ]
    };
    const needs = scanExampleNeeds(graph, (type) =>
      type.startsWith("openai.") ? ["OPENAI_API_KEY"] : []
    );
    expect(needs).toEqual({
      modelKinds: [],
      requiredSettings: ["OPENAI_API_KEY"]
    });
  });

  it("runs as is when nothing asks for a model or a key", () => {
    const graph = {
      nodes: [
        {
          type: "nodetool.input.ImageInput",
          data: { value: { type: "image", uri: "package://x/coffee.jpg" } }
        },
        { type: "nodetool.image.Blur", data: { size: 12 } }
      ]
    };
    expect(exampleRunsAsIs(scanExampleNeeds(graph, () => []))).toBe(true);
  });

  it("ignores a type string that only ends in _model without a model shape", () => {
    expect(scanExampleNeeds({ type: "image_model" }).modelKinds).toEqual([]);
  });
});
