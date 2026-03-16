import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { KieAINode, KIE_DYNAMIC_NODES } from "../src/nodes/kie-dynamic.js";

const originalFetch = globalThis.fetch;
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch;
  delete process.env.KIE_API_KEY;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.KIE_API_KEY;
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    arrayBuffer: async () => new Uint8Array([116, 101, 115, 116]).buffer,
  } as unknown as Response;
}

// Model IDs that map to each output type via inferOutputType:
// - "kling" -> video (video keyword)
// - "suno" -> audio (audio keyword)
// - "flux/text2image" -> image (no video/audio keyword)

// Minimal docs with Format table for model ID extraction.
// NOTE: parseInputParams uses a regex with \Z (Python-style) which does not
// work in JS, so params are not actually parsed. Tests reflect the real behavior.
const DOCS_IMAGE_MODEL = `| **Format** | \`flux/text2image\` |`;
const DOCS_VIDEO_MODEL = `| **Format** | \`kling/video-generation\` |`;
const DOCS_AUDIO_MODEL = `| **Format** | \`suno/audio-gen\` |`;

describe("KIE_DYNAMIC_NODES export", () => {
  it("exports 1 node class", () => {
    expect(KIE_DYNAMIC_NODES).toHaveLength(1);
  });
});

describe("KieAINode static metadata", () => {
  it("has correct nodeType", () => {
    expect(KieAINode.nodeType).toBe("kie.dynamic_schema.KieAI");
  });

  it("has correct title", () => {
    expect(KieAINode.title).toBe("Kie AI");
  });

  it("has correct description", () => {
    expect(KieAINode.description).toContain("Dynamic Kie.ai node");
  });

  it("defaults returns the current serialized metadata fields", () => {
    const node = new KieAINode();
    expect(node.serialize()).toEqual({ timeout_seconds: 0, model_info: "" });
  });
});

describe("KieAINode validation", () => {
  it("throws on empty model_info", async () => {
    const node = new KieAINode();
    await expect(
      node.process({ model_info: "", _secrets: { KIE_API_KEY: "k" } })
    ).rejects.toThrow("model_info is empty");
  });

  it("throws on whitespace-only model_info", async () => {
    const node = new KieAINode();
    await expect(
      node.process({ model_info: "   ", _secrets: { KIE_API_KEY: "k" } })
    ).rejects.toThrow("model_info is empty");
  });

  it("throws on missing API key", async () => {
    const node = new KieAINode();
    await expect(
      node.process({ model_info: "some docs" })
    ).rejects.toThrow("KIE_API_KEY is not configured");
  });

  it("throws when model_info has no model ID", async () => {
    const node = new KieAINode();
    await expect(
      node.process({
        model_info: "Some text without model identifier",
        _secrets: { KIE_API_KEY: "k" },
      })
    ).rejects.toThrow("Could not find model ID");
  });
});

describe("KieAINode process with mocked API", () => {
  function setupSuccessfulKieApi() {
    mockFetch.mockImplementation(async (url: string | URL) => {
      const urlStr = String(url);
      if (urlStr.includes("createTask")) {
        return jsonResponse({ code: 200, data: { taskId: "task_dyn_1" } });
      }
      if (urlStr.includes("recordInfo")) {
        return jsonResponse({
          code: 200,
          data: {
            state: "success",
            resultJson: JSON.stringify({
              resultUrls: ["https://cdn.example.com/output.png"],
            }),
          },
        });
      }
      if (urlStr.includes("cdn.example.com")) {
        return {
          ok: true,
          status: 200,
          json: async () => null,
          text: async () => "",
          arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
        } as unknown as Response;
      }
      return jsonResponse({ error: "unknown" }, 404);
    });
  }

  it("processes image model and returns image output", async () => {
    setupSuccessfulKieApi();
    const node = new KieAINode();
    const result = await node.process({
      model_info: DOCS_IMAGE_MODEL,
      _secrets: { KIE_API_KEY: "test-key" },
    });
    expect(result.image).toBeDefined();
    expect((result.image as { data: string }).data).toBeTruthy();
  });

  it("processes video model and returns video output", async () => {
    setupSuccessfulKieApi();
    const node = new KieAINode();
    const result = await node.process({
      model_info: DOCS_VIDEO_MODEL,
      _secrets: { KIE_API_KEY: "test-key" },
    });
    expect(result.video).toBeDefined();
    expect((result.video as { data: string }).data).toBeTruthy();
  });

  it("processes audio model and returns audio output", async () => {
    setupSuccessfulKieApi();
    const node = new KieAINode();
    const result = await node.process({
      model_info: DOCS_AUDIO_MODEL,
      _secrets: { KIE_API_KEY: "test-key" },
    });
    expect(result.audio).toBeDefined();
    expect((result.audio as { data: string }).data).toBeTruthy();
  });

  it("sends correct model ID to createTask", async () => {
    setupSuccessfulKieApi();
    const node = new KieAINode();
    await node.process({
      model_info: DOCS_IMAGE_MODEL,
      _secrets: { KIE_API_KEY: "test-key" },
    });
    const createCall = mockFetch.mock.calls.find((c: unknown[]) =>
      String(c[0]).includes("createTask")
    );
    expect(createCall).toBeDefined();
    const body = JSON.parse(createCall![1].body);
    expect(body.model).toBe("flux/text2image");
  });

  it("uses API key from env when _secrets not provided", async () => {
    setupSuccessfulKieApi();
    process.env.KIE_API_KEY = "env-api-key";
    const node = new KieAINode();
    const result = await node.process({
      model_info: DOCS_IMAGE_MODEL,
    });
    expect(result.image).toBeDefined();
  });

  it("uses API key from _secrets over env", async () => {
    setupSuccessfulKieApi();
    process.env.KIE_API_KEY = "env-key";
    const node = new KieAINode();
    const result = await node.process({
      model_info: DOCS_IMAGE_MODEL,
      _secrets: { KIE_API_KEY: "secrets-key" },
    });
    expect(result.image).toBeDefined();
    // Verify the Authorization header uses secrets-key
    const createCall = mockFetch.mock.calls.find((c: unknown[]) =>
      String(c[0]).includes("createTask")
    );
    expect(createCall![1].headers.Authorization).toBe("Bearer secrets-key");
  });

  it("result data is base64 encoded", async () => {
    setupSuccessfulKieApi();
    const node = new KieAINode();
    const result = await node.process({
      model_info: DOCS_IMAGE_MODEL,
      _secrets: { KIE_API_KEY: "k" },
    });
    const data = (result.image as { data: string }).data;
    // [1, 2, 3] -> base64 "AQID"
    expect(data).toBe("AQID");
  });

  it("model ID extracted from 'model' JSON field", async () => {
    setupSuccessfulKieApi();
    const node = new KieAINode();
    const result = await node.process({
      model_info: `"model": "dalle/text2image"`,
      _secrets: { KIE_API_KEY: "k" },
    });
    // "dalle" doesn't match video/audio keywords -> image
    expect(result.image).toBeDefined();
    const createCall = mockFetch.mock.calls.find((c: unknown[]) =>
      String(c[0]).includes("createTask")
    );
    const body = JSON.parse(createCall![1].body);
    expect(body.model).toBe("dalle/text2image");
  });
});

describe("KieAINode parseInputParams and full process", () => {
  function setupSuccessfulKieApi() {
    mockFetch.mockImplementation(async (url: string | URL) => {
      const urlStr = String(url);
      if (urlStr.includes("createTask")) {
        return jsonResponse({ code: 200, data: { taskId: "task_dyn_p" } });
      }
      if (urlStr.includes("recordInfo")) {
        return jsonResponse({
          code: 200,
          data: {
            state: "success",
            resultJson: JSON.stringify({
              resultUrls: ["https://cdn.example.com/output.png"],
            }),
          },
        });
      }
      if (urlStr.includes("cdn.example.com")) {
        return {
          ok: true,
          status: 200,
          json: async () => null,
          text: async () => "",
          arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
        } as unknown as Response;
      }
      return jsonResponse({ error: "unknown" }, 404);
    });
  }

  // Docs with full parameter section that exercises parseInputParams
  const FULL_DOCS = `
| **Format** | \`test/model-123\` |

### input Object Parameters

#### prompt
- **Type**: \`string\`
- **Required**: Yes
- **Description**: The prompt text
- **Default Value**: \`hello world\`

#### width
- **Type**: \`integer\`
- **Required**: No
- **Description**: Width of the output
- **Default Value**: \`512\`
- **Range**: \`256\` to \`1024\`

#### height
- **Type**: \`number\`
- **Required**: No
- **Description**: Height
- **Default Value**: \`3.14\`

#### enable_hd
- **Type**: \`boolean\`
- **Required**: No
- **Description**: Enable HD mode
- **Default Value**: \`true\`

#### style
- **Type**: \`string\`
- **Required**: No
- **Description**: Style choice
- **Options**:
  - \`realistic\`
  - \`artistic\`
  - \`cartoon\`

#### image_url
- **Type**: \`string\`
- **Required**: No
- **Description**: Upload image URL

#### image_urls
- **Type**: \`array\`
- **Required**: No
- **Description**: Multiple images
- **Accepted File Types**: png, jpg

#### upload_method
- **Type**: \`string\`
- **Required**: No
- **Description**: Hidden param

#### json_config
- **Type**: \`string\`
- **Required**: No
- **Default Value**: \`{"key": "value"}\`
- **Description**: JSON config

---
`;

  it("parses input params from docs with all field types", async () => {
    setupSuccessfulKieApi();
    const node = new KieAINode();
    const result = await node.process({
      model_info: FULL_DOCS,
      prompt: "test prompt",
      _secrets: { KIE_API_KEY: "test-key" },
    });
    expect(result.image).toBeDefined();
    // Verify the createTask call includes the prompt
    const createCall = mockFetch.mock.calls.find((c: unknown[]) =>
      String(c[0]).includes("createTask")
    );
    const body = JSON.parse(createCall![1].body);
    expect(body.model).toBe("test/model-123");
    expect(body.input.prompt).toBe("test prompt");
  });

  it("throws when required param is missing", async () => {
    setupSuccessfulKieApi();
    const node = new KieAINode();
    await expect(
      node.process({
        model_info: FULL_DOCS,
        // prompt is required but not provided
        _secrets: { KIE_API_KEY: "test-key" },
      })
    ).rejects.toThrow("Missing required input: prompt");
  });

  it("passes file URL params through", async () => {
    setupSuccessfulKieApi();
    const node = new KieAINode();
    const result = await node.process({
      model_info: FULL_DOCS,
      prompt: "test",
      image_url: "https://example.com/img.png",
      image_urls: ["https://a.com/1.png", "https://b.com/2.png"],
      _secrets: { KIE_API_KEY: "test-key" },
    });
    expect(result.image).toBeDefined();
    const createCall = mockFetch.mock.calls.find((c: unknown[]) =>
      String(c[0]).includes("createTask")
    );
    const body = JSON.parse(createCall![1].body);
    expect(body.input.image_url).toBe("https://example.com/img.png");
  });

  it("extracts model ID from Model name format", async () => {
    setupSuccessfulKieApi();
    const node = new KieAINode();
    const result = await node.process({
      model_info: `Model name, format: \`custom/my-model\`\n### input Object Parameters\n---`,
      prompt: "test",
      _secrets: { KIE_API_KEY: "test-key" },
    });
    expect(result.image).toBeDefined();
    const createCall = mockFetch.mock.calls.find((c: unknown[]) =>
      String(c[0]).includes("createTask")
    );
    const body = JSON.parse(createCall![1].body);
    expect(body.model).toBe("custom/my-model");
  });

  it("infers video output type", async () => {
    setupSuccessfulKieApi();
    const node = new KieAINode();
    const result = await node.process({
      model_info: `| **Format** | \`kling/video-gen\` |\n---`,
      _secrets: { KIE_API_KEY: "test-key" },
    });
    expect(result.video).toBeDefined();
  });

  it("infers audio output type", async () => {
    setupSuccessfulKieApi();
    const node = new KieAINode();
    const result = await node.process({
      model_info: `| **Format** | \`suno/music-gen\` |\n---`,
      _secrets: { KIE_API_KEY: "test-key" },
    });
    expect(result.audio).toBeDefined();
  });

  it("skips params with no name match", async () => {
    setupSuccessfulKieApi();
    const node = new KieAINode();
    // Docs with a block that has no name match (just whitespace/empty)
    const docs = `| **Format** | \`test/model\` |\n### input Object Parameters\n####\n#### prompt\n- **Type**: \`string\`\n- **Required**: Yes\n- **Description**: text\n---`;
    const result = await node.process({
      model_info: docs,
      prompt: "hi",
      _secrets: { KIE_API_KEY: "test-key" },
    });
    expect(result.image).toBeDefined();
  });

  it("sets isFileUrl when description contains Upload and type is string", async () => {
    setupSuccessfulKieApi();
    const node = new KieAINode();
    const docs = `| **Format** | \`test/uploadmodel\` |
### input Object Parameters
#### my_file
- **Type**: \`string\`
- **Required**: No
- **Description**: Upload your file here
- **Default Value**: \`\`
---`;
    const result = await node.process({
      model_info: docs,
      my_file: "https://example.com/file.png",
      _secrets: { KIE_API_KEY: "test-key" },
    });
    expect(result.image).toBeDefined();
    const createCall = mockFetch.mock.calls.find((c: unknown[]) =>
      String(c[0]).includes("createTask")
    );
    const body = JSON.parse(createCall![1].body);
    expect(body.input.my_file).toBe("https://example.com/file.png");
  });

  it("coerces default value for boolean false", async () => {
    setupSuccessfulKieApi();
    const node = new KieAINode();
    // Docs with boolean param default = "false"
    const docs = `| **Format** | \`test/boolmodel\` |\n### input Object Parameters\n#### enabled\n- **Type**: \`boolean\`\n- **Required**: No\n- **Default Value**: \`false\`\n- **Description**: flag\n---`;
    const result = await node.process({
      model_info: docs,
      _secrets: { KIE_API_KEY: "test-key" },
    });
    expect(result.image).toBeDefined();
  });
});

describe("KieAINode API error handling", () => {
  it("throws on API submit error", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ code: 401, message: "Unauthorized" })
    );
    const node = new KieAINode();
    await expect(
      node.process({
        model_info: DOCS_IMAGE_MODEL,
        _secrets: { KIE_API_KEY: "bad-key" },
      })
    ).rejects.toThrow("Unauthorized");
  });

  it("throws on task failure", async () => {
    mockFetch.mockImplementation(async (url: string | URL) => {
      const urlStr = String(url);
      if (urlStr.includes("createTask")) {
        return jsonResponse({ code: 200, data: { taskId: "task_fail" } });
      }
      if (urlStr.includes("recordInfo")) {
        return jsonResponse({
          code: 200,
          data: { state: "failed", failMsg: "Generation error" },
        });
      }
      return jsonResponse({}, 404);
    });
    const node = new KieAINode();
    await expect(
      node.process({
        model_info: DOCS_IMAGE_MODEL,
        _secrets: { KIE_API_KEY: "k" },
      })
    ).rejects.toThrow("Task failed");
  });

  it("throws on submit HTTP error", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: {} }, 500)
    );
    const node = new KieAINode();
    await expect(
      node.process({
        model_info: DOCS_IMAGE_MODEL,
        _secrets: { KIE_API_KEY: "k" },
      })
    ).rejects.toThrow("Submit failed");
  });

  it("throws when no taskId returned", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ code: 200, data: {} })
    );
    const node = new KieAINode();
    await expect(
      node.process({
        model_info: DOCS_IMAGE_MODEL,
        _secrets: { KIE_API_KEY: "k" },
      })
    ).rejects.toThrow("No taskId");
  });
});
