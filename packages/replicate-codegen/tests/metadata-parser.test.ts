import { describe, it, expect } from "vitest";
import { MetadataParser } from "../src/metadata-parser.js";
import type {
  PackageMetadata,
  MetadataNodeEntry
} from "../src/metadata-parser.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(
  overrides: Partial<MetadataNodeEntry> = {}
): MetadataNodeEntry {
  return {
    title: "Sdxl",
    description: "A text-to-image model",
    namespace: "replicate.image.generate",
    node_type: "replicate.image.generate.Sdxl",
    properties: [],
    outputs: [{ type: { type: "image" }, name: "output" }],
    the_model_info: { owner: "stability-ai", name: "sdxl" },
    ...overrides
  };
}

function makeMetadata(nodes: MetadataNodeEntry[]): PackageMetadata {
  return {
    name: "nodetool-replicate",
    description: "Replicate AI nodes for NodeTool",
    version: "0.1.0",
    nodes
  };
}

const parser = new MetadataParser();

// ---------------------------------------------------------------------------
// parseNode() — single entry
// ---------------------------------------------------------------------------

describe("MetadataParser.parseNode()", () => {
  it("derives className from node_type last segment", () => {
    const entry = makeEntry({
      node_type: "replicate.image.generate.StabilityAiSdxl"
    });
    const spec = parser.parseNode(entry);
    expect(spec.className).toBe("StabilityAiSdxl");
  });

  it("derives modelId from the_model_info owner/name", () => {
    const entry = makeEntry({
      the_model_info: { owner: "stability-ai", name: "sdxl" }
    });
    const spec = parser.parseNode(entry);
    expect(spec.endpointId).toBe("stability-ai/sdxl");
  });

  it("uses empty string endpointId when the_model_info is missing", () => {
    const entry = makeEntry({ the_model_info: undefined });
    const spec = parser.parseNode(entry);
    expect(spec.endpointId).toBe("");
  });

  it("uses empty string endpointId when owner is missing", () => {
    const entry = makeEntry({ the_model_info: { name: "sdxl" } });
    const spec = parser.parseNode(entry);
    expect(spec.endpointId).toBe("");
  });

  it("maps image output type", () => {
    const entry = makeEntry({
      outputs: [{ type: { type: "image" }, name: "output" }]
    });
    const spec = parser.parseNode(entry);
    expect(spec.outputType).toBe("image");
  });

  it("maps video output type", () => {
    const entry = makeEntry({
      outputs: [{ type: { type: "video" }, name: "output" }]
    });
    const spec = parser.parseNode(entry);
    expect(spec.outputType).toBe("video");
  });

  it("maps audio output type", () => {
    const entry = makeEntry({
      outputs: [{ type: { type: "audio" }, name: "output" }]
    });
    const spec = parser.parseNode(entry);
    expect(spec.outputType).toBe("audio");
  });

  it("maps str output type", () => {
    const entry = makeEntry({
      outputs: [{ type: { type: "str" }, name: "output" }]
    });
    const spec = parser.parseNode(entry);
    expect(spec.outputType).toBe("str");
  });

  it("falls back to str for missing outputs", () => {
    const entry = makeEntry({ outputs: [] });
    const spec = parser.parseNode(entry);
    expect(spec.outputType).toBe("str");
  });

  it("uses entry description as docstring", () => {
    const entry = makeEntry({ description: "My custom description" });
    const spec = parser.parseNode(entry);
    expect(spec.docstring).toBe("My custom description");
  });

  it("returns empty tags and useCases", () => {
    const spec = parser.parseNode(makeEntry());
    expect(spec.tags).toEqual([]);
    expect(spec.useCases).toEqual([]);
  });

  // ── property parsing ──────────────────────────────────────────────────────

  it("parses str property", () => {
    const entry = makeEntry({
      properties: [
        {
          name: "prompt",
          type: { type: "str", optional: false },
          default: "",
          title: "Prompt",
          description: "Input prompt"
        }
      ]
    });
    const spec = parser.parseNode(entry);
    const field = spec.inputFields.find((f) => f.name === "prompt")!;
    expect(field).toBeDefined();
    expect(field.propType).toBe("str");
    expect(field.tsType).toBe("string");
    expect(field.required).toBe(true);
  });

  it("parses int property with explicit default", () => {
    const entry = makeEntry({
      properties: [
        {
          name: "num_steps",
          type: { type: "int", optional: false },
          default: 50,
          title: "Steps",
          description: "Number of steps"
        }
      ]
    });
    const spec = parser.parseNode(entry);
    const field = spec.inputFields.find((f) => f.name === "num_steps")!;
    expect(field.propType).toBe("int");
    expect(field.default).toBe(50);
  });

  it("parses float property", () => {
    const entry = makeEntry({
      properties: [
        {
          name: "guidance_scale",
          type: { type: "float", optional: false },
          default: 7.5,
          title: "Guidance Scale",
          description: ""
        }
      ]
    });
    const spec = parser.parseNode(entry);
    const field = spec.inputFields.find((f) => f.name === "guidance_scale")!;
    expect(field.propType).toBe("float");
    expect(field.default).toBe(7.5);
  });

  it("parses bool property", () => {
    const entry = makeEntry({
      properties: [
        {
          name: "apply_watermark",
          type: { type: "bool", optional: false },
          default: true,
          title: "Apply Watermark",
          description: ""
        }
      ]
    });
    const spec = parser.parseNode(entry);
    const field = spec.inputFields.find((f) => f.name === "apply_watermark")!;
    expect(field.propType).toBe("bool");
    expect(field.default).toBe(true);
  });

  it("parses image property — defaults to null", () => {
    const entry = makeEntry({
      properties: [
        {
          name: "image",
          type: { type: "image", optional: true },
          default: null,
          title: "Image",
          description: ""
        }
      ]
    });
    const spec = parser.parseNode(entry);
    const field = spec.inputFields.find((f) => f.name === "image")!;
    expect(field.propType).toBe("image");
    expect(field.default).toBeNull();
  });

  it("parses video property — defaults to null", () => {
    const entry = makeEntry({
      properties: [
        {
          name: "video",
          type: { type: "video", optional: true },
          default: null,
          title: "Video",
          description: ""
        }
      ]
    });
    const spec = parser.parseNode(entry);
    const field = spec.inputFields.find((f) => f.name === "video")!;
    expect(field.propType).toBe("video");
    expect(field.default).toBeNull();
  });

  it("parses audio property — defaults to null", () => {
    const entry = makeEntry({
      properties: [
        {
          name: "audio",
          type: { type: "audio", optional: true },
          default: null,
          title: "Audio",
          description: ""
        }
      ]
    });
    const spec = parser.parseNode(entry);
    const field = spec.inputFields.find((f) => f.name === "audio")!;
    expect(field.propType).toBe("audio");
    expect(field.default).toBeNull();
  });

  it("parses enum property and creates EnumDef", () => {
    const entry = makeEntry({
      properties: [
        {
          name: "scheduler",
          type: {
            type: "enum",
            values: ["DDIM", "K_EULER", "PNDM"],
            optional: false
          },
          default: "K_EULER",
          title: "Scheduler",
          description: "Scheduler type"
        }
      ]
    });
    const spec = parser.parseNode(entry);
    const field = spec.inputFields.find((f) => f.name === "scheduler")!;
    expect(field.propType).toBe("enum");
    expect(field.enumRef).toBe("Scheduler");
    expect(field.enumValues).toEqual(["DDIM", "K_EULER", "PNDM"]);

    const enumDef = spec.enums.find((e) => e.name === "Scheduler")!;
    expect(enumDef).toBeDefined();
    expect(enumDef.values.map(([k]) => k)).toContain("DDIM");
    expect(enumDef.values.map(([k]) => k)).toContain("K_EULER");
    expect(enumDef.values.map(([, v]) => v)).toContain("DDIM");
  });

  it("marks optional properties as not required", () => {
    const entry = makeEntry({
      properties: [
        {
          name: "negative_prompt",
          type: { type: "str", optional: true },
          default: "",
          title: "Negative Prompt",
          description: ""
        }
      ]
    });
    const spec = parser.parseNode(entry);
    const field = spec.inputFields.find((f) => f.name === "negative_prompt")!;
    expect(field.required).toBe(false);
  });

  it("defaults optional str field with null default to null", () => {
    const entry = makeEntry({
      properties: [
        {
          name: "lora_url",
          type: { type: "str", optional: true },
          default: null,
          title: "LoRA URL",
          description: ""
        }
      ]
    });
    const spec = parser.parseNode(entry);
    const field = spec.inputFields.find((f) => f.name === "lora_url")!;
    expect(field.default).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseAll() — multiple entries grouped by module
// ---------------------------------------------------------------------------

describe("MetadataParser.parseAll()", () => {
  it("groups nodes by module name", () => {
    const metadata = makeMetadata([
      makeEntry({
        namespace: "replicate.image.generate",
        node_type: "replicate.image.generate.Sdxl"
      }),
      makeEntry({
        namespace: "replicate.video.generate",
        node_type: "replicate.video.generate.WanT2V",
        title: "WanT2V",
        outputs: [{ type: { type: "video" }, name: "output" }],
        the_model_info: { owner: "wan-video", name: "wan-t2v" }
      })
    ]);
    const modules = parser.parseAll(metadata);
    expect(modules.has("image-generate")).toBe(true);
    expect(modules.has("video-generate")).toBe(true);
  });

  it("converts namespace to module name correctly", () => {
    const metadata = makeMetadata([
      makeEntry({ namespace: "replicate.audio.transcribe" })
    ]);
    const modules = parser.parseAll(metadata);
    expect(modules.has("audio-transcribe")).toBe(true);
  });

  it("strips replicate. prefix from namespace", () => {
    const metadata = makeMetadata([
      makeEntry({ namespace: "replicate.image.enhance" })
    ]);
    const modules = parser.parseAll(metadata);
    expect(modules.has("image-enhance")).toBe(true);
    expect(modules.has("replicate.image-enhance")).toBe(false);
  });

  it("deduplicates nodes by className within same module", () => {
    const metadata = makeMetadata([
      makeEntry({ node_type: "replicate.image.generate.Sdxl" }),
      makeEntry({ node_type: "replicate.image.generate.Sdxl" }) // duplicate
    ]);
    const modules = parser.parseAll(metadata);
    expect(modules.get("image-generate")?.length).toBe(1);
  });

  it("keeps different classNames within same module", () => {
    const metadata = makeMetadata([
      makeEntry({ node_type: "replicate.image.generate.Sdxl" }),
      makeEntry({
        node_type: "replicate.image.generate.FluxDev",
        the_model_info: { owner: "black-forest-labs", name: "flux-dev" },
        title: "FluxDev"
      })
    ]);
    const modules = parser.parseAll(metadata);
    expect(modules.get("image-generate")?.length).toBe(2);
  });

  it("handles nodes from multiple different namespaces", () => {
    const metadata = makeMetadata([
      makeEntry({ namespace: "replicate.image.generate" }),
      makeEntry({
        namespace: "replicate.image.upscale",
        node_type: "replicate.image.upscale.RealEsrgan",
        title: "RealEsrgan",
        the_model_info: { owner: "nightmareai", name: "real-esrgan" }
      }),
      makeEntry({
        namespace: "replicate.audio.transcribe",
        node_type: "replicate.audio.transcribe.WhisperLargeV3",
        title: "WhisperLargeV3",
        outputs: [{ type: { type: "str" }, name: "output" }],
        the_model_info: { owner: "openai", name: "whisper" }
      })
    ]);
    const modules = parser.parseAll(metadata);
    expect(modules.size).toBe(3);
    expect(modules.has("image-generate")).toBe(true);
    expect(modules.has("image-upscale")).toBe(true);
    expect(modules.has("audio-transcribe")).toBe(true);
  });

  it("preserves all node specs in each module", () => {
    const metadata = makeMetadata([
      makeEntry({
        namespace: "replicate.image.generate",
        node_type: "replicate.image.generate.Sdxl"
      })
    ]);
    const modules = parser.parseAll(metadata);
    const specs = modules.get("image-generate")!;
    expect(specs).toHaveLength(1);
    expect(specs[0].className).toBe("Sdxl");
  });
});

// ---------------------------------------------------------------------------
// _namespaceToModuleName — conversion logic
// ---------------------------------------------------------------------------

describe("namespace to module name conversion", () => {
  it('"replicate.image.generate" → "image-generate"', () => {
    const metadata = makeMetadata([
      makeEntry({ namespace: "replicate.image.generate" })
    ]);
    const modules = parser.parseAll(metadata);
    expect([...modules.keys()]).toContain("image-generate");
  });

  it('"replicate.video.face" → "video-face"', () => {
    const metadata = makeMetadata([
      makeEntry({ namespace: "replicate.video.face" })
    ]);
    const modules = parser.parseAll(metadata);
    expect([...modules.keys()]).toContain("video-face");
  });

  it('"replicate.text.generate" → "text-generate"', () => {
    const metadata = makeMetadata([
      makeEntry({
        namespace: "replicate.text.generate",
        outputs: [{ type: { type: "str" }, name: "output" }]
      })
    ]);
    const modules = parser.parseAll(metadata);
    expect([...modules.keys()]).toContain("text-generate");
  });

  it('"replicate.embedding" → "embedding"', () => {
    const metadata = makeMetadata([
      makeEntry({
        namespace: "replicate.embedding",
        outputs: [{ type: { type: "str" }, name: "output" }]
      })
    ]);
    const modules = parser.parseAll(metadata);
    expect([...modules.keys()]).toContain("embedding");
  });
});
