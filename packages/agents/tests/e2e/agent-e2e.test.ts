/**
 * Agent E2E tests using ScriptedProvider.
 *
 * These tests drive the full agent execution pipeline (planning → task
 * execution → step execution) without any real LLM API calls.
 *
 * The ScriptedProvider acts like a real LLM: it inspects each call's
 * messages and tools and returns appropriate responses:
 *   - Planning call (tools includes "create_task") → returns create_task tool call
 *   - Step call (tools includes "finish_step") → returns finish_step tool call
 *   - Text call (no schema tools) → returns a plain text message
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Agent } from "../../src/agent.js";
import { TaskPlanner } from "../../src/task-planner.js";
import { TaskExecutor } from "../../src/task-executor.js";
import { StepExecutor } from "../../src/step-executor.js";
import {
  ScriptedProvider,
  planScript,
  stepScript,
  textScript,
  autoScript,
  toolThenFinishScript
} from "@nodetool-ai/runtime";
import type { Task } from "../../src/types.js";
import type { ProcessingMessage, StepResult } from "@nodetool-ai/protocol";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeContext() {
  const store = new Map<string, unknown>();
  return {
    storeStepResult: async (key: string, value: unknown) => {
      store.set(key, value);
      return key;
    },
    loadStepResult: async <T = unknown>(
      key: string,
      defaultValue?: T
    ): Promise<T> => {
      return (store.has(key) ? store.get(key) : defaultValue) as T;
    },
    set: (key: string, value: unknown) => {
      store.set(key, value);
    },
    get: (key: string) => store.get(key),
    _store: store
  } as any;
}

async function collectMessages(
  gen: AsyncGenerator<ProcessingMessage>
): Promise<ProcessingMessage[]> {
  const messages: ProcessingMessage[] = [];
  for await (const msg of gen) {
    messages.push(msg);
  }
  return messages;
}

function findStepResults(messages: ProcessingMessage[]): StepResult[] {
  return messages.filter((m) => m.type === "step_result") as StepResult[];
}

// A minimal task for tests that skip planning
function makeSimpleTask(overrides?: Partial<Task>): Task {
  return {
    id: "task-1",
    title: "Simple Test Task",
    steps: [
      {
        id: "step_1",
        instructions: "Return the answer to life, universe and everything.",
        completed: false,
        dependsOn: [],
        logs: [],
        outputSchema: JSON.stringify({
          type: "object",
          properties: { answer: { type: "number" } },
          required: ["answer"]
        })
      }
    ],
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// 1. StepExecutor — single step with scripted provider
// ---------------------------------------------------------------------------

describe("StepExecutor E2E", () => {
  it("completes a single structured step via finish_step", async () => {
    const provider = new ScriptedProvider([stepScript({ answer: 42 })]);
    const context = makeContext();
    const task = makeSimpleTask();
    const step = task.steps[0];

    const executor = new StepExecutor({
      task,
      step,
      context,
      provider,
      model: "fake-model"
    });

    const messages = await collectMessages(executor.execute());
    const results = findStepResults(messages);

    expect(results).toHaveLength(1);
    expect(results[0].result).toEqual({ answer: 42 });
    expect(step.completed).toBe(true);
  });

  it("completes an unstructured step (no schema) via plain text", async () => {
    const provider = new ScriptedProvider([
      textScript("The capital of France is Paris.")
    ]);
    const context = makeContext();
    const task: Task = {
      id: "task-text",
      title: "Text Task",
      steps: [
        {
          id: "step_text",
          instructions: "What is the capital of France?",
          completed: false,
          dependsOn: [],
          logs: []
          // No outputSchema — unstructured mode
        }
      ]
    };

    const executor = new StepExecutor({
      task,
      step: task.steps[0],
      context,
      provider,
      model: "fake-model"
    });

    const messages = await collectMessages(executor.execute());
    const results = findStepResults(messages);

    expect(results).toHaveLength(1);
    expect(results[0].result).toContain("Paris");
  });

  it("passes dependency results to the next step", async () => {
    const provider = new ScriptedProvider([stepScript({ doubled: 84 })]);
    const context = makeContext();

    // Seed the dependency result
    await context.storeStepResult("step_prev", { value: 42 });

    const task: Task = {
      id: "task-dep",
      title: "Dependency Task",
      steps: [
        {
          id: "step_next",
          instructions: "Double the value from step_prev.",
          completed: false,
          dependsOn: ["step_prev"],
          logs: [],
          outputSchema: JSON.stringify({
            type: "object",
            properties: { doubled: { type: "number" } },
            required: ["doubled"]
          })
        }
      ]
    };

    const executor = new StepExecutor({
      task,
      step: task.steps[0],
      context,
      provider,
      model: "fake-model"
    });

    const messages = await collectMessages(executor.execute());

    // The user message sent to the provider should include the dep result
    const firstCall = provider.callLog[0];
    const userMsg = firstCall.messages.find((m) => m.role === "user");
    expect(
      typeof userMsg?.content === "string" ? userMsg.content : ""
    ).toContain("step_prev");
    expect(findStepResults(messages)[0].result).toEqual({ doubled: 84 });
  });

  it("retries when finish_step result fails schema validation, then succeeds", async () => {
    // First call: finish_step missing required key "answer" → fails schema validation
    // Second call: finish_step with correct result
    const provider = new ScriptedProvider([
      stepScript({ wrong_key: "oops" }), // missing required "answer" key
      stepScript({ answer: 42 }) // correct
    ]);
    const context = makeContext();
    const task = makeSimpleTask();
    const step = task.steps[0];

    const executor = new StepExecutor({
      task,
      step,
      context,
      provider,
      model: "fake-model",
      maxIterations: 5
    });

    const messages = await collectMessages(executor.execute());
    const results = findStepResults(messages);

    // Should eventually succeed with the corrected result
    expect(results[results.length - 1].result).toEqual({ answer: 42 });
  });

  it("marks step as failed when maxIterations exhausted without finish_step", async () => {
    // Provider returns text, never calls finish_step
    const provider = new ScriptedProvider([textScript("I keep thinking...")]);
    const context = makeContext();
    const task = makeSimpleTask();

    const executor = new StepExecutor({
      task,
      step: task.steps[0],
      context,
      provider,
      model: "fake-model",
      maxIterations: 2
    });

    const messages = await collectMessages(executor.execute());
    const taskUpdates = messages.filter((m) => m.type === "task_update");
    const failed = taskUpdates.find((m) => (m as any).event === "step_failed");
    expect(failed).toBeDefined();
    expect(task.steps[0].completed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. TaskExecutor — multi-step task
// ---------------------------------------------------------------------------

describe("TaskExecutor E2E", () => {
  it("executes a 2-step sequential task", async () => {
    const provider = new ScriptedProvider([
      stepScript({ value: 10 }), // step_1
      stepScript({ result: 20 }) // step_2
    ]);
    const context = makeContext();
    const task: Task = {
      id: "task-seq",
      title: "Sequential Task",
      steps: [
        {
          id: "step_1",
          instructions: "Produce a value.",
          completed: false,
          dependsOn: [],
          logs: [],
          outputSchema: JSON.stringify({
            type: "object",
            properties: { value: { type: "number" } },
            required: ["value"]
          })
        },
        {
          id: "step_2",
          instructions: "Double the value from step_1.",
          completed: false,
          dependsOn: ["step_1"],
          logs: [],
          outputSchema: JSON.stringify({
            type: "object",
            properties: { result: { type: "number" } },
            required: ["result"]
          })
        }
      ]
    };

    const executor = new TaskExecutor({
      provider,
      model: "fake-model",
      context,
      tools: [],
      task
    });

    const messages = await collectMessages(executor.executeTasks());
    const results = findStepResults(messages);

    expect(results).toHaveLength(2);
    expect(results[0].result).toEqual({ value: 10 });
    expect(results[1].result).toEqual({ result: 20 });

    // step_1 result should be available for step_2 to load
    const stored = await context.loadStepResult("step_1");
    expect(stored).toEqual({ value: 10 });
  });

  it("executes independent steps (no deps) both to completion", async () => {
    const provider = new ScriptedProvider([
      stepScript({ a: 1 }),
      stepScript({ b: 2 })
    ]);
    const context = makeContext();
    const task: Task = {
      id: "task-parallel",
      title: "Parallel Task",
      steps: [
        {
          id: "step_a",
          instructions: "Compute a.",
          completed: false,
          dependsOn: [],
          logs: [],
          outputSchema: JSON.stringify({
            type: "object",
            properties: { a: { type: "number" } },
            required: ["a"]
          })
        },
        {
          id: "step_b",
          instructions: "Compute b.",
          completed: false,
          dependsOn: [],
          logs: [],
          outputSchema: JSON.stringify({
            type: "object",
            properties: { b: { type: "number" } },
            required: ["b"]
          })
        }
      ]
    };

    const executor = new TaskExecutor({
      provider,
      model: "fake-model",
      context,
      tools: [],
      task
    });
    const messages = await collectMessages(executor.executeTasks());
    const results = findStepResults(messages);

    expect(results).toHaveLength(2);
    const combined = Object.assign(
      {},
      ...results.map((r) => r.result as object)
    );
    expect(combined).toMatchObject({ a: 1, b: 2 });
  });
});

// ---------------------------------------------------------------------------
// 3. TaskPlanner — planning phase
// ---------------------------------------------------------------------------

describe("TaskPlanner E2E", () => {
  it("parses a valid create_task tool call into a Task", async () => {
    const provider = new ScriptedProvider([
      planScript({
        title: "Research Plan",
        steps: [
          { id: "gather", instructions: "Gather data.", depends_on: [] },
          {
            id: "analyze",
            instructions: "Analyze gathered data.",
            depends_on: ["gather"]
          }
        ]
      })
    ]);
    const context = makeContext();

    const planner = new TaskPlanner({ provider, model: "fake-model" });
    const gen = planner.plan("Research the topic", context);

    let task: Task | null = null;
    let result = await gen.next();
    while (!result.done) {
      result = await gen.next();
    }
    task = result.value;

    expect(task).not.toBeNull();
    expect(task!.title).toBe("Research Plan");
    expect(task!.steps).toHaveLength(2);
    expect(task!.steps[0].id).toBe("gather");
    expect(task!.steps[1].dependsOn).toContain("gather");
  });

  it("retries when LLM returns text instead of tool call", async () => {
    // Fail twice with text, succeed on 3rd.
    // StepExecutor drives the LLM loop, so each retry may use multiple
    // provider calls. We only verify the final plan was captured.
    const provider = new ScriptedProvider([
      textScript("Let me think about this..."), // attempt 1: no tool call → finalizes
      textScript("Still thinking..."), // attempt 2: no tool call → finalizes
      planScript({
        // attempt 3: valid plan
        title: "Retry Plan",
        steps: [{ id: "step_1", instructions: "Do it.", depends_on: [] }]
      })
    ]);
    const context = makeContext();

    const planner = new TaskPlanner({
      provider,
      model: "fake-model",
      maxRetries: 3
    });
    const gen = planner.plan("Do something", context);

    let task: Task | null = null;
    let result = await gen.next();
    while (!result.done) {
      result = await gen.next();
    }
    task = result.value;

    expect(task).not.toBeNull();
    expect(task!.title).toBe("Retry Plan");
    // StepExecutor uses at least 3 provider calls (one per retry attempt minimum)
    expect(provider.callLog.length).toBeGreaterThanOrEqual(3);
  });

  it("returns null after maxRetries without valid tool call", async () => {
    const provider = new ScriptedProvider([textScript("I refuse to plan.")]);
    const context = makeContext();

    const planner = new TaskPlanner({
      provider,
      model: "fake-model",
      maxRetries: 2
    });
    const gen = planner.plan("Plan something", context);

    let result = await gen.next();
    while (!result.done) {
      result = await gen.next();
    }

    expect(result.value).toBeNull();
  });

  it("rejects cyclic dependencies in plan", async () => {
    const provider = new ScriptedProvider([
      planScript({
        title: "Cyclic Plan",
        steps: [
          { id: "a", instructions: "Step A.", depends_on: ["b"] },
          { id: "b", instructions: "Step B.", depends_on: ["a"] }
        ]
      }),
      // Retry: valid plan after cycle rejection
      planScript({
        title: "Fixed Plan",
        steps: [
          { id: "a", instructions: "Step A.", depends_on: [] },
          { id: "b", instructions: "Step B.", depends_on: ["a"] }
        ]
      })
    ]);
    const context = makeContext();

    const planner = new TaskPlanner({
      provider,
      model: "fake-model",
      maxRetries: 3
    });
    const gen = planner.plan("Do something", context);

    let task: Task | null = null;
    let result = await gen.next();
    while (!result.done) {
      result = await gen.next();
    }
    task = result.value;

    expect(task).not.toBeNull();
    expect(task!.title).toBe("Fixed Plan");
    // First attempt was rejected (cyclic), second was accepted
    expect(provider.callLog.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// 4. Full Agent — planning + execution
// ---------------------------------------------------------------------------

describe("Agent E2E (full pipeline)", () => {
  it("runs full planning + execution with autoScript", async () => {
    const plan = {
      title: "Auto Plan",
      steps: [
        {
          id: "step_1",
          instructions: "Compute the result.",
          depends_on: [],
          output_schema: JSON.stringify({
            type: "object",
            properties: { value: { type: "number" } },
            required: ["value"]
          })
        }
      ]
    };

    // autoScript: first call gets create_task (planning), subsequent calls get finish_step
    const provider = new ScriptedProvider([
      autoScript({ plan, result: { value: 99 } }),
      autoScript({ plan, result: { value: 99 } })
    ]);
    const context = makeContext();

    const agent = new Agent({
      name: "test-agent",
      objective: "Compute the result.",
      provider,
      model: "fake-model"
    });

    const messages = await collectMessages(agent.execute(context));
    const results = findStepResults(messages);

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[results.length - 1].result).toEqual({ value: 99 });
  });

  it("skips planning when task is pre-provided", async () => {
    const provider = new ScriptedProvider([
      stepScript({ output: "hello world" })
    ]);
    const context = makeContext();

    const task = makeSimpleTask({
      steps: [
        {
          id: "step_1",
          instructions: "Say hello world.",
          completed: false,
          dependsOn: [],
          logs: [],
          outputSchema: JSON.stringify({
            type: "object",
            properties: { output: { type: "string" } },
            required: ["output"]
          })
        }
      ]
    });

    const agent = new Agent({
      name: "test-agent",
      objective: "Say hello.",
      provider,
      model: "fake-model",
      task
    });

    const messages = await collectMessages(agent.execute(context));
    const results = findStepResults(messages);

    // No planning call — provider only called once (step execution)
    expect(provider.callLog).toHaveLength(1);
    expect(results[0].result).toEqual({ output: "hello world" });
  });

  it("captures final result from the last task step", async () => {
    const provider = new ScriptedProvider([
      stepScript({ step1: "done" }),
      stepScript({ final: "answer" })
    ]);
    const context = makeContext();

    const task: Task = {
      id: "task-final",
      title: "Multi-step Task",
      steps: [
        {
          id: "step_1",
          instructions: "Do step 1.",
          completed: false,
          dependsOn: [],
          logs: [],
          outputSchema: JSON.stringify({
            type: "object",
            properties: { step1: { type: "string" } },
            required: ["step1"]
          })
        },
        {
          id: "step_2",
          instructions: "Finalize.",
          completed: false,
          dependsOn: ["step_1"],
          logs: [],
          outputSchema: JSON.stringify({
            type: "object",
            properties: { final: { type: "string" } },
            required: ["final"]
          })
        }
      ]
    };

    const agent = new Agent({
      name: "test-agent",
      objective: "Complete both steps.",
      provider,
      model: "fake-model",
      task
    });

    const messages = await collectMessages(agent.execute(context));
    const results = findStepResults(messages);
    const taskResults = results.filter((r) => r.is_task_result);

    // Last step should be marked as task result
    expect(taskResults).toHaveLength(1);
    expect(taskResults[0].result).toEqual({ final: "answer" });
    expect(agent.getResults()).toEqual({ final: "answer" });
  });
});

// ---------------------------------------------------------------------------
// 5. ScriptedProvider unit tests
// ---------------------------------------------------------------------------

describe("ScriptedProvider", () => {
  it("cycles through scripts in order", async () => {
    const provider = new ScriptedProvider([
      textScript("first"),
      textScript("second"),
      textScript("third")
    ]);

    const chunks: string[] = [];
    for (let i = 0; i < 3; i++) {
      for await (const item of provider.generateMessages({
        messages: [],
        model: "m"
      })) {
        if ("type" in item && (item as any).type === "chunk") {
          chunks.push((item as any).content);
        }
      }
    }

    expect(chunks).toEqual(["first", "second", "third"]);
  });

  it("repeats last script when call count exceeds script count", async () => {
    const provider = new ScriptedProvider([
      textScript("only"),
      textScript("last")
    ]);

    const chunks: string[] = [];
    for (let i = 0; i < 4; i++) {
      for await (const item of provider.generateMessages({
        messages: [],
        model: "m"
      })) {
        if ("type" in item && (item as any).type === "chunk") {
          chunks.push((item as any).content);
        }
      }
    }

    expect(chunks).toEqual(["only", "last", "last", "last"]);
  });

  it("autoScript detects create_task tool", async () => {
    const provider = new ScriptedProvider([
      autoScript({
        plan: {
          title: "T",
          steps: [{ id: "s1", instructions: "x", depends_on: [] }]
        }
      })
    ]);

    const items: any[] = [];
    for await (const item of provider.generateMessages({
      messages: [],
      model: "m",
      tools: [{ name: "create_task", description: "", inputSchema: {} }]
    })) {
      items.push(item);
    }

    expect(items[0].name).toBe("create_task");
    expect(items[0].args.title).toBe("T");
  });

  it("autoScript detects finish_step tool", async () => {
    const provider = new ScriptedProvider([autoScript({ result: { x: 1 } })]);

    const items: any[] = [];
    for await (const item of provider.generateMessages({
      messages: [],
      model: "m",
      tools: [{ name: "finish_step", description: "", inputSchema: {} }]
    })) {
      items.push(item);
    }

    expect(items[0].name).toBe("finish_step");
    expect(items[0].args.result).toEqual({ x: 1 });
  });

  it("autoScript falls back to text when no known tools", async () => {
    const provider = new ScriptedProvider([autoScript({ text: "fallback" })]);

    const items: any[] = [];
    for await (const item of provider.generateMessages({
      messages: [],
      model: "m",
      tools: []
    })) {
      items.push(item);
    }

    expect(items[0].type).toBe("chunk");
    expect(items[0].content).toBe("fallback");
  });

  it("logs all calls in callLog", async () => {
    const provider = new ScriptedProvider([textScript("a"), textScript("b")]);

    for (let i = 0; i < 2; i++) {
      // consume

      for await (const _ of provider.generateMessages({
        messages: [{ role: "user", content: `call ${i}` }],
        model: "m"
      })) {
        /* */
      }
    }

    expect(provider.callLog).toHaveLength(2);
    expect((provider.callLog[0].messages[0] as any).content).toBe("call 0");
    expect((provider.callLog[1].messages[0] as any).content).toBe("call 1");
  });

  it("reset() clears call index and log", async () => {
    const provider = new ScriptedProvider([textScript("a"), textScript("b")]);

    // Use both scripts
    for (let i = 0; i < 2; i++) {
      for await (const _ of provider.generateMessages({
        messages: [],
        model: "m"
      })) {
        /* */
      }
    }
    expect(provider.callLog).toHaveLength(2);

    provider.reset();
    expect(provider.callLog).toHaveLength(0);

    // After reset, starts from script 0 again
    const chunks: string[] = [];
    for await (const item of provider.generateMessages({
      messages: [],
      model: "m"
    })) {
      if ("type" in item && (item as any).type === "chunk") {
        chunks.push((item as any).content);
      }
    }
    expect(chunks).toEqual(["a"]);
  });
});
