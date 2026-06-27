/**
 * The compiler must work when the provider runs its own tool loop (the Claude
 * Agent SDK): a tool-free `generateMessages`, with tools driven inside
 * `generateLoop` via the harness-supplied `executeTool`.
 */
import { describe, it, expect } from "vitest";
import { CompilerAgent } from "../src/compiler-agent.js";
import { memoryKeys } from "@nodetool-ai/runtime";
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
      yield { type: "chunk", content: "", done: true };
    },
    async *generateMessagesTraced(): AsyncGenerator<ProviderStreamItem> {
      yield { type: "chunk", content: "", done: true };
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

describe("CompilerAgent — provider-driven tool loop", () => {
  it("reads memory and finishes via finish_step when the provider owns the loop", async () => {
    const context = createMockContext();
    context.memory.set({
      key: memoryKeys.task("research"),
      kind: "task_result",
      value: { sources: ["alpha.com"] },
      source: "research",
      title: "Research findings"
    });

    const provider = createSdkLoopProvider([
      {
        id: "tc_read",
        name: "memory_read",
        args: { keys: ["task:research"] }
      },
      {
        id: "tc_finish",
        name: "finish_step",
        args: { result: { summary: "Done.", sources: ["alpha.com"] } }
      }
    ]);

    const compiler = new CompilerAgent({
      objective: "Summarize research",
      outputSchema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          sources: { type: "array", items: { type: "string" } }
        },
        required: ["summary", "sources"]
      },
      provider,
      model: "opus",
      context: context as never
    });

    const events: unknown[] = [];
    const gen = compiler.compile();
    let next = await gen.next();
    while (!next.done) {
      events.push(next.value);
      next = await gen.next();
    }

    expect(next.value).toEqual({ summary: "Done.", sources: ["alpha.com"] });
    const names = events
      .filter((e) => (e as { type?: string }).type === "tool_call_update")
      .map((e) => (e as { name: string }).name);
    expect(names).toContain("memory_read");
    expect(names).toContain("finish_step");
  });

  it("returns prose (no output schema) from the final assistant turn", async () => {
    const context = createMockContext();

    // Prose mode has no finish_step tool — the loop ends on a no-tool-call turn
    // and the final assistant text is the result.
    const provider = {
      provider: "sdk_loop",
      hasToolSupport: async () => true,
      async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
        yield { type: "chunk", content: "Final prose answer.", done: false };
      },
      async *generateMessagesTraced(): AsyncGenerator<ProviderStreamItem> {
        yield { type: "chunk", content: "Final prose answer.", done: false };
      },
      async *generateLoop(): AsyncGenerator<ProviderStreamItem> {
        yield { type: "chunk", content: "Final prose answer.", done: false };
        yield {
          type: "message",
          message: { role: "assistant", content: "Final prose answer." }
        };
        yield { type: "chunk", content: "", done: true };
      }
    } as unknown as BaseProvider;

    const compiler = new CompilerAgent({
      objective: "Summarize",
      provider,
      model: "opus",
      context: context as never
    });

    const gen = compiler.compile();
    let next = await gen.next();
    while (!next.done) next = await gen.next();
    expect(next.value).toBe("Final prose answer.");
  });
});
