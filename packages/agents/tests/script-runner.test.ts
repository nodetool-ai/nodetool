/**
 * ScriptRunner — orchestration scripts in the QuickJS sandbox, with every
 * `agent()` call backed by a real StepExecutor driven here by a fake provider
 * whose loop just calls `finish_step`.
 */
import { describe, it, expect } from "vitest";
import { ScriptRunner } from "../src/script-runner.js";
import type {
  BaseProvider,
  ProviderStreamItem,
  ToolCall
} from "@nodetool-ai/runtime";
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import { createMockContext } from "./_helpers/mock-context.js";

const ECHO_SCHEMA = {
  type: "object",
  properties: { echo: { type: "string" } },
  required: ["echo"]
};

interface EchoProviderOptions {
  /** Per-call delay so concurrency is observable. */
  delayMs?: number;
  /** Transform the step prompt into the `echo` value. Default: identity. */
  echoFor?: (prompt: string) => string;
}

/**
 * Fake provider whose generateLoop finishes every step via `finish_step`,
 * echoing the step's objective (embedded in the system message). Tracks the
 * number of concurrently running loops.
 */
function createEchoProvider(opts: EchoProviderOptions = {}) {
  let active = 0;
  let maxActive = 0;
  let calls = 0;

  const provider = {
    provider: "echo",
    hasToolSupport: async () => true,
    getTotalCost: () => calls * 0.01,
    async *generateLoop(args: {
      messages: Array<{ role: string; content: unknown }>;
      tools?: Array<{
        name: string;
        execute?: (a: Record<string, unknown>) => Promise<unknown>;
      }>;
    }): AsyncGenerator<ProviderStreamItem> {
      active++;
      calls++;
      maxActive = Math.max(maxActive, active);
      try {
        if (opts.delayMs) {
          await new Promise((r) => setTimeout(r, opts.delayMs));
        }
        const system = String(args.messages[0]?.content ?? "");
        const objective = /# Objective\n(.*)/.exec(system)?.[1] ?? "?";
        const echo = (opts.echoFor ?? ((p: string) => p))(objective);
        const finish = args.tools?.find((t) => t.name === "finish_step");
        const tc: ToolCall = {
          id: `tc_${calls}`,
          name: "finish_step",
          args: { result: { echo } }
        };
        yield tc;
        const content = await finish?.execute?.(tc.args as never);
        yield {
          type: "message",
          message: {
            role: "tool",
            toolCallId: tc.id,
            content:
              typeof content === "string" ? content : JSON.stringify(content)
          }
        };
        yield { type: "chunk", content: "", done: true };
      } finally {
        active--;
      }
    }
  } as unknown as BaseProvider;

  return {
    provider,
    getMaxActive: () => maxActive,
    getCalls: () => calls
  };
}

async function run(
  runner: ScriptRunner,
  script: string
): Promise<{ result: unknown; messages: ProcessingMessage[] }> {
  const messages: ProcessingMessage[] = [];
  const gen = runner.execute(script);
  let next = await gen.next();
  while (!next.done) {
    messages.push(next.value);
    next = await gen.next();
  }
  return { result: next.value, messages };
}

describe("ScriptRunner", () => {
  it("runs a single agent call and returns the script's return value", async () => {
    const { provider } = createEchoProvider();
    const runner = new ScriptRunner({
      provider,
      model: "test",
      context: createMockContext()
    });

    const { result, messages } = await run(
      runner,
      `const a = await agent("say hi", { schema: ${JSON.stringify(ECHO_SCHEMA)} });
       return { got: a.echo };`
    );

    expect(result).toEqual({ got: "say hi" });
    expect(messages.some((m) => m.type === "step_result")).toBe(true);
  });

  it("fans out with parallel() and respects the concurrency cap", async () => {
    const { provider, getMaxActive } = createEchoProvider({ delayMs: 20 });
    const runner = new ScriptRunner({
      provider,
      model: "test",
      context: createMockContext(),
      maxConcurrentAgents: 2
    });

    const { result } = await run(
      runner,
      `const results = await parallel(
         ["a", "b", "c", "d", "e"].map((p) => () =>
           agent(p, { schema: ${JSON.stringify(ECHO_SCHEMA)} })
         )
       );
       return results.map((r) => r.echo).sort();`
    );

    expect(result).toEqual(["a", "b", "c", "d", "e"]);
    expect(getMaxActive()).toBeLessThanOrEqual(2);
  });

  it("pipeline() threads stage results and passes the original item", async () => {
    const { provider } = createEchoProvider();
    const runner = new ScriptRunner({
      provider,
      model: "test",
      context: createMockContext()
    });

    const { result } = await run(
      runner,
      `const out = await pipeline(
         ["x", "y"],
         (item) => agent(item, { schema: ${JSON.stringify(ECHO_SCHEMA)} }),
         (prev, original, index) => original + ":" + prev.echo + ":" + index
       );
       return out;`
    );

    expect(result).toEqual(["x:x:0", "y:y:1"]);
  });

  it("enforces the lifetime agent-call cap; failed thunks become null", async () => {
    const { provider, getCalls } = createEchoProvider();
    const runner = new ScriptRunner({
      provider,
      model: "test",
      context: createMockContext(),
      maxAgentCalls: 2,
      maxConcurrentAgents: 1
    });

    const { result } = await run(
      runner,
      `const results = await parallel(
         ["a", "b", "c", "d"].map((p) => () =>
           agent(p, { schema: ${JSON.stringify(ECHO_SCHEMA)} })
         )
       );
       return results.filter((r) => r !== null).length;`
    );

    expect(result).toBe(2);
    expect(getCalls()).toBe(2);
  });

  it("exposes budget counters and inputs to the script", async () => {
    const { provider } = createEchoProvider();
    const runner = new ScriptRunner({
      provider,
      model: "test",
      context: createMockContext(),
      maxAgentCalls: 7,
      inputs: { topic: "foxes" }
    });

    const { result } = await run(
      runner,
      `await agent(inputs.topic, { schema: ${JSON.stringify(ECHO_SCHEMA)} });
       return {
         max: budget.maxAgentCalls,
         used: budget.agentCalls(),
         remaining: budget.remainingCalls(),
         spent: await budget.spentUsd(),
         topic: inputs.topic
       };`
    );

    expect(result).toEqual({
      max: 7,
      used: 1,
      remaining: 6,
      spent: 0.01,
      topic: "foxes"
    });
  });

  it("emits log() lines as log_update messages", async () => {
    const { provider } = createEchoProvider();
    const runner = new ScriptRunner({
      provider,
      model: "test",
      context: createMockContext()
    });

    const { messages } = await run(runner, `log("round 1 done"); return 1;`);

    const logs = messages.filter(
      (m) => m.type === "log_update" && m.content === "round 1 done"
    );
    expect(logs).toHaveLength(1);
  });

  it("throws when the script itself fails", async () => {
    const { provider } = createEchoProvider();
    const runner = new ScriptRunner({
      provider,
      model: "test",
      context: createMockContext()
    });

    await expect(run(runner, `throw new Error("boom");`)).rejects.toThrow(
      /Orchestration script failed: .*boom/
    );
  });

  it("agent() without a schema returns the sub-agent's text result", async () => {
    // Unstructured steps finalize on a no-tool-call assistant message.
    const provider = {
      provider: "text",
      hasToolSupport: async () => true,
      getTotalCost: () => 0,
      async *generateLoop(): AsyncGenerator<ProviderStreamItem> {
        yield { type: "chunk", content: "plain answer", done: false };
        yield {
          type: "message",
          message: { role: "assistant", content: "plain answer" }
        };
        yield { type: "chunk", content: "", done: true };
      }
    } as unknown as BaseProvider;

    const runner = new ScriptRunner({
      provider,
      model: "test",
      context: createMockContext()
    });

    const { result } = await run(
      runner,
      `const text = await agent("answer plainly");
       return text;`
    );

    expect(result).toBe("plain answer");
  });
});
