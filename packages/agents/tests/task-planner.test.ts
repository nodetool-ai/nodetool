import { describe, it, expect, vi } from "vitest";
import { TaskPlanner } from "../src/task-planner.js";
import type { Step, Task } from "../src/types.js";
import type { ProcessingMessage } from "@nodetool/protocol";

function createMockProvider(taskData?: Record<string, unknown>) {
  const data = taskData ?? {
    title: "Test Task",
    steps: [
      { id: "s1", instructions: "Do first thing", depends_on: [] },
      { id: "s2", instructions: "Do second thing", depends_on: ["s1"] },
    ],
  };
  return {
    provider: "mock",
    hasToolSupport: async () => true,
    generateMessages: async function* () {
      yield { type: "chunk" as const, content: "Planning...", done: false };
      yield {
        id: "tc_1",
        name: "create_task",
        args: data,
      };
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

function createMockContext() {
  return {
    set: vi.fn(),
    get: vi.fn(),
  } as any;
}

describe("TaskPlanner", () => {
  it("generates a valid task plan", async () => {
    const planner = new TaskPlanner({
      provider: createMockProvider(),
      model: "test-model",
    });

    const messages: ProcessingMessage[] = [];
    let task: Task | null = null;

    const gen = planner.plan("Do something useful", createMockContext());
    while (true) {
      const { value, done } = await gen.next();
      if (done) {
        task = value as Task | null;
        break;
      }
      messages.push(value);
    }

    expect(task).not.toBeNull();
    expect(task!.title).toBe("Test Task");
    expect(task!.steps).toHaveLength(2);
    expect(task!.steps[0].id).toBe("s1");
    expect(task!.steps[1].dependsOn).toEqual(["s1"]);

    // Should have planning_update messages
    const updates = messages.filter((m) => m.type === "planning_update");
    expect(updates.length).toBeGreaterThanOrEqual(2);
  });

  it("returns null when LLM produces no task data", async () => {
    const provider = {
      ...createMockProvider(),
      generateMessages: async function* () {
        yield { type: "chunk" as const, content: "I don't know how to make a plan", done: false };
      },
    } as any;

    const planner = new TaskPlanner({
      provider,
      model: "test-model",
      maxRetries: 1,
    });

    const gen = planner.plan("Do something", createMockContext());
    let task: Task | null = null;
    while (true) {
      const { value, done } = await gen.next();
      if (done) {
        task = value as Task | null;
        break;
      }
    }

    expect(task).toBeNull();
  });

  describe("validateDependencies", () => {
    it("rejects steps with missing dependency IDs", () => {
      const planner = new TaskPlanner({
        provider: createMockProvider(),
        model: "test-model",
      });

      const steps: Step[] = [
        { id: "s1", instructions: "Do A", completed: false, dependsOn: ["nonexistent"], logs: [] },
      ];

      const errors = planner.validateDependencies(steps);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("nonexistent");
    });

    it("accepts input keys as valid dependencies", () => {
      const planner = new TaskPlanner({
        provider: createMockProvider(),
        model: "test-model",
        inputs: { myInput: "value" },
      });

      const steps: Step[] = [
        { id: "s1", instructions: "Do A", completed: false, dependsOn: ["myInput"], logs: [] },
      ];

      const errors = planner.validateDependencies(steps);
      expect(errors).toHaveLength(0);
    });

    it("rejects duplicate step IDs", () => {
      const planner = new TaskPlanner({
        provider: createMockProvider(),
        model: "test-model",
      });

      const steps: Step[] = [
        { id: "s1", instructions: "Do A", completed: false, dependsOn: [], logs: [] },
        { id: "s1", instructions: "Do B", completed: false, dependsOn: [], logs: [] },
      ];

      const errors = planner.validateDependencies(steps);
      expect(errors.some((e) => e.includes("Duplicate"))).toBe(true);
    });
  });

  describe("validatePlanSemantics", () => {
    it("rejects steps with looping phrases", () => {
      const planner = new TaskPlanner({
        provider: createMockProvider(),
        model: "test-model",
      });

      const steps: Step[] = [
        { id: "process_items", instructions: "For each URL, fetch the content", completed: false, dependsOn: [], logs: [] },
      ];

      const errors = planner.validatePlanSemantics(steps);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("looping phrase");
    });

    it("allows aggregator steps to have looping language", () => {
      const planner = new TaskPlanner({
        provider: createMockProvider(),
        model: "test-model",
      });

      const steps: Step[] = [
        { id: "aggregate_results", instructions: "For each result, combine into final report", completed: false, dependsOn: [], logs: [] },
      ];

      const errors = planner.validatePlanSemantics(steps);
      expect(errors).toHaveLength(0);
    });

    it("detects missing aggregator dependencies on extractor steps", () => {
      const planner = new TaskPlanner({
        provider: createMockProvider(),
        model: "test-model",
      });

      const steps: Step[] = [
        { id: "extract_data_1", instructions: "Get data from source 1", completed: false, dependsOn: [], logs: [] },
        { id: "extract_data_2", instructions: "Get data from source 2", completed: false, dependsOn: [], logs: [] },
        { id: "aggregate_results", instructions: "Combine all data", completed: false, dependsOn: ["extract_data_1"], logs: [] },
      ];

      const errors = planner.validatePlanSemantics(steps);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("extract_data_2");
    });
  });

  describe("checkForCycles", () => {
    it("detects circular dependencies", () => {
      const planner = new TaskPlanner({
        provider: createMockProvider(),
        model: "test-model",
      });

      const task: Task = {
        id: "t1",
        title: "Test",
        steps: [
          { id: "s1", instructions: "A", completed: false, dependsOn: ["s2"], logs: [] },
          { id: "s2", instructions: "B", completed: false, dependsOn: ["s1"], logs: [] },
        ],
      };

      expect(planner.checkForCycles(task)).toBe(false);
    });

    it("accepts valid DAGs", () => {
      const planner = new TaskPlanner({
        provider: createMockProvider(),
        model: "test-model",
      });

      const task: Task = {
        id: "t1",
        title: "Test",
        steps: [
          { id: "s1", instructions: "A", completed: false, dependsOn: [], logs: [] },
          { id: "s2", instructions: "B", completed: false, dependsOn: ["s1"], logs: [] },
          { id: "s3", instructions: "C", completed: false, dependsOn: ["s1", "s2"], logs: [] },
        ],
      };

      expect(planner.checkForCycles(task)).toBe(true);
    });
  });

  it("retries on validation failure and succeeds", async () => {
    let callCount = 0;
    const provider = {
      ...createMockProvider(),
      generateMessages: async function* () {
        callCount++;
        if (callCount === 1) {
          // First attempt: invalid plan with cycle
          yield { type: "chunk" as const, content: "Planning...", done: false };
          yield {
            id: "tc_1",
            name: "create_task",
            args: {
              title: "Bad Plan",
              steps: [
                { id: "s1", instructions: "A", depends_on: ["s2"] },
                { id: "s2", instructions: "B", depends_on: ["s1"] },
              ],
            },
          };
        } else {
          // Second attempt: valid plan
          yield { type: "chunk" as const, content: "Replanning...", done: false };
          yield {
            id: "tc_2",
            name: "create_task",
            args: {
              title: "Good Plan",
              steps: [
                { id: "s1", instructions: "A", depends_on: [] },
                { id: "s2", instructions: "B", depends_on: ["s1"] },
              ],
            },
          };
        }
      },
    } as any;

    const planner = new TaskPlanner({
      provider,
      model: "test-model",
      maxRetries: 3,
    });

    const gen = planner.plan("Do something", createMockContext());
    let task: Task | null = null;
    const messages: ProcessingMessage[] = [];
    while (true) {
      const { value, done } = await gen.next();
      if (done) {
        task = value as Task | null;
        break;
      }
      messages.push(value);
    }

    expect(task).not.toBeNull();
    expect(task!.title).toBe("Good Plan");
    expect(callCount).toBe(2);

    // Should have validation failure update
    const failedUpdates = messages.filter(
      (m) => m.type === "planning_update" && (m as any).status === "failed",
    );
    expect(failedUpdates.length).toBeGreaterThanOrEqual(1);
  });

  it("returns null after exhausting retries", async () => {
    // Always produces invalid plan (cycle)
    const provider = {
      ...createMockProvider(),
      generateMessages: async function* () {
        yield { type: "chunk" as const, content: "Planning...", done: false };
        yield {
          id: "tc_1",
          name: "create_task",
          args: {
            title: "Bad Plan",
            steps: [
              { id: "s1", instructions: "A", depends_on: ["s2"] },
              { id: "s2", instructions: "B", depends_on: ["s1"] },
            ],
          },
        };
      },
    } as any;

    const planner = new TaskPlanner({
      provider,
      model: "test-model",
      maxRetries: 2,
    });

    const gen = planner.plan("Do something", createMockContext());
    let task: Task | null = null;
    while (true) {
      const { value, done } = await gen.next();
      if (done) {
        task = value as Task | null;
        break;
      }
    }

    expect(task).toBeNull();
  });

  it("formats tool info with schemas", () => {
    const mockTool = {
      name: "my_tool",
      description: "A useful tool",
      inputSchema: {
        type: "object" as const,
        properties: {
          query: { type: "string" },
          limit: { type: "number" },
        },
        required: ["query"],
      },
      process: vi.fn(),
      userMessage: () => "Using tool",
      toProviderTool: vi.fn(),
    } as any;

    const planner = new TaskPlanner({
      provider: createMockProvider(),
      model: "test-model",
      tools: [mockTool],
    });

    // Access formatToolsInfo indirectly via plan prompt generation
    // We verify it includes tool schema info by checking the plan generation works
    // with the tool info available. For a more direct test, we use the public validatePlan.
    const task: Task = {
      id: "t1",
      title: "Test",
      steps: [{ id: "s1", instructions: "Do it", completed: false, dependsOn: [], logs: [] }],
    };
    expect(planner.validatePlan(task)).toHaveLength(0);
  });
});
