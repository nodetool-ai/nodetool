/**
 * A workflow made only of generator nodes left no `nodetool_predictions` row
 * and a null `nodetool_jobs.cost`. The nodes ran their chat completion through
 * `context.runProviderPrediction({ capability: "generate_message" })`, and both
 * consumers of the resulting `prediction` message drop a token-billed
 * capability (`isUnitBilledCapability`).
 *
 * These tests pin the fix: a generator node reports its provider spend through
 * `context.setProviderCost`, the same path `AgentNode` and the FAL/kie nodes
 * use, so the run's `node_update` carries a `provider_cost` the ledger writes.
 */

import { describe, it, expect, vi } from "vitest";
import {
  ChartGeneratorNode,
  DataGeneratorNode,
  SVGGeneratorNode
} from "../src/nodes/generators.js";
import type { ProcessingContext } from "@nodetool-ai/runtime";

const MODEL = "gpt-4o-mini";

/** A provider that books cost and tokens the way `BaseProvider.trackUsage` does. */
function makeProvider(options: {
  /** Spend already on the instance from an earlier node in the same run. */
  startingCost?: number;
  costPerCall: number;
  inputTokens: number;
  outputTokens: number;
}) {
  return {
    provider: "openai",
    cost: options.startingCost ?? 0,
    usageTotals: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
    book(): void {
      this.cost += options.costPerCall;
      this.usageTotals.inputTokens += options.inputTokens;
      this.usageTotals.outputTokens += options.outputTokens;
    }
  };
}

type Provider = ReturnType<typeof makeProvider>;

/**
 * A context whose `runProviderPrediction` books spend on the memoized provider
 * instance, exactly as `runGenerationWith` -> `generateMessageTraced` ->
 * `trackUsage` does at runtime.
 */
function createContext(provider: Provider, content: string) {
  const setProviderCost = vi.fn();
  const context = {
    getProvider: async () => provider,
    setProviderCost,
    runProviderPrediction: async () => {
      provider.book();
      return { content };
    },
    // eslint-disable-next-line require-yield
    streamProviderPrediction: async function* () {},
    get: <T,>(_key: string, defaultValue?: T) => defaultValue as T
  } as unknown as ProcessingContext;
  return { context, setProviderCost };
}

describe("generator node provider spend", () => {
  it("reports the SVG generator's cost, provider, model and tokens", async () => {
    const provider = makeProvider({
      costPerCall: 0.0042,
      inputTokens: 200,
      outputTokens: 100
    });
    const { context, setProviderCost } = createContext(
      provider,
      '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
    );
    const node = new SVGGeneratorNode();
    node.assign({
      prompt: "a red circle",
      model: { provider: "openai", id: MODEL }
    });

    await node.process(context);

    expect(setProviderCost).toHaveBeenCalledTimes(1);
    expect(setProviderCost).toHaveBeenCalledWith("openai", 0.0042, "USD", {
      model: MODEL,
      currency: "USD",
      billing_unit: "tokens",
      quantity: 300,
      input_tokens: 200,
      output_tokens: 100,
      cached_tokens: null
    });
  });

  it("reports the data generator's cost", async () => {
    const provider = makeProvider({
      costPerCall: 0.0011,
      inputTokens: 60,
      outputTokens: 30
    });
    const { context, setProviderCost } = createContext(
      provider,
      "name,age\nAlice,30\nBob,25"
    );
    const node = new DataGeneratorNode();
    node.assign({
      prompt: "2 people",
      model: { provider: "openai", id: MODEL }
    });

    await node.process(context);

    expect(setProviderCost).toHaveBeenCalledTimes(1);
    const [providerId, amount, currency, detail] =
      setProviderCost.mock.calls[0];
    expect(providerId).toBe("openai");
    expect(amount).toBeCloseTo(0.0011, 10);
    expect(currency).toBe("USD");
    expect(detail).toMatchObject({ model: MODEL, quantity: 90 });
  });

  it("reports only its own delta, not spend an earlier node left on the instance", async () => {
    // One `ProcessingContext` memoizes one provider instance for every node in
    // the run, so the running total is not this node's charge.
    const provider = makeProvider({
      startingCost: 1.25,
      costPerCall: 0.003,
      inputTokens: 10,
      outputTokens: 5
    });
    const { context, setProviderCost } = createContext(
      provider,
      JSON.stringify({
        title: "t",
        x_label: "x",
        y_label: "y",
        legend: false,
        data: { series: [] }
      })
    );
    const node = new ChartGeneratorNode();
    node.assign({
      prompt: "plot it",
      model: { provider: "openai", id: MODEL }
    });

    await node.process(context);

    expect(setProviderCost).toHaveBeenCalledTimes(1);
    expect(setProviderCost.mock.calls[0][1]).toBeCloseTo(0.003, 10);
  });

  it("still runs when the context has no provider to meter", async () => {
    const setProviderCost = vi.fn();
    const context = {
      setProviderCost,
      runProviderPrediction: async () => ({
        content: '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
      }),
      // eslint-disable-next-line require-yield
      streamProviderPrediction: async function* () {}
    } as unknown as ProcessingContext;
    const node = new SVGGeneratorNode();
    node.assign({
      prompt: "a red circle",
      model: { provider: "openai", id: MODEL }
    });

    const result = await node.process(context);

    expect(result.output[0].content).toContain("<svg");
    expect(setProviderCost).not.toHaveBeenCalled();
  });
});
