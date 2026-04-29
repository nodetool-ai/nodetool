import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SchemaParser } from "../src/schema-parser.js";
import type { FieldDef } from "../src/types.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let fluxDevSchema: Record<string, any>;
let parser: SchemaParser;

beforeAll(async () => {
  const raw = await readFile(
    join(__dirname, "fixtures", "flux-dev-schema.json"),
    "utf-8"
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
      "REALISTIC_IMAGE_B_AND_W"
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
      parser.generateClassName("fal-ai/luma-dream-machine/image-to-video")
    ).toBe("LumaDreamMachineImageToVideo");
  });

  it("strips dots in version segments", () => {
    // fal-ai/model/v5.6 -> ModelV56
    expect(parser.generateClassName("fal-ai/model/v5.6")).toBe("ModelV56");
  });

  it("handles single-segment endpoint without fal-ai prefix", () => {
    expect(parser.generateClassName("some-model")).toBe("SomeModel");
  });

  it("strips non-fal-ai vendor prefixes", () => {
    expect(parser.generateClassName("openai/gpt-image-2")).toBe("GptImage2");
    expect(parser.generateClassName("openai/gpt-image-2/edit")).toBe(
      "GptImage2Edit"
    );
    expect(
      parser.generateClassName("openrouter/router/openai/v1/responses")
    ).toBe("RouterOpenaiV1Responses");
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
    const field = spec.inputFields.find(
      (f) => f.name === "num_inference_steps"
    );
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
      "enabled"
    );
    expect(result).toEqual({ tsType: "boolean", propType: "bool" });
  });

  it("maps image_url field to image", () => {
    const result = parser.jsonTypeToTs(
      { type: "string" },
      undefined,
      "image_url"
    );
    expect(result).toEqual({ tsType: "image", propType: "image" });
  });

  it("maps video_url field to video", () => {
    const result = parser.jsonTypeToTs(
      { type: "string" },
      undefined,
      "video_url"
    );
    expect(result).toEqual({ tsType: "video", propType: "video" });
  });

  it("maps audio_url field to audio", () => {
    const result = parser.jsonTypeToTs(
      { type: "string" },
      undefined,
      "audio_url"
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
      "tags"
    );
    expect(result).toEqual({ tsType: "string[]", propType: "list[str]" });
  });

  it("maps object type to dict", () => {
    const result = parser.jsonTypeToTs({ type: "object" }, undefined, "meta");
    expect(result).toEqual({ tsType: "object", propType: "dict[str, any]" });
  });

  it("maps unknown type to any", () => {
    const result = parser.jsonTypeToTs({ type: "null" }, undefined, "field");
    expect(result).toEqual({ tsType: "any", propType: "any" });
  });
});

// ---------------------------------------------------------------------------
// normalizeAssetUrlFields
// ---------------------------------------------------------------------------

describe("normalizeAssetUrlFields", () => {
  let p: SchemaParser;
  beforeEach(() => {
    p = new SchemaParser();
  });

  function makeField(
    overrides: Partial<FieldDef> & { name: string }
  ): FieldDef {
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

  it("renames image_url → image and records apiParamName", () => {
    const fields = [
      makeField({
        name: "image_url",
        propType: "image",
        tsType: "image",
        default: null
      })
    ];
    const result = p.normalizeAssetUrlFields(fields);
    expect(result[0].name).toBe("image");
    expect(result[0].apiParamName).toBe("image_url");
    expect(result[0].propType).toBe("image");
  });

  it("renames video_url → video and records apiParamName", () => {
    const fields = [
      makeField({
        name: "video_url",
        propType: "video",
        tsType: "video",
        default: null
      })
    ];
    const result = p.normalizeAssetUrlFields(fields);
    expect(result[0].name).toBe("video");
    expect(result[0].apiParamName).toBe("video_url");
    expect(result[0].propType).toBe("video");
  });

  it("renames audio_url → audio and records apiParamName", () => {
    const fields = [
      makeField({
        name: "audio_url",
        propType: "audio",
        tsType: "audio",
        default: null
      })
    ];
    const result = p.normalizeAssetUrlFields(fields);
    expect(result[0].name).toBe("audio");
    expect(result[0].apiParamName).toBe("audio_url");
    expect(result[0].propType).toBe("audio");
  });

  it("renames compound prefix: input_image_url → input_image", () => {
    const fields = [
      makeField({
        name: "input_image_url",
        propType: "image",
        tsType: "image",
        default: null
      })
    ];
    const result = p.normalizeAssetUrlFields(fields);
    expect(result[0].name).toBe("input_image");
    expect(result[0].apiParamName).toBe("input_image_url");
  });

  it("does not rename non-asset _url fields (e.g. webhook_url)", () => {
    const fields = [makeField({ name: "webhook_url", propType: "str" })];
    const result = p.normalizeAssetUrlFields(fields);
    expect(result[0].name).toBe("webhook_url");
    expect(result[0].apiParamName).toBeUndefined();
  });

  it("does not rename fields without _url suffix", () => {
    const fields = [makeField({ name: "prompt", propType: "str" })];
    const result = p.normalizeAssetUrlFields(fields);
    expect(result[0].name).toBe("prompt");
    expect(result[0].apiParamName).toBeUndefined();
  });

  it("leaves unrelated fields in the array unchanged", () => {
    const fields = [
      makeField({
        name: "image_url",
        propType: "image",
        tsType: "image",
        default: null
      }),
      makeField({ name: "prompt", propType: "str" })
    ];
    const result = p.normalizeAssetUrlFields(fields);
    expect(result[0].name).toBe("image");
    expect(result[1].name).toBe("prompt");
  });
});

// ---------------------------------------------------------------------------
// normalizeImageUrlsFields
// ---------------------------------------------------------------------------

describe("normalizeImageUrlsFields", () => {
  let p: SchemaParser;
  beforeEach(() => {
    p = new SchemaParser();
  });

  function makeField(
    overrides: Partial<FieldDef> & { name: string }
  ): FieldDef {
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

  it("renames image_urls → images and sets list[image] type", () => {
    const fields = [
      makeField({
        name: "image_urls",
        propType: "list[image]",
        tsType: "image[]",
        default: []
      })
    ];
    const result = p.normalizeImageUrlsFields(fields);
    expect(result[0].name).toBe("images");
    expect(result[0].apiParamName).toBe("image_urls");
    expect(result[0].propType).toBe("list[image]");
    expect(result[0].tsType).toBe("image[]");
  });

  it("does not rename video_urls (only handles image_urls)", () => {
    const fields = [
      makeField({
        name: "video_urls",
        propType: "list[video]",
        tsType: "video[]",
        default: []
      })
    ];
    const result = p.normalizeImageUrlsFields(fields);
    expect(result[0].name).toBe("video_urls");
    expect(result[0].apiParamName).toBeUndefined();
  });

  it("does not rename fields that do not end with _urls", () => {
    const fields = [
      makeField({
        name: "image_url",
        propType: "image",
        tsType: "image",
        default: null
      })
    ];
    const result = p.normalizeImageUrlsFields(fields);
    expect(result[0].name).toBe("image_url");
  });

  it("leaves unrelated fields unchanged", () => {
    const fields = [
      makeField({
        name: "image_urls",
        propType: "list[image]",
        tsType: "image[]",
        default: []
      }),
      makeField({ name: "prompt", propType: "str" })
    ];
    const result = p.normalizeImageUrlsFields(fields);
    expect(result[0].name).toBe("images");
    expect(result[1].name).toBe("prompt");
  });
});

// ---------------------------------------------------------------------------
// parse() — edge cases with minimal synthetic schemas
// ---------------------------------------------------------------------------

describe("parse() — synthetic schema edge cases", () => {
  let p: SchemaParser;
  beforeEach(() => {
    p = new SchemaParser();
  });

  function makeMinimalSchema(
    overrides: Record<string, unknown> = {}
  ): Record<string, unknown> {
    return {
      openapi: "3.0.0",
      info: {
        title: "Test",
        version: "1.0.0",
        "x-fal-metadata": { endpointId: "fal-ai/test/model" }
      },
      paths: {
        "/fal-ai/test/model": {
          post: {
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {},
                    required: []
                  }
                }
              }
            }
          },
          get: {
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {}
                    }
                  }
                }
              }
            }
          }
        }
      },
      ...overrides
    };
  }

  it("extracts endpoint ID from path when x-fal-metadata is absent", () => {
    const schema = {
      openapi: "3.0.0",
      info: { title: "Test" },
      paths: {
        "/fal-ai/some/model": {
          post: {
            requestBody: {
              content: {
                "application/json": {
                  schema: { type: "object", properties: {}, required: [] }
                }
              }
            }
          }
        }
      }
    };
    const spec = p.parse(schema);
    expect(spec.endpointId).toBe("fal-ai/some/model");
  });

  it("returns empty string when no paths are present", () => {
    const schema = { openapi: "3.0.0", info: { title: "Test" }, paths: {} };
    const spec = p.parse(schema);
    expect(spec.endpointId).toBe("");
  });

  it("determines video output type from 'video' key", () => {
    const schema = makeMinimalSchema();
    // Inject video property into the response schema
    (
      (schema["paths"] as Record<string, unknown>)[
        "/fal-ai/test/model"
      ] as Record<string, unknown>
    )["get"] = {
      responses: {
        "200": {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { video: { type: "object" } }
              }
            }
          }
        }
      }
    };
    const spec = p.parse(schema);
    expect(spec.outputType).toBe("video");
  });

  it("determines audio output type from 'audio' key", () => {
    const schema = makeMinimalSchema();
    (
      (schema["paths"] as Record<string, unknown>)[
        "/fal-ai/test/model"
      ] as Record<string, unknown>
    )["get"] = {
      responses: {
        "200": {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { audio: { type: "object" } }
              }
            }
          }
        }
      }
    };
    const spec = p.parse(schema);
    expect(spec.outputType).toBe("audio");
  });

  it("determines dict output type for multiple output fields", () => {
    const schema = makeMinimalSchema();
    (
      (schema["paths"] as Record<string, unknown>)[
        "/fal-ai/test/model"
      ] as Record<string, unknown>
    )["get"] = {
      responses: {
        "200": {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  result: { type: "string" },
                  metadata: { type: "object" }
                }
              }
            }
          }
        }
      }
    };
    const spec = p.parse(schema);
    expect(spec.outputType).toBe("dict");
  });

  it("determines image output type from single 'image' key", () => {
    const schema = makeMinimalSchema();
    (
      (schema["paths"] as Record<string, unknown>)[
        "/fal-ai/test/model"
      ] as Record<string, unknown>
    )["get"] = {
      responses: {
        "200": {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { image: { type: "object" } }
              }
            }
          }
        }
      }
    };
    const spec = p.parse(schema);
    expect(spec.outputType).toBe("image");
  });

  it("resolves inline $ref in input schema", () => {
    const schema = {
      openapi: "3.0.0",
      info: {
        "x-fal-metadata": { endpointId: "fal-ai/test" }
      },
      components: {
        schemas: {
          TestInput: {
            type: "object",
            properties: {
              prompt: { type: "string", description: "Text prompt" }
            },
            required: ["prompt"]
          }
        }
      },
      paths: {
        "/fal-ai/test": {
          post: {
            requestBody: {
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/TestInput" }
                }
              }
            }
          }
        }
      }
    };
    const spec = p.parse(schema);
    const promptField = spec.inputFields.find((f) => f.name === "prompt");
    expect(promptField).toBeDefined();
    expect(promptField?.required).toBe(true);
    expect(promptField?.propType).toBe("str");
  });

  it("resolves allOf in input schema by merging properties", () => {
    const schema = {
      openapi: "3.0.0",
      info: { "x-fal-metadata": { endpointId: "fal-ai/test" } },
      components: {
        schemas: {
          Base: {
            type: "object",
            properties: { seed: { type: "integer", default: -1 } },
            required: []
          },
          Extra: {
            type: "object",
            properties: { prompt: { type: "string" } },
            required: ["prompt"]
          }
        }
      },
      paths: {
        "/fal-ai/test": {
          post: {
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    allOf: [
                      { $ref: "#/components/schemas/Base" },
                      { $ref: "#/components/schemas/Extra" }
                    ]
                  }
                }
              }
            }
          }
        }
      }
    };
    const spec = p.parse(schema);
    expect(spec.inputFields.find((f) => f.name === "seed")).toBeDefined();
    expect(spec.inputFields.find((f) => f.name === "prompt")).toBeDefined();
  });

  it("normalizes image_url fields during parse", () => {
    const schema = makeMinimalSchema();
    (
      (
        (schema["paths"] as Record<string, unknown>)[
          "/fal-ai/test/model"
        ] as Record<string, unknown>
      )["post"] as Record<string, unknown>
    )["requestBody"] = {
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              image_url: { type: "string", description: "Input image URL" }
            },
            required: []
          }
        }
      }
    };
    const spec = p.parse(schema);
    // Should be renamed from image_url → image
    const imageField = spec.inputFields.find((f) => f.name === "image");
    expect(imageField).toBeDefined();
    expect(imageField?.apiParamName).toBe("image_url");
    expect(imageField?.propType).toBe("image");
  });

  it("generates default -1 for seed-named integer fields", () => {
    const schema = makeMinimalSchema();
    (
      (
        (schema["paths"] as Record<string, unknown>)[
          "/fal-ai/test/model"
        ] as Record<string, unknown>
      )["post"] as Record<string, unknown>
    )["requestBody"] = {
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              seed: {
                type: "integer",
                description: "Random seed for reproducibility"
              }
            },
            required: []
          }
        }
      }
    };
    const spec = p.parse(schema);
    const seedField = spec.inputFields.find((f) => f.name === "seed");
    expect(seedField).toBeDefined();
    expect(seedField?.default).toBe(-1);
  });

  it("skips queue-status paths when finding the output schema", () => {
    const schema = {
      openapi: "3.0.0",
      info: { "x-fal-metadata": { endpointId: "fal-ai/test" } },
      paths: {
        "/fal-ai/test/requests/{request_id}": {
          get: {
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        images: { type: "array", items: { type: "object" } }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "/fal-ai/test/requests/{request_id}/status": {
          get: {
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      title: "QueueStatus",
                      properties: {
                        status: { type: "string" },
                        request_id: { type: "string" }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    };
    const spec = p.parse(schema);
    expect(spec.outputType).toBe("image");
  });
});
