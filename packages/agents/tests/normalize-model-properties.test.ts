import { describe, it, expect } from "vitest";
import { normalizeModelProperties } from "../src/normalize-model-properties.js";

const registry = (modelType: string, propName = "model") => ({
  getMetadata: () =>
    ({
      properties: [
        { name: propName, type: { type: modelType } },
        { name: "prompt", type: { type: "str" } }
      ]
    }) as any
});

describe("normalizeModelProperties", () => {
  it("completes a bare {provider, id} into the declared model type", () => {
    const out = normalizeModelProperties(
      "nodetool.agents.Agent",
      { model: { provider: "openai", id: "gpt-5-mini" }, prompt: "hi" },
      registry("language_model")
    );

    expect(out!.model).toEqual({
      type: "language_model",
      provider: "openai",
      id: "gpt-5-mini",
      name: "gpt-5-mini",
      path: null,
      supported_tasks: []
    });
    expect(out!.prompt).toBe("hi");
  });

  // A TextToImage node's `model` is an image_model — assuming language_model
  // here would write the wrong discriminator.
  it("uses the node's own declared model type", () => {
    const out = normalizeModelProperties(
      "nodetool.image.TextToImage",
      { model: { provider: "fal_ai", id: "fal-ai/flux/schnell" } },
      registry("image_model")
    );

    expect((out!.model as any).type).toBe("image_model");
  });

  it("keeps a name the planner did supply", () => {
    const out = normalizeModelProperties(
      "nodetool.agents.Agent",
      { model: { provider: "openai", id: "gpt-5-mini", name: "GPT-5 Mini" } },
      registry("language_model")
    );

    expect((out!.model as any).name).toBe("GPT-5 Mini");
  });

  it("leaves an already-complete model untouched", () => {
    const model = {
      type: "language_model",
      provider: "openai",
      id: "gpt-5-mini",
      name: "GPT-5 Mini"
    };
    const props = { model };
    const out = normalizeModelProperties(
      "nodetool.agents.Agent",
      props,
      registry("language_model")
    );

    expect(out).toBe(props);
    expect(out!.model).toBe(model);
  });

  it("ignores non-model properties that happen to look like refs", () => {
    const props = { config: { provider: "openai", id: "x" } };
    const out = normalizeModelProperties(
      "nodetool.agents.Agent",
      props,
      registry("language_model")
    );

    expect(out).toBe(props);
  });

  it("passes through when the registry has no metadata for the type", () => {
    const props = { model: { provider: "openai", id: "gpt-5-mini" } };
    const out = normalizeModelProperties("nodetool.made.Up", props, {
      getMetadata: () => undefined
    });

    expect(out).toBe(props);
  });

  it("handles nodes with no properties", () => {
    expect(
      normalizeModelProperties("x", undefined, registry("language_model"))
    ).toBeUndefined();
  });
});
