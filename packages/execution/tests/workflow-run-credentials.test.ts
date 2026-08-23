/**
 * The credential preflight that refuses a run whose providers cannot be
 * constructed. Both directions are pinned here: the refusal fires with a
 * message naming the secret, and it stays silent once store or env resolves
 * the key — a check that has only ever been green proves nothing.
 */
import { describe, expect, it, afterEach } from "vitest";
// Importing the runtime barrel registers the builtin providers this test
// asserts against.
import { listRegisteredProviderIds } from "@nodetool-ai/runtime";
import { unconfiguredProviderErrors } from "../src/service/workflow-run.js";

const nullResolver = { resolveSecret: () => null };
const storeResolver = (values: Record<string, string>) => ({
  resolveSecret: (key: string) => values[key] ?? null
});

/** A graph selecting one provider, the way TextToImage's default does. */
const graphWithProvider = (provider: string) => ({
  nodes: [
    {
      id: "n1",
      type: "nodetool.image.TextToImage",
      properties: {
        model: { type: "image_model", provider, id: "some-model" }
      }
    }
  ]
});

describe("unconfiguredProviderErrors", () => {
  const saved = process.env["OPENAI_API_KEY"];
  const savedAlibabaKey = process.env["DASHSCOPE_API_KEY"];
  const savedAlibabaUrl = process.env["DASHSCOPE_BASE_URL"];

  afterEach(() => {
    if (saved === undefined) delete process.env["OPENAI_API_KEY"];
    else process.env["OPENAI_API_KEY"] = saved;
    if (savedAlibabaKey === undefined) delete process.env["DASHSCOPE_API_KEY"];
    else process.env["DASHSCOPE_API_KEY"] = savedAlibabaKey;
    if (savedAlibabaUrl === undefined) delete process.env["DASHSCOPE_BASE_URL"];
    else process.env["DASHSCOPE_BASE_URL"] = savedAlibabaUrl;
  });

  it("is registered against the real runtime registry", () => {
    expect(listRegisteredProviderIds()).toContain("openai");
  });

  it("refuses an unconfigured provider and names the secret to set", async () => {
    delete process.env["OPENAI_API_KEY"];
    const errors = await unconfiguredProviderErrors(
      graphWithProvider("openai"),
      nullResolver
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"openai"');
    expect(errors[0]).toContain("OPENAI_API_KEY");
    expect(errors[0]).toContain("Settings");
  });

  it("passes once the store resolves the key", async () => {
    delete process.env["OPENAI_API_KEY"];
    expect(
      await unconfiguredProviderErrors(
        graphWithProvider("openai"),
        storeResolver({ OPENAI_API_KEY: "sk-test" })
      )
    ).toEqual([]);
  });

  it("accepts the env fallback the run itself would use", async () => {
    process.env["OPENAI_API_KEY"] = "sk-from-env";
    expect(
      await unconfiguredProviderErrors(
        graphWithProvider("openai"),
        nullResolver
      )
    ).toEqual([]);
  });

  it("accepts Alibaba's documented default base URL", async () => {
    delete process.env["DASHSCOPE_API_KEY"];
    delete process.env["DASHSCOPE_BASE_URL"];
    expect(
      await unconfiguredProviderErrors(
        graphWithProvider("alibaba"),
        storeResolver({ DASHSCOPE_API_KEY: "sk-test" })
      )
    ).toEqual([]);
  });

  it("skips unregistered ids — the model-selection check owns those", async () => {
    expect(
      await unconfiguredProviderErrors(
        graphWithProvider("nonesuch"),
        nullResolver
      )
    ).toEqual([]);
  });

  it("skips providers registered without required credentials", async () => {
    expect(
      await unconfiguredProviderErrors(
        graphWithProvider("nodetool"),
        nullResolver
      )
    ).toEqual([]);
  });

  it("ignores the saved model on a bypassed node", async () => {
    const graph = graphWithProvider("openai");
    graph.nodes[0].ui_properties = { bypassed: true };
    expect(await unconfiguredProviderErrors(graph, nullResolver)).toEqual([]);
  });

  it("ignores a saved model replaced by an incoming data edge", async () => {
    // The source node has to exist: `normalizeGraph` prunes an edge whose
    // endpoints it cannot find, and a pruned edge shadows nothing.
    const graph = {
      nodes: [
        { id: "model-source", type: "test.ModelSource", properties: {} },
        ...graphWithProvider("openai").nodes
      ],
      edges: [
        {
          source: "model-source",
          sourceHandle: "output",
          target: "n1",
          targetHandle: "model"
        }
      ]
    };
    expect(await unconfiguredProviderErrors(graph, nullResolver)).toEqual([]);
  });

  it("checks a saved model when bypass rewriting drops its incoming edge", async () => {
    delete process.env["OPENAI_API_KEY"];
    const graph = {
      nodes: [
        {
          id: "bypassed",
          type: "test.Bypassed",
          properties: {},
          ui_properties: { bypassed: true }
        },
        ...graphWithProvider("openai").nodes
      ],
      edges: [
        {
          source: "bypassed",
          sourceHandle: "model",
          target: "n1",
          targetHandle: "model"
        }
      ]
    };

    const errors = await unconfiguredProviderErrors(graph, nullResolver);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("OPENAI_API_KEY");
  });

  it("answers nothing for a graph without model references or nodes", async () => {
    expect(await unconfiguredProviderErrors({}, nullResolver)).toEqual([]);
    expect(
      await unconfiguredProviderErrors({ nodes: [] }, nullResolver)
    ).toEqual([]);
    expect(
      await unconfiguredProviderErrors({ nodes: "not-an-array" }, nullResolver)
    ).toEqual([]);
  });
});
