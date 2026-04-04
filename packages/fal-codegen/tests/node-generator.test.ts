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
    endpointId: "fal-ai/flux/dev",
    className: "FluxDev",
    docstring: "FLUX.1 dev model.",
    tags: ["image", "generation", "flux"],
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

  it("generates correct nodeType", () => {
    const spec = makeSpec();
    const code = gen.generate(spec, "text_to_image");
    expect(code).toContain(
      `static readonly nodeType = "fal.text_to_image.FluxDev"`
    );
  });

  it("uses underscores in nodeType when module has dashes", () => {
    const spec = makeSpec();
    const code = gen.generate(spec, "text-to-image");
    expect(code).toContain(
      `static readonly nodeType = "fal.text_to_image.FluxDev"`
    );
  });

  it("generates correct title from class name", () => {
    const spec = makeSpec({ className: "FluxDev" });
    const code = gen.generate(spec, "text_to_image");
    expect(code).toContain(`static readonly title = "Flux Dev"`);
  });

  it("generates correct title for multi-word class name", () => {
    const spec = makeSpec({ className: "StableDiffusionXL" });
    const code = gen.generate(spec, "text_to_image");
    expect(code).toContain(`static readonly title = "Stable Diffusion X L"`);
  });

  it("generates description with docstring and tags", () => {
    const spec = makeSpec();
    const code = gen.generate(spec, "text_to_image");
    expect(code).toContain("FLUX.1 dev model.");
    expect(code).toContain("image, generation, flux");
  });

  it("generates requiredSettings with FAL_API_KEY", () => {
    const spec = makeSpec();
    const code = gen.generate(spec, "text_to_image");
    expect(code).toContain(
      `static readonly requiredSettings = ["FAL_API_KEY"]`
    );
  });

  it("generates extends FalNode", () => {
    const spec = makeSpec();
    const code = gen.generate(spec, "text_to_image");
    expect(code).toContain("extends FalNode");
  });

  // ── @prop decorators ──────────────────────────────────────────────────────

  it("generates @prop decorator for str field", () => {
    const spec = makeSpec({
      inputFields: [
        makeField({
          name: "prompt",
          propType: "str",
          default: "",
          description: "The prompt"
        })
      ]
    });
    const code = gen.generate(spec, "text_to_image");
    expect(code).toContain(
      `@prop({ type: "str", default: "", description: "The prompt" })`
    );
    expect(code).toContain(`declare prompt: any;`);
  });

  it("generates @prop decorator for int field", () => {
    const spec = makeSpec({
      inputFields: [
        makeField({
          name: "num_inference_steps",
          propType: "int",
          default: 28,
          description: "Steps"
        })
      ]
    });
    const code = gen.generate(spec, "text_to_image");
    expect(code).toContain(
      `@prop({ type: "int", default: 28, description: "Steps" })`
    );
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
    const code = gen.generate(spec, "text_to_image");
    expect(code).toContain(`@prop({ type: "float", default: 7.5`);
  });

  it("generates @prop decorator for bool field", () => {
    const spec = makeSpec({
      inputFields: [
        makeField({
          name: "enable_safety_checker",
          propType: "bool",
          default: true,
          description: "Safety checker"
        })
      ]
    });
    const code = gen.generate(spec, "text_to_image");
    expect(code).toContain(`@prop({ type: "bool", default: true`);
  });

  // ── Enum field ────────────────────────────────────────────────────────────

  it("generates @prop for enum with values array", () => {
    const spec = makeSpec({
      inputFields: [
        makeField({
          name: "image_size",
          propType: "enum",
          default: "landscape_4_3",
          description: "Size",
          enumRef: "ImageSize",
          enumValues: ["square_hd", "square", "landscape_4_3"]
        })
      ]
    });
    const code = gen.generate(spec, "text_to_image");
    expect(code).toContain(`type: "enum"`);
    expect(code).toContain(`default: "landscape_4_3"`);
    expect(code).toContain(`values: ["square_hd", "square", "landscape_4_3"]`);
    expect(code).toContain(`declare image_size: any;`);
  });

  // ── process() — scalar extraction ─────────────────────────────────────────

  it("generates String() cast for str fields", () => {
    const spec = makeSpec({
      inputFields: [makeField({ name: "prompt", propType: "str", default: "" })]
    });
    const code = gen.generate(spec, "text_to_image");
    expect(code).toContain(`const prompt = String(this.prompt ?? "");`);
  });

  it("generates Number() cast for int fields", () => {
    const spec = makeSpec({
      inputFields: [
        makeField({ name: "num_steps", propType: "int", default: 28 })
      ]
    });
    const code = gen.generate(spec, "text_to_image");
    expect(code).toContain(`const numSteps = Number(this.num_steps ?? 28);`);
  });

  it("generates Number() cast for float fields", () => {
    const spec = makeSpec({
      inputFields: [
        makeField({ name: "guidance_scale", propType: "float", default: 7.5 })
      ]
    });
    const code = gen.generate(spec, "text_to_image");
    expect(code).toContain(
      `const guidanceScale = Number(this.guidance_scale ?? 7.5);`
    );
  });

  it("generates String() cast for enum fields", () => {
    const spec = makeSpec({
      inputFields: [
        makeField({
          name: "image_size",
          propType: "enum",
          default: "landscape_4_3",
          enumValues: ["square_hd", "landscape_4_3"]
        })
      ]
    });
    const code = gen.generate(spec, "text_to_image");
    expect(code).toContain(
      `const imageSize = String(this.image_size ?? "landscape_4_3");`
    );
  });

  it("includes scalar vars in args object", () => {
    const spec = makeSpec({
      inputFields: [
        makeField({ name: "prompt", propType: "str", default: "" }),
        makeField({ name: "num_steps", propType: "int", default: 4 })
      ]
    });
    const code = gen.generate(spec, "text_to_image");
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
    const code = gen.generate(spec, "text_to_image");
    expect(code).toContain(`"image_url"`);
  });

  // ── process() — image input ───────────────────────────────────────────────

  it("generates image input handling with imageToDataUrl", () => {
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
    const code = gen.generate(spec, "image_to_image");
    expect(code).toContain(`isRefSet(imageRef)`);
    expect(code).toContain(`imageToDataUrl`);
    expect(code).toContain(`args["image"]`);
  });

  // ── process() — video input ───────────────────────────────────────────────

  it("generates video input handling with assetToFalUrl", () => {
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
    const code = gen.generate(spec, "video_to_video");
    expect(code).toContain(`isRefSet(videoRef)`);
    expect(code).toContain(`assetToFalUrl`);
  });

  // ── process() — output handling ───────────────────────────────────────────

  it("generates image output: images[0].url", () => {
    const spec = makeSpec({ outputType: "image" });
    const code = gen.generate(spec, "text_to_image");
    expect(code).toContain(`res.images as { url: string }[]`);
    expect(code).toContain(`images[0].url`);
    expect(code).toContain(`type: "image"`);
  });

  it("generates video output: res.video.url", () => {
    const spec = makeSpec({ outputType: "video" });
    const code = gen.generate(spec, "text_to_video");
    expect(code).toContain(`(res.video as any).url`);
    expect(code).toContain(`type: "video"`);
  });

  it("generates audio output: res.audio.url", () => {
    const spec = makeSpec({ outputType: "audio" });
    const code = gen.generate(spec, "text_to_audio");
    expect(code).toContain(`(res.audio as any).url`);
    expect(code).toContain(`type: "audio"`);
  });

  it("generates dict output: returns res directly", () => {
    const spec = makeSpec({ outputType: "dict" });
    const code = gen.generate(spec, "llm");
    expect(code).toContain(`return { output: res }`);
  });

  // ── falSubmit call ─────────────────────────────────────────────────────────

  it("calls falSubmit with correct endpoint ID", () => {
    const spec = makeSpec({ endpointId: "fal-ai/flux/dev" });
    const code = gen.generate(spec, "text_to_image");
    expect(code).toContain(`falSubmit(apiKey, "fal-ai/flux/dev", args)`);
  });

  it("calls removeNulls on args", () => {
    const spec = makeSpec();
    const code = gen.generate(spec, "text_to_image");
    expect(code).toContain(`removeNulls(args)`);
  });

  // ── nested asset field ─────────────────────────────────────────────────────

  it("generates nested asset handling with nestedAssetKey", () => {
    const spec = makeSpec({
      inputFields: [
        makeField({
          name: "video_conditioning",
          propType: "video",
          tsType: "video",
          default: null,
          nestedAssetKey: "video_url"
        }),
        makeField({
          name: "start_frame_num",
          propType: "int",
          default: 0,
          parentField: "video_conditioning"
        })
      ],
      outputType: "video"
    });
    const code = gen.generate(spec, "image_to_video");
    expect(code).toContain(`"video_url": videoConditioningUrl`);
    expect(code).toContain(`"start_frame_num"`);
    // Sub-field should NOT be declared as top-level prop
    expect(code).not.toContain(`declare start_frame_num: any;`);
  });
});

// ---------------------------------------------------------------------------
// generateModule()
// ---------------------------------------------------------------------------

describe("NodeGenerator.generateModule()", () => {
  const gen = new NodeGenerator();

  it("includes BaseNode and prop imports", () => {
    const code = gen.generateModule("text_to_image", [makeSpec()]);
    expect(code).toContain(
      `import { BaseNode, prop } from "@nodetool/node-sdk"`
    );
  });

  it("includes fal-base imports", () => {
    const code = gen.generateModule("text_to_image", [makeSpec()]);
    expect(code).toContain(`from "../fal-base.js"`);
    expect(code).toContain(`getFalApiKey`);
    expect(code).toContain(`falSubmit`);
    expect(code).toContain(`removeNulls`);
  });

  it("exports FAL_{MODULE}_NODES array", () => {
    const code = gen.generateModule("text_to_image", [makeSpec()]);
    expect(code).toContain(`export const FAL_TEXT_TO_IMAGE_NODES`);
    expect(code).toContain(`FluxDev,`);
  });

  it("handles dashes in module name for array export", () => {
    const code = gen.generateModule("text-to-image", [makeSpec()]);
    expect(code).toContain(`FAL_TEXT_TO_IMAGE_NODES`);
  });

  it("includes all class names in export array", () => {
    const spec1 = makeSpec({
      className: "FluxDev",
      endpointId: "fal-ai/flux/dev"
    });
    const spec2 = makeSpec({
      className: "FluxPro",
      endpointId: "fal-ai/flux/pro"
    });
    const code = gen.generateModule("text_to_image", [spec1, spec2]);
    expect(code).toContain(`FluxDev,`);
    expect(code).toContain(`FluxPro,`);
  });

  it("applies module config overrides", () => {
    const spec = makeSpec({
      className: "OldName",
      endpointId: "fal-ai/flux/dev"
    });
    const moduleConfig = {
      configs: {
        "fal-ai/flux/dev": { className: "NewName" } as NodeConfig
      }
    };
    const code = gen.generateModule("text_to_image", [spec], moduleConfig);
    expect(code).toContain(`class NewName`);
  });
});

// ---------------------------------------------------------------------------
// applyConfig()
// ---------------------------------------------------------------------------

describe("NodeGenerator.applyConfig()", () => {
  const gen = new NodeGenerator();

  it("overrides className", () => {
    const spec = makeSpec({ className: "Original" });
    const result = gen.applyConfig(spec, { className: "Renamed" });
    expect(result.className).toBe("Renamed");
  });

  it("overrides docstring", () => {
    const spec = makeSpec({ docstring: "Old doc" });
    const result = gen.applyConfig(spec, { docstring: "New doc" });
    expect(result.docstring).toBe("New doc");
  });

  it("overrides tags", () => {
    const spec = makeSpec({ tags: ["old"] });
    const result = gen.applyConfig(spec, { tags: ["new", "tags"] });
    expect(result.tags).toEqual(["new", "tags"]);
  });

  it("applies field overrides — description", () => {
    const spec = makeSpec({
      inputFields: [
        makeField({
          name: "seed",
          propType: "int",
          default: 0,
          description: "Old"
        })
      ]
    });
    const result = gen.applyConfig(spec, {
      fieldOverrides: { seed: { description: "New description" } }
    });
    expect(result.inputFields[0].description).toBe("New description");
  });

  it("applies field overrides — default value", () => {
    const spec = makeSpec({
      inputFields: [makeField({ name: "seed", propType: "int", default: 0 })]
    });
    const result = gen.applyConfig(spec, {
      fieldOverrides: { seed: { default: -1 } }
    });
    expect(result.inputFields[0].default).toBe(-1);
  });

  it("renames enum via enumOverrides", () => {
    const enumDef: EnumDef = {
      name: "ImageSize",
      values: [
        ["SQUARE_HD", "square_hd"],
        ["LANDSCAPE_4_3", "landscape_4_3"]
      ]
    };
    const spec = makeSpec({
      inputFields: [
        makeField({
          name: "image_size",
          propType: "enum",
          enumRef: "ImageSize",
          enumValues: ["square_hd"]
        })
      ],
      enums: [enumDef]
    });
    const result = gen.applyConfig(spec, {
      enumOverrides: { ImageSize: "ImageSizePreset" }
    });
    expect(result.enums[0].name).toBe("ImageSizePreset");
    expect(result.inputFields[0].enumRef).toBe("ImageSizePreset");
  });

  it("does not mutate the original spec", () => {
    const spec = makeSpec({ className: "Original" });
    gen.applyConfig(spec, { className: "Renamed" });
    expect(spec.className).toBe("Original");
  });
});

// ---------------------------------------------------------------------------
// selectBasicFields() heuristic
// ---------------------------------------------------------------------------

describe("NodeGenerator.selectBasicFields()", () => {
  const gen = new NodeGenerator();

  it("prioritises P0 assets named image/video/audio", () => {
    const spec = makeSpec({
      inputFields: [
        makeField({ name: "seed", propType: "int", default: 0 }),
        makeField({
          name: "image",
          propType: "image",
          tsType: "image",
          default: null
        }),
        makeField({ name: "prompt", propType: "str", default: "" })
      ]
    });
    const fields = gen.selectBasicFields(spec);
    expect(fields[0]).toBe("image");
  });

  it("puts prompt fields before scalar fields", () => {
    const spec = makeSpec({
      inputFields: [
        makeField({ name: "width", propType: "int", default: 512 }),
        makeField({ name: "prompt", propType: "str", default: "" }),
        makeField({ name: "height", propType: "int", default: 512 })
      ]
    });
    const fields = gen.selectBasicFields(spec);
    expect(fields.indexOf("prompt")).toBeLessThan(fields.indexOf("width"));
  });

  it("returns at most 5 fields", () => {
    const spec = makeSpec({
      inputFields: Array.from({ length: 10 }, (_, i) =>
        makeField({ name: `field_${i}`, propType: "int", default: i })
      )
    });
    const fields = gen.selectBasicFields(spec);
    expect(fields.length).toBeLessThanOrEqual(5);
  });

  it("excludes seed from P4 candidates", () => {
    const spec = makeSpec({
      inputFields: [
        makeField({ name: "seed", propType: "int", default: -1 }),
        makeField({ name: "prompt", propType: "str", default: "" })
      ]
    });
    const fields = gen.selectBasicFields(spec);
    expect(fields).not.toContain("seed");
  });
});

// ---------------------------------------------------------------------------
// process() — bool field extraction
// ---------------------------------------------------------------------------

describe("NodeGenerator.generate() — bool field in process()", () => {
  const gen = new NodeGenerator();

  it("generates Boolean() cast for bool fields", () => {
    const spec = makeSpec({
      inputFields: [
        makeField({
          name: "enable_safety_checker",
          propType: "bool",
          default: true
        })
      ]
    });
    const code = gen.generate(spec, "text_to_image");
    expect(code).toContain(
      `const enableSafetyChecker = Boolean(this.enable_safety_checker ?? true);`
    );
  });

  it("includes bool var in args object", () => {
    const spec = makeSpec({
      inputFields: [
        makeField({ name: "safe_mode", propType: "bool", default: false })
      ]
    });
    const code = gen.generate(spec, "text_to_image");
    expect(code).toContain(`"safe_mode": safeMode,`);
  });
});

// ---------------------------------------------------------------------------
// process() — reserved variable name collision
// ---------------------------------------------------------------------------

describe("NodeGenerator.generate() — reserved variable names", () => {
  const gen = new NodeGenerator();

  it("prefixes 'inputs' field name with field_ to avoid collision", () => {
    const spec = makeSpec({
      inputFields: [makeField({ name: "inputs", propType: "str", default: "" })]
    });
    const code = gen.generate(spec, "text_to_image");
    expect(code).toContain(`const field_inputs =`);
    expect(code).toContain(`"inputs": field_inputs,`);
  });

  it("prefixes 'output' field name with field_ to avoid collision", () => {
    const spec = makeSpec({
      inputFields: [makeField({ name: "output", propType: "str", default: "" })]
    });
    const code = gen.generate(spec, "text_to_image");
    expect(code).toContain(`const field_output =`);
    expect(code).toContain(`"output": field_output,`);
  });
});

// ---------------------------------------------------------------------------
// process() — list asset fields
// ---------------------------------------------------------------------------

describe("NodeGenerator.generate() — list asset fields", () => {
  const gen = new NodeGenerator();

  it("generates list[image] handling with assetToFalUrl loop", () => {
    const spec = makeSpec({
      inputFields: [
        makeField({
          name: "images",
          propType: "list[image]",
          tsType: "image[]",
          default: [],
          apiParamName: "image_urls"
        })
      ],
      outputType: "image"
    });
    const code = gen.generate(spec, "image_to_image");
    expect(code).toContain(`imagesList`);
    expect(code).toContain(`imagesUrls`);
    expect(code).toContain(`assetToFalUrl`);
    expect(code).toContain(`"image_urls"`);
  });

  it("generates list[video] handling with assetToFalUrl loop", () => {
    const spec = makeSpec({
      inputFields: [
        makeField({
          name: "videos",
          propType: "list[video]",
          tsType: "video[]",
          default: []
        })
      ],
      outputType: "video"
    });
    const code = gen.generate(spec, "video_to_video");
    expect(code).toContain(`videosList`);
    expect(code).toContain(`videosUrls`);
    expect(code).toContain(`assetToFalUrl`);
  });

  it("generates list[audio] handling with assetToFalUrl loop", () => {
    const spec = makeSpec({
      inputFields: [
        makeField({
          name: "audio_files",
          propType: "list[audio]",
          tsType: "audio[]",
          default: []
        })
      ],
      outputType: "audio"
    });
    const code = gen.generate(spec, "audio_to_audio");
    expect(code).toContain(`audioFilesList`);
    expect(code).toContain(`audioFilesUrls`);
  });

  it("does NOT declare parentField sub-fields as top-level props, but DOES declare list asset field", () => {
    const spec = makeSpec({
      inputFields: [
        makeField({
          name: "images",
          propType: "list[image]",
          tsType: "image[]",
          default: []
        }),
        makeField({
          name: "sub_option",
          propType: "str",
          default: "",
          parentField: "images"
        })
      ]
    });
    const code = gen.generate(spec, "image_to_image");
    // List asset field IS declared as a prop
    expect(code).toContain(`declare images: any;`);
    // But its parentField sub-field is NOT
    expect(code).not.toContain(`declare sub_option: any;`);
  });
});
