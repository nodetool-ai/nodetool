/**
 * CodeActExecutor harness tests — a scripted provider drives code actions
 * through the real QuickJS sandbox and tool bridge. No network, no model.
 */
import { describe, it, expect } from "vitest";
import { CodeActExecutor } from "../src/codeact/codeact-executor.js";
import { Tool } from "../src/tools/base-tool.js";
import type { Step, Task } from "../src/types.js";
import type {
  BaseProvider,
  ProcessingContext,
  ProviderStreamItem,
  ToolCall
} from "@nodetool-ai/runtime";
import { createMockContext } from "./_helpers/mock-context.js";

class AddTool extends Tool {
  readonly name = "add";
  readonly description = "Add two numbers.";
  protected override readonly jsonSchema = {
    type: "object",
    properties: { a: { type: "number" }, b: { type: "number" } },
    required: ["a", "b"]
  };
  calls = 0;
  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    this.calls++;
    return { sum: Number(params["a"]) + Number(params["b"]) };
  }
}

class FailingTool extends Tool {
  readonly name = "always_fails";
  readonly description = "Fails every time.";
  async process(): Promise<unknown> {
    return { error: "boom", message: "this tool always fails" };
  }
}

/**
 * Minimal provider that owns the loop the way BaseProvider.generateLoop does:
 * each scripted turn is either a batch of tool calls (dispatched to the
 * ProviderTool's own `execute`) or a final assistant text message.
 */
type ScriptTurn = { toolCalls: ToolCall[] } | { assistant: string };

function createLoopProvider(turns: ScriptTurn[]): BaseProvider {
  return {
    provider: "fake",
    hasToolSupport: async () => true,
    async *generateLoop(args: {
      tools?: Array<{
        name: string;
        execute?: (a: Record<string, unknown>) => Promise<string | unknown>;
      }>;
      signal?: AbortSignal;
    }): AsyncGenerator<ProviderStreamItem> {
      const toolMap = new Map((args.tools ?? []).map((t) => [t.name, t]));
      for (const turn of turns) {
        if (args.signal?.aborted) break;
        if ("assistant" in turn) {
          yield {
            type: "message",
            message: { role: "assistant", content: turn.assistant }
          };
          continue;
        }
        for (const tc of turn.toolCalls) {
          if (args.signal?.aborted) break;
          yield tc;
          const tool = toolMap.get(tc.name);
          const content = tool?.execute ? await tool.execute(tc.args) : "";
          yield {
            type: "message",
            message: {
              role: "tool",
              toolCallId: tc.id,
              content:
                typeof content === "string" ? content : JSON.stringify(content)
            }
          };
        }
      }
      yield { type: "chunk", content: "", done: true };
    }
  } as unknown as BaseProvider;
}

function makeStep(outputSchema?: object): { step: Step; task: Task } {
  const step: Step = {
    id: "step_1",
    instructions: "Compute the answer",
    completed: false,
    dependsOn: [],
    logs: [],
    outputSchema: outputSchema ? JSON.stringify(outputSchema) : undefined
  };
  return { step, task: { id: "task_1", title: "T", steps: [step] } };
}

const ANSWER_SCHEMA = {
  type: "object",
  properties: { answer: { type: "number" } },
  required: ["answer"]
};

function codeAction(id: string, code: string): ToolCall {
  return { id, name: "execute_code", args: { code } };
}

describe("CodeActExecutor", () => {
  it("chains multiple tool calls in one action and finishes", async () => {
    const { step, task } = makeStep(ANSWER_SCHEMA);
    const context = createMockContext();
    const add = new AddTool();
    const provider = createLoopProvider([
      {
        toolCalls: [
          codeAction(
            "tc_1",
            `const first = await tools.add({a: 1, b: 2});
             const second = await tools.add({a: first.sum, b: 39});
             await finish({answer: second.sum});`
          )
        ]
      }
    ]);

    const executor = new CodeActExecutor({
      task,
      step,
      context: context as never,
      provider,
      model: "m",
      tools: [add]
    });

    const messages: Array<{ type: string; name?: string }> = [];
    for await (const msg of executor.execute()) {
      messages.push({
        type: msg.type,
        name: (msg as { name?: string }).name
      });
    }

    expect(step.completed).toBe(true);
    expect(executor.getResult()).toEqual({ answer: 42 });
    expect(add.calls).toBe(2);
    expect(context.memory.getValue("step:step_1")).toEqual({ answer: 42 });
    // Inner bridged calls surface as tool_call_update alongside execute_code.
    const toolUpdates = messages.filter((m) => m.type === "tool_call_update");
    expect(toolUpdates.map((m) => m.name)).toEqual([
      "execute_code",
      "add",
      "add"
    ]);
  });

  it("persists state across actions", async () => {
    const { step, task } = makeStep(ANSWER_SCHEMA);
    const context = createMockContext();
    const provider = createLoopProvider([
      { toolCalls: [codeAction("tc_1", `state.x = 41; return "stored";`)] },
      {
        toolCalls: [
          codeAction("tc_2", `await finish({answer: state.x + 1});`)
        ]
      }
    ]);

    const executor = new CodeActExecutor({
      task,
      step,
      context: context as never,
      provider,
      model: "m",
      tools: []
    });
    for await (const _msg of executor.execute()) {
      // drain
    }

    expect(step.completed).toBe(true);
    expect(executor.getResult()).toEqual({ answer: 42 });
  });

  it("rejects a schema-invalid finish and accepts the repaired one", async () => {
    const { step, task } = makeStep(ANSWER_SCHEMA);
    const context = createMockContext();
    const provider = createLoopProvider([
      {
        toolCalls: [
          codeAction("tc_1", `await finish({answer: "not a number"});`)
        ]
      },
      { toolCalls: [codeAction("tc_2", `await finish({answer: 7});`)] }
    ]);

    const executor = new CodeActExecutor({
      task,
      step,
      context: context as never,
      provider,
      model: "m",
      tools: []
    });
    for await (const _msg of executor.execute()) {
      // drain
    }

    expect(step.completed).toBe(true);
    expect(executor.getResult()).toEqual({ answer: 7 });
  });

  it("surfaces a failing tool as a guest exception the action can catch", async () => {
    const { step, task } = makeStep(ANSWER_SCHEMA);
    const context = createMockContext();
    const provider = createLoopProvider([
      {
        toolCalls: [
          codeAction(
            "tc_1",
            `let failed = false;
             try {
               await tools.always_fails({});
             } catch (e) {
               failed = e.message.includes("always fails");
             }
             await finish({answer: failed ? 1 : 0});`
          )
        ]
      }
    ]);

    const executor = new CodeActExecutor({
      task,
      step,
      context: context as never,
      provider,
      model: "m",
      tools: [new FailingTool()]
    });
    for await (const _msg of executor.execute()) {
      // drain
    }

    expect(step.completed).toBe(true);
    expect(executor.getResult()).toEqual({ answer: 1 });
  });

  it("keeps going after a crashed action", async () => {
    const { step, task } = makeStep(ANSWER_SCHEMA);
    const context = createMockContext();
    const provider = createLoopProvider([
      { toolCalls: [codeAction("tc_1", `throw new Error("oops");`)] },
      { toolCalls: [codeAction("tc_2", `await finish({answer: 3});`)] }
    ]);

    const executor = new CodeActExecutor({
      task,
      step,
      context: context as never,
      provider,
      model: "m",
      tools: []
    });
    for await (const _msg of executor.execute()) {
      // drain
    }

    expect(step.completed).toBe(true);
    expect(executor.getResult()).toEqual({ answer: 3 });
  });

  it("finalizes an unschema'd step from a plain assistant message", async () => {
    const { step, task } = makeStep();
    const context = createMockContext();
    const provider = createLoopProvider([
      { assistant: "The capital of France is Paris." }
    ]);

    const executor = new CodeActExecutor({
      task,
      step,
      context: context as never,
      provider,
      model: "m",
      tools: []
    });
    for await (const _msg of executor.execute()) {
      // drain
    }

    expect(step.completed).toBe(true);
    expect(executor.getResult()).toBe("The capital of France is Paris.");
  });

  it("fails the step explicitly when no completion happens", async () => {
    const { step, task } = makeStep(ANSWER_SCHEMA);
    const context = createMockContext();
    const provider = createLoopProvider([
      { toolCalls: [codeAction("tc_1", `return "still thinking";`)] }
    ]);

    const executor = new CodeActExecutor({
      task,
      step,
      context: context as never,
      provider,
      model: "m",
      tools: []
    });

    const results: Array<{ type: string; error?: string }> = [];
    for await (const msg of executor.execute()) {
      results.push(msg as { type: string; error?: string });
    }

    expect(step.completed).toBe(false);
    expect(step.failed).toBe(true);
    const stepResult = results.find((m) => m.type === "step_result");
    expect(stepResult?.error).toContain("Step failed");
  });
});

describe("resolveExecutionMode", () => {
  it("prefers the explicit option, then the setting, then tools", async () => {
    const { resolveExecutionMode, AGENT_EXECUTION_MODE_ENV } = await import(
      "../src/codeact/execution-mode.js"
    );
    const saved = process.env[AGENT_EXECUTION_MODE_ENV];
    try {
      delete process.env[AGENT_EXECUTION_MODE_ENV];
      expect(resolveExecutionMode()).toBe("tools");
      process.env[AGENT_EXECUTION_MODE_ENV] = "codeact";
      expect(resolveExecutionMode()).toBe("codeact");
      expect(resolveExecutionMode("tools")).toBe("tools");
      process.env[AGENT_EXECUTION_MODE_ENV] = "CodeAct";
      expect(resolveExecutionMode()).toBe("codeact");
      process.env[AGENT_EXECUTION_MODE_ENV] = "nonsense";
      expect(resolveExecutionMode()).toBe("tools");
    } finally {
      if (saved === undefined) delete process.env[AGENT_EXECUTION_MODE_ENV];
      else process.env[AGENT_EXECUTION_MODE_ENV] = saved;
    }
  });
});
