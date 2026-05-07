/**
 * End-to-end tests for the unified agent memory system.
 *
 * Drives `MultiModeAgent` in plan mode and `TaskExecutor` directly with a
 * scriptable mock provider, then verifies that:
 *
 *   1. Every step / task / input is written to `context.memory` under a
 *      canonical namespaced key.
 *   2. Downstream tasks see upstream task results in their step's user
 *      message (no replacement of the default execution prompt).
 *   3. Final task results survive even when only one task in a multi-task
 *      plan emits an `is_task_result` step result.
 */

import { describe, expect, it, vi } from "vitest";
import { MultiModeAgent } from "../src/multi-mode-agent.js";
import { TaskExecutor } from "../src/task-executor.js";
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
    // Inputs should also surface in the user message of the first step.
    const userMsg = provider.calls[0].userContent;
    expect(userMsg).toContain("# Memory");
    expect(userMsg).toContain("Acme");
    expect(userMsg).toContain("EU");
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

    // First call (research) must NOT see the not-yet-existing task result.
    const firstUserMsg = provider.calls[0].userContent;
    expect(firstUserMsg).not.toContain("task:task_research");

    // Second call (report) MUST see the upstream task result rendered into
    // the user message — proving downstream agents discover memory entries.
    const secondUserMsg = provider.calls[1].userContent;
    expect(secondUserMsg).toContain("# Memory");
    expect(secondUserMsg).toContain("task:task_research");
    expect(secondUserMsg).toContain("alpha");
    expect(secondUserMsg).toContain("beta");
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
});
