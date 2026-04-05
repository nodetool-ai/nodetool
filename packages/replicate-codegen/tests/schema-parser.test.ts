import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SchemaParser } from "../src/schema-parser.js";
import type { ReplicateSchema } from "../src/schema-fetcher.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

let sdxlSchema: ReplicateSchema;
let parser: SchemaParser;

beforeAll(async () => {
  const raw = await readFile(
    join(__dirname, "fixtures", "sdxl-schema.json"),
    "utf-8"
  );
  sdxlSchema = JSON.parse(raw) as ReplicateSchema;
  parser = new SchemaParser();
});

// ---------------------------------------------------------------------------
// toEnumKey — UPPER_SNAKE_CASE normalization
// ---------------------------------------------------------------------------

describe("toEnumKey", () => {
  it('converts ratio "16:9" → "RATIO_16_9"', () => {
    expect(parser.toEnumKey("16:9")).toBe("RATIO_16_9");
  });

  it('converts ratio "9:16" → "RATIO_9_16"', () => {
    expect(parser.toEnumKey("9:16")).toBe("RATIO_9_16");
  });

  it('converts snake_case "K_EULER" → "K_EULER"', () => {
    expect(parser.toEnumKey("K_EULER")).toBe("K_EULER");
  });

  it('converts numeric string "5" → "VALUE_5"', () => {
    expect(parser.toEnumKey("5")).toBe("VALUE_5");
  });

  it('converts "DPM++ 2M" → "DPM_PLUS_PLUS_2M"', () => {
    expect(parser.toEnumKey("DPM++ 2M")).toBe("DPM_PLUS_PLUS_2M");
  });

  it('converts "DPMSolverMultistep" → "DPMSOLVERMULTISTEP"', () => {
    expect(parser.toEnumKey("DPMSolverMultistep")).toBe("DPMSOLVERMULTISTEP");
  });

  it('converts "(No style)" → "NO_STYLE"', () => {
    expect(parser.toEnumKey("(No style)")).toBe("NO_STYLE");
  });

  it('converts "no_refiner" → "NO_REFINER"', () => {
    expect(parser.toEnumKey("no_refiner")).toBe("NO_REFINER");
  });

  it('converts "base_image_refiner" → "BASE_IMAGE_REFINER"', () => {
    expect(parser.toEnumKey("base_image_refiner")).toBe("BASE_IMAGE_REFINER");
  });

  it('converts plain lowercase "none" → "NONE"', () => {
    expect(parser.toEnumKey("none")).toBe("NONE");
  });

  it('converts "expert_ensemble_refiner" → "EXPERT_ENSEMBLE_REFINER"', () => {
    expect(parser.toEnumKey("expert_ensemble_refiner")).toBe(
      "EXPERT_ENSEMBLE_REFINER"
    );
  });

  it("handles values starting with digit — prepends underscore", () => {
    expect(parser.toEnumKey("2x")).toBe("_2X");
  });

  it('converts slash separator "realistic_image/b_and_w" → "REALISTIC_IMAGE_B_AND_W"', () => {
    // Slash becomes __ which then gets collapsed to _ by the dedup pass
    expect(parser.toEnumKey("realistic_image/b_and_w")).toBe(
      "REALISTIC_IMAGE_B_AND_W"
    );
  });
});

// ---------------------------------------------------------------------------
// generateClassName
// ---------------------------------------------------------------------------

describe("generateClassName", () => {
  it('"stability-ai/sdxl" → "StabilityAiSdxl"', () => {
    expect(parser.generateClassName("stability-ai/sdxl")).toBe(
      "StabilityAiSdxl"
    );
  });

  it('"black-forest-labs/flux-schnell" → "BlackForestLabsFluxSchnell"', () => {
    expect(parser.generateClassName("black-forest-labs/flux-schnell")).toBe(
      "BlackForestLabsFluxSchnell"
    );
  });

  it('"lucataco/sdxl-lcm" → "LucatacoSdxlLcm"', () => {
    expect(parser.generateClassName("lucataco/sdxl-lcm")).toBe(
      "LucatacoSdxlLcm"
    );
  });

  it("strips dots from version segments", () => {
    expect(parser.generateClassName("owner/model.v2")).toBe("OwnerModelv2");
  });

  it("handles single-segment model ID", () => {
    expect(parser.generateClassName("my-model")).toBe("MyModel");
  });
});

// ---------------------------------------------------------------------------
// parse() — full sdxl schema
// ---------------------------------------------------------------------------

describe("parse() with sdxl schema", () => {
  it("extracts the correct endpointId", () => {
    const spec = parser.parse(sdxlSchema);
    expect(spec.endpointId).toBe(
      "stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e68b3c9e1d0d8f37e2f4b09bb"
    );
  });

  it("generates correct class name from model ID", () => {
    const spec = parser.parse(sdxlSchema);
    expect(spec.className).toBe("StabilityAiSdxl");
  });

  it("extracts docstring from description", () => {
    const spec = parser.parse(sdxlSchema);
    expect(spec.docstring).toContain("text-to-image");
  });

  it("returns empty tags and useCases (filled later by config)", () => {
    const spec = parser.parse(sdxlSchema);
    expect(spec.tags).toEqual([]);
    expect(spec.useCases).toEqual([]);
  });

  it("extracts input fields", () => {
    const spec = parser.parse(sdxlSchema);
    expect(spec.inputFields.length).toBeGreaterThan(0);
  });

  it('finds the "prompt" field as a required string input', () => {
    const spec = parser.parse(sdxlSchema);
    const prompt = spec.inputFields.find((f) => f.name === "prompt");
    expect(prompt).toBeDefined();
    expect(prompt?.tsType).toBe("string");
    expect(prompt?.propType).toBe("str");
    expect(prompt?.required).toBe(true);
  });

  it('finds "width" as an integer field with correct default', () => {
    const spec = parser.parse(sdxlSchema);
    const field = spec.inputFields.find((f) => f.name === "width");
    expect(field).toBeDefined();
    expect(field?.propType).toBe("int");
    expect(field?.tsType).toBe("number");
    expect(field?.default).toBe(1024);
  });

  it('finds "guidance_scale" as a float field', () => {
    const spec = parser.parse(sdxlSchema);
    const field = spec.inputFields.find((f) => f.name === "guidance_scale");
    expect(field).toBeDefined();
    expect(field?.propType).toBe("float");
    expect(field?.default).toBe(7.5);
  });

  it('finds "apply_watermark" as a boolean field', () => {
    const spec = parser.parse(sdxlSchema);
    const field = spec.inputFields.find((f) => f.name === "apply_watermark");
    expect(field).toBeDefined();
    expect(field?.tsType).toBe("boolean");
    expect(field?.propType).toBe("bool");
    expect(field?.default).toBe(true);
  });

  it('detects "image" uri field as image type', () => {
    const spec = parser.parse(sdxlSchema);
    const field = spec.inputFields.find((f) => f.name === "image");
    expect(field).toBeDefined();
    expect(field?.propType).toBe("image");
    expect(field?.tsType).toBe("image");
    expect(field?.default).toBeNull();
  });

  it('detects "mask" uri field as image type', () => {
    const spec = parser.parse(sdxlSchema);
    const field = spec.inputFields.find((f) => f.name === "mask");
    expect(field).toBeDefined();
    expect(field?.propType).toBe("image");
  });

  it('detects "scheduler" as an enum and extracts values', () => {
    const spec = parser.parse(sdxlSchema);
    const field = spec.inputFields.find((f) => f.name === "scheduler");
    expect(field).toBeDefined();
    expect(field?.propType).toBe("enum");
    expect(field?.enumRef).toBe("Scheduler");

    const enumDef = spec.enums.find((e) => e.name === "Scheduler");
    expect(enumDef).toBeDefined();
    expect(enumDef?.values.map(([k]) => k)).toContain("DDIM");
    expect(enumDef?.values.map(([k]) => k)).toContain("K_EULER");
    // raw values preserved
    expect(enumDef?.values.map(([, v]) => v)).toContain("DDIM");
    expect(enumDef?.values.map(([, v]) => v)).toContain("K_EULER");
  });

  it('detects "refine" as an enum', () => {
    const spec = parser.parse(sdxlSchema);
    const field = spec.inputFields.find((f) => f.name === "refine");
    expect(field).toBeDefined();
    expect(field?.enumRef).toBe("Refine");
  });

  it("defaults outputType to str (overridden by config later)", () => {
    const spec = parser.parse(sdxlSchema);
    expect(spec.outputType).toBe("str");
  });
});

// ---------------------------------------------------------------------------
// _jsonTypeToTs — type mapping (via parse with minimal schemas)
// ---------------------------------------------------------------------------

describe("type mapping via parse()", () => {
  function makeSchema(
    propName: string,
    propDef: Record<string, unknown>
  ): ReplicateSchema {
    return {
      modelId: "test/model",
      owner: "test",
      name: "model",
      version: "v1",
      description: "",
      inputSchema: {
        type: "object",
        properties: { [propName]: propDef },
        required: []
      },
      outputSchema: {}
    };
  }

  it("maps string type to str", () => {
    const spec = parser.parse(makeSchema("prompt", { type: "string" }));
    const f = spec.inputFields.find((f) => f.name === "prompt")!;
    expect(f.propType).toBe("str");
    expect(f.tsType).toBe("string");
  });

  it("maps integer type to int", () => {
    const spec = parser.parse(
      makeSchema("steps", { type: "integer", default: 28 })
    );
    const f = spec.inputFields.find((f) => f.name === "steps")!;
    expect(f.propType).toBe("int");
    expect(f.tsType).toBe("number");
  });

  it("maps number type to float", () => {
    const spec = parser.parse(
      makeSchema("scale", { type: "number", default: 7.5 })
    );
    const f = spec.inputFields.find((f) => f.name === "scale")!;
    expect(f.propType).toBe("float");
  });

  it("maps boolean type to bool", () => {
    const spec = parser.parse(
      makeSchema("enabled", { type: "boolean", default: false })
    );
    const f = spec.inputFields.find((f) => f.name === "enabled")!;
    expect(f.propType).toBe("bool");
    expect(f.tsType).toBe("boolean");
  });

  it("maps uri string with 'video' in name to video type", () => {
    const spec = parser.parse(
      makeSchema("video_url", { type: "string", format: "uri" })
    );
    const f = spec.inputFields.find((f) => f.name === "video_url")!;
    expect(f.propType).toBe("video");
    expect(f.tsType).toBe("video");
  });

  it("maps uri string with 'audio' in name to audio type", () => {
    const spec = parser.parse(
      makeSchema("audio_url", { type: "string", format: "uri" })
    );
    const f = spec.inputFields.find((f) => f.name === "audio_url")!;
    expect(f.propType).toBe("audio");
  });

  it("maps uri string with 'sound' in name to audio type", () => {
    const spec = parser.parse(
      makeSchema("sound_file", { type: "string", format: "uri" })
    );
    const f = spec.inputFields.find((f) => f.name === "sound_file")!;
    expect(f.propType).toBe("audio");
  });

  it("maps uri string with 'music' in name to audio type", () => {
    const spec = parser.parse(
      makeSchema("music_file", { type: "string", format: "uri" })
    );
    const f = spec.inputFields.find((f) => f.name === "music_file")!;
    expect(f.propType).toBe("audio");
  });

  it("maps generic uri string to image type by default", () => {
    const spec = parser.parse(
      makeSchema("image_url", { type: "string", format: "uri" })
    );
    const f = spec.inputFields.find((f) => f.name === "image_url")!;
    expect(f.propType).toBe("image");
  });

  it("maps array of strings to list[str]", () => {
    const spec = parser.parse(
      makeSchema("tags", { type: "array", items: { type: "string" } })
    );
    const f = spec.inputFields.find((f) => f.name === "tags")!;
    expect(f.propType).toBe("list[str]");
    expect(f.tsType).toBe("string[]");
  });

  it("maps object type to dict[str, any]", () => {
    const spec = parser.parse(makeSchema("meta", { type: "object" }));
    const f = spec.inputFields.find((f) => f.name === "meta")!;
    expect(f.propType).toBe("dict[str, any]");
    expect(f.tsType).toBe("object");
  });
});

// ---------------------------------------------------------------------------
// _getDefaultValue — default value logic
// ---------------------------------------------------------------------------

describe("default value logic via parse()", () => {
  function makeSchema(
    propName: string,
    propDef: Record<string, unknown>,
    required = false
  ): ReplicateSchema {
    return {
      modelId: "test/model",
      owner: "test",
      name: "model",
      version: "v1",
      description: "",
      inputSchema: {
        type: "object",
        properties: { [propName]: propDef },
        required: required ? [propName] : []
      },
      outputSchema: {}
    };
  }

  it("uses provided default value for string field", () => {
    const spec = parser.parse(
      makeSchema("style", { type: "string", default: "photorealistic" })
    );
    expect(spec.inputFields[0].default).toBe("photorealistic");
  });

  it("uses provided default value for integer field", () => {
    const spec = parser.parse(
      makeSchema("steps", { type: "integer", default: 50 })
    );
    expect(spec.inputFields[0].default).toBe(50);
  });

  it("uses seed=-1 default for seed-description integer", () => {
    const spec = parser.parse(
      makeSchema("seed", {
        type: "integer",
        description: "Random seed for reproducibility"
      })
    );
    expect(spec.inputFields[0].default).toBe(-1);
  });

  it("defaults image/video/audio fields to null", () => {
    const spec = parser.parse(
      makeSchema("image_url", { type: "string", format: "uri" })
    );
    expect(spec.inputFields[0].default).toBeNull();
  });

  it("defaults boolean field to false when no default provided", () => {
    const spec = parser.parse(makeSchema("flag", { type: "boolean" }));
    expect(spec.inputFields[0].default).toBe(false);
  });

  it("defaults float field to 0.0 when no default provided", () => {
    const spec = parser.parse(makeSchema("scale", { type: "number" }));
    expect(spec.inputFields[0].default).toBe(0.0);
  });

  it("defaults string field to empty string when no default provided", () => {
    const spec = parser.parse(makeSchema("prompt", { type: "string" }));
    expect(spec.inputFields[0].default).toBe("");
  });
});
