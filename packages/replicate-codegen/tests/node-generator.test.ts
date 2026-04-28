import { describe, it, expect } from "vitest";
import { NodeGenerator } from "../src/node-generator.js";
import type { NodeSpec, FieldDef, EnumDef, NodeConfig } from "../src/types.js";

// ---------------------------------------------------------------------------
// Helpers to build minimal specs
// ---------------------------------------------------------------------------

function makeField(overrides: Partial<FieldDef> & { name: string }): FieldDef {
  return {
    tsType: "string",
    propType: "str",
    default: "",
    description: "",
    fieldType: "input",
    required: false,
    ...overrides
  };
}

function makeSpec(overrides: Partial<NodeSpec> = {}): NodeSpec {
  return {
    endpointId:
      "stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e68b3c9e1d0d8f37e2f4b09bb",
    className: "StabilityAiSdxl",
    docstring: "A text-to-image generative AI model.",
    tags: ["image", "generation", "sdxl"],
    useCases: [],
    inputFields: [makeField({ name: "prompt", propType: "str", default: "" })],
    outputType: "image",
    outputFields: [],
    enums: [],
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// generate() — single class
// ---------------------------------------------------------------------------

describe("NodeGenerator.generate()", () => {
  const gen = new NodeGenerator();

  it("generates correct nodeType with replicate prefix", () => {
    const spec = makeSpec();
    const code = gen.generate(spec, "image-generate");
    expect(code).toContain(
      `static readonly nodeType = "replicate.image.generate.StabilityAiSdxl"`
    );
  });

  it("replaces dashes with dots in module name for nodeType", () => {
    const spec = makeSpec();
    const code = gen.generate(spec, "image-generate");
    expect(code).toContain(`"replicate.image.generate.StabilityAiSdxl"`);
  });

  it("generates correct title from class name", () => {
    const spec = makeSpec({ className: "StabilityAiSdxl" });
    const code = gen.generate(spec, "image-generate");
    expect(code).toContain(`static readonly title = "Stability Ai Sdxl"`);
  });

  it("generates title with spaces for multi-word class name", () => {
    const spec = makeSpec({ className: "BlackForestLabsFluxSchnell" });
    const code = gen.generate(spec, "image-generate");
    expect(code).toContain(
      `static readonly title = "Black Forest Labs Flux Schnell"`
    );
  });

  it("generates description with docstring and tags", () => {
    const spec = makeSpec();
    const code = gen.generate(spec, "image-generate");
    expect(code).toContain("A text-to-image generative AI model.");
    expect(code).toContain("image, generation, sdxl");
  });

  it("generates requiredSettings with REPLICATE_API_TOKEN", () => {
    const spec = makeSpec();
    const code = gen.generate(spec, "image-generate");
    expect(code).toContain(
      `static readonly requiredSettings = ["REPLICATE_API_TOKEN"]`
    );
  });

  it("generates extends ReplicateNode", () => {
    const spec = makeSpec();
    const code = gen.generate(spec, "image-generate");
    expect(code).toContain("extends ReplicateNode");
  });

  it("generates metadataOutputTypes with image output type", () => {
    const spec = makeSpec({ outputType: "image" });
    const code = gen.generate(spec, "image-generate");
    expect(code).toContain(`static readonly metadataOutputTypes`);
    expect(code).toContain(`output: "image"`);
  });

  it("generates metadataOutputTypes with video output type", () => {
    const spec = makeSpec({ outputType: "video" });
    const code = gen.generate(spec, "video-generate");
    expect(code).toContain(`output: "video"`);
  });

  it("generates metadataOutputTypes with audio output type", () => {
    const spec = makeSpec({ outputType: "audio" });
    const code = gen.generate(spec, "audio-generate");
    expect(code).toContain(`output: "audio"`);
  });

  it("generates metadataOutputTypes with str output type", () => {
    const spec = makeSpec({ outputType: "str" });
    const code = gen.generate(spec, "text-generate");
    expect(code).toContain(`output: "str"`);
  });

  // ── @prop decorators ──────────────────────────────────────────────────────

  it("generates @prop decorator for str field", () => {
    const spec = makeSpec({
      inputFields: [
        makeField({
          name: "prompt",
          propType: "str",
          default: "",
          description: "Input prompt"
        })
      ]
    });
    const code = gen.generate(spec, "image-generate");
    expect(code).toContain(`type: "str"`);
    expect(code).toContain(`default: ""`);
    expect(code).toContain(`description: "Input prompt"`);
    expect(code).toContain(`declare prompt: any;`);
  });

  it("generates @prop decorator for int field", () => {
    const spec = makeSpec({
      inputFields: [
        makeField({
          name: "num_inference_steps",
          propType: "int",
          default: 50,
          description: "Steps"
        })
      ]
    });
    const code = gen.generate(spec, "image-generate");
    expect(code).toContain(`type: "int"`);
    expect(code).toContain(`default: 50`);
  });

  it("generates @prop decorator for float field", () => {
    const spec = makeSpec({
      inputFields: [
        makeField({
          name: "guidance_scale",
          propType: "float",
          default: 7.5,
          description: "Guidance scale"
        })
      ]
    });
    const code = gen.generate(spec, "image-generate");
    expect(code).toContain(`type: "float"`);
    expect(code).toContain(`default: 7.5`);
  });

  it("generates @prop decorator for bool field", () => {
    const spec = makeSpec({
      inputFields: [
        makeField({
          name: "apply_watermark",
          propType: "bool",
          default: true,
          description: "Apply watermark"
        })
      ]
    });
    const code = gen.generate(spec, "image-generate");
    expect(code).toContain(`type: "bool"`);
    expect(code).toContain(`default: true`);
  });

  // ── Enum field ────────────────────────────────────────────────────────────

  it("generates @prop for enum with values array", () => {
    const spec = makeSpec({
      inputFields: [
        makeField({
          name: "scheduler",
          propType: "enum",
          default: "K_EULER",
          description: "Scheduler type",
          enumRef: "Scheduler",
          enumValues: ["DDIM", "K_EULER", "PNDM"]
        })
      ]
    });
    const code = gen.generate(spec, "image-generate");
    expect(code).toContain(`type: "enum"`);
    expect(code).toContain(`default: "K_EULER"`);
    expect(code).toContain(`values: ["DDIM", "K_EULER", "PNDM"]`);
    expect(code).toContain(`declare scheduler: any;`);
  });

  // ── process() — scalar extraction ─────────────────────────────────────────

  it("generates String() cast for str fields", () => {
    const spec = makeSpec({
      inputFields: [makeField({ name: "prompt", propType: "str", default: "" })]
    });
    const code = gen.generate(spec, "image-generate");
    expect(code).toContain(`const prompt = String(this.prompt ?? "");`);
  });

  it("generates Number() cast for int fields", () => {
    const spec = makeSpec({
      inputFields: [
        makeField({ name: "num_steps", propType: "int", default: 50 })
      ]
    });
    const code = gen.generate(spec, "image-generate");
    expect(code).toContain(`const numSteps = Number(this.num_steps ?? 50);`);
  });

  it("generates Number() cast for float fields", () => {
    const spec = makeSpec({
      inputFields: [
        makeField({ name: "guidance_scale", propType: "float", default: 7.5 })
      ]
    });
    const code = gen.generate(spec, "image-generate");
    expect(code).toContain(
      `const guidanceScale = Number(this.guidance_scale ?? 7.5);`
    );
  });

  it("generates Boolean() cast for bool fields", () => {
    const spec = makeSpec({
      inputFields: [
        makeField({ name: "apply_watermark", propType: "bool", default: true })
      ]
    });
    const code = gen.generate(spec, "image-generate");
    expect(code).toContain(
      `const applyWatermark = Boolean(this.apply_watermark ?? true);`
    );
  });

  it("includes scalar vars in args object", () => {
    const spec = makeSpec({
      inputFields: [
        makeField({ name: "prompt", propType: "str", default: "" }),
        makeField({ name: "num_steps", propType: "int", default: 50 })
      ]
    });
    const code = gen.generate(spec, "image-generate");
    expect(code).toContain(`"prompt": prompt,`);
    expect(code).toContain(`"num_steps": numSteps,`);
  });

  it("uses apiParamName in args when set", () => {
    const spec = makeSpec({
      inputFields: [
        makeField({
          name: "image",
          apiParamName: "image_url",
          propType: "str",
          default: ""
        })
      ]
    });
    const code = gen.generate(spec, "image-generate");
    expect(code).toContain(`"image_url"`);
  });

  // ── process() — image input ───────────────────────────────────────────────

  it("generates image input handling with isRefSet and assetToUrl", () => {
    const spec = makeSpec({
      inputFields: [
        makeField({
          name: "image",
          propType: "image",
          tsType: "image",
          default: null
        })
      ]
    });
    const code = gen.generate(spec, "image-to-image");
    expect(code).toContain(`isRefSet(imageRef)`);
    expect(code).toContain(`assetToUrl(imageRef!, apiKey)`);
    expect(code).toContain(`args["image"]`);
  });

  it("generates video input handling with isRefSet and assetToUrl", () => {
    const spec = makeSpec({
      inputFields: [
        makeField({
          name: "video",
          propType: "video",
          tsType: "video",
          default: null
        })
      ],
      outputType: "video"
    });
    const code = gen.generate(spec, "video-to-video");
    expect(code).toContain(`isRefSet(videoRef)`);
    expect(code).toContain(`assetToUrl(videoRef!, apiKey)`);
  });

  it("generates audio input handling with isRefSet and assetToUrl", () => {
    const spec = makeSpec({
      inputFields: [
        makeField({
          name: "audio",
          propType: "audio",
          tsType: "audio",
          default: null
        })
      ],
      outputType: "audio"
    });
    const code = gen.generate(spec, "audio-to-audio");
    expect(code).toContain(`isRefSet(audioRef)`);
    expect(code).toContain(`assetToUrl(audioRef!, apiKey)`);
  });

  // ── process() — output handling ───────────────────────────────────────────

  it("generates image output using outputToImageRef", () => {
    const spec = makeSpec({ outputType: "image" });
    const code = gen.generate(spec, "image-generate");
    expect(code).toContain(`outputToImageRef(res.output)`);
  });

  it("generates video output using outputToVideoRef", () => {
    const spec = makeSpec({ outputType: "video" });
    const code = gen.generate(spec, "video-generate");
    expect(code).toContain(`outputToVideoRef(res.output)`);
  });

  it("generates audio output using outputToAudioRef", () => {
    const spec = makeSpec({ outputType: "audio" });
    const code = gen.generate(spec, "audio-generate");
    expect(code).toContain(`outputToAudioRef(res.output)`);
  });

  it("generates str output using outputToString", () => {
    const spec = makeSpec({ outputType: "str" });
    const code = gen.generate(spec, "text-generate");
    expect(code).toContain(`outputToString(res.output)`);
  });

  it("generates default output for unknown type", () => {
    const spec = makeSpec({ outputType: "any" });
    const code = gen.generate(spec, "image-generate");
    expect(code).toContain(`return { output: res.output }`);
  });

  // ── replicateSubmit call ──────────────────────────────────────────────────

  it("calls replicateSubmit with correct endpointId", () => {
    const spec = makeSpec({
      endpointId:
        "stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e68b3c9e1d0d8f37e2f4b09bb"
    });
    const code = gen.generate(spec, "image-generate");
    expect(code).toContain(
      `replicateSubmit(apiKey, "stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e68b3c9e1d0d8f37e2f4b09bb", args)`
    );
  });

  it("calls removeNulls on args", () => {
    const spec = makeSpec();
    const code = gen.generate(spec, "image-generate");
    expect(code).toContain(`removeNulls(args)`);
  });

  it("calls getReplicateApiKey to extract api key", () => {
    const spec = makeSpec();
    const code = gen.generate(spec, "image-generate");
    expect(code).toContain(`getReplicateApiKey(this._secrets)`);
  });

  // ── parentField filtering ─────────────────────────────────────────────────

  it("does not declare parentField sub-fields as top-level props", () => {
    const spec = makeSpec({
      inputFields: [
        makeField({ name: "prompt", propType: "str", default: "" }),
        makeField({
          name: "width",
          propType: "int",
          default: 0,
          parentField: "some_parent"
        })
      ]
    });
    const code = gen.generate(spec, "image-generate");
    expect(code).not.toContain(`declare width: any;`);
  });

  // ── prompt_template exclusion ─────────────────────────────────────────────

  it("excludes prompt_template from scalar extraction", () => {
    const spec = makeSpec({
      inputFields: [
        makeField({ name: "prompt", propType: "str", default: "" }),
        makeField({
          name: "prompt_template",
          propType: "str",
          default: "{prompt}"
        })
      ]
    });
    const code = gen.generate(spec, "image-generate");
    // prompt_template should not appear in scalar extraction
    expect(code).not.toContain(`this.prompt_template`);
  });
});

// ---------------------------------------------------------------------------
// generateModule()
// ---------------------------------------------------------------------------

describe("NodeGenerator.generateModule()", () => {
  const gen = new NodeGenerator();

  it("includes BaseNode and prop imports from @nodetool/node-sdk", () => {
    const code = gen.generateModule("image-generate", [makeSpec()]);
    expect(code).toContain(
      `import { BaseNode, prop } from "@nodetool/node-sdk"`
    );
    expect(code).toContain(
      `import type { NodeClass } from "@nodetool/node-sdk"`
    );
  });

  it("includes replicate-base imports", () => {
    const code = gen.generateModule("image-generate", [makeSpec()]);
    expect(code).toContain(`from "../replicate-base.js"`);
    expect(code).toContain(`getReplicateApiKey`);
    expect(code).toContain(`replicateSubmit`);
    expect(code).toContain(`removeNulls`);
    expect(code).toContain(`isRefSet`);
    expect(code).toContain(`assetToUrl`);
    expect(code).toContain(`outputToImageRef`);
    expect(code).toContain(`outputToVideoRef`);
    expect(code).toContain(`outputToAudioRef`);
    expect(code).toContain(`outputToString`);
  });

  it("sets ReplicateNode = BaseNode alias", () => {
    const code = gen.generateModule("image-generate", [makeSpec()]);
    expect(code).toContain(`const ReplicateNode = BaseNode`);
  });

  it("exports REPLICATE_{MODULE}_NODES array", () => {
    const code = gen.generateModule("image-generate", [makeSpec()]);
    expect(code).toContain(`export const REPLICATE_IMAGE_GENERATE_NODES`);
    expect(code).toContain(`StabilityAiSdxl,`);
  });

  it("handles dashes in module name for array export", () => {
    const code = gen.generateModule("image-generate", [makeSpec()]);
    expect(code).toContain(`REPLICATE_IMAGE_GENERATE_NODES`);
  });

  it("includes all class names in export array", () => {
    const spec1 = makeSpec({
      className: "StabilityAiSdxl",
      endpointId: "stability-ai/sdxl:v1"
    });
    const spec2 = makeSpec({
      className: "BlackForestLabsFluxDev",
      endpointId: "black-forest-labs/flux-dev:v1"
    });
    const code = gen.generateModule("image-generate", [spec1, spec2]);
    expect(code).toContain(`StabilityAiSdxl,`);
    expect(code).toContain(`BlackForestLabsFluxDev,`);
  });

  it("applies module config overrides", () => {
    const spec = makeSpec({
      className: "OldName",
      endpointId:
        "stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e68b3c9e1d0d8f37e2f4b09bb"
    });
    const moduleConfig = {
      configs: {
        "stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e68b3c9e1d0d8f37e2f4b09bb":
          { className: "Sdxl" } as NodeConfig
      }
    };
    const code = gen.generateModule("image-generate", [spec], moduleConfig);
    expect(code).toContain(`class Sdxl`);
    expect(code).not.toContain(`class OldName`);
  });
});

// ---------------------------------------------------------------------------
// applyConfig()
// ---------------------------------------------------------------------------

describe("NodeGenerator.applyConfig()", () => {
  const gen = new NodeGenerator();

  it("overrides className", () => {
    const spec = makeSpec({ className: "StabilityAiSdxl" });
    const result = gen.applyConfig(spec, { className: "Sdxl" });
    expect(result.className).toBe("Sdxl");
  });

  it("overrides docstring", () => {
    const spec = makeSpec({ docstring: "Old doc" });
    const result = gen.applyConfig(spec, { docstring: "New doc" });
    expect(result.docstring).toBe("New doc");
  });

  it("overrides tags", () => {
    const spec = makeSpec({ tags: ["old"] });
    const result = gen.applyConfig(spec, { tags: ["image", "text-to-image"] });
    expect(result.tags).toEqual(["image", "text-to-image"]);
  });

  it("overrides returnType (outputType)", () => {
    const spec = makeSpec({ outputType: "str" });
    const result = gen.applyConfig(spec, { returnType: "image" });
    expect(result.outputType).toBe("image");
  });

  it("applies field override — description", () => {
    const spec = makeSpec({
      inputFields: [
        makeField({
          name: "seed",
          propType: "int",
          default: 0,
          description: "Old description"
        })
      ]
    });
    const result = gen.applyConfig(spec, {
      fieldOverrides: { seed: { description: "New description" } }
    });
    expect(result.inputFields[0].description).toBe("New description");
  });

  it("applies field override — default value", () => {
    const spec = makeSpec({
      inputFields: [makeField({ name: "seed", propType: "int", default: 0 })]
    });
    const result = gen.applyConfig(spec, {
      fieldOverrides: { seed: { default: -1 } }
    });
    expect(result.inputFields[0].default).toBe(-1);
  });

  it("applies field override — propType change", () => {
    const spec = makeSpec({
      inputFields: [
        makeField({ name: "image_path", propType: "str", default: "" })
      ]
    });
    const result = gen.applyConfig(spec, {
      fieldOverrides: { image_path: { propType: "image" } }
    });
    expect(result.inputFields[0].propType).toBe("image");
  });

  it("renames enum via enumOverrides", () => {
    const enumDef: EnumDef = {
      name: "Scheduler",
      values: [
        ["DDIM", "DDIM"],
        ["K_EULER", "K_EULER"]
      ]
    };
    const spec = makeSpec({
      inputFields: [
        makeField({
          name: "scheduler",
          propType: "enum",
          enumRef: "Scheduler",
          enumValues: ["DDIM"]
        })
      ],
      enums: [enumDef]
    });
    const result = gen.applyConfig(spec, {
      enumOverrides: { Scheduler: "SchedulerType" }
    });
    expect(result.enums[0].name).toBe("SchedulerType");
    expect(result.inputFields[0].enumRef).toBe("SchedulerType");
  });

  it("applies enumValueOverrides to rename enum keys", () => {
    const enumDef: EnumDef = {
      name: "Refine",
      values: [
        ["NO_REFINER", "no_refiner"],
        ["BASE_IMAGE_REFINER", "base_image_refiner"]
      ]
    };
    const spec = makeSpec({
      inputFields: [
        makeField({
          name: "refine",
          propType: "enum",
          enumRef: "Refine",
          enumValues: ["no_refiner", "base_image_refiner"]
        })
      ],
      enums: [enumDef]
    });
    const result = gen.applyConfig(spec, {
      enumValueOverrides: {
        Refine: { NO_REFINER: "NONE", BASE_IMAGE_REFINER: "BASE" }
      }
    });
    const keys = result.enums[0].values.map(([k]) => k);
    expect(keys).toContain("NONE");
    expect(keys).toContain("BASE");
    expect(keys).not.toContain("NO_REFINER");
  });

  it("does not mutate the original spec", () => {
    const spec = makeSpec({ className: "StabilityAiSdxl" });
    gen.applyConfig(spec, { className: "Sdxl" });
    expect(spec.className).toBe("StabilityAiSdxl");
  });

  it("does not mutate original inputFields array", () => {
    const original = makeField({
      name: "prompt",
      propType: "str",
      default: ""
    });
    const spec = makeSpec({ inputFields: [original] });
    gen.applyConfig(spec, {
      fieldOverrides: { prompt: { description: "Changed" } }
    });
    expect(original.description).toBe("");
  });
});
