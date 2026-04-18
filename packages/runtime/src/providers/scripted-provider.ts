/**
 * ScriptedProvider -- a deterministic fake provider for agent E2E tests.
 *
 * Instead of a single fixed response, each generateMessages call dispatches
 * to the next script function in the sequence. Scripts can inspect the full
 * messages and tools list to decide what to yield, making it possible to
 * simulate a real LLM that responds to context.
 *
 * Usage:
 *   const provider = new ScriptedProvider([
 *     planScript({ title: "My Plan", steps: [...] }),   // call 0: planning
 *     stepScript({ answer: "42" }),                     // call 1: step 1
 *     stepScript({ summary: "done" }),                  // call 2: step 2
 *   ]);
 */

import { randomUUID } from "node:crypto";
import type { Chunk } from "@nodetool/protocol";
import { BaseProvider } from "./base-provider.js";
import type { Message, ProviderStreamItem, ProviderTool } from "./types.js";

// ---------------------------------------------------------------------------
// Script types
// ---------------------------------------------------------------------------

export type ScriptItem =
  | { type: "chunk"; content: string; done?: boolean }
  | {
      type: "tool_call";
      name: string;
      args: Record<string, unknown>;
      id?: string;
    };

/**
 * A script function is called with the current messages and tools for a
 * generateMessages invocation, and returns an array of items to yield.
 */
export type ScriptFn = (
  messages: Message[],
  tools: ProviderTool[]
) => ScriptItem[];

// ---------------------------------------------------------------------------
// ScriptedProvider
// ---------------------------------------------------------------------------

export class ScriptedProvider extends BaseProvider {
  private readonly scripts: ScriptFn[];
  private callIdx = 0;

  /** Full log of all generateMessages calls (messages + tools per call). */
  readonly callLog: Array<{ messages: Message[]; tools: ProviderTool[] }> = [];

  constructor(scripts: ScriptFn[]) {
    super("fake");
    if (scripts.length === 0)
      throw new Error("ScriptedProvider requires at least one script");
    this.scripts = scripts;
  }

  /** Reset call index and log (useful between test cases). */
  reset(): void {
    this.callIdx = 0;
    this.callLog.length = 0;
  }

  async generateMessage(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    maxTokens?: number;
  }): Promise<Message> {
    let content = "";
    for await (const item of this.generateMessages(args)) {
      if ("type" in item && (item as { type: string }).type === "chunk") {
        content += (item as { content?: string }).content ?? "";
      }
    }
    return { role: "assistant", content: content || "Done." };
  }

  async *generateMessages(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    maxTokens?: number;
  }): AsyncGenerator<ProviderStreamItem> {
    const tools = args.tools ?? [];
    this.callLog.push({ messages: args.messages, tools });

    // Use the next script; if exhausted, repeat the last one
    const idx = Math.min(this.callIdx, this.scripts.length - 1);
    this.callIdx++;
    const script = this.scripts[idx];
    const items = script(args.messages, tools);

    for (const item of items) {
      if (item.type === "chunk") {
        yield {
          type: "chunk",
          content: item.content,
          done: item.done ?? true,
          content_type: "text"
        } as Chunk;
      } else {
        // tool_call
        yield {
          id: item.id ?? randomUUID(),
          name: item.name,
          args: item.args
        };
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Script factory helpers
// ---------------------------------------------------------------------------

export interface TaskPlanSpec {
  title: string;
  steps: Array<{
    id: string;
    instructions: string;
    depends_on?: string[];
    output_schema?: string;
    tools?: string[];
  }>;
}

/**
 * Spec for a multi-task plan where each task runs as an independent sub-agent.
 */
export interface MultiTaskPlanSpec {
  title: string;
  tasks: Array<{
    id: string;
    title: string;
    depends_on?: string[];
    steps: Array<{
      id: string;
      instructions: string;
      depends_on?: string[];
      output_schema?: string;
      tools?: string[];
    }>;
  }>;
}

/**
 * Script that calls the `create_task` tool with the provided plan.
 * Use this for the planning phase of agent execution (single-task mode).
 */
export function planScript(taskSpec: TaskPlanSpec): ScriptFn {
  return (_messages, _tools) => [
    {
      type: "tool_call",
      name: "create_task",
      args: taskSpec as unknown as Record<string, unknown>
    }
  ];
}

/**
 * Script that calls the `create_plan` tool with a multi-task plan.
 * Use this for the planning phase of agent execution (multi-task mode).
 */
export function multiTaskPlanScript(planSpec: MultiTaskPlanSpec): ScriptFn {
  return (_messages, _tools) => [
    {
      type: "tool_call",
      name: "create_plan",
      args: planSpec as unknown as Record<string, unknown>
    }
  ];
}

/**
 * Script that calls `finish_step` with the provided result.
 * Use this for step execution phases.
 */
export function stepScript(result: unknown): ScriptFn {
  return (_messages, _tools) => [
    { type: "tool_call", name: "finish_step", args: { result } }
  ];
}

/**
 * Script that emits a plain text chunk (no tool call).
 * Useful for unstructured steps or testing fallback behavior.
 */
export function textScript(content: string): ScriptFn {
  return (_messages, _tools) => [{ type: "chunk", content, done: true }];
}

/**
 * Script that calls an arbitrary tool by name.
 */
export function toolCallScript(
  name: string,
  args: Record<string, unknown>
): ScriptFn {
  return (_messages, _tools) => [{ type: "tool_call", name, args }];
}

/**
 * Auto-detecting script: inspects the `tools` list for each call and decides:
 * - If `create_plan` is available → call it with `opts.multiTaskPlan` or auto-wrap `opts.plan`
 * - If `create_task` is available → call it with `opts.plan`
 * - If `finish_step` is available → call it with `opts.result`
 * - Otherwise → emit `opts.text` as a chunk
 *
 * This mimics a "smart" LLM that knows what tools are available.
 */
export function autoScript(opts: {
  plan?: TaskPlanSpec;
  multiTaskPlan?: MultiTaskPlanSpec;
  result?: unknown;
  text?: string;
}): ScriptFn {
  return (messages, tools) => {
    const toolNames = new Set(tools.map((t) => t.name));

    // Incremental planner: add_task + finish_plan
    if (
      toolNames.has("add_task") &&
      toolNames.has("finish_plan") &&
      (opts.multiTaskPlan || opts.plan)
    ) {
      const planSpec: MultiTaskPlanSpec = opts.multiTaskPlan ?? {
        title: opts.plan!.title,
        tasks: [
          {
            id: "task_1",
            title: opts.plan!.title,
            depends_on: [],
            steps: opts.plan!.steps
          }
        ]
      };

      // Count add_task tool results already in history to decide next step.
      let addedCount = 0;
      for (const m of messages) {
        if (m.role !== "tool") continue;
        const content = typeof m.content === "string" ? m.content : "";
        if (content.includes('"status":"task_added"')) addedCount++;
      }

      if (addedCount < planSpec.tasks.length) {
        const task = planSpec.tasks[addedCount];
        return [
          {
            type: "tool_call",
            name: "add_task",
            args: task as unknown as Record<string, unknown>
          }
        ];
      }
      return [
        {
          type: "tool_call",
          name: "finish_plan",
          args: { title: planSpec.title }
        }
      ];
    }

    if (toolNames.has("create_plan") && (opts.multiTaskPlan || opts.plan)) {
      // Legacy one-shot multi-task plan tool.
      const planArgs = opts.multiTaskPlan ?? {
        title: opts.plan!.title,
        tasks: [
          {
            id: "task_1",
            title: opts.plan!.title,
            depends_on: [],
            steps: opts.plan!.steps
          }
        ]
      };
      return [
        {
          type: "tool_call",
          name: "create_plan",
          args: planArgs as unknown as Record<string, unknown>
        }
      ];
    }
    if (toolNames.has("create_task") && opts.plan) {
      return [
        {
          type: "tool_call",
          name: "create_task",
          args: opts.plan as unknown as Record<string, unknown>
        }
      ];
    }
    if (toolNames.has("finish_step")) {
      return [
        {
          type: "tool_call",
          name: "finish_step",
          args: { result: opts.result ?? {} }
        }
      ];
    }
    return [
      { type: "chunk", content: opts.text ?? "Task completed.", done: true }
    ];
  };
}

/**
 * Sequence of tool calls followed by a finish_step.
 * Models a step where the LLM first uses tools, then completes.
 *
 * Example:
 *   toolThenFinishScript(
 *     [{ name: "calculator", args: { expression: "2+2" } }],
 *     { answer: 4 }
 *   )
 *
 * The provider will yield the tool call on the first iteration, and on the
 * next iteration (after tool results are fed back) it will yield finish_step.
 */
export function toolThenFinishScript(
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>,
  finalResult: unknown
): ScriptFn[] {
  const scripts: ScriptFn[] = [
    // First call: yield the tool calls
    (_messages, _tools) =>
      toolCalls.map((tc) => ({
        type: "tool_call" as const,
        name: tc.name,
        args: tc.args
      })),
    // Second call (after tool results): yield finish_step
    stepScript(finalResult)
  ];
  return scripts;
}
