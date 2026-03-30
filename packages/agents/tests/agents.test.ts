import { describe, it, expect, vi } from "vitest";
import { SimpleAgent } from "../src/simple-agent.js";
import { TaskPlanner } from "../src/task-planner.js";
import { TaskExecutor } from "../src/task-executor.js";
import type { Step, Task } from "../src/types.js";
import type { ProcessingMessage } from "@nodetool/protocol";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Create a mock provider that yields items from a sequence of responses.
 * Each call to generateMessages consumes the next response from the queue.
 * If the queue is exhausted, returns an empty stream.
 */
function createMockProvider(
  responseSequence: Array<
    Array<
      | { type: "chunk"; content: string; done?: boolean }
      | { id: string; name: string; args: Record<string, unknown> }
    >
  >,
) {
  let callIndex = 0;
  return {
    provider: "mock",
    hasToolSupport: async () => true,
    generateMessages: async function* () {
      const items = responseSequence[callIndex] ?? [];
      callIndex++;
      for (const item of items) {
        yield item;
      }
    },
    async *generateMessagesTraced(...args: any[]) { yield* (this as any).generateMessages(...args); },
    async generateMessageTraced(...args: any[]) { return (this as any).generateMessage(...args); },
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
    isContextLengthError: () => false,
  } as any;
}

/**
 * Minimal mock ProcessingContext.
 */
function createMockContext() {
  const store = new Map<string, unknown>();
  return {
    storeStepResult: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
      return key;
    }),
    loadStepResult: vi.fn(async (key: string) => {
      return store.get(key);
    }),
    set: vi.fn((key: string, value: unknown) => {
      store.set(key, value);
    }),
    get: vi.fn((key: string) => {
      return store.get(key);
    }),
    _store: store,
  } as any;
}

// ---------------------------------------------------------------------------
// SimpleAgent
// ---------------------------------------------------------------------------

describe("SimpleAgent", () => {
  it("executes and returns result from a single step", async () => {
    const provider = createMockProvider([
      [
        { type: "chunk", content: "thinking..." },
        {
          id: "tc_1",
          name: "finish_step",
          args: { result: { value: "hello" } },
        },
      ],
    ]);

    const agent = new SimpleAgent({
      name: "test-agent",
      objective: "Say hello",
      provider,
      model: "test-model",
      tools: [],
      outputSchema: {
        type: "object",
        properties: { value: { type: "string" } },
      },
    });

    const context = createMockContext();
    const messages: ProcessingMessage[] = [];
    for await (const msg of agent.execute(context)) {
      messages.push(msg);
    }

    expect(agent.getResults()).toEqual({ value: "hello" });
    expect(agent.task).not.toBeNull();
    expect(agent.task!.steps).toHaveLength(1);
    expect(agent.task!.steps[0].completed).toBe(true);
  });

  it("works with default tools when none provided", async () => {
    const provider = createMockProvider([
      [
        { type: "chunk", content: "ok" },
        {
          id: "tc_1",
          name: "finish_step",
          args: { result: { v: 1 } },
        },
      ],
    ]);

    const agent = new SimpleAgent({
      name: "no-tools-agent",
      objective: "Do nothing",
      provider,
      model: "test-model",
      // tools not provided, should default to []
      outputSchema: { type: "object", properties: { v: { type: "number" } } },
    });

    const context = createMockContext();
    for await (const _msg of agent.execute(context)) {
      // consume
    }

    expect(agent.getResults()).toEqual({ v: 1 });
  });

  it("yields processing messages during execution", async () => {
    const provider = createMockProvider([
      [
        { type: "chunk", content: "Working on it..." },
        { type: "chunk", content: " Almost done." },
        {
          id: "tc_1",
          name: "finish_step",
          args: { result: { done: true } },
        },
      ],
    ]);

    const agent = new SimpleAgent({
      name: "test-agent",
      objective: "Do something",
      provider,
      model: "test-model",
      tools: [],
      outputSchema: { type: "object", properties: { done: { type: "boolean" } } },
    });

    const context = createMockContext();
    const messages: ProcessingMessage[] = [];
    for await (const msg of agent.execute(context)) {
      messages.push(msg);
    }

    const types = messages.map((m) => m.type);
    expect(types).toContain("task_update");
    expect(types).toContain("chunk");
    expect(types).toContain("step_result");

    // Verify we got the chunk content
    const chunks = messages.filter((m) => m.type === "chunk");
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// TaskPlanner
// ---------------------------------------------------------------------------

describe("TaskPlanner", () => {
  it("creates a task with steps from LLM response", async () => {
    const taskPayload = {
      title: "My Task",
      steps: [
        { id: "step_a", instructions: "Do A", depends_on: [] },
        { id: "step_b", instructions: "Do B", depends_on: ["step_a"] },
      ],
    };

    const provider = createMockProvider([
      [
        { type: "chunk", content: "Planning..." },
        {
          id: "tc_plan",
          name: "create_task",
          args: taskPayload,
        },
      ],
    ]);

    const planner = new TaskPlanner({
      provider,
      model: "test-model",
    });

    const context = createMockContext();
    const messages: ProcessingMessage[] = [];
    let task: Task | null = null;

    const gen = planner.plan("Build something", context);
    let result = await gen.next();
    while (!result.done) {
      messages.push(result.value);
      result = await gen.next();
    }
    task = result.value;

    expect(task).not.toBeNull();
    expect(task!.title).toBe("My Task");
    expect(task!.steps).toHaveLength(2);
    expect(task!.steps[0].id).toBe("step_a");
    expect(task!.steps[1].id).toBe("step_b");
    expect(task!.steps[1].dependsOn).toEqual(["step_a"]);

    // Should have a planning_update message
    const planningUpdates = messages.filter((m) => m.type === "planning_update");
    expect(planningUpdates.length).toBeGreaterThanOrEqual(1);
  });

  it("validates DAG structure and rejects circular deps", async () => {
    const circularPayload = {
      title: "Circular Task",
      steps: [
        { id: "step_x", instructions: "Do X", depends_on: ["step_y"] },
        { id: "step_y", instructions: "Do Y", depends_on: ["step_x"] },
      ],
    };

    const provider = createMockProvider([
      [
        {
          id: "tc_plan",
          name: "create_task",
          args: circularPayload,
        },
      ],
    ]);

    const planner = new TaskPlanner({
      provider,
      model: "test-model",
    });

    const context = createMockContext();
    const messages: ProcessingMessage[] = [];

    const gen = planner.plan("Circular objective", context);
    let result = await gen.next();
    while (!result.done) {
      messages.push(result.value);
      result = await gen.next();
    }
    const task = result.value;

    // Should return null due to circular dependencies
    expect(task).toBeNull();

    // Should have a planning_update about circular dependencies
    const errorUpdates = messages.filter(
      (m) =>
        (m.type === "planning_update" &&
          "content" in m &&
          typeof (m as any).content === "string" &&
          (m as any).content.toLowerCase().includes("circular")) ||
        (m.type === "chunk" &&
          "content" in m &&
          typeof (m as any).content === "string" &&
          (m as any).content.toLowerCase().includes("circular")),
    );
    expect(errorUpdates.length).toBeGreaterThanOrEqual(1);
  });

  it("includes outputSchema in planner prompt when provided", async () => {
    const taskPayload = {
      title: "Schema Plan",
      steps: [
        { id: "step_a", instructions: "Do A", depends_on: [] },
      ],
    };

    const provider = createMockProvider([
      [
        {
          id: "tc_plan",
          name: "create_task",
          args: taskPayload,
        },
      ],
    ]);

    const planner = new TaskPlanner({
      provider,
      model: "test-model",
      outputSchema: { type: "object", properties: { answer: { type: "string" } } },
    });

    const context = createMockContext();
    const gen = planner.plan("Plan with schema", context);
    let result = await gen.next();
    while (!result.done) {
      result = await gen.next();
    }
    const task = result.value;

    expect(task).not.toBeNull();
  });

  it("includes tool info when tools are provided", async () => {
    const taskPayload = {
      title: "Tools Task",
      steps: [
        { id: "step_a", instructions: "Use tool", depends_on: [] },
      ],
    };

    const provider = createMockProvider([
      [
        {
          id: "tc_plan",
          name: "create_task",
          args: taskPayload,
        },
      ],
    ]);

    const mockTool = {
      name: "my_tool",
      description: "A test tool",
      inputSchema: { type: "object" as const, properties: {}, required: [] },
      process: async () => ({}),
      userMessage: () => "Using my_tool",
      toProviderTool: () => ({
        name: "my_tool",
        description: "A test tool",
        inputSchema: { type: "object", properties: {}, required: [] },
      }),
    };

    const planner = new TaskPlanner({
      provider,
      model: "test-model",
      tools: [mockTool as any],
    });

    const context = createMockContext();
    const gen = planner.plan("Use tools", context);
    let result = await gen.next();
    while (!result.done) {
      result = await gen.next();
    }
    const task = result.value;

    expect(task).not.toBeNull();
    expect(task!.title).toBe("Tools Task");
  });

  it("extracts task from text when no tool call is made", async () => {
    const taskPayload = {
      title: "Text Task",
      steps: [
        { id: "step_a", instructions: "Do A", depends_on: [] },
      ],
    };

    // Provider returns JSON in text, not as a tool call
    const provider = createMockProvider([
      [
        { type: "chunk", content: `Here is the plan: ${JSON.stringify(taskPayload)}` },
      ],
    ]);

    const planner = new TaskPlanner({
      provider,
      model: "test-model",
    });

    const context = createMockContext();
    const gen = planner.plan("Text extraction test", context);
    let result = await gen.next();
    while (!result.done) {
      result = await gen.next();
    }
    const task = result.value;

    expect(task).not.toBeNull();
    expect(task!.title).toBe("Text Task");
    expect(task!.steps).toHaveLength(1);
  });

  it("handles dependsOn camelCase field name and missing depends fields", async () => {
    const taskPayload = {
      title: "CamelCase Task",
      steps: [
        { id: "step_a", instructions: "Do A", dependsOn: [] },
        { id: "step_b", instructions: "Do B", dependsOn: ["step_a"] },
        { id: "step_c", instructions: "Do C" }, // no depends_on or dependsOn => fallback to []
      ],
    };

    const provider = createMockProvider([
      [
        {
          id: "tc_plan",
          name: "create_task",
          args: taskPayload,
        },
      ],
    ]);

    const planner = new TaskPlanner({
      provider,
      model: "test-model",
    });

    const context = createMockContext();
    const gen = planner.plan("Test camelCase deps", context);
    let result = await gen.next();
    while (!result.done) {
      result = await gen.next();
    }
    const task = result.value;

    expect(task).not.toBeNull();
    expect(task!.steps[0].dependsOn).toEqual([]);
    expect(task!.steps[1].dependsOn).toEqual(["step_a"]);
    // step_c has no depends_on or dependsOn, should default to []
    expect(task!.steps[2].dependsOn).toEqual([]);
  });

  it("returns null when LLM provides no task data", async () => {
    // Provider that returns no tool call and no extractable JSON
    const provider = createMockProvider([
      [
        { type: "chunk", content: "I don't know how to plan this." },
      ],
    ]);

    const planner = new TaskPlanner({
      provider,
      model: "test-model",
    });

    const context = createMockContext();
    const messages: ProcessingMessage[] = [];
    const gen = planner.plan("Impossible objective", context);
    let result = await gen.next();
    while (!result.done) {
      messages.push(result.value);
      result = await gen.next();
    }
    const task = result.value;

    expect(task).toBeNull();
    // Should have a failure chunk
    const failChunks = messages.filter(
      (m) =>
        m.type === "chunk" &&
        typeof (m as any).content === "string" &&
        (m as any).content.includes("Failed"),
    );
    expect(failChunks).toHaveLength(1);
  });

  it("handles output_schema snake_case field name", async () => {
    const taskPayload = {
      title: "Snake Schema Task",
      steps: [
        {
          id: "step_a",
          instructions: "Do A",
          depends_on: [],
          output_schema: '{"type": "string"}',
        },
      ],
    };

    const provider = createMockProvider([
      [
        {
          id: "tc_plan",
          name: "create_task",
          args: taskPayload,
        },
      ],
    ]);

    const planner = new TaskPlanner({
      provider,
      model: "test-model",
    });

    const context = createMockContext();
    const gen = planner.plan("Test snake_case output_schema", context);
    let result = await gen.next();
    while (!result.done) {
      result = await gen.next();
    }
    const task = result.value;

    expect(task).not.toBeNull();
    expect(task!.steps[0].outputSchema).toBe('{"type": "string"}');
  });

  it("handles malformed step data with missing fields and tools array", async () => {
    const taskPayload = {
      title: "Malformed Task",
      steps: [
        { depends_on: [] }, // missing id and instructions
        { id: "step_b", instructions: "Do B", depends_on: [], tools: ["my_tool"] },
      ],
    };

    const provider = createMockProvider([
      [
        {
          id: "tc_plan",
          name: "create_task",
          args: taskPayload,
        },
      ],
    ]);

    const planner = new TaskPlanner({
      provider,
      model: "test-model",
    });

    const context = createMockContext();
    const gen = planner.plan("Malformed step test", context);
    let result = await gen.next();
    while (!result.done) {
      result = await gen.next();
    }
    const task = result.value;

    expect(task).not.toBeNull();
    expect(task!.steps).toHaveLength(2);
    // First step: id should be a UUID (generated), instructions empty
    expect(task!.steps[0].id).toBeTruthy();
    expect(task!.steps[0].instructions).toBe("");
    // Second step: should have tools array
    expect(task!.steps[1].tools).toEqual(["my_tool"]);
  });

  it("handles missing title and steps in task data", async () => {
    const taskPayload = {}; // No title, no steps

    const provider = createMockProvider([
      [
        {
          id: "tc_plan",
          name: "create_task",
          args: taskPayload,
        },
      ],
    ]);

    const planner = new TaskPlanner({
      provider,
      model: "test-model",
    });

    const context = createMockContext();
    const gen = planner.plan("Empty task data", context);
    let result = await gen.next();
    while (!result.done) {
      result = await gen.next();
    }
    const task = result.value;

    expect(task).not.toBeNull();
    expect(task!.title).toBe("Untitled Task");
    expect(task!.steps).toHaveLength(0);
  });

  it("handles outputSchema camelCase field name", async () => {
    const taskPayload = {
      title: "Schema Task",
      steps: [
        {
          id: "step_a",
          instructions: "Do A",
          depends_on: [],
          outputSchema: '{"type": "object"}',
        },
      ],
    };

    const provider = createMockProvider([
      [
        {
          id: "tc_plan",
          name: "create_task",
          args: taskPayload,
        },
      ],
    ]);

    const planner = new TaskPlanner({
      provider,
      model: "test-model",
    });

    const context = createMockContext();
    const gen = planner.plan("Test camelCase outputSchema", context);
    let result = await gen.next();
    while (!result.done) {
      result = await gen.next();
    }
    const task = result.value;

    expect(task).not.toBeNull();
    expect(task!.steps[0].outputSchema).toBe('{"type": "object"}');
  });
});

// ---------------------------------------------------------------------------
// TaskExecutor
// ---------------------------------------------------------------------------

describe("TaskExecutor", () => {
  it("executes steps in dependency order", async () => {
    const stepA: Step = {
      id: "step_a",
      instructions: "First step",
      completed: false,
      dependsOn: [],
      outputSchema: JSON.stringify({
        type: "object",
        properties: { data: { type: "string" } },
      }),
      logs: [],
    };

    const stepB: Step = {
      id: "step_b",
      instructions: "Second step",
      completed: false,
      dependsOn: ["step_a"],
      outputSchema: JSON.stringify({
        type: "object",
        properties: { result: { type: "string" } },
      }),
      logs: [],
    };

    const task: Task = {
      id: "task_1",
      title: "Sequential Task",
      steps: [stepA, stepB],
    };

    // Two calls to generateMessages: one for step_a, one for step_b
    const provider = createMockProvider([
      [
        { type: "chunk", content: "Executing A" },
        {
          id: "tc_a",
          name: "finish_step",
          args: { result: { data: "from_a" } },
        },
      ],
      [
        { type: "chunk", content: "Executing B" },
        {
          id: "tc_b",
          name: "finish_step",
          args: { result: { result: "from_b" } },
        },
      ],
    ]);

    const context = createMockContext();
    const executor = new TaskExecutor({
      provider,
      model: "test-model",
      context,
      tools: [],
      task,
    });

    const messages: ProcessingMessage[] = [];
    for await (const msg of executor.executeTasks()) {
      messages.push(msg);
    }

    // Both steps should be completed
    expect(stepA.completed).toBe(true);
    expect(stepB.completed).toBe(true);

    // step_a result should be stored before step_b runs
    expect(context.storeStepResult).toHaveBeenCalledWith("step_a", { data: "from_a" });
    expect(context.storeStepResult).toHaveBeenCalledWith("step_b", { result: "from_b" });

    // Verify step_result messages
    const stepResults = messages.filter((m) => m.type === "step_result");
    expect(stepResults).toHaveLength(2);
  });

  it("handles multi-step task with dependent steps", async () => {
    // Diamond dependency: A -> B, A -> C, B+C -> D
    const stepA: Step = {
      id: "a",
      instructions: "Root step",
      completed: false,
      dependsOn: [],
      outputSchema: JSON.stringify({ type: "object", properties: { v: { type: "number" } } }),
      logs: [],
    };
    const stepB: Step = {
      id: "b",
      instructions: "Branch 1",
      completed: false,
      dependsOn: ["a"],
      outputSchema: JSON.stringify({ type: "object", properties: { v: { type: "number" } } }),
      logs: [],
    };
    const stepC: Step = {
      id: "c",
      instructions: "Branch 2",
      completed: false,
      dependsOn: ["a"],
      outputSchema: JSON.stringify({ type: "object", properties: { v: { type: "number" } } }),
      logs: [],
    };
    const stepD: Step = {
      id: "d",
      instructions: "Merge step",
      completed: false,
      dependsOn: ["b", "c"],
      outputSchema: JSON.stringify({ type: "object", properties: { v: { type: "number" } } }),
      logs: [],
    };

    const task: Task = {
      id: "diamond_task",
      title: "Diamond dependency",
      steps: [stepA, stepB, stepC, stepD],
    };

    // The executor processes steps sequentially within each "round".
    // Round 1: step A (only one with no deps)
    // Round 2: steps B and C (both depend only on A)
    // Round 3: step D (depends on B and C)
    const provider = createMockProvider([
      // Round 1: step A
      [
        { type: "chunk", content: "A" },
        { id: "tc_a", name: "finish_step", args: { result: { v: 1 } } },
      ],
      // Round 2: step B
      [
        { type: "chunk", content: "B" },
        { id: "tc_b", name: "finish_step", args: { result: { v: 2 } } },
      ],
      // Round 2: step C
      [
        { type: "chunk", content: "C" },
        { id: "tc_c", name: "finish_step", args: { result: { v: 3 } } },
      ],
      // Round 3: step D
      [
        { type: "chunk", content: "D" },
        { id: "tc_d", name: "finish_step", args: { result: { v: 6 } } },
      ],
    ]);

    const context = createMockContext();
    const executor = new TaskExecutor({
      provider,
      model: "test-model",
      context,
      tools: [],
      task,
    });

    const messages: ProcessingMessage[] = [];
    for await (const msg of executor.executeTasks()) {
      messages.push(msg);
    }

    // All steps complete
    expect(stepA.completed).toBe(true);
    expect(stepB.completed).toBe(true);
    expect(stepC.completed).toBe(true);
    expect(stepD.completed).toBe(true);

    // Verify all step results were stored
    const stepResults = messages.filter((m) => m.type === "step_result");
    expect(stepResults).toHaveLength(4);

    // step D should have been the last to complete
    const resultIds = stepResults.map((m) => (m as any).step.id);
    expect(resultIds.indexOf("d")).toBeGreaterThan(resultIds.indexOf("a"));
    expect(resultIds.indexOf("d")).toBeGreaterThan(resultIds.indexOf("b"));
    expect(resultIds.indexOf("d")).toBeGreaterThan(resultIds.indexOf("c"));
  });

  it("detects dependency deadlock when step depends on non-existent ID", async () => {
    const stepA: Step = {
      id: "step_a",
      instructions: "Depends on missing step",
      completed: false,
      dependsOn: ["nonexistent_step"],
      outputSchema: JSON.stringify({ type: "object", properties: {} }),
      logs: [],
    };

    const task: Task = {
      id: "deadlock_task",
      title: "Deadlock Task",
      steps: [stepA],
    };

    const provider = createMockProvider([]);
    const context = createMockContext();

    const executor = new TaskExecutor({
      provider,
      model: "test-model",
      context,
      tools: [],
      task,
    });

    const messages: ProcessingMessage[] = [];
    for await (const msg of executor.executeTasks()) {
      messages.push(msg);
    }

    // Step should NOT be completed (deadlocked)
    expect(stepA.completed).toBe(false);

    // Should have a chunk message about dependency issues
    const deadlockMsgs = messages.filter(
      (m) =>
        m.type === "chunk" &&
        typeof (m as any).content === "string" &&
        (m as any).content.includes("dependency"),
    );
    expect(deadlockMsgs).toHaveLength(1);
  });

  it("treats input keys as satisfied dependencies", async () => {
    const stepA: Step = {
      id: "step_a",
      instructions: "Uses input data",
      completed: false,
      dependsOn: ["user_input"],
      outputSchema: JSON.stringify({
        type: "object",
        properties: { v: { type: "string" } },
      }),
      logs: [],
    };

    const task: Task = {
      id: "input_dep_task",
      title: "Input Dependency Task",
      steps: [stepA],
    };

    // Provider returns finish_step immediately
    const provider = createMockProvider([
      [
        { type: "chunk", content: "Using input" },
        {
          id: "tc_a",
          name: "finish_step",
          args: { result: { v: "done" } },
        },
      ],
    ]);

    const context = createMockContext();

    const executor = new TaskExecutor({
      provider,
      model: "test-model",
      context,
      tools: [],
      task,
      inputs: { user_input: "some data" },
    });

    const messages: ProcessingMessage[] = [];
    for await (const msg of executor.executeTasks()) {
      messages.push(msg);
    }

    // Step should complete because "user_input" is in inputs
    expect(stepA.completed).toBe(true);
    expect(context.storeStepResult).toHaveBeenCalledWith("step_a", { v: "done" });
  });
});
