/**
 * A production job whose only node was an `Agent` left no `nodetool_predictions`
 * row and a null `nodetool_jobs.cost`: the node called `provider.generateLoop`
 * and `trackUsage` reached only the in-memory invocation account, never the DB.
 *
 * These tests pin the fix. `AgentNode` now reports its provider spend through
 * `context.setProviderCost`, the same path FAL and kie use, so the run's
 * `node_update` carries a `provider_cost` the ledger can write.
 */

import { describe, it, expect, vi } from "vitest";
import { AgentNode } from "../src/nodes/agents.js";
import { meterProviderSpend } from "../src/nodes/provider-spend.js";
import type { ProcessingContext } from "@nodetool-ai/runtime";

const MODEL = "gpt-4o-mini";

/** A provider that books cost and tokens the way `BaseProvider.trackUsage` does. */
function makeProvider(options: {
  /** Spend already on the instance from an earlier node in the same run. */
  startingCost?: number;
  costPerCall: number;
  inputTokens: number;
  outputTokens: number;
  /** Throw after booking, to exercise the failure path. */
  throwAfter?: boolean;
}) {
  const self = {
    provider: "openai",
    cost: options.startingCost ?? 0,
    usageTotals: {
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0
    },
    async *generateLoop() {
      self.cost += options.costPerCall;
      self.usageTotals.inputTokens += options.inputTokens;
      self.usageTotals.outputTokens += options.outputTokens;
      yield {
        type: "chunk",
        content: "answer",
        content_type: "text",
        done: true
      };
      yield {
        type: "message",
        message: { role: "assistant", content: "answer" }
      };
      if (options.throwAfter) {
        throw new Error("provider blew up");
      }
    }
  };
  return self;
}

function createContext(provider: unknown) {
  const setProviderCost = vi.fn();
  const context = {
    getProvider: async () => provider,
    setProviderCost,
    get: <T,>(_key: string, defaultValue?: T) => defaultValue as T
  } as unknown as ProcessingContext;
  return { context, setProviderCost };
}

function makeAgent() {
  const agent = new AgentNode();
  agent.assign({
    system: "You are helpful",
    prompt: "Say hello",
    model: { provider: "openai", id: MODEL },
    max_tokens: 512
  });
  return agent;
}

async function drain(agent: AgentNode, context: ProcessingContext) {
  for await (const _item of agent.genProcess(context)) {
    // Drain the stream; these tests assert on the reported spend, not output.
  }
}

describe("AgentNode provider spend", () => {
  it("reports the loop's cost, provider, model and tokens", async () => {
    const provider = makeProvider({
      costPerCall: 0.0042,
      inputTokens: 200,
      outputTokens: 100
    });
    const { context, setProviderCost } = createContext(provider);

    await drain(makeAgent(), context);

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

  it("reports only its own delta, not spend an earlier node left on the instance", async () => {
    // One `ProcessingContext` memoizes one provider instance for every node in
    // the run, so the running total is not this node's charge.
    const provider = makeProvider({
      startingCost: 1.25,
      costPerCall: 0.003,
      inputTokens: 10,
      outputTokens: 5
    });
    const { context, setProviderCost } = createContext(provider);

    await drain(makeAgent(), context);

    const [, amount] = setProviderCost.mock.calls[0];
    expect(amount).toBeCloseTo(0.003, 10);
  });

  it("reports what was spent before a provider error", async () => {
    const provider = makeProvider({
      costPerCall: 0.002,
      inputTokens: 40,
      outputTokens: 20,
      throwAfter: true
    });
    const { context, setProviderCost } = createContext(provider);

    await expect(drain(makeAgent(), context)).rejects.toThrow(
      "provider blew up"
    );

    expect(setProviderCost).toHaveBeenCalledTimes(1);
    const [, amount] = setProviderCost.mock.calls[0];
    expect(amount).toBeCloseTo(0.002, 10);
  });
});

describe("meterProviderSpend", () => {
  it("reports nothing when the provider booked no cost", () => {
    const provider = { provider: "ollama", cost: 0 };
    const setProviderCost = vi.fn();

    meterProviderSpend({ setProviderCost } as never, provider, "llama3").report();

    // A zero would be stored as a real zero and read as a free call.
    expect(setProviderCost).not.toHaveBeenCalled();
  });

  it("reports once, so a `finally` after an explicit report double-counts nothing", () => {
    const provider = { provider: "openai", cost: 0 };
    const setProviderCost = vi.fn();
    const meter = meterProviderSpend(
      { setProviderCost } as never,
      provider,
      MODEL
    );

    provider.cost = 0.01;
    meter.report();
    provider.cost = 0.02;
    meter.report();

    expect(setProviderCost).toHaveBeenCalledTimes(1);
    expect(setProviderCost.mock.calls[0][1]).toBeCloseTo(0.01, 10);
  });
});
