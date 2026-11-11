import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { ProcessingContext, ScriptedProvider } from "@nodetool-ai/runtime";
import { FalRawNode, FalDynamicNode } from "../src/fal-dynamic.js";

/* ------------------------------------------------------------------ */
/*  Scripted fal_ai provider and fetch mock                             */
/* ------------------------------------------------------------------ */

const originalFetch = globalThis.fetch;
let mockFetch: ReturnType<typeof vi.fn>;
let provider: ScriptedProvider;
let ctx: ProcessingContext;

beforeEach(() => {
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch;
  provider = new ScriptedProvider([], {
    providerId: "fal_ai",
    uploadUrl: () => "https://fal.media/uploaded.mp4"
  });
  ctx = new ProcessingContext({ jobId: "job-fal-dynamic" });
  ctx.setProviderResolver(async () => provider);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
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
    provider.scriptEndpoint("*", { output: response });

    const node = new FalRawNode();
    const executor = node.toExecutor();
    const result = await executor.process({
      endpoint_id: "fal-ai/flux/dev",
      arguments: JSON.stringify({ prompt: "a cat" })
    }, ctx);

    expect(result).toEqual({ result: response });
    expect(provider.endpointCalls).toHaveLength(1);
    const { model: endpoint, input } = provider.endpointCalls[0];
    expect(endpoint).toBe("fal-ai/flux/dev");
    expect(input).toEqual({ prompt: "a cat" });
  });

  it("uses node property defaults when inputs are absent", async () => {
    provider.scriptEndpoint("*", { output: { ok: true } });
    const node = new FalRawNode();
    // Set properties via default mechanism
    (node as Record<string, unknown>).endpoint_id = "fal-ai/test";
    (node as Record<string, unknown>).arguments = '{"x": 1}';

    const executor = node.toExecutor();
    const result = await executor.process({}, ctx);
    expect(result).toEqual({ result: { ok: true } });
  });

  it("throws when endpoint_id is empty", async () => {
    const node = new FalRawNode();
    const executor = node.toExecutor();
    await expect(
      executor.process({
        endpoint_id: "",
        arguments: "{}"
      }, ctx)
    ).rejects.toThrow("endpoint_id is required");
  });

  it("throws when arguments is not valid JSON", async () => {
    const node = new FalRawNode();
    const executor = node.toExecutor();
    await expect(
      executor.process({
        endpoint_id: "fal-ai/test",
        arguments: "not json"
      }, ctx)
    ).rejects.toThrow("arguments must be valid JSON");
  });

  it("propagates FAL SDK errors", async () => {
    provider.scriptEndpoint("*", new Error("FAL queue error"));
    const node = new FalRawNode();
    const executor = node.toExecutor();
    await expect(
      executor.process({
        endpoint_id: "fal-ai/test",
        arguments: "{}"
      }, ctx)
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

  it("has supportsDynamicInputs = true", () => {
    expect(FalDynamicNode.supportsDynamicInputs).toBe(true);
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
      executor.process({ model_info: "" }, ctx)
    ).rejects.toThrow("model_info is required");
  });

  it("throws when model_info cannot be resolved to a URL", async () => {
    const node = new FalDynamicNode();
    const executor = node.toExecutor();
    // A URL that is not fal.ai and not parseable as endpoint id
    await expect(
      executor.process({
        model_info: "https://evil.com/some/path"
      }, ctx)
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
    provider.scriptEndpoint("*", { output: apiResponse });

    const node = new FalDynamicNode();
    const executor = node.toExecutor();
    const result = await executor.process({
      model_info: "fal-ai/flux/dev",
      prompt: "a dog"
    }, ctx);

    expect(provider.endpointCalls).toHaveLength(1);
    const { model: endpoint, input } = provider.endpointCalls[0];
    expect(endpoint).toBe("fal-ai/flux/dev");
    expect(input.prompt).toBe("a dog");
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
    provider.scriptEndpoint("*", { output: apiResponse });

    const node = new FalDynamicNode();
    const executor = node.toExecutor();
    const result = await executor.process({
      model_info: "fal-ai/flux/dev",
      prompt: "test"
    }, ctx);
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
    provider.scriptEndpoint("*", {
      output: {
        images: [{ url: "https://fal.media/x.png", width: 1, height: 1 }]
      }
    });

    const node = new FalDynamicNode();
    const executor = node.toExecutor();
    const result = await executor.process({
      model_info:
        "https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/flux/dev",
      prompt: "hello"
    }, ctx);
    // The schema behind the URL is what maps the response, so a mapped output
    // is the evidence the URL resolved to a schema at all.
    expect(result).toEqual({
      images: [{ type: "image", uri: "https://fal.media/x.png" }]
    });
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
        model_info: "fal-ai/test"
      }, ctx)
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
        model_info: "fal-ai/flux/dev"
        // no "prompt" key
      }, ctx)
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

    provider.scriptEndpoint("*", { output: { result: "done" } });

    const node = new FalDynamicNode();
    const executor = node.toExecutor();
    await executor.process({
      model_info: "fal-ai/img2img",
      image_url: {
        type: "image",
        data: "aGVsbG8=", // base64 "hello"
        uri: "test.png"
      }
    }, ctx);

    const { input } = provider.endpointCalls[0];
    // Should be converted to a data URI string
    expect(typeof input.image_url).toBe("string");
    expect((input.image_url as string).startsWith("data:")).toBe(true);
  });

  it("uploads a video data ref with a video MIME type (not as image)", async () => {
    const openApiWithVideo = {
      info: { "x-fal-metadata": { endpointId: "fal-ai/vid" } },
      paths: {
        "/fal-ai/vid": {
          post: {
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { video_url: { type: "string" } },
                    required: ["video_url"]
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
              `**Model ID**: \`fal-ai/vid\`\n` +
                `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/vid`
            )
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(openApiWithVideo)
      });
    });

    provider.scriptEndpoint("*", { output: { result: "done" } });

    const node = new FalDynamicNode();
    const executor = node.toExecutor();
    await executor.process({
      model_info: "fal-ai/vid",
      video_url: { type: "video", data: "aGVsbG8=" } // no uri → must upload
    }, ctx);

    // The uploaded blob must carry a video content type, never image/*.
    expect(provider.uploadCalls).toHaveLength(1);
    expect(provider.uploadCalls[0].mimeType).toBe("video/mp4");

    const { input } = provider.endpointCalls[0];
    expect(input.video_url).toBe("https://fal.media/uploaded.mp4");
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

    provider.scriptEndpoint("*", {
      output: {
        images: [{ url: "https://fal.media/x.png", width: 1, height: 1 }]
      }
    });

    const node = new FalDynamicNode();
    const executor = node.toExecutor();
    await executor.process({
      model_info: "https://fal.ai/models/fal-ai/flux/dev",
      prompt: "test"
    }, ctx);

    // Should have fetched llms.txt
    expect(callOrder.some((u) => u.endsWith("llms.txt"))).toBe(true);
  });
});
