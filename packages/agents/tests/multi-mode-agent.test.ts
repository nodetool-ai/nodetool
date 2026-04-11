import { describe, it, expect, vi } from "vitest";
import { MultiModeAgent } from "../src/multi-mode-agent.js";
import { SubAgentPlanner } from "../src/sub-agent-planner.js";
import type { ProcessingMessage } from "@nodetool/protocol";
import type { AgentMode, SubAgentConfig, Task } from "../src/types.js";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockProvider(
  responseSequence: Array<
    Array<
      | { type: "chunk"; content: string; done?: boolean }
      | { id: string; name: string; args: Record<string, unknown> }
    >
  >
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

/**
 * Creates a mock provider that returns structured responses for generateMessageTraced.
 */
function createTracedMockProvider(
  responses: Array<{
    content?: string;
    toolCalls?: Array<{
      id: string;
      name: string;
      args: Record<string, unknown>;
    }>;
  }>
) {
  let callIndex = 0;
  return {
    provider: "mock",
    hasToolSupport: async () => true,
    generateMessages: async function* () {
      /* no-op */
    },
    async *generateMessagesTraced(..._args: any[]) {
      /* no-op */
    },
    generateMessage: vi.fn().mockImplementation(() => {
      const resp = responses[callIndex] ?? { content: "" };
      callIndex++;
      return resp;
    }),
    generateMessageTraced: vi.fn().mockImplementation(() => {
      const resp = responses[callIndex] ?? { content: "" };
      callIndex++;
      return resp;
    }),
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
    _store: store
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MultiModeAgent", () => {
  describe("constructor", () => {
    it("defaults to loop mode", () => {
      const provider = createMockProvider([]);
      const agent = new MultiModeAgent({
        name: "test",
        objective: "do something",
        provider,
        model: "test-model"
      });
      expect(agent).toBeDefined();
    });

    it("accepts all three modes", () => {
      const modes: AgentMode[] = ["loop", "plan", "multi-agent"];
      for (const mode of modes) {
        const agent = new MultiModeAgent({
          name: "test",
          objective: "do something",
          provider: createMockProvider([]),
          model: "test-model",
          mode
        });
        expect(agent).toBeDefined();
      }
    });
  });

  describe("loop mode", () => {
    it("executes a simple loop and yields messages", async () => {
      const provider = createMockProvider([
        [
          { type: "chunk", content: "Hello " },
          { type: "chunk", content: "world" },
          {
            id: "tc1",
            name: "finish_step",
            args: { result: "Hello world", metadata: { title: "Test" } }
          }
        ]
      ]);

      const agent = new MultiModeAgent({
        name: "test-loop",
        objective: "Say hello",
        provider,
        model: "test-model",
        mode: "loop"
      });

      const messages: ProcessingMessage[] = [];
      for await (const msg of agent.execute(createMockContext())) {
        messages.push(msg);
      }

      // Should have log_update + chunks + step_result messages
      expect(messages.length).toBeGreaterThan(0);

      const logUpdates = messages.filter((m) => m.type === "log_update");
      expect(logUpdates.length).toBeGreaterThan(0);
    });
  });

  describe("plan mode", () => {
    it("runs planning then execution phases", async () => {
      // Provider responses:
      // 1. Planner call: returns create_plan tool call
      // 2. Step executor: returns chunk + finish_step
      const provider = createMockProvider([
        // Planner response
        [
          { type: "chunk", content: "Planning..." },
          {
            id: "tc_plan",
            name: "create_plan",
            args: {
              title: "Test Plan",
              tasks: [
                {
                  id: "task_1",
                  title: "Test Task",
                  depends_on: [],
                  steps: [
                    { id: "s1", instructions: "Do the thing", depends_on: [] }
                  ]
                }
              ]
            }
          }
        ],
        // Step s1 execution
        [
          { type: "chunk", content: "Executing step..." },
          {
            id: "tc_finish",
            name: "finish_step",
            args: { result: "done", metadata: { title: "Result" } }
          }
        ]
      ]);

      const agent = new MultiModeAgent({
        name: "test-plan",
        objective: "Plan and execute",
        provider,
        model: "test-model",
        mode: "plan"
      });

      const messages: ProcessingMessage[] = [];
      for await (const msg of agent.execute(createMockContext())) {
        messages.push(msg);
      }

      // Should have planning updates + task update + execution messages
      expect(messages.length).toBeGreaterThan(0);

      const planningUpdates = messages.filter(
        (m) => m.type === "planning_update"
      );
      expect(planningUpdates.length).toBeGreaterThan(0);

      // Task should have been set (first task in plan)
      expect(agent.task).not.toBeNull();
      expect(agent.task!.title).toBe("Test Task");
    });

    it("uses pre-defined task and skips planning", async () => {
      const provider = createMockProvider([
        // Step execution only
        [
          { type: "chunk", content: "Running..." },
          {
            id: "tc_finish",
            name: "finish_step",
            args: { result: "completed", metadata: { title: "Done" } }
          }
        ]
      ]);

      const predefinedTask: Task = {
        id: "task_1",
        title: "Predefined",
        steps: [
          {
            id: "s1",
            instructions: "Execute this",
            completed: false,
            dependsOn: [],
            logs: []
          }
        ]
      };

      const agent = new MultiModeAgent({
        name: "test-plan-predefined",
        objective: "Execute predefined task",
        provider,
        model: "test-model",
        mode: "plan",
        task: predefinedTask
      });

      const messages: ProcessingMessage[] = [];
      for await (const msg of agent.execute(createMockContext())) {
        messages.push(msg);
      }

      // Should NOT have planning updates (task was predefined)
      const planningUpdates = messages.filter(
        (m) => m.type === "planning_update"
      );
      expect(planningUpdates.length).toBe(0);
    });
  });
});

describe("SubAgentPlanner", () => {
  it("generates sub-agent configs from an objective", async () => {
    const provider = createTracedMockProvider([
      {
        content: "",
        toolCalls: [
          {
            id: "tc1",
            name: "create_team",
            args: {
              agents: [
                {
                  name: "coordinator",
                  role: "Lead the team",
                  skills: ["planning"]
                },
                {
                  name: "researcher",
                  role: "Research information",
                  skills: ["web_search"]
                },
                { name: "writer", role: "Write content", skills: ["writing"] }
              ]
            }
          }
        ]
      }
    ]);

    const planner = new SubAgentPlanner({
      provider,
      model: "test-model"
    });

    const messages: ProcessingMessage[] = [];
    let configs: SubAgentConfig[] = [];

    const gen = planner.plan("Research and write a report", 3);
    while (true) {
      const { value, done } = await gen.next();
      if (done) {
        configs = value as SubAgentConfig[];
        break;
      }
      messages.push(value);
    }

    expect(configs).toHaveLength(3);
    expect(configs[0].name).toBe("coordinator");
    expect(configs[0].role).toBe("Lead the team");
    expect(configs[0].skills).toEqual(["planning"]);
    expect(configs[1].name).toBe("researcher");
    expect(configs[2].name).toBe("writer");

    // Should have planning_update messages
    const updates = messages.filter((m) => m.type === "planning_update");
    expect(updates.length).toBeGreaterThan(0);
  });

  it("falls back to generic agents on LLM failure", async () => {
    // Provider returns empty/invalid responses to trigger fallback
    const provider = createTracedMockProvider([
      { content: "I don't understand" },
      { content: "Still confused" },
      { content: "Cannot help" }
    ]);

    const planner = new SubAgentPlanner({
      provider,
      model: "test-model"
    });

    const messages: ProcessingMessage[] = [];
    let configs: SubAgentConfig[] = [];

    const gen = planner.plan("Do something complex", 3);
    while (true) {
      const { value, done } = await gen.next();
      if (done) {
        configs = value as SubAgentConfig[];
        break;
      }
      messages.push(value);
    }

    // Should return fallback generic agents
    expect(configs.length).toBeGreaterThan(0);
    expect(configs[0].name).toBe("coordinator");
  });
});

describe("AgentMode type", () => {
  it("exports AgentMode type correctly", async () => {
    const { MultiModeAgent: MMA } = await import("../src/multi-mode-agent.js");
    expect(MMA).toBeDefined();
  });
});
