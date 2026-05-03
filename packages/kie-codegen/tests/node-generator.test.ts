import { describe, it, expect } from "vitest";
import { KieNodeGenerator } from "../src/node-generator.js";
import type { NodeConfig, ModuleConfig, FieldDef } from "../src/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeField(overrides: Partial<FieldDef> & { name: string }): FieldDef {
  return {
    type: "str",
    default: "",
    ...overrides
  };
}

function makeNode(overrides: Partial<NodeConfig> = {}): NodeConfig {
  return {
    className: "TestModel",
    modelId: "test-model-v1",
    title: "Test Model",
    description: "A test model.",
    outputType: "image",
    fields: [makeField({ name: "prompt" })],
    ...overrides
  };
}

function makeModule(overrides: Partial<ModuleConfig> = {}): ModuleConfig {
  return {
    moduleName: "image",
    nodes: [makeNode()],
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// generateModule() — full module
// ---------------------------------------------------------------------------

describe("KieNodeGenerator.generateModule()", () => {
  const gen = new KieNodeGenerator();

  it("generates imports with BaseNode and prop", () => {
    const code = gen.generateModule(makeModule());
    expect(code).toContain(
      'import { BaseNode, prop } from "@nodetool-ai/node-sdk"'
    );
  });

  it("generates imports from kie-base", () => {
    const code = gen.generateModule(makeModule());
    expect(code).toContain("getApiKey");
    expect(code).toContain("kieExecuteTask");
    expect(code).toContain("isRefSet");
  });

  it("includes kieExecuteSunoTask import when useSuno is set", () => {
    const code = gen.generateModule(
      makeModule({
        nodes: [makeNode({ useSuno: true })]
      })
    );
    expect(code).toContain("kieExecuteSunoTask");
  });

  it("does not include kieExecuteSunoTask import when not needed", () => {
    const code = gen.generateModule(makeModule());
    expect(code).not.toContain("kieExecuteSunoTask");
  });

  it("includes uploadImageInput when image uploads are configured", () => {
    const code = gen.generateModule(
      makeModule({
        nodes: [
          makeNode({
            fields: [makeField({ name: "image", type: "image" })],
            uploads: [{ field: "image", kind: "image" }]
          })
        ]
      })
    );
    expect(code).toContain("uploadImageInput");
  });

  it("includes uploadAudioInput when audio uploads are configured", () => {
    const code = gen.generateModule(
      makeModule({
        nodes: [
          makeNode({
            fields: [makeField({ name: "audio", type: "audio" })],
            uploads: [{ field: "audio", kind: "audio" }]
          })
        ]
      })
    );
    expect(code).toContain("uploadAudioInput");
  });

  it("includes uploadVideoInput when video uploads are configured", () => {
    const code = gen.generateModule(
      makeModule({
        nodes: [
          makeNode({
            fields: [makeField({ name: "video", type: "video" })],
            uploads: [{ field: "video", kind: "video" }]
          })
        ]
      })
    );
    expect(code).toContain("uploadVideoInput");
  });

  it("generates export array with correct module name", () => {
    const code = gen.generateModule(makeModule());
    expect(code).toContain(
      "export const KIE_IMAGE_NODES: readonly NodeClass[]"
    );
    expect(code).toContain("TestModelNode,");
  });

  it("converts dashes to underscores in export array name", () => {
    const code = gen.generateModule(
      makeModule({ moduleName: "text-to-image" })
    );
    expect(code).toContain("KIE_TEXT_TO_IMAGE_NODES");
  });

  it("generates multiple node classes", () => {
    const code = gen.generateModule(
      makeModule({
        nodes: [
          makeNode({ className: "ModelA" }),
          makeNode({ className: "ModelB" })
        ]
      })
    );
    expect(code).toContain("class ModelANode");
    expect(code).toContain("class ModelBNode");
    expect(code).toContain("ModelANode,");
    expect(code).toContain("ModelBNode,");
  });
});

// ---------------------------------------------------------------------------
// Class generation
// ---------------------------------------------------------------------------

describe("Class structure", () => {
  const gen = new KieNodeGenerator();

  it("generates correct nodeType", () => {
    const code = gen.generateModule(makeModule());
    expect(code).toContain('static readonly nodeType = "kie.image.TestModel"');
  });

  it("generates correct title", () => {
    const code = gen.generateModule(
      makeModule({
        nodes: [makeNode({ title: "My Custom Title" })]
      })
    );
    expect(code).toContain('static readonly title = "My Custom Title"');
  });

  it("auto-generates title from className when not provided", () => {
    const code = gen.generateModule(
      makeModule({
        nodes: [makeNode({ className: "FluxProDev", title: "" })]
      })
    );
    // toTitle("FluxProDev") => "Flux Pro Dev"
    // But title is empty string, so it will use the empty string
    // Actually looking at the code: node.title || toTitle(node.className)
    // Empty string is falsy, so it falls back to toTitle
    expect(code).toContain('static readonly title = "Flux Pro Dev"');
  });

  it("generates description", () => {
    const code = gen.generateModule(
      makeModule({
        nodes: [makeNode({ description: "Generate an image" })]
      })
    );
    expect(code).toContain("Generate an image");
  });

  it("escapes backticks in description", () => {
    const code = gen.generateModule(
      makeModule({
        nodes: [makeNode({ description: "Use `this` model" })]
      })
    );
    expect(code).toContain("Use 'this' model");
  });

  it("generates metadataOutputTypes", () => {
    const code = gen.generateModule(
      makeModule({
        nodes: [makeNode({ outputType: "audio" })]
      })
    );
    expect(code).toContain(
      'static readonly metadataOutputTypes = { output: "audio" }'
    );
  });

  it("generates requiredSettings with KIE_API_KEY", () => {
    const code = gen.generateModule(makeModule());
    expect(code).toContain(
      'static readonly requiredSettings = ["KIE_API_KEY"]'
    );
  });

  it("generates exposeAsTool = true", () => {
    const code = gen.generateModule(makeModule());
    expect(code).toContain("static readonly exposeAsTool = true");
  });

  it("extends BaseNode", () => {
    const code = gen.generateModule(makeModule());
    expect(code).toContain("extends BaseNode");
  });
});

// ---------------------------------------------------------------------------
// @prop decorators
// ---------------------------------------------------------------------------

describe("@prop decorators", () => {
  const gen = new KieNodeGenerator();

  it("generates @prop for str field", () => {
    const code = gen.generateModule(
      makeModule({
        nodes: [
          makeNode({
            fields: [
              makeField({ name: "prompt", type: "str", default: "hello" })
            ]
          })
        ]
      })
    );
    expect(code).toContain('@prop({ type: "str", default: "hello" })');
  });

  it("generates @prop for int field", () => {
    const code = gen.generateModule(
      makeModule({
        nodes: [
          makeNode({
            fields: [makeField({ name: "width", type: "int", default: 512 })]
          })
        ]
      })
    );
    expect(code).toContain('@prop({ type: "int", default: 512 })');
  });

  it("generates @prop for float field", () => {
    const code = gen.generateModule(
      makeModule({
        nodes: [
          makeNode({
            fields: [
              makeField({ name: "strength", type: "float", default: 0.5 })
            ]
          })
        ]
      })
    );
    expect(code).toContain('@prop({ type: "float", default: 0.5 })');
  });

  it("generates @prop for bool field", () => {
    const code = gen.generateModule(
      makeModule({
        nodes: [
          makeNode({
            fields: [makeField({ name: "enable", type: "bool", default: true })]
          })
        ]
      })
    );
    expect(code).toContain('@prop({ type: "bool", default: true })');
  });

  it("generates default false for bool with undefined default", () => {
    const code = gen.generateModule(
      makeModule({
        nodes: [
          makeNode({
            fields: [{ name: "enable", type: "bool" }]
          })
        ]
      })
    );
    // When default is undefined, _renderProp uses the else branch: type === "bool" ? "false" : '""'
    expect(code).toContain("default: false");
  });

  it("generates default empty string for str with no default", () => {
    const code = gen.generateModule(
      makeModule({
        nodes: [
          makeNode({
            fields: [{ name: "text", type: "str" }]
          })
        ]
      })
    );
    expect(code).toContain('@prop({ type: "str", default: "" })');
  });

  it("generates enum values", () => {
    const code = gen.generateModule(
      makeModule({
        nodes: [
          makeNode({
            fields: [
              makeField({
                name: "style",
                type: "enum",
                values: ["photo", "art", "sketch"]
              })
            ]
          })
        ]
      })
    );
    expect(code).toContain('values: ["photo","art","sketch"]');
  });

  it("generates title in @prop", () => {
    const code = gen.generateModule(
      makeModule({
        nodes: [
          makeNode({
            fields: [makeField({ name: "prompt", title: "Text Prompt" })]
          })
        ]
      })
    );
    expect(code).toContain('title: "Text Prompt"');
  });

  it("generates description in @prop", () => {
    const code = gen.generateModule(
      makeModule({
        nodes: [
          makeNode({
            fields: [
              makeField({
                name: "prompt",
                description: "Enter your prompt here"
              })
            ]
          })
        ]
      })
    );
    expect(code).toContain('description: "Enter your prompt here"');
  });

  it("generates min and max in @prop", () => {
    const code = gen.generateModule(
      makeModule({
        nodes: [
          makeNode({
            fields: [
              makeField({ name: "steps", type: "int", min: 1, max: 100 })
            ]
          })
        ]
      })
    );
    expect(code).toContain("min: 1");
    expect(code).toContain("max: 100");
  });

  it("generates declare for each field", () => {
    const code = gen.generateModule(
      makeModule({
        nodes: [
          makeNode({
            fields: [
              makeField({ name: "prompt" }),
              makeField({ name: "width", type: "int" })
            ]
          })
        ]
      })
    );
    expect(code).toContain("declare prompt: any;");
    expect(code).toContain("declare width: any;");
  });
});

// ---------------------------------------------------------------------------
// process() method
// ---------------------------------------------------------------------------

describe("process() method", () => {
  const gen = new KieNodeGenerator();

  it("calls getApiKey", () => {
    const code = gen.generateModule(makeModule());
    expect(code).toContain("const apiKey = getApiKey(this._secrets)");
  });

  it("builds params object", () => {
    const code = gen.generateModule(makeModule());
    expect(code).toContain("const params: Record<string, unknown> = {}");
  });

  it("casts str fields with String()", () => {
    const code = gen.generateModule(
      makeModule({
        nodes: [
          makeNode({
            fields: [makeField({ name: "prompt", type: "str" })]
          })
        ]
      })
    );
    expect(code).toContain('params["prompt"] = String(this.prompt');
  });

  it("casts int fields with Number()", () => {
    const code = gen.generateModule(
      makeModule({
        nodes: [
          makeNode({
            fields: [makeField({ name: "width", type: "int", default: 512 })]
          })
        ]
      })
    );
    expect(code).toContain('params["width"] = Number(this.width');
  });

  it("casts float fields with Number()", () => {
    const code = gen.generateModule(
      makeModule({
        nodes: [
          makeNode({
            fields: [
              makeField({ name: "strength", type: "float", default: 0.5 })
            ]
          })
        ]
      })
    );
    expect(code).toContain('params["strength"] = Number(this.strength');
  });

  it("casts bool fields with Boolean()", () => {
    const code = gen.generateModule(
      makeModule({
        nodes: [
          makeNode({
            fields: [makeField({ name: "enable", type: "bool" })]
          })
        ]
      })
    );
    expect(code).toContain('params["enable"] = Boolean(this.enable');
  });

  it("calls kieExecuteTask for standard nodes", () => {
    const code = gen.generateModule(
      makeModule({
        nodes: [makeNode({ modelId: "my-model-v1" })]
      })
    );
    expect(code).toContain('kieExecuteTask(apiKey, "my-model-v1"');
  });

  it("calls kieExecuteSunoTask for Suno nodes", () => {
    const code = gen.generateModule(
      makeModule({
        nodes: [makeNode({ useSuno: true })]
      })
    );
    expect(code).toContain("kieExecuteSunoTask(apiKey, params");
  });

  it("returns output with correct type", () => {
    const code = gen.generateModule(
      makeModule({
        nodes: [makeNode({ outputType: "audio" })]
      })
    );
    expect(code).toContain(
      'return { output: { type: "audio", data: result.data } }'
    );
  });

  it("uses pollInterval and maxAttempts from node config", () => {
    const code = gen.generateModule(
      makeModule({
        nodes: [makeNode({ pollInterval: 5000, maxAttempts: 100 })]
      })
    );
    expect(code).toContain("5000, 100)");
  });

  it("falls back to module defaults for poll config", () => {
    const code = gen.generateModule(
      makeModule({
        defaultPollInterval: 3000,
        defaultMaxAttempts: 150,
        nodes: [makeNode()]
      })
    );
    expect(code).toContain("3000, 150)");
  });

  it("falls back to hardcoded defaults (2000, 300)", () => {
    const code = gen.generateModule(makeModule());
    expect(code).toContain("2000, 300)");
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe("Validation rules", () => {
  const gen = new KieNodeGenerator();

  it("generates not_empty validation", () => {
    const code = gen.generateModule(
      makeModule({
        nodes: [
          makeNode({
            validation: [{ field: "prompt", rule: "not_empty" }]
          })
        ]
      })
    );
    expect(code).toContain("if (!String(this.prompt");
    expect(code).toContain("throw new Error");
  });

  it("uses custom validation message", () => {
    const code = gen.generateModule(
      makeModule({
        nodes: [
          makeNode({
            validation: [
              {
                field: "prompt",
                rule: "not_empty",
                message: "Prompt required!"
              }
            ]
          })
        ]
      })
    );
    expect(code).toContain("Prompt required!");
  });

  it("uses default validation message when none provided", () => {
    const code = gen.generateModule(
      makeModule({
        nodes: [
          makeNode({
            validation: [{ field: "prompt", rule: "not_empty" }]
          })
        ]
      })
    );
    expect(code).toContain("prompt cannot be empty");
  });
});

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

describe("Upload handling", () => {
  const gen = new KieNodeGenerator();

  it("generates single image upload", () => {
    const code = gen.generateModule(
      makeModule({
        nodes: [
          makeNode({
            fields: [makeField({ name: "image", type: "image" })],
            uploads: [{ field: "image", kind: "image" }]
          })
        ]
      })
    );
    expect(code).toContain("uploadImageInput(apiKey, this.image)");
    expect(code).toContain("imageUrl");
  });

  it("generates single audio upload", () => {
    const code = gen.generateModule(
      makeModule({
        nodes: [
          makeNode({
            fields: [makeField({ name: "audio_file", type: "audio" })],
            uploads: [{ field: "audio_file", kind: "audio" }]
          })
        ]
      })
    );
    expect(code).toContain("uploadAudioInput(apiKey, this.audio_file)");
  });

  it("generates list upload", () => {
    const code = gen.generateModule(
      makeModule({
        nodes: [
          makeNode({
            fields: [makeField({ name: "images", type: "list[image]" })],
            uploads: [{ field: "images", kind: "image", isList: true }]
          })
        ]
      })
    );
    expect(code).toContain("for (const item of");
    expect(code).toContain("imagesUrls");
  });

  it("generates grouped uploads into array param", () => {
    const code = gen.generateModule(
      makeModule({
        nodes: [
          makeNode({
            fields: [
              makeField({ name: "img1", type: "image" }),
              makeField({ name: "img2", type: "image" })
            ],
            uploads: [
              {
                field: "img1",
                kind: "image",
                groupKey: "images",
                paramName: "image_urls"
              },
              {
                field: "img2",
                kind: "image",
                groupKey: "images",
                paramName: "image_urls"
              }
            ]
          })
        ]
      })
    );
    expect(code).toContain("imageUrls: string[]");
    expect(code).toContain("this.img1");
    expect(code).toContain("this.img2");
  });

  it("uses custom paramName for upload", () => {
    const code = gen.generateModule(
      makeModule({
        nodes: [
          makeNode({
            fields: [makeField({ name: "photo", type: "image" })],
            uploads: [
              { field: "photo", kind: "image", paramName: "input_image" }
            ]
          })
        ]
      })
    );
    expect(code).toContain('"input_image"');
  });
});

// ---------------------------------------------------------------------------
// Conditional fields
// ---------------------------------------------------------------------------

describe("Conditional fields", () => {
  const gen = new KieNodeGenerator();

  it("generates gte_zero condition", () => {
    const code = gen.generateModule(
      makeModule({
        nodes: [
          makeNode({
            fields: [makeField({ name: "seed", type: "int", default: -1 })],
            conditionalFields: [{ field: "seed", condition: "gte_zero" }]
          })
        ]
      })
    );
    expect(code).toContain(">= 0");
    expect(code).toContain('params["seed"]');
  });

  it("generates truthy condition", () => {
    const code = gen.generateModule(
      makeModule({
        nodes: [
          makeNode({
            fields: [makeField({ name: "style", type: "str" })],
            conditionalFields: [{ field: "style", condition: "truthy" }]
          })
        ]
      })
    );
    expect(code).toContain("if (this.style)");
  });
});

// ---------------------------------------------------------------------------
// Parameter name mapping
// ---------------------------------------------------------------------------

describe("Parameter name mapping", () => {
  const gen = new KieNodeGenerator();

  it("uses paramNames to map field to API param", () => {
    const code = gen.generateModule(
      makeModule({
        nodes: [
          makeNode({
            fields: [
              makeField({ name: "num_steps", type: "int", default: 20 })
            ],
            paramNames: { num_steps: "steps" }
          })
        ]
      })
    );
    expect(code).toContain('params["steps"]');
    expect(code).not.toContain('params["num_steps"]');
  });
});

// ---------------------------------------------------------------------------
// Field variable name handling
// ---------------------------------------------------------------------------

describe("Reserved field names", () => {
  const gen = new KieNodeGenerator();

  it("skips asset-type fields in params (handled by uploads)", () => {
    const code = gen.generateModule(
      makeModule({
        nodes: [
          makeNode({
            fields: [
              makeField({ name: "prompt", type: "str" }),
              makeField({ name: "image", type: "image" })
            ],
            uploads: [{ field: "image", kind: "image" }]
          })
        ]
      })
    );
    // image should not appear in params assignment (only in upload logic)
    expect(code).toContain('params["prompt"]');
    // The image field should not have a params assignment
    const paramsLines = code
      .split("\n")
      .filter((l) => l.includes('params["image"]'));
    // Only the upload conditional should reference params["image_url"]
    expect(paramsLines.length).toBe(0);
  });
});
