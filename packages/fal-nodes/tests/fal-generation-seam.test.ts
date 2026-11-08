import { describe, expect, it, vi, afterEach } from "vitest";
import {
  ProcessingContext,
  ScriptedProvider,
  type GenerationLifecycleHooks
} from "@nodetool-ai/runtime";
import {
  createFalNodeClass,
  type FalManifestEntry
} from "../src/fal-factory.js";
import { FalDynamicNode, FalRawNode } from "../src/fal-dynamic.js";
import { callFalEndpoint } from "../src/fal-base.js";

const RESULT = { image: { url: "https://fal.media/result.png" } };

function scripted(events: string[] = []): ScriptedProvider {
  return new ScriptedProvider([], {
    providerId: "fal_ai",
    endpoints: {
      "*": () => {
        events.push("provider");
        return { output: RESULT, requestId: "fal-request-1" };
      }
    }
  });
}

function contextFor(
  provider: ScriptedProvider,
  events: string[],
  reject = false
): ProcessingContext {
  const lifecycle: GenerationLifecycleHooks = {
    onGenerationAccepted: () => {
      events.push("accepted");
      if (reject) throw new Error("durable acceptance failed");
    },
    onGenerationTerminal: ({ status }) => {
      events.push(`terminal:${status}`);
    }
  };
  const ctx = new ProcessingContext({
    jobId: "job-seam",
    generationLifecycle: lifecycle
  });
  ctx.setProviderResolver(async () => provider);
  return ctx;
}

function predictions(ctx: ProcessingContext) {
  return ctx.getMessages().filter((message) => message.type === "prediction");
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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not call the provider for a generated node when durable acceptance fails", async () => {
    const provider = scripted();
    const NodeClass = createFalNodeClass(generatedSpec);

    await expect(
      new NodeClass({})
        .toExecutor()
        .process({}, contextFor(provider, [], true))
    ).rejects.toThrow("durable acceptance failed");
    expect(provider.endpointCalls).toEqual([]);
  });

  it("emits a prediction message naming fal_ai, the capability and the model", async () => {
    const provider = scripted();
    const ctx = contextFor(provider, []);
    const NodeClass = createFalNodeClass(generatedSpec);

    const result = await new NodeClass({}).toExecutor().process({}, ctx);

    expect(result.output).toMatchObject({
      type: "image",
      uri: "https://fal.media/result.png"
    });
    expect(predictions(ctx).at(-1)).toMatchObject({
      status: "completed",
      provider: "fal_ai",
      capability: "text_to_image",
      model: "fal-ai/test",
      node_id: "fal.image.SeamTestNode"
    });
  });

  it("accepts before the raw node calls the provider and records the terminal after", async () => {
    const events: string[] = [];
    const provider = scripted(events);
    const node = new FalRawNode({});
    const result = await node.toExecutor().process(
      { endpoint_id: "fal-ai/test", arguments: '{"prompt":"x"}' },
      contextFor(provider, events)
    );

    expect(result).toEqual({ result: RESULT });
    expect(events).toEqual(["accepted", "provider", "terminal:completed"]);
    expect(provider.endpointCalls).toHaveLength(1);
    expect(provider.endpointCalls[0]).toMatchObject({
      model: "fal-ai/test",
      input: { prompt: "x" }
    });
  });

  it("routes the schema-driven node through the same seam", async () => {
    const events: string[] = [];
    const provider = scripted(events);
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
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(openapi)))
    );

    const node = new FalDynamicNode({});
    const result = await node.toExecutor().process(
      {
        model_info:
          "https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai%2Ftest"
      },
      contextFor(provider, events)
    );

    expect(result).toEqual({ image: { url: "https://fal.media/result.png" } });
    expect(events).toEqual(["accepted", "provider", "terminal:completed"]);
    expect(provider.endpointCalls).toHaveLength(1);
  });

  it("opens no second generation inside an enclosing one", async () => {
    const events: string[] = [];
    const provider = scripted(events);
    const ctx = contextFor(provider, events);

    await ctx.runGenerationWith(
      {
        provider: "fal_ai",
        capability: "text_to_image",
        model: "fal-ai/test",
        params: {}
      },
      async () =>
        (
          await callFalEndpoint(ctx, {
            endpoint: "fal-ai/test",
            args: {},
            nodeType: "fal.image.SeamTestNode",
            capability: "text_to_image"
          })
        ).data
    );

    expect(events).toEqual(["accepted", "provider", "terminal:completed"]);
    expect(
      predictions(ctx).filter((message) => message.status === "running")
    ).toHaveLength(1);
  });
});
