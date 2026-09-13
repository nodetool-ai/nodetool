import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  createFalNodeClass,
  type FalManifestEntry
} from "../src/fal-factory.js";
import { FalDynamicNode, FalRawNode } from "../src/fal-dynamic.js";

const mockSubscribe = vi.fn();
const originalFetch = globalThis.fetch;

vi.mock("@fal-ai/client", () => ({
  createFalClient: vi.fn(() => ({
    subscribe: mockSubscribe,
    storage: { upload: vi.fn() }
  }))
}));

function contextFor(events: string[], reject = false): ProcessingContext {
  return {
    getSecret: async () => "test-key",
    runGenerationWith: async (
      _request: unknown,
      call: (provider: null, signal: AbortSignal) => Promise<unknown>
    ) => {
      events.push("accepted");
      if (reject) throw new Error("durable acceptance failed");
      events.push("provider");
      const result = await call(null, new AbortController().signal);
      events.push("bound");
      return {
        id: "generation-1",
        output: result,
        assets: [],
        receipt: { provider_request_id: "fal-request-1" },
        duration_ms: 0
      };
    }
  } as unknown as ProcessingContext;
}

const generatedSpec: FalManifestEntry = {
  endpointId: "fal-ai/test",
  className: "SeamTestNode",
  moduleName: "image",
  docstring: "seam test",
  tags: [],
  useCases: [],
  outputType: "image",
  outputFields: [],
  enums: [],
  inputFields: []
};

describe("FAL node generation seam", () => {
  beforeEach(() => {
    mockSubscribe.mockReset();
    mockSubscribe.mockResolvedValue({
      data: { image: { url: "https://fal.media/result.png" } },
      requestId: "fal-request-1"
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("does not submit a generated node when durable acceptance fails", async () => {
    const NodeClass = createFalNodeClass(generatedSpec);
    const node = new NodeClass({});

    await expect(
      node.toExecutor().process({}, contextFor([], true))
    ).rejects.toThrow("durable acceptance failed");
    expect(mockSubscribe).not.toHaveBeenCalled();
  });

  it("accepts before the raw node submits and binds after the paid call", async () => {
    const events: string[] = [];
    const node = new FalRawNode({});
    const result = await node.toExecutor().process(
      {
        _secrets: { FAL_API_KEY: "test-key" },
        endpoint_id: "fal-ai/test",
        arguments: "{}"
      },
      contextFor(events)
    );

    expect(result).toEqual({
      result: { image: { url: "https://fal.media/result.png" } }
    });
    expect(events).toEqual(["accepted", "provider", "bound"]);
    expect(mockSubscribe).toHaveBeenCalledOnce();
  });

  it("routes the schema-driven node through the same seam", async () => {
    const events: string[] = [];
    const openapi = {
      info: { "x-fal-metadata": { endpointId: "fal-ai/test" } },
      paths: {
        "/fal-ai/test": {
          post: {
            requestBody: {
              content: { "application/json": { schema: { type: "object" } } }
            }
          },
          get: {
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: { image: { type: "string" } }
                    }
                  }
                }
              }
            }
          }
        }
      }
    };
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(openapi)));

    const node = new FalDynamicNode({});
    const result = await node.toExecutor().process(
      {
        _secrets: { FAL_API_KEY: "test-key" },
        model_info:
          "https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai%2Ftest"
      },
      contextFor(events)
    );

    expect(result).toEqual({ image: { url: "https://fal.media/result.png" } });
    expect(events).toEqual(["accepted", "provider", "bound"]);
    expect(mockSubscribe).toHaveBeenCalledOnce();
  });
});
