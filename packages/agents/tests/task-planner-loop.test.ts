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

/** Drain a planning generator, keeping every message it yielded. */
async function collectPlan(
  gen: AsyncGenerator<ProcessingMessage, TaskPlan | null>
): Promise<{ plan: TaskPlan | null; messages: ProcessingMessage[] }> {
  const messages: ProcessingMessage[] = [];
  let res = await gen.next();
  while (!res.done) {
    messages.push(res.value);
    res = await gen.next();
  }
  return { plan: res.value, messages };
}

function planningContents(messages: ProcessingMessage[]): string[] {
  return messages
    .filter((m) => m.type === "planning_update")
    .map((m) => (m as { content?: string }).content ?? "");
}

/**
 * A backend whose agent loop keeps producing text after the abort a committed
 * plan fires — the Claude Agent SDK race that made the model narrate a retry of
 * the finish_plan call that had just succeeded.
 */
function createLaggingAbortProvider(script: ToolCall[]): BaseProvider {
  return {
    provider: "lagging_sdk",
    hasToolSupport: async () => true,
    async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
      yield { type: "chunk", content: "", done: true };
    },
    async *generateMessagesTraced(): AsyncGenerator<ProviderStreamItem> {
      yield { type: "chunk", content: "", done: true };
    },
    async *generateLoop(args: {
      tools?: Array<{
        name: string;
        execute?: (a: Record<string, unknown>) => Promise<string | unknown>;
      }>;
    }): AsyncGenerator<ProviderStreamItem> {
      const toolMap = new Map((args.tools ?? []).map((t) => [t.name, t]));
      for (const tc of script) {
        yield tc;
        const tool = toolMap.get(tc.name);
        if (tool?.execute) await tool.execute(tc.args);
        yield {
          type: "message",
          message: { role: "tool", toolCallId: tc.id, content: "{}" }
        };
      }
      // Emitted after the plan committed and the loop was aborted.
      yield {
        type: "chunk",
        content: "The finish_plan call didn't complete. Let me retry.",
        done: false
      };
      yield { type: "chunk", content: "", done: true };
    }
  } as unknown as BaseProvider;
}

describe("TaskPlanner.planMultiTask — ending the loop", () => {
  it("drops provider text emitted after the plan is committed", async () => {
    const provider = createLaggingAbortProvider(scriptedPlanCalls());
    const planner = new TaskPlanner({ provider, model: "opus", tools: [] });

    const { plan, messages } = await collectPlan(
      planner.planMultiTask(OBJECTIVE, createMockContext() as ProcessingContext)
    );

    expect(plan?.title).toBe("Outreach Plan");
    const text = messages
      .filter((m) => m.type === "chunk")
      .map((m) => (m as { content?: string }).content ?? "")
      .join("");
    expect(text).not.toContain("didn't complete");
  });

  it("reports a cancelled run as cancelled, not as an exhausted budget", async () => {
    const controller = new AbortController();
    const provider = createSdkLoopProvider(scriptedPlanCalls().slice(0, 1));
    const planner = new TaskPlanner({
      provider,
      model: "opus",
      tools: [],
      signal: controller.signal
    });

    const gen = planner.planMultiTask(
      OBJECTIVE,
      createMockContext() as ProcessingContext
    );
    const messages: ProcessingMessage[] = [];
    let res = await gen.next();
    while (!res.done) {
      messages.push(res.value);
      controller.abort();
      res = await gen.next();
    }

    expect(res.value).toBeNull();
    const contents = planningContents(messages).join(" | ");
    expect(contents).toContain("cancelled");
    expect(contents).not.toContain("exhausted");
  });

  it("names the real ending when the model never calls finish_plan", async () => {
    const provider = createSdkLoopProvider(scriptedPlanCalls().slice(0, 2));
    const planner = new TaskPlanner({ provider, model: "opus", tools: [] });

    const { plan, messages } = await collectPlan(
      planner.planMultiTask(OBJECTIVE, createMockContext() as ProcessingContext)
    );

    expect(plan).toBeNull();
    const contents = planningContents(messages).join(" | ");
    expect(contents).toContain("2 task(s) without calling finish_plan");
    expect(contents).not.toContain("exhausted");
  });
});

/** Capture the system prompt the planner sends, then stop. */
function createPromptCapturingProvider(seen: { system: string }): BaseProvider {
  return {
    provider: "capture",
    hasToolSupport: async () => true,
    async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
      yield { type: "chunk", content: "", done: true };
    },
    async *generateMessagesTraced(): AsyncGenerator<ProviderStreamItem> {
      yield { type: "chunk", content: "", done: true };
    },
    async *generateLoop(args: {
      messages: Message[];
    }): AsyncGenerator<ProviderStreamItem> {
      seen.system = String(args.messages[0]?.content ?? "");
      yield { type: "chunk", content: "", done: true };
    }
  } as unknown as BaseProvider;
}

describe("TaskPlanner.planMultiTask — the system prompt", () => {
  it("keeps the planner contract when the caller supplies a prompt", async () => {
    const seen = { system: "" };
    const planner = new TaskPlanner({
      provider: createPromptCapturingProvider(seen),
      model: "opus",
      tools: [],
      systemPrompt: "You are a friendly assistant"
    });

    await drainPlan(
      planner.planMultiTask(OBJECTIVE, createMockContext() as ProcessingContext)
    );

    expect(seen.system).toContain("You are a friendly assistant");
    // The contract the caller's prompt used to replace outright.
    expect(seen.system).toContain("TaskArchitect");
    expect(seen.system).toContain("## ID Rules");
    expect(seen.system).toContain("## Parallelism");
    expect(seen.system).toContain("## Output Schemas");
    expect(seen.system.indexOf("You are a friendly assistant")).toBeLessThan(
      seen.system.indexOf("TaskArchitect")
    );
  });

  it("omits the media tool instructions when the run has no tools", async () => {
    const seen = { system: "" };
    const planner = new TaskPlanner({
      provider: createPromptCapturingProvider(seen),
      model: "opus",
      tools: []
    });

    const { messages } = await collectPlan(
      planner.planMultiTask(OBJECTIVE, createMockContext() as ProcessingContext)
    );

    expect(seen.system).not.toContain("generate_image");
    expect(seen.system).not.toContain("google_search");
    expect(seen.system).toContain("## No Execution Tools");
    expect(planningContents(messages).join(" | ")).toContain(
      "No execution tools available"
    );
  });
});
