/**
 * `applyRunPolicy` is what makes a planned graph runnable: the planner leaves
 * its Agent nodes model-less on purpose, and an unstamped node dies on
 * "Select a model". Its one importer is the `graph-e2e` eval suite
 * (`src/evals/graph-e2e-eval.ts`), which stamps the policy itself before
 * handing the graph to the injected runner.
 */
import { describe, it, expect } from "vitest";
import type { GraphData } from "@nodetool-ai/protocol";
import { applyRunPolicy, type RunPolicy } from "../src/run-policy.js";

const POLICY: RunPolicy = { providerId: "mock", modelId: "mock-model" };

const agentGraph = (properties: Record<string, unknown>): GraphData => ({
  nodes: [{ id: "a1", type: "nodetool.agents.Agent", properties }],
  edges: []
});

const firstProperties = (graph: GraphData): Record<string, unknown> =>
  graph.nodes[0].properties ?? {};

describe("applyRunPolicy", () => {
  it("stamps the configured provider+model onto a model-less Agent node", () => {
    const stamped = applyRunPolicy(agentGraph({ prompt: "hi" }), POLICY);

    expect(firstProperties(stamped)).toMatchObject({
      prompt: "hi",
      model: { type: "language_model", provider: "mock", id: "mock-model" }
    });
  });

  it("stamps over the empty-model default", () => {
    const stamped = applyRunPolicy(
      agentGraph({ model: { type: "language_model", provider: "empty", id: "" } }),
      POLICY
    );

    expect(firstProperties(stamped)["model"]).toMatchObject({
      provider: "mock",
      id: "mock-model"
    });
  });

  it("leaves a node that already names a model alone", () => {
    const stamped = applyRunPolicy(
      agentGraph({ model: { provider: "openai", id: "gpt-5.4-mini" } }),
      POLICY
    );

    expect(firstProperties(stamped)["model"]).toEqual({
      provider: "openai",
      id: "gpt-5.4-mini"
    });
  });

  it("stamps the run's system prompt, turn budget and token cap", () => {
    const stamped = applyRunPolicy(agentGraph({ prompt: "hi" }), {
      ...POLICY,
      systemPrompt: "be terse",
      maxStepIterations: 5,
      maxTokens: 256
    });

    expect(firstProperties(stamped)).toMatchObject({
      system: "be terse",
      max_turns: 5,
      max_tokens: 256
    });
  });

  it("leaves a node's own system prompt, turn budget and token cap alone", () => {
    const stamped = applyRunPolicy(
      agentGraph({ prompt: "hi", system: "own", max_turns: 3, max_tokens: 7 }),
      {
        ...POLICY,
        systemPrompt: "be terse",
        maxStepIterations: 5,
        maxTokens: 256
      }
    );

    expect(firstProperties(stamped)).toMatchObject({
      system: "own",
      max_turns: 3,
      max_tokens: 7
    });
  });

  it("omits policy properties the run did not configure", () => {
    const stamped = applyRunPolicy(agentGraph({ prompt: "hi" }), POLICY);

    const properties = firstProperties(stamped);
    expect(properties["system"]).toBeUndefined();
    expect(properties["max_turns"]).toBeUndefined();
    expect(properties["max_tokens"]).toBeUndefined();
  });

  it("does not touch non-Agent nodes", () => {
    const graph: GraphData = {
      nodes: [
        { id: "c1", type: "nodetool.text.Concat", properties: { a: "x" } }
      ],
      edges: []
    };

    expect(firstProperties(applyRunPolicy(graph, POLICY))).toEqual({ a: "x" });
  });
});
