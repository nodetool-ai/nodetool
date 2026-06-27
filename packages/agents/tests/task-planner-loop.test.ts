import { describe, it, expect } from "vitest";
import { TaskPlanner } from "../src/task-planner.js";
import { FakeProvider } from "@nodetool-ai/runtime";
import type {
  BaseProvider,
  ProcessingContext,
  ProviderStreamItem,
  ToolCall,
  Message
} from "@nodetool-ai/runtime";
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import type { TaskPlan } from "../src/types.js";
import { createMockContext } from "./_helpers/mock-context.js";

const OBJECTIVE = "Research and write outreach";

/** A plausible two-task plan, scripted as the tool calls a planner LLM emits. */
function scriptedPlanCalls(): ToolCall[] {
  return [
    {
      id: "tc_add_1",
      name: "add_task",
      args: {
        id: "task_research",
        title: "Research the prospect",
        depends_on: [],
        steps: [
          {
            id: "task_research_s1",
            instructions: "Search the web",
            depends_on: []
          }
        ]
      }
    },
    {
      id: "tc_add_2",
      name: "add_task",
      args: {
        id: "task_write",
        title: "Write outreach",
        depends_on: ["task_research"],
        steps: [
          {
            id: "task_write_s1",
            instructions: "Draft the email",
            depends_on: []
          }
        ]
      }
    },
    { id: "tc_finish", name: "finish_plan", args: { title: "Outreach Plan" } }
  ];
}

/**
 * Mimics a provider whose backend runs its own agent loop (the Claude Agent
 * SDK): `generateMessages` is tool-free, and tools are driven inside
 * `generateLoop`, which calls the harness-supplied `executeTool` and translates
 * the result stream into ToolCall items and tool-result message events.
 */
function createSdkLoopProvider(script: ToolCall[]): BaseProvider {
  return {
    provider: "sdk_loop",
    hasToolSupport: async () => true,
    // Tool-free single-turn primitive — ignores `tools`, like the agent SDK.
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
            content: typeof content === "string" ? content : JSON.stringify(content)
          }
        };
        if (tool?.terminal) break;
        if (args.signal?.aborted) break;
      }
      yield { type: "chunk", content: "", done: true };
    }
  } as unknown as BaseProvider;
}

/** Drain a planning generator and return its final TaskPlan (or null). */
async function drainPlan(
  gen: AsyncGenerator<ProcessingMessage, TaskPlan | null>
): Promise<TaskPlan | null> {
  let res = await gen.next();
  while (!res.done) res = await gen.next();
  return res.value;
}

describe("TaskPlanner.planMultiTask — provider-driven tool loop", () => {
  it("builds a plan when the provider runs its own tool loop (agent SDK)", async () => {
    const provider = createSdkLoopProvider(scriptedPlanCalls());
    const planner = new TaskPlanner({ provider, model: "opus", tools: [] });

    const plan = await drainPlan(
      planner.planMultiTask(OBJECTIVE, createMockContext() as ProcessingContext)
    );

    expect(plan).not.toBeNull();
    expect(plan!.title).toBe("Outreach Plan");
    expect(plan!.tasks.map((t) => t.id)).toEqual(["task_research", "task_write"]);
    expect(plan!.tasks[1].dependsOn).toEqual(["task_research"]);
  });

  it("still builds a plan with a completion-style provider", async () => {
    let burst = 0;
    const provider = new FakeProvider({
      customResponseFn: (_messages: Message[]): string | ToolCall[] => {
        if (burst++ === 0) return scriptedPlanCalls();
        return "done";
      }
    });
    const planner = new TaskPlanner({
      provider: provider as unknown as BaseProvider,
      model: "fake",
      tools: []
    });

    const plan = await drainPlan(
      planner.planMultiTask(OBJECTIVE, createMockContext() as ProcessingContext)
    );

    expect(plan).not.toBeNull();
    expect(plan!.title).toBe("Outreach Plan");
    expect(plan!.tasks.map((t) => t.id)).toEqual(["task_research", "task_write"]);
  });
});
