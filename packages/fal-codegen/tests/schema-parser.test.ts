import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SchemaParser } from "../src/schema-parser.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let fluxDevSchema: Record<string, any>;
let parser: SchemaParser;

beforeAll(async () => {
  const raw = await readFile(
    join(__dirname, "fixtures", "flux-dev-schema.json"),
    "utf-8",
  );
  fluxDevSchema = JSON.parse(raw);
  parser = new SchemaParser();
});

// ---------------------------------------------------------------------------
// toEnumValue — UPPER_SNAKE_CASE normalization
// ---------------------------------------------------------------------------

describe("toEnumValue", () => {
  it('converts ratio "16:9" → "RATIO_16_9"', () => {
    expect(parser.toEnumValue("16:9")).toBe("RATIO_16_9");
  });

  it('converts ratio "9:16" → "RATIO_9_16"', () => {
    expect(parser.toEnumValue("9:16")).toBe("RATIO_9_16");
  });

  it('converts snake_case "square_hd" → "SQUARE_HD"', () => {
    expect(parser.toEnumValue("square_hd")).toBe("SQUARE_HD");
  });

  it('converts numeric string "5" → "VALUE_5"', () => {
    expect(parser.toEnumValue("5")).toBe("VALUE_5");
  });

  it('converts "DPM++ 2M" → "DPM_PLUS_PLUS_2M"', () => {
    expect(parser.toEnumValue("DPM++ 2M")).toBe("DPM_PLUS_PLUS_2M");
  });

  it('converts "Digital Art" → "DIGITAL_ART"', () => {
    expect(parser.toEnumValue("Digital Art")).toBe("DIGITAL_ART");
  });

  it('converts "(No style)" → "NO_STYLE"', () => {
    expect(parser.toEnumValue("(No style)")).toBe("NO_STYLE");
  });

  it('converts "realistic_image/b_and_w" → "REALISTIC_IMAGE_B_AND_W"', () => {
    // Slash becomes __ which then gets collapsed to _ by the dedup pass
    expect(parser.toEnumValue("realistic_image/b_and_w")).toBe(
      "REALISTIC_IMAGE_B_AND_W",
    );
  });

  it('converts "X264 (.mp4)" → "X264_MP4"', () => {
    // parens removed, dot replaced with underscore, collapsed
    expect(parser.toEnumValue("X264 (.mp4)")).toBe("X264_MP4");
  });

  it('converts plain lowercase "none" → "NONE"', () => {
    expect(parser.toEnumValue("none")).toBe("NONE");
  });

  it('converts hyphenated "landscape_4_3" → "LANDSCAPE_4_3"', () => {
    expect(parser.toEnumValue("landscape_4_3")).toBe("LANDSCAPE_4_3");
  });
});

// ---------------------------------------------------------------------------
// generateClassName
// ---------------------------------------------------------------------------

describe("generateClassName", () => {
  it('"fal-ai/flux/dev" → "FluxDev"', () => {
    expect(parser.generateClassName("fal-ai/flux/dev")).toBe("FluxDev");
  });

  it('"fal-ai/luma-dream-machine/image-to-video" → "LumaDreamMachineImageToVideo"', () => {
    expect(
      parser.generateClassName("fal-ai/luma-dream-machine/image-to-video"),
    ).toBe("LumaDreamMachineImageToVideo");
  });

  it("strips dots in version segments", () => {
    // fal-ai/model/v5.6 -> ModelV56
    expect(parser.generateClassName("fal-ai/model/v5.6")).toBe("ModelV56");
  });

  it("handles single-segment endpoint without fal-ai prefix", () => {
    expect(parser.generateClassName("some-model")).toBe("SomeModel");
  });
});

// ---------------------------------------------------------------------------
// parse() — full flux/dev schema
// ---------------------------------------------------------------------------

describe("parse() with flux-dev schema", () => {
  it("extracts the correct endpoint ID", () => {
    const spec = parser.parse(fluxDevSchema);
    expect(spec.endpointId).toBe("fal-ai/flux/dev");
  });

  it("generates correct class name from endpoint", () => {
    const spec = parser.parse(fluxDevSchema);
    expect(spec.className).toBe("FluxDev");
  });

  it("extracts input fields", () => {
    const spec = parser.parse(fluxDevSchema);
    expect(spec.inputFields.length).toBeGreaterThan(0);
  });

  it('finds the "prompt" field as a string input', () => {
    const spec = parser.parse(fluxDevSchema);
    const prompt = spec.inputFields.find((f) => f.name === "prompt");
    expect(prompt).toBeDefined();
    expect(prompt?.tsType).toBe("string");
    expect(prompt?.propType).toBe("str");
    expect(prompt?.required).toBe(true);
  });

  it('finds "num_inference_steps" as an integer field', () => {
    const spec = parser.parse(fluxDevSchema);
    const field = spec.inputFields.find((f) => f.name === "num_inference_steps");
    expect(field).toBeDefined();
    expect(field?.propType).toBe("int");
    expect(field?.tsType).toBe("number");
    expect(field?.default).toBe(28);
  });

  it('finds "guidance_scale" as a float field', () => {
    const spec = parser.parse(fluxDevSchema);
    const field = spec.inputFields.find((f) => f.name === "guidance_scale");
    expect(field).toBeDefined();
    expect(field?.propType).toBe("float");
    expect(field?.default).toBe(3.5);
  });

  it('finds "sync_mode" as a boolean field', () => {
    const spec = parser.parse(fluxDevSchema);
    const field = spec.inputFields.find((f) => f.name === "sync_mode");
    expect(field).toBeDefined();
    expect(field?.tsType).toBe("boolean");
    expect(field?.propType).toBe("bool");
    expect(field?.default).toBe(false);
  });

  it('detects "output_format" as an enum and extracts values', () => {
    const spec = parser.parse(fluxDevSchema);

    const field = spec.inputFields.find((f) => f.name === "output_format");
    expect(field).toBeDefined();
    expect(field?.tsType).toBe("enum");
    expect(field?.enumRef).toBe("OutputFormat");

    const enumDef = spec.enums.find((e) => e.name === "OutputFormat");
    expect(enumDef).toBeDefined();
    expect(enumDef?.values.map(([k]) => k)).toContain("JPEG");
    expect(enumDef?.values.map(([k]) => k)).toContain("PNG");
    // raw values preserved
    expect(enumDef?.values.map(([, v]) => v)).toContain("jpeg");
    expect(enumDef?.values.map(([, v]) => v)).toContain("png");
  });

  it('detects "acceleration" as an enum', () => {
    const spec = parser.parse(fluxDevSchema);
    const field = spec.inputFields.find((f) => f.name === "acceleration");
    expect(field).toBeDefined();
    expect(field?.enumRef).toBe("Acceleration");
  });

  it("determines output type as image (images array in output)", () => {
    const spec = parser.parse(fluxDevSchema);
    // FluxDevOutput has "images" property → output type should be "image"
    expect(spec.outputType).toBe("image");
  });

  it("returns empty tags and useCases (filled later by config)", () => {
    const spec = parser.parse(fluxDevSchema);
    expect(spec.tags).toEqual([]);
    expect(spec.useCases).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// jsonTypeToTs — type mapping
// ---------------------------------------------------------------------------

describe("jsonTypeToTs", () => {
  it("maps string type to str", () => {
    const result = parser.jsonTypeToTs({ type: "string" }, undefined, "prompt");
    expect(result).toEqual({ tsType: "string", propType: "str" });
  });

  it("maps integer type to int", () => {
    const result = parser.jsonTypeToTs({ type: "integer" }, undefined, "steps");
    expect(result).toEqual({ tsType: "number", propType: "int" });
  });

  it("maps number type to float", () => {
    const result = parser.jsonTypeToTs({ type: "number" }, undefined, "scale");
    expect(result).toEqual({ tsType: "number", propType: "float" });
  });

  it("maps boolean type to bool", () => {
    const result = parser.jsonTypeToTs(
      { type: "boolean" },
      undefined,
      "enabled",
    );
    expect(result).toEqual({ tsType: "boolean", propType: "bool" });
  });

  it("maps image_url field to image", () => {
    const result = parser.jsonTypeToTs(
      { type: "string" },
      undefined,
      "image_url",
    );
    expect(result).toEqual({ tsType: "image", propType: "image" });
  });

  it("maps video_url field to video", () => {
    const result = parser.jsonTypeToTs(
      { type: "string" },
      undefined,
      "video_url",
    );
    expect(result).toEqual({ tsType: "video", propType: "video" });
  });

  it("maps audio_url field to audio", () => {
    const result = parser.jsonTypeToTs(
      { type: "string" },
      undefined,
      "audio_url",
    );
    expect(result).toEqual({ tsType: "audio", propType: "audio" });
  });

  it('maps field named "image" to image type', () => {
    const result = parser.jsonTypeToTs({ type: "string" }, undefined, "image");
    expect(result).toEqual({ tsType: "image", propType: "image" });
  });

  it('maps field named "mask" to image type', () => {
    const result = parser.jsonTypeToTs({ type: "string" }, undefined, "mask");
    expect(result).toEqual({ tsType: "image", propType: "image" });
  });

  it('maps field named "video" to video type', () => {
    const result = parser.jsonTypeToTs({ type: "string" }, undefined, "video");
    expect(result).toEqual({ tsType: "video", propType: "video" });
  });

  it("maps enum ref to enum type", () => {
    const result = parser.jsonTypeToTs({ type: "string" }, "MyEnum", "field");
    expect(result).toEqual({ tsType: "enum", propType: "enum" });
  });

  it("maps array of strings to list[str]", () => {
    const result = parser.jsonTypeToTs(
      { type: "array", items: { type: "string" } },
      undefined,
      "tags",
    );
    expect(result).toEqual({ tsType: "string[]", propType: "list[str]" });
  });

  it("maps object type to dict", () => {
    const result = parser.jsonTypeToTs({ type: "object" }, undefined, "meta");
    expect(result).toEqual({ tsType: "object", propType: "dict[str, any]" });
  });
});
