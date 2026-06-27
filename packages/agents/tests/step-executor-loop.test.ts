/**
 * StepExecutor must work when the provider runs its own tool loop (the Claude
 * Agent SDK): a tool-free `generateMessages`, with tools driven inside
 * `generateLoop` via the harness-supplied `executeTool`.
 */
import { describe, it, expect } from "vitest";
import { StepExecutor } from "../src/step-executor.js";
import type { Step, Task } from "../src/types.js";
import type {
  BaseProvider,
  ProviderStreamItem,
  ToolCall
} from "@nodetool-ai/runtime";
import { createMockContext } from "./_helpers/mock-context.js";

function createSdkLoopProvider(script: ToolCall[]): BaseProvider {
  return {
    provider: "sdk_loop",
    hasToolSupport: async () => true,
    async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
      yield { type: "chunk", content: "Working…", done: false };
    },
    async *generateMessagesTraced(): AsyncGenerator<ProviderStreamItem> {
      yield { type: "chunk", content: "Working…", done: false };
    },
    // Mirrors the migrated BaseProvider.generateLoop: dispatch each call to the
    // ProviderTool's own `execute`, and stop after a `terminal` tool runs.
    async *generateLoop(args: {
      tools?: Array<{
        name: string;
        execute?: (a: Record<string, unknown>) => Promise<string | unknown>;
        terminal?: boolean;
      }>;
      executeTool?: (tc: ToolCall) => Promise<string | unknown>;
      signal?: AbortSignal;
    }): AsyncGenerator<ProviderStreamItem> {
      yield { type: "chunk", content: "Working…", done: false };
      const toolMap = new Map((args.tools ?? []).map((t) => [t.name, t]));
      for (const tc of script) {
        if (args.signal?.aborted) break;
        yield tc;
        const tool = toolMap.get(tc.name);
        const content = tool?.execute
          ? await tool.execute(tc.args)
          : args.executeTool
            ? await args.executeTool(tc)
            : "";
        yield {
          type: "message",
          message: {
            role: "tool",
            toolCallId: tc.id,
            content:
              typeof content === "string" ? content : JSON.stringify(content)
          }
        };
        if (tool?.terminal) break;
        if (args.signal?.aborted) break;
      }
      yield { type: "chunk", content: "", done: true };
    }
  } as unknown as BaseProvider;
}

describe("StepExecutor — provider-driven tool loop", () => {
  it("completes a schema'd step via finish_step when the provider owns the loop", async () => {
    const step: Step = {
      id: "step_1",
      instructions: "Compute the answer",
      completed: false,
      dependsOn: [],
      outputSchema: JSON.stringify({
        type: "object",
        properties: { answer: { type: "string" } },
        required: ["answer"]
      }),
      logs: []
    };
    const task: Task = { id: "task_1", title: "T", steps: [step] };
    const context = createMockContext();

    const provider = createSdkLoopProvider([
      { id: "tc_finish", name: "finish_step", args: { result: { answer: "42" } } }
    ]);

    const executor = new StepExecutor({
      task,
      step,
      context: context as never,
      provider,
      model: "opus"
    });

    const types: string[] = [];
    for await (const msg of executor.execute()) types.push(msg.type);

    expect(step.completed).toBe(true);
    expect(types).toContain("step_result");
    expect(context.memory.getValue("step:step_1")).toEqual({ answer: "42" });
    expect(executor.getResult()).toEqual({ answer: "42" });
  });
});
