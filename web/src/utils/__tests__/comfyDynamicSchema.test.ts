import {
  isComfyConnection,
  normalizeComfyPrompt,
  parseComfyWorkflowJson,
  resolveComfySchema,
  paramToDynInput,
  type ComfyPrompt
} from "../comfyDynamicSchema";

const samplePrompt: ComfyPrompt = {
  "3": {
    class_type: "KSampler",
    inputs: {
      seed: 42,
      steps: 20,
      cfg: 7.5,
      model: ["4", 0],
      positive: ["6", 0],
      latent_image: ["5", 0]
    }
  },
  "6": {
    class_type: "CLIPTextEncode",
    inputs: { text: "a cat", clip: ["4", 1] },
    _meta: { title: "Positive Prompt" }
  },
  "10": {
    class_type: "LoadImage",
    inputs: { image: "input.png", upload: "image" }
  },
  "9": {
    class_type: "SaveImage",
    inputs: { images: ["8", 0], filename_prefix: "ComfyUI" }
  }
};

describe("isComfyConnection", () => {
  it("detects [sourceId, slot] connection refs", () => {
    expect(isComfyConnection(["4", 0])).toBe(true);
    expect(isComfyConnection([4, 1])).toBe(true);
  });
  it("rejects literal values", () => {
    expect(isComfyConnection("input.png")).toBe(false);
    expect(isComfyConnection(42)).toBe(false);
    expect(isComfyConnection(["a", "b"])).toBe(false);
    expect(isComfyConnection([1, 2, 3])).toBe(false);
  });
});

describe("normalizeComfyPrompt", () => {
  it("accepts a bare API-format prompt", () => {
    expect(normalizeComfyPrompt(samplePrompt)).toBe(samplePrompt);
  });
  it("unwraps an object nested under `prompt`", () => {
    expect(normalizeComfyPrompt({ prompt: samplePrompt })).toEqual(
      samplePrompt
    );
  });
  it("rejects the UI/full workflow format with a helpful error", () => {
    expect(() => normalizeComfyPrompt({ nodes: [], links: [] })).toThrow(
      /Save \(API Format\)/
    );
  });
  it("rejects nodes that are not in API format", () => {
    expect(() =>
      normalizeComfyPrompt({ "1": { foo: "bar" } })
    ).toThrow(/API format/);
  });
});

describe("parseComfyWorkflowJson", () => {
  it("throws on invalid JSON", () => {
    expect(() => parseComfyWorkflowJson("{not json")).toThrow(/Invalid JSON/);
  });
  it("parses valid API-format JSON", () => {
    expect(parseComfyWorkflowJson(JSON.stringify(samplePrompt))).toEqual(
      samplePrompt
    );
  });
});

describe("resolveComfySchema", () => {
  const schema = resolveComfySchema(samplePrompt);

  it("exposes LoadImage as a typed image input keyed <id>:<field>", () => {
    expect(schema.dynamic_inputs["10:image"]).toMatchObject({
      type: "image",
      optional: true,
      default: "input.png"
    });
    expect(schema.dynamic_properties["10:image"]).toBe("input.png");
  });

  it("exposes SaveImage as a typed list[image] output", () => {
    expect(schema.dynamic_outputs["9:images"]).toMatchObject({
      type: "list[image]"
    });
  });

  it("collects literal scalar params with inferred types", () => {
    const byHandle = Object.fromEntries(
      schema.availableParams.map((p) => [p.handle, p])
    );
    expect(byHandle["3:seed"].type).toBe("int");
    expect(byHandle["3:cfg"].type).toBe("float");
    expect(byHandle["6:text"].type).toBe("str");
  });

  it("does not expose connection inputs as params", () => {
    const handles = schema.availableParams.map((p) => p.handle);
    expect(handles).not.toContain("3:model");
    expect(handles).not.toContain("6:clip");
    expect(handles).not.toContain("9:images");
  });

  it("does not duplicate the auto-exposed media field as a param", () => {
    const handles = schema.availableParams.map((p) => p.handle);
    expect(handles).not.toContain("10:image");
  });

  it("labels params using node _meta.title when present", () => {
    const text = schema.availableParams.find((p) => p.handle === "6:text");
    expect(text?.label).toBe("Positive Prompt · text");
  });
});

describe("paramToDynInput", () => {
  it("builds optional typed input metadata from a param", () => {
    const schema = resolveComfySchema(samplePrompt);
    const seed = schema.availableParams.find((p) => p.handle === "3:seed")!;
    expect(paramToDynInput(seed)).toMatchObject({
      type: "int",
      optional: true,
      default: 42,
      description: "KSampler · seed"
    });
  });
});
