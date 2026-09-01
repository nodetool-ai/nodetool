import { describe, it, expect } from "vitest";
// Import from source (not the package's stale dist) so the test exercises the
// AgentNode in this working tree.
import { AgentNode } from "../src/nodes/agents.js";
import { BaseProvider, createRunBudget } from "@nodetool-ai/runtime";
import { RUN_BUDGET_CONTEXT_KEY } from "@nodetool-ai/runtime";
import type { ProcessingContext, RunBudget } from "@nodetool-ai/runtime";

/** A model the price catalog covers, so a USD cap has a worst case to reserve. */
const PRICED_MODEL = "gpt-4o-mini";
const MAX_TOKENS = 4096;

interface ScriptedProvider {
  provider: string;
  /** Model calls the loop actually made. */
  calls: number;
  /** What the provider reports having spent so far, in USD. */
  totalCost: number;
}

/**
 * A provider that answers one turn with a single final chunk and books
 * `costPerCall` for it. Delegates the tool-calling loop to `BaseProvider`, so
 * the admission point under test is the real one.
 */
function makeScriptedProvider(costPerCall = 0): () => ScriptedProvider {
  return () => {
    const self = {
      provider: "openai",
      calls: 0,
      totalCost: 0,
      getTotalCost() {
        return self.totalCost;
      },
      async *generateMessages() {
        self.calls += 1;
        yield {
          type: "chunk",
          content: "answer",
          content_type: "text",
          done: true
        };
        self.totalCost += costPerCall;
      },
      async *generateMessagesTraced(...args: unknown[]) {
        yield* (self as any).generateMessages(...args);
      },
      generateLoop(loopArgs: unknown) {
        return (
          BaseProvider.prototype as { generateLoop: (a: unknown) => unknown }
        ).generateLoop.call(self, loopArgs);
      },
      // The admission point under test lives on BaseProvider; borrow it so
      // this mock reserves exactly the way a real provider does.
      _admitTurn(...args: unknown[]) {
        return (
          BaseProvider.prototype as unknown as {
            _admitTurn: (...a: unknown[]) => boolean;
          }
        )._admitTurn.call(self, ...args);
      }
    };
    return self as unknown as ScriptedProvider;
  };
}

/** A provider whose loop ends with the given stop item after one chunk. */
function makeStoppingProvider(reason: "aborted" | "iterations") {
  return () => ({
    provider: "openai",
    getTotalCost: () => 0,
    async *generateLoop() {
      yield {
        type: "chunk",
        content: "partial",
        content_type: "text",
        done: true
      };
      yield {
        type: "message",
        message: { role: "assistant", content: "partial" }
      };
      yield { type: "stop", reason, detail: `stopped: ${reason}` };
    }
  });
}

function createContext(
  provider: () => unknown,
  variables: Record<string, unknown> = {}
): ProcessingContext {
  return {
    getProvider: async () => provider(),
    get: <T,>(key: string, defaultValue?: T) =>
      (key in variables ? variables[key] : defaultValue) as T
  } as unknown as ProcessingContext;
}

function makeAgent(props: Record<string, unknown>): AgentNode {
  const agent = new AgentNode();
  agent.assign({
    system: "You are helpful",
    prompt: "Say hello",
    model: { provider: "openai", id: PRICED_MODEL },
    max_tokens: MAX_TOKENS,
    ...props
  });
  return agent;
}

async function drain(agent: AgentNode, context: ProcessingContext) {
  const items: Record<string, unknown>[] = [];
  for await (const item of agent.genProcess(context)) items.push(item);
  return items;
}

describe("AgentNode run budget", () => {
  it("fails naming the cap, and makes no model call, when one turn cannot fit", async () => {
    // gpt-4o-mini bills $0.60 per 1M output tokens, so 4096 output tokens is a
    // worst case of ~$0.0025 — well over this cap.
    const factory = makeScriptedProvider();
    let created: ScriptedProvider | undefined;
    const context = createContext(() => (created = factory()));
    const agent = makeAgent({ cost_cap_usd: 0.0001 });

    await expect(drain(agent, context)).rejects.toThrow(
      /turn budget of \$0\.0001 reached/
    );
    expect(created?.calls).toBe(0);
  });

  it("reserves against the budget already on the context, not a fresh one", async () => {
    // The parent's cap is what has to hold. The node asks for $999 of its own,
    // which it must not get.
    const parent: RunBudget = createRunBudget({
      capUsd: 1,
      maxOutputTokens: MAX_TOKENS,
      unpricedTokenCeiling: 400000,
      deadlineMs: 60_000,
      maxConcurrency: 8,
      maxTurns: 10
    });
    const context = createContext(makeScriptedProvider(0.25), {
      [RUN_BUDGET_CONTEXT_KEY]: parent
    });
    const agent = makeAgent({ cost_cap_usd: 999 });

    await drain(agent, context);

    // A node that opened its own budget would leave the parent's spend at 0.
    expect(parent.turns.spentUsd).toBeCloseTo(0.25, 6);
    expect(parent.turnCount.current).toBe(1);
  });

  it("stops cleanly on an aborted run instead of raising", async () => {
    const context = createContext(makeStoppingProvider("aborted"));
    const agent = makeAgent({});

    const items = await drain(agent, context);

    expect(items.some((item) => item.text === "partial")).toBe(true);
  });

  it("keeps reaching Max Turns a clean end, not an error", async () => {
    const context = createContext(makeStoppingProvider("iterations"));
    const agent = makeAgent({});

    await expect(drain(agent, context)).resolves.toBeDefined();
  });
});
