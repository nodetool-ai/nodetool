/**
 * End-to-end tests for the unified agent memory system with progressive
 * disclosure.
 *
 * Drives `MultiModeAgent` in plan mode and `TaskExecutor` directly with a
 * scriptable mock provider, then verifies that:
 *
 *   1. Every step / task / input is written to `context.memory` under a
 *      canonical namespaced key.
 *   2. Memory contents are NOT auto-injected into prompts; the agent
 *      discovers them via `memory_list` / `memory_read` tools.
 *   3. Downstream tasks see only specific upstream key hints (the planner's
 *      declared `dependsOn` IDs), not full values.
 *   4. The progressive-disclosure round trip (`memory_list` → `memory_read`
 *      → `finish_step`) works end-to-end with a fake provider.
 */

import { describe, expect, it, vi } from "vitest";
import { MultiModeAgent } from "../src/multi-mode-agent.js";
import { TaskExecutor } from "../src/task-executor.js";
import { StepExecutor } from "../src/step-executor.js";
import { ParallelTaskExecutor } from "../src/parallel-task-executor.js";
import { memoryKeys } from "@nodetool-ai/runtime";
import type { Task, TaskPlan } from "../src/types.js";
import { createMockContext } from "./_helpers/mock-context.js";

// ---------------------------------------------------------------------------
// Mock provider that records the messages it sees on every call.
// ---------------------------------------------------------------------------

interface RecordedCall {
  systemPrompt: string;
  userContent: string;
  fullMessages: Array<{ role: string; content: unknown }>;
}

function createRecordingProvider(
  scripted: Record<
    string,
    | { type: "chunk"; content: string; done?: boolean }
    | { id: string; name: string; args: Record<string, unknown> }
  >[][]
) {
  const calls: RecordedCall[] = [];
  let callIndex = 0;
  return {
    provider: "mock",
    calls,
    hasToolSupport: async () => true,
    generateMessages: async function* (args: any) {
      const messages = (args?.messages ?? []) as Array<{
        role: string;
        content: unknown;
      }>;
      const sys = messages.find((m) => m.role === "system");
      const user = messages.find((m) => m.role === "user");
      calls.push({
        systemPrompt: typeof sys?.content === "string" ? sys.content : "",
        userContent: typeof user?.content === "string" ? user.content : "",
        fullMessages: messages
      });

      const items = scripted[callIndex] ?? [];
      callIndex++;
      for (const item of items) {
        yield item;
      }
    },
    async *generateMessagesTraced(...args: any[]) {
      yield* (this as any).generateMessages(...args);
    },
    async generateMessageTraced(...args: any[]) {
      return (this as any).generateMessage(...args);
    },
    generateMessage: vi.fn(),
    getAvailableLanguageModels: vi.fn().mockResolvedValue([]),
    getAvailableImageModels: vi.fn().mockResolvedValue([]),
    getAvailableVideoModels: vi.fn().mockResolvedValue([]),
    getAvailableTTSModels: vi.fn().mockResolvedValue([]),
    getAvailableASRModels: vi.fn().mockResolvedValue([]),
    getAvailableEmbeddingModels: vi.fn().mockResolvedValue([]),
    getContainerEnv: () => ({}),
    textToImage: vi.fn(),
    imageToImage: vi.fn(),
    textToSpeech: vi.fn(),
    automaticSpeechRecognition: vi.fn(),
    textToVideo: vi.fn(),
    imageToVideo: vi.fn(),
    generateEmbedding: vi.fn(),
    isContextLengthError: () => false
  } as any;
}

const finishStep = (id: string, result: unknown) => ({
  id,
  name: "finish_step",
  args: { result }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Agent memory propagation", () => {
  it("writes step and task results to memory under canonical keys", async () => {
    const provider = createRecordingProvider([
      [finishStep("tc1", { value: 42 })]
    ]);
    const context = createMockContext();

    const task: Task = {
      id: "task_alpha",
      title: "Alpha",
      steps: [
        {
          id: "step_alpha",
          instructions: "Compute alpha.",
          completed: false,
          dependsOn: [],
          outputSchema: JSON.stringify({
            type: "object",
            properties: { value: { type: "number" } }
          }),
          logs: []
        }
      ]
    };

    const executor = new TaskExecutor({
      provider,
      model: "test",
      context,
      tools: [],
      task
    });

    for await (const _ of executor.executeTasks()) {
      /* drain */
    }

    expect(context.memory.has(memoryKeys.step("step_alpha"))).toBe(true);
    expect(context.memory.getValue(memoryKeys.step("step_alpha"))).toEqual({
      value: 42
    });
    // Last step is the finish step → also stored as task_result.
    expect(context.memory.has(memoryKeys.task("task_alpha"))).toBe(true);
    expect(context.memory.getValue(memoryKeys.task("task_alpha"))).toEqual({
      value: 42
    });
  });

  it("seeds inputs as input: memory entries", async () => {
    const provider = createRecordingProvider([
      [finishStep("tc1", { value: 1 })]
    ]);
    const context = createMockContext();

    const task: Task = {
      id: "t1",
      title: "T",
      steps: [
        {
          id: "s1",
          instructions: "Do",
          completed: false,
          dependsOn: [],
          outputSchema: JSON.stringify({ type: "object", properties: {} }),
          logs: []
        }
      ]
    };

    const executor = new TaskExecutor({
      provider,
      model: "test",
      context,
      tools: [],
      task,
      inputs: { customer: "Acme", region: "EU" }
    });

    for await (const _ of executor.executeTasks()) {
      /* drain */
    }

    expect(context.memory.getValue(memoryKeys.input("customer"))).toBe("Acme");
    expect(context.memory.getValue(memoryKeys.input("region"))).toBe("EU");
    // Inputs are NOT auto-injected into the user message — the agent must
    // discover them via memory_list / memory_read (progressive disclosure).
    const userMsg = provider.calls[0].userContent;
    expect(userMsg).not.toContain("Acme");
    expect(userMsg).not.toContain("EU");
    // The system prompt always advertises the memory tools.
    const sysPrompt = provider.calls[0].systemPrompt;
    expect(sysPrompt).toContain("memory_list");
    expect(sysPrompt).toContain("memory_read");
  });

  it("makes upstream task results visible in downstream task prompts (plan mode)", async () => {
    const provider = createRecordingProvider([
      // task_research → step_research
      [finishStep("tc_a", { findings: ["alpha", "beta"] })],
      // task_report → step_report (depends on task_research)
      [finishStep("tc_b", { report: "summary" })]
    ]);
    const context = createMockContext();

    const plan: TaskPlan = {
      title: "Research and report",
      tasks: [
        {
          id: "task_research",
          title: "Research",
          dependsOn: [],
          completed: false,
          steps: [
            {
              id: "step_research",
              instructions: "Gather findings.",
              completed: false,
              dependsOn: [],
              outputSchema: JSON.stringify({
                type: "object",
                properties: {
                  findings: { type: "array", items: { type: "string" } }
                }
              }),
              logs: []
            }
          ]
        },
        {
          id: "task_report",
          title: "Report",
          dependsOn: ["task_research"],
          completed: false,
          steps: [
            {
              id: "step_report",
              instructions: "Write report from upstream findings.",
              completed: false,
              dependsOn: [],
              outputSchema: JSON.stringify({
                type: "object",
                properties: { report: { type: "string" } }
              }),
              logs: []
            }
          ]
        }
      ]
    };

    const executor = new ParallelTaskExecutor({
      provider,
      model: "test",
      context,
      tools: [],
      taskPlan: plan
    });

    for await (const _ of executor.execute()) {
      /* drain */
    }

    expect(plan.tasks[0].completed).toBe(true);
    expect(plan.tasks[1].completed).toBe(true);

    // First call (research) has no upstream task → no memory hint.
    const firstUserMsg = provider.calls[0].userContent;
    expect(firstUserMsg).not.toContain("task:task_research");
    expect(firstUserMsg).not.toContain("Required upstream memory");

    // Second call (report) names the upstream task as a memory hint —
    // values are NOT included; the agent fetches via memory_read.
    const secondUserMsg = provider.calls[1].userContent;
    expect(secondUserMsg).toContain(
      "# Required upstream memory (call `memory_read` with these keys):"
    );
    expect(secondUserMsg).toContain("- task:task_research");
    expect(secondUserMsg).not.toContain("alpha");
    expect(secondUserMsg).not.toContain("beta");

    // The actual value is in shared memory and reachable via the tool.
    expect(
      context.memory.getValue(memoryKeys.task("task_research"))
    ).toEqual({ findings: ["alpha", "beta"] });
  });

  it("preserves the default execution discipline (finish_step instructions) when a custom user prompt is provided", async () => {
    const provider = createRecordingProvider([
      [finishStep("tc_a", { findings: [] })]
    ]);
    const context = createMockContext();

    const plan: TaskPlan = {
      title: "Plan",
      tasks: [
        {
          id: "t1",
          title: "T",
          dependsOn: [],
          completed: false,
          steps: [
            {
              id: "s1",
              instructions: "Do work.",
              completed: false,
              dependsOn: [],
              outputSchema: JSON.stringify({
                type: "object",
                properties: {
                  findings: { type: "array", items: { type: "string" } }
                }
              }),
              logs: []
            }
          ]
        }
      ]
    };

    const userPrompt = "DOMAIN_PREAMBLE_MARKER: company data is confidential.";
    const executor = new ParallelTaskExecutor({
      provider,
      model: "test",
      context,
      tools: [],
      taskPlan: plan,
      systemPrompt: userPrompt
    });

    for await (const _ of executor.execute()) {
      /* drain */
    }

    // The final system prompt must contain BOTH the user preamble AND the
    // default execution discipline (output schema, finish_step protocol).
    const sys = provider.calls[0].systemPrompt;
    expect(sys).toContain("DOMAIN_PREAMBLE_MARKER");
    expect(sys).toContain("CALL `finish_step`");
    expect(sys).toContain("Output Schema");
  });

  it("plan mode emits a final task_result discoverable by callers", async () => {
    // Two-task plan via MultiModeAgent driven by the planner tool sequence.
    const provider = createRecordingProvider([
      // Planner: add_task #1
      [
        {
          id: "tc_add_1",
          name: "add_task",
          args: {
            id: "task_one",
            title: "Task One",
            depends_on: [],
            steps: [
              {
                id: "task_one_s1",
                instructions: "Do A",
                depends_on: [],
                output_schema: JSON.stringify({
                  type: "object",
                  properties: { greeting: { type: "string" } },
                  required: ["greeting"]
                })
              }
            ]
          }
        }
      ],
      // Planner: finish_plan
      [{ id: "tc_finish_plan", name: "finish_plan", args: { title: "P" } }],
      // Step task_one_s1
      [finishStep("tc_step", { greeting: "Hello" })]
    ]);
    const context = createMockContext();

    const agent = new MultiModeAgent({
      name: "test-plan-mode",
      objective: "Greet the user",
      provider,
      model: "test",
      mode: "plan"
    });

    for await (const _ of agent.execute(context)) {
      /* drain */
    }

    // The task result must be in shared memory under the canonical key.
    expect(context.memory.getValue(memoryKeys.task("task_one"))).toEqual({
      greeting: "Hello"
    });
    // The agent's `results` is set from the captured step_result.
    expect(agent.getResults()).toEqual({ greeting: "Hello" });
  });

  it("agent discovers and reads memory via memory_list → memory_read → finish_step", async () => {
    // Pre-populate memory with two upstream task results — neither auto-
    // injected. The agent must list, read the relevant one, and finish.
    const context = createMockContext();
    context.memory.set({
      key: memoryKeys.task("upstream_a"),
      kind: "task_result",
      value: { findings: ["alpha", "beta"] },
      source: "upstream_a",
      title: "Upstream A findings"
    });
    context.memory.set({
      key: memoryKeys.task("upstream_b"),
      kind: "task_result",
      value: { unrelated: "ignore me" },
      source: "upstream_b",
      title: "Upstream B"
    });

    // Scripted provider: turn 1 → memory_list, turn 2 → memory_read, turn 3 → finish_step.
    const provider = createRecordingProvider([
      // Turn 1: list memory
      [
        {
          id: "tc_list",
          name: "memory_list",
          args: { kind: ["task_result"] }
        }
      ],
      // Turn 2: read just the relevant entry
      [
        {
          id: "tc_read",
          name: "memory_read",
          args: { keys: ["task:upstream_a"] }
        }
      ],
      // Turn 3: finish_step using the value the agent fetched
      [finishStep("tc_finish", { summary: "alpha, beta" })]
    ]);

    const task: Task = {
      id: "task_synth",
      title: "Synthesize",
      steps: [
        {
          id: "step_synth",
          instructions: "Summarize the upstream findings.",
          completed: false,
          dependsOn: [],
          outputSchema: JSON.stringify({
            type: "object",
            properties: { summary: { type: "string" } },
            required: ["summary"]
          }),
          logs: []
        }
      ]
    };

    const executor = new StepExecutor({
      task,
      step: task.steps[0],
      context,
      provider,
      model: "test"
    });

    for await (const _ of executor.execute()) {
      /* drain */
    }

    // The first user message must NOT contain the values, only the
    // instructions + system prompt mentions of the memory tools.
    const firstUser = provider.calls[0].userContent;
    expect(firstUser).not.toContain("alpha");
    expect(firstUser).not.toContain("beta");

    // System prompt advertises the tools.
    const sys = provider.calls[0].systemPrompt;
    expect(sys).toContain("memory_list");
    expect(sys).toContain("memory_read");

    // After the agent fetched via memory_read, the conversation history
    // (turn 3) must include the value as a tool result.
    const turn3 = provider.calls[2].fullMessages;
    const toolMessages = turn3.filter((m) => m.role === "tool");
    const hasReadResult = toolMessages.some(
      (m) =>
        typeof m.content === "string" &&
        m.content.includes("alpha") &&
        m.content.includes("beta")
    );
    expect(hasReadResult).toBe(true);

    // Final result captured.
    expect(executor.getResult()).toEqual({ summary: "alpha, beta" });
  });

  it("memory_write publishes shared facts that subsequent steps see in memory_list", async () => {
    const context = createMockContext();

    // Step 1 publishes a fact via memory_write, then finishes.
    const provider = createRecordingProvider([
      [
        {
          id: "tc_write",
          name: "memory_write",
          args: {
            key: "top_source",
            value: "https://example.com/article",
            title: "Top source URL"
          }
        }
      ],
      [finishStep("tc_finish", { ok: true })]
    ]);

    const task: Task = {
      id: "task_publisher",
      title: "Publisher",
      steps: [
        {
          id: "step_publisher",
          instructions: "Publish the top source to shared memory.",
          completed: false,
          dependsOn: [],
          outputSchema: JSON.stringify({
            type: "object",
            properties: { ok: { type: "boolean" } },
            required: ["ok"]
          }),
          logs: []
        }
      ]
    };

    const executor = new StepExecutor({
      task,
      step: task.steps[0],
      context,
      provider,
      model: "test"
    });

    for await (const _ of executor.execute()) {
      /* drain */
    }

    // The shared entry is in memory under shared:<suffix>.
    const sharedKey = memoryKeys.shared("top_source");
    expect(context.memory.has(sharedKey)).toBe(true);
    const entry = context.memory.get(sharedKey);
    expect(entry?.kind).toBe("shared");
    expect(entry?.value).toBe("https://example.com/article");
    expect(entry?.title).toBe("Top source URL");
  });
});
