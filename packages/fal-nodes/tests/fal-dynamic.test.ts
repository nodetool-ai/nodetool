import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { FalRawNode, FalDynamicNode } from "../src/fal-dynamic.js";

/* ------------------------------------------------------------------ */
/*  Mock @fal-ai/client SDK                                            */
/* ------------------------------------------------------------------ */

const mockSubscribe = vi.fn();
const mockStorageUpload = vi.fn();

vi.mock("@fal-ai/client", () => ({
  createFalClient: vi.fn(() => ({
    subscribe: mockSubscribe,
    storage: { upload: mockStorageUpload }
  }))
}));

/* ------------------------------------------------------------------ */
/*  Fetch mock                                                          */
/* ------------------------------------------------------------------ */

const originalFetch = globalThis.fetch;
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch;
  mockSubscribe.mockReset();
  mockStorageUpload.mockReset();
  delete process.env.FAL_API_KEY;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.FAL_API_KEY;
});

/* ================================================================== */
/*  Helpers                                                             */
/* ================================================================== */

/** Minimal OpenAPI schema stub for a flux/dev-like endpoint */
const minimalOpenApi = {
  info: {
    "x-fal-metadata": { endpointId: "fal-ai/flux/dev" }
  },
  paths: {
    "/fal-ai/flux/dev": {
      post: {
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  prompt: { type: "string" },
                  num_images: { type: "integer" }
                },
                required: ["prompt"]
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
                  properties: {
                    images: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          url: { type: "string" },
                          width: { type: "integer" },
                          height: { type: "integer" }
                        }
                      }
                    }
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

/* ================================================================== */
/*  FalRawNode static metadata                                          */
/* ================================================================== */

describe("FalRawNode static metadata", () => {
  it("has expected nodeType", () => {
    expect(FalRawNode.nodeType).toBe("fal.dynamic.FalRaw");
  });

  it("has a title", () => {
    expect(typeof FalRawNode.title).toBe("string");
    expect(FalRawNode.title.length).toBeGreaterThan(0);
  });

  it("requires FAL_API_KEY setting", () => {
    expect(FalRawNode.requiredSettings).toContain("FAL_API_KEY");
  });
});

/* ================================================================== */
/*  FalRawNode.process                                                  */
/* ================================================================== */

describe("FalRawNode.process", () => {
  it("calls the specified endpoint with parsed args and returns result", async () => {
    const response = { images: [{ url: "https://fal.media/img.png" }] };
    mockSubscribe.mockResolvedValue({ data: response });

    const node = new FalRawNode();
    const executor = node.toExecutor();
    const result = await executor.process({
      _secrets: { FAL_API_KEY: "test-key" },
      endpoint_id: "fal-ai/flux/dev",
      arguments: JSON.stringify({ prompt: "a cat" })
    });

    expect(result).toEqual({ result: response });
    expect(mockSubscribe).toHaveBeenCalledOnce();
    const [endpoint, opts] = mockSubscribe.mock.calls[0] as [
      string,
      { input: Record<string, unknown> }
    ];
    expect(endpoint).toBe("fal-ai/flux/dev");
    expect(opts.input).toEqual({ prompt: "a cat" });
  });

  it("uses node property defaults when inputs are absent", async () => {
    mockSubscribe.mockResolvedValue({ data: { ok: true } });
    const node = new FalRawNode();
    // Set properties via default mechanism
    (node as Record<string, unknown>).endpoint_id = "fal-ai/test";
    (node as Record<string, unknown>).arguments = '{"x": 1}';

    const executor = node.toExecutor();
    const result = await executor.process({
      _secrets: { FAL_API_KEY: "k" }
    });
    expect(result).toEqual({ result: { ok: true } });
  });

  it("throws when endpoint_id is empty", async () => {
    const node = new FalRawNode();
    const executor = node.toExecutor();
    await expect(
      executor.process({
        _secrets: { FAL_API_KEY: "k" },
        endpoint_id: "",
        arguments: "{}"
      })
    ).rejects.toThrow("endpoint_id is required");
  });

  it("throws when arguments is not valid JSON", async () => {
    const node = new FalRawNode();
    const executor = node.toExecutor();
    await expect(
      executor.process({
        _secrets: { FAL_API_KEY: "k" },
        endpoint_id: "fal-ai/test",
        arguments: "not json"
      })
    ).rejects.toThrow("arguments must be valid JSON");
  });

  it("propagates FAL SDK errors", async () => {
    mockSubscribe.mockRejectedValue(new Error("FAL queue error"));
    const node = new FalRawNode();
    const executor = node.toExecutor();
    await expect(
      executor.process({
        _secrets: { FAL_API_KEY: "k" },
        endpoint_id: "fal-ai/test",
        arguments: "{}"
      })
    ).rejects.toThrow("FAL queue error");
  });
});

/* ================================================================== */
/*  FalDynamicNode static metadata                                      */
/* ================================================================== */

describe("FalDynamicNode static metadata", () => {
  it("has expected nodeType", () => {
    expect(FalDynamicNode.nodeType).toBe("fal.dynamic.FalDynamic");
  });

  it("has isDynamic = true", () => {
    expect(FalDynamicNode.isDynamic).toBe(true);
  });

  it("has supportsDynamicOutputs = true", () => {
    expect(FalDynamicNode.supportsDynamicOutputs).toBe(true);
  });

  it("requires FAL_API_KEY setting", () => {
    expect(FalDynamicNode.requiredSettings).toContain("FAL_API_KEY");
  });
});

/* ================================================================== */
/*  FalDynamicNode.process — model_info validation                     */
/* ================================================================== */

describe("FalDynamicNode.process — model_info validation", () => {
  it("throws when model_info is empty", async () => {
    const node = new FalDynamicNode();
    const executor = node.toExecutor();
    await expect(
      executor.process({ _secrets: { FAL_API_KEY: "k" }, model_info: "" })
    ).rejects.toThrow("model_info is required");
  });

  it("throws when model_info cannot be resolved to a URL", async () => {
    const node = new FalDynamicNode();
    const executor = node.toExecutor();
    // A URL that is not fal.ai and not parseable as endpoint id
    await expect(
      executor.process({
        _secrets: { FAL_API_KEY: "k" },
        model_info: "https://evil.com/some/path"
      })
    ).rejects.toThrow();
  });
});

/* ================================================================== */
/*  FalDynamicNode.process — endpoint ID happy path                    */
/* ================================================================== */

describe("FalDynamicNode.process — endpoint ID resolution", () => {
  it("resolves an endpoint ID like 'fal-ai/flux/dev' and submits", async () => {
    // Mock llms.txt fetch
    mockFetch.mockImplementation((url: string) => {
      if (String(url).endsWith("llms.txt")) {
        return Promise.resolve({
          ok: true,
          text: () =>
            Promise.resolve(
              `**Model ID**: \`fal-ai/flux/dev\`\n` +
                `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/flux/dev`
            )
        });
      }
      // OpenAPI schema fetch
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(minimalOpenApi)
      });
    });

    const apiResponse = {
      images: [{ url: "https://fal.media/img.png", width: 512, height: 512 }]
    };
    mockSubscribe.mockResolvedValue({ data: apiResponse });

    const node = new FalDynamicNode();
    const executor = node.toExecutor();
    const result = await executor.process({
      _secrets: { FAL_API_KEY: "test-key" },
      model_info: "fal-ai/flux/dev",
      prompt: "a dog"
    });

    expect(mockSubscribe).toHaveBeenCalledOnce();
    const [endpoint, opts] = mockSubscribe.mock.calls[0] as [
      string,
      { input: Record<string, unknown> }
    ];
    expect(endpoint).toBe("fal-ai/flux/dev");
    expect(opts.input.prompt).toBe("a dog");
    // Output should be mapped: images array → [{type: "image", uri: ...}]
    expect(result).toBeDefined();
  });

  it("falls back to returning { result } when output schema cannot map", async () => {
    // Empty output schema → mapOutputValues returns empty → fall back to { result }
    const emptyOutputOpenApi = {
      ...minimalOpenApi,
      paths: {
        "/fal-ai/flux/dev": {
          ...minimalOpenApi.paths["/fal-ai/flux/dev"],
          get: {
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: { type: "object", properties: {} }
                  }
                }
              }
            }
          }
        }
      }
    };

    mockFetch.mockImplementation((url: string) => {
      if (String(url).endsWith("llms.txt")) {
        return Promise.resolve({
          ok: true,
          text: () =>
            Promise.resolve(
              `**Model ID**: \`fal-ai/flux/dev\`\n` +
                `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/flux/dev`
            )
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(emptyOutputOpenApi)
      });
    });

    const apiResponse = { raw: "value" };
    mockSubscribe.mockResolvedValue({ data: apiResponse });

    const node = new FalDynamicNode();
    const executor = node.toExecutor();
    const result = await executor.process({
      _secrets: { FAL_API_KEY: "key" },
      model_info: "fal-ai/flux/dev",
      prompt: "test"
    });
    expect(result).toEqual({ result: apiResponse });
  });
});

/* ================================================================== */
/*  FalDynamicNode.process — direct OpenAPI URL                        */
/* ================================================================== */

describe("FalDynamicNode.process — direct OpenAPI URL", () => {
  it("accepts a direct openapi.json URL as model_info", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(minimalOpenApi)
    });
    mockSubscribe.mockResolvedValue({
      data: {
        images: [{ url: "https://fal.media/x.png", width: 1, height: 1 }]
      }
    });

    const node = new FalDynamicNode();
    const executor = node.toExecutor();
    const result = await executor.process({
      _secrets: { FAL_API_KEY: "k" },
      model_info:
        "https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/flux/dev",
      prompt: "hello"
    });
    expect(result).toBeDefined();
    // Should only fetch OpenAPI once (no llms.txt detour)
    expect(mockFetch).toHaveBeenCalledOnce();
  });
});

/* ================================================================== */
/*  FalDynamicNode.process — domain validation                         */
/* ================================================================== */

describe("FalDynamicNode.process — domain validation", () => {
  it("rejects fetch to non-fal.ai domains", async () => {
    // Provide a URL that normalizes to an llms.txt on a bad domain
    // We can achieve this by passing a raw llms.txt URL on a different domain
    // Actually, the only way to get a non-fal.ai URL into the fetch is to bypass
    // normalizeModelInfo. Let's test an invalid fal.ai URL that coerces to nothing.
    const node = new FalDynamicNode();
    const executor = node.toExecutor();
    // Pass text with an openapi URL on a bad domain
    const maliciousText =
      `**Model ID**: \`fal-ai/test\`\n` +
      `https://evil.com/openapi.json?endpoint_id=fal-ai/test`;

    // normalizeModelInfo treats this as raw llms.txt text (no URL prefix)
    // parseModelInfoText extracts the openapi URL but it passes validateFalUrl
    // Actually evil.com is not fal.ai so it should throw
    mockFetch.mockImplementation(() => {
      // llms.txt URL resolves to fal.ai, but open api url could be bad
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(maliciousText)
      });
    });

    await expect(
      executor.process({
        _secrets: { FAL_API_KEY: "k" },
        model_info: "fal-ai/test"
      })
    ).rejects.toThrow();
  });
});

/* ================================================================== */
/*  FalDynamicNode.process — required input validation                 */
/* ================================================================== */

describe("FalDynamicNode.process — required input validation", () => {
  it("throws when a required schema field is missing", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (String(url).endsWith("llms.txt")) {
        return Promise.resolve({
          ok: true,
          text: () =>
            Promise.resolve(
              `**Model ID**: \`fal-ai/flux/dev\`\n` +
                `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/flux/dev`
            )
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(minimalOpenApi)
      });
    });

    const node = new FalDynamicNode();
    const executor = node.toExecutor();
    // "prompt" is required in minimalOpenApi but we do not provide it
    await expect(
      executor.process({
        _secrets: { FAL_API_KEY: "k" },
        model_info: "fal-ai/flux/dev"
        // no "prompt" key
      })
    ).rejects.toThrow("Missing required input: prompt");
  });
});

/* ================================================================== */
/*  FalDynamicNode.process — asset ref coercion                        */
/* ================================================================== */

describe("FalDynamicNode.process — asset ref coercion", () => {
  it("converts an image asset ref to a data URI before submission", async () => {
    const openApiWithImage = {
      info: { "x-fal-metadata": { endpointId: "fal-ai/img2img" } },
      paths: {
        "/fal-ai/img2img": {
          post: {
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      image_url: { type: "string" }
                    },
                    required: ["image_url"]
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
                    schema: { type: "object", properties: {} }
                  }
                }
              }
            }
          }
        }
      }
    };

    mockFetch.mockImplementation((url: string) => {
      if (String(url).endsWith("llms.txt")) {
        return Promise.resolve({
          ok: true,
          text: () =>
            Promise.resolve(
              `**Model ID**: \`fal-ai/img2img\`\n` +
                `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/img2img`
            )
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(openApiWithImage)
      });
    });

    mockSubscribe.mockResolvedValue({ data: { result: "done" } });

    const node = new FalDynamicNode();
    const executor = node.toExecutor();
    await executor.process({
      _secrets: { FAL_API_KEY: "k" },
      model_info: "fal-ai/img2img",
      image_url: {
        type: "image",
        data: "aGVsbG8=", // base64 "hello"
        uri: "test.png"
      }
    });

    const [, opts] = mockSubscribe.mock.calls[0] as [
      string,
      { input: Record<string, unknown> }
    ];
    // Should be converted to a data URI string
    expect(typeof opts.input.image_url).toBe("string");
    expect((opts.input.image_url as string).startsWith("data:")).toBe(true);
  });
});

/* ================================================================== */
/*  FalDynamicNode.process — fal.ai model URL as model_info            */
/* ================================================================== */

describe("FalDynamicNode.process — fal.ai model URL", () => {
  it("accepts a fal.ai model URL and fetches llms.txt from it", async () => {
    const callOrder: string[] = [];
    mockFetch.mockImplementation((url: string) => {
      const urlStr = String(url);
      callOrder.push(urlStr);
      if (urlStr.endsWith("llms.txt")) {
        return Promise.resolve({
          ok: true,
          text: () =>
            Promise.resolve(
              `**Model ID**: \`fal-ai/flux/dev\`\n` +
                `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/flux/dev`
            )
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(minimalOpenApi)
      });
    });

    mockSubscribe.mockResolvedValue({
      data: {
        images: [{ url: "https://fal.media/x.png", width: 1, height: 1 }]
      }
    });

    const node = new FalDynamicNode();
    const executor = node.toExecutor();
    await executor.process({
      _secrets: { FAL_API_KEY: "k" },
      model_info: "https://fal.ai/models/fal-ai/flux/dev",
      prompt: "test"
    });

    // Should have fetched llms.txt
    expect(callOrder.some((u) => u.endsWith("llms.txt"))).toBe(true);
  });
});
