import { describe, it, expect, vi } from "vitest";
import { TaskExecutor } from "../src/task-executor.js";
import type { Step, Task } from "../src/types.js";
import type { ProcessingMessage, StepResult } from "@nodetool-ai/protocol";
import { memoryKeys, BaseProvider } from "@nodetool-ai/runtime";
import { createMockContext } from "./_helpers/mock-context.js";

/**
 * Mock provider that finishes each step via a finish_step tool call, echoing
 * the ephemeral step's rendered instructions back so fan-out tests can assert
 * per-item template interpolation. `delayMs` simulates async work.
 */
function createMockProvider(delayMs = 0) {
  return {
    provider: "mock",
    hasToolSupport: async () => true,
    generateMessages: async function* (opts?: any) {
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
      // Surface the last user message so tests can verify rendered instructions.
      const messages = opts?.messages ?? [];
      const lastUser = [...messages]
        .reverse()
        .find((m: any) => m.role === "user");
      const rendered =
        typeof lastUser?.content === "string" ? lastUser.content : "";
      yield { type: "chunk" as const, content: "Working...", done: false };
      yield {
        id: "tc_1",
        name: "finish_step",
        args: { result: { done: true, rendered } }
      };
    },
    async *generateMessagesTraced(...args: any[]) {
      yield* (this as any).generateMessages(...args);
    },
    generateLoop(args: unknown) {
      return (
        BaseProvider.prototype as { generateLoop: (a: unknown) => unknown }
      ).generateLoop.call(this, args);
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

/** Provider whose generateMessages throws — exercises error propagation. */
function createThrowingProvider() {
  const p = createMockProvider();
  p.generateMessages = async function* () {
    yield { type: "chunk" as const, content: "boom", done: false };
    throw new Error("provider exploded");
  };
  return p;
}

function makeStep(id: string, dependsOn: string[] = []): Step {
  return {
    id,
    instructions: `Do ${id}`,
    completed: false,
    dependsOn,
    outputSchema: JSON.stringify({
      type: "object",
      properties: { done: { type: "boolean" } }
    }),
    logs: []
  };
}

async function drain(
  gen: AsyncGenerator<ProcessingMessage>
): Promise<ProcessingMessage[]> {
  const out: ProcessingMessage[] = [];
  for await (const m of gen) out.push(m);
  return out;
}

describe("TaskExecutor coverage", () => {
  it("completes immediately for an empty task", async () => {
    const task: Task = { id: "t1", title: "Empty", steps: [] };
    const executor = new TaskExecutor({
      provider: createMockProvider(),
      model: "m",
      context: createMockContext(),
      tools: [],
      task
    });
    const messages = await drain(executor.executeTasks());
    // No steps -> nothing to run, no dependency-issue chunk.
    expect(messages).toHaveLength(0);
  });

  it("does not re-seed inputs already present in memory", async () => {
    const context = createMockContext();
    // Pre-seed the input key an upstream caller would have written.
    context.memory.set({
      key: memoryKeys.input("shared"),
      kind: "input",
      value: "original",
      title: "shared"
    });
    const setSpy = vi.spyOn(context.memory, "set");

    const executor = new TaskExecutor({
      provider: createMockProvider(),
      model: "m",
      context,
      tools: [],
      task: { id: "t1", title: "T", steps: [makeStep("s1")] },
      inputs: { shared: "new-value" }
    });
    await drain(executor.executeTasks());

    // The pre-existing input must not be overwritten.
    expect(context.memory.getValue(memoryKeys.input("shared"))).toBe(
      "original"
    );
    // set() was never called for the already-present input key.
    const inputWrites = setSpy.mock.calls.filter(
      (c: any) => c[0]?.key === memoryKeys.input("shared")
    );
    expect(inputWrites).toHaveLength(0);
  });

  it("treats inputs as satisfied dependencies for a step", async () => {
    // s1 depends on an input key, not another step.
    const s1 = makeStep("s1", ["customer"]);
    const task: Task = { id: "t1", title: "T", steps: [s1] };
    const executor = new TaskExecutor({
      provider: createMockProvider(),
      model: "m",
      context: createMockContext(),
      tools: [],
      task,
      inputs: { customer: "acme" }
    });
    const messages = await drain(executor.executeTasks());
    expect(s1.completed).toBe(true);
    expect(messages.some((m) => m.type === "step_result")).toBe(true);
  });

  it("does not defer the finish step once all other steps are complete", async () => {
    // s1 already complete; s2 is the finish step and immediately executable.
    const s1 = makeStep("s1");
    s1.completed = true;
    const s2 = makeStep("s2");
    const task: Task = { id: "t1", title: "T", steps: [s1, s2] };
    const executor = new TaskExecutor({
      provider: createMockProvider(),
      model: "m",
      context: createMockContext(),
      tools: [],
      task
    });
    await drain(executor.executeTasks());
    expect(s2.completed).toBe(true);
  });

  describe("process-mode fan-out", () => {
    it("marks a process step complete when it has no dependencies", async () => {
      const proc: Step = {
        ...makeStep("p1"),
        mode: "process"
      };
      const task: Task = { id: "t1", title: "T", steps: [proc] };
      const context = createMockContext();
      const executor = new TaskExecutor({
        provider: createMockProvider(),
        model: "m",
        context,
        tools: [],
        task
      });
      const messages = await drain(executor.executeTasks());
      expect(proc.completed).toBe(true);
      // No ephemeral step ran, so no step_result was produced by fan-out.
      expect(messages.some((m) => m.type === "step_result")).toBe(false);
    });

    it("stores an empty list when the discover result is missing", async () => {
      const discover = makeStep("d1");
      discover.completed = true; // pretend it already ran, but no memory value
      const proc: Step = { ...makeStep("p1", ["d1"]), mode: "process" };
      const task: Task = { id: "t1", title: "T", steps: [discover, proc] };
      const context = createMockContext();
      const executor = new TaskExecutor({
        provider: createMockProvider(),
        model: "m",
        context,
        tools: [],
        task
      });
      await drain(executor.executeTasks());
      expect(proc.completed).toBe(true);
      expect(proc.endTime).toBeTypeOf("number");
      expect(context.memory.getValue(memoryKeys.step("p1"))).toEqual([]);
    });

    it("wraps a non-array discover result as a single-item list", async () => {
      const discover = makeStep("d1");
      discover.completed = true;
      const proc: Step = {
        ...makeStep("p1", ["d1"]),
        mode: "process",
        perItemInstructions: "Handle {name}"
      };
      const task: Task = { id: "t1", title: "T", steps: [discover, proc] };
      const context = createMockContext();
      // Non-array object value.
      context.memory.set({
        key: memoryKeys.step("d1"),
        kind: "step_result",
        value: { name: "solo" },
        source: "d1"
      });
      const executor = new TaskExecutor({
        provider: createMockProvider(),
        model: "m",
        context,
        tools: [],
        task
      });
      const messages = await drain(executor.executeTasks());
      expect(proc.completed).toBe(true);
      const aggregated = context.memory.getValue(memoryKeys.step("p1")) as any[];
      expect(aggregated).toHaveLength(1);
      // Exactly one ephemeral step ran.
      const stepResults = messages.filter((m) => m.type === "step_result");
      expect(stepResults).toHaveLength(1);
      // The {name} placeholder was rendered with the object's field.
      expect((aggregated[0] as any).rendered).toContain("solo");
    });

    it("fans out over an array of objects, interpolating {field} per item", async () => {
      const discover = makeStep("d1");
      discover.completed = true;
      const proc: Step = {
        ...makeStep("p1", ["d1"]),
        mode: "process",
        perItemInstructions: "Process city {city}"
      };
      const task: Task = { id: "t1", title: "T", steps: [discover, proc] };
      const context = createMockContext();
      context.memory.set({
        key: memoryKeys.step("d1"),
        kind: "step_result",
        value: [{ city: "paris" }, { city: "tokyo" }],
        source: "d1"
      });
      const executor = new TaskExecutor({
        provider: createMockProvider(),
        model: "m",
        context,
        tools: [],
        task
      });
      const messages = await drain(executor.executeTasks());
      const aggregated = context.memory.getValue(memoryKeys.step("p1")) as any[];
      expect(aggregated).toHaveLength(2);
      const rendered = aggregated.map((r) => r.rendered).join("\n");
      expect(rendered).toContain("paris");
      expect(rendered).toContain("tokyo");
      expect(messages.filter((m) => m.type === "step_result")).toHaveLength(2);
    });

    it("renders {item} for an array of primitive items", async () => {
      const discover = makeStep("d1");
      discover.completed = true;
      const proc: Step = {
        ...makeStep("p1", ["d1"]),
        mode: "process",
        perItemInstructions: "Say {item}"
      };
      const task: Task = { id: "t1", title: "T", steps: [discover, proc] };
      const context = createMockContext();
      context.memory.set({
        key: memoryKeys.step("d1"),
        kind: "step_result",
        value: ["alpha", "beta"],
        source: "d1"
      });
      const executor = new TaskExecutor({
        provider: createMockProvider(),
        model: "m",
        context,
        tools: [],
        task
      });
      const messages = await drain(executor.executeTasks());
      const aggregated = context.memory.getValue(memoryKeys.step("p1")) as any[];
      expect(aggregated).toHaveLength(2);
      const rendered = aggregated.map((r) => r.rendered).join("\n");
      expect(rendered).toContain("alpha");
      expect(rendered).toContain("beta");
      expect(messages.filter((m) => m.type === "step_result")).toHaveLength(2);
    });

    it("falls back to step.instructions when perItemInstructions is absent", async () => {
      const discover = makeStep("d1");
      discover.completed = true;
      const proc: Step = {
        ...makeStep("p1", ["d1"]),
        instructions: "Base task for {item}",
        mode: "process"
      };
      const task: Task = { id: "t1", title: "T", steps: [discover, proc] };
      const context = createMockContext();
      context.memory.set({
        key: memoryKeys.step("d1"),
        kind: "step_result",
        value: ["only"],
        source: "d1"
      });
      const executor = new TaskExecutor({
        provider: createMockProvider(),
        model: "m",
        context,
        tools: [],
        task
      });
      await drain(executor.executeTasks());
      const aggregated = context.memory.getValue(memoryKeys.step("p1")) as any[];
      expect((aggregated[0] as any).rendered).toContain("only");
    });

    it("fans out in parallel when parallelExecution=true and >1 item", async () => {
      const discover = makeStep("d1");
      discover.completed = true;
      const proc: Step = {
        ...makeStep("p1", ["d1"]),
        mode: "process",
        perItemInstructions: "Item {item}"
      };
      const task: Task = { id: "t1", title: "T", steps: [discover, proc] };
      const context = createMockContext();
      context.memory.set({
        key: memoryKeys.step("d1"),
        kind: "step_result",
        value: ["a", "b", "c"],
        source: "d1"
      });
      const executor = new TaskExecutor({
        provider: createMockProvider(5),
        model: "m",
        context,
        tools: [],
        task,
        parallelExecution: true
      });
      const messages = await drain(executor.executeTasks());
      const aggregated = context.memory.getValue(memoryKeys.step("p1")) as any[];
      expect(aggregated).toHaveLength(3);
      expect(messages.filter((m) => m.type === "step_result")).toHaveLength(3);
    });
  });

  it("surfaces a failing step as an error step_result in parallel mode", async () => {
    const s1 = makeStep("s1");
    const s2 = makeStep("s2");
    const task: Task = { id: "t1", title: "T", steps: [s1, s2] };
    const executor = new TaskExecutor({
      provider: createThrowingProvider(),
      model: "m",
      context: createMockContext(),
      tools: [],
      task,
      parallelExecution: true
    });
    const messages = await drain(executor.executeTasks());
    // StepExecutor catches the provider error and emits an error step_result;
    // the merge generator still drains both concurrent steps to completion.
    const errored = messages.filter(
      (m) =>
        m.type === "step_result" && (m as StepResult).result?.error != null
    ) as StepResult[];
    expect(errored.length).toBeGreaterThanOrEqual(1);
    expect(String(errored[0].result?.error)).toContain("provider exploded");
  });

  it("uses perItemSchema for ephemeral step output schema when provided", async () => {
    // Exercises the perItemSchema branch of ephemeral step construction.
    const discover = makeStep("d1");
    discover.completed = true;
    const proc: Step = {
      ...makeStep("p1", ["d1"]),
      mode: "process",
      perItemInstructions: "Do {item}",
      perItemSchema: JSON.stringify({
        type: "object",
        properties: { done: { type: "boolean" } }
      })
    };
    const task: Task = { id: "t1", title: "T", steps: [discover, proc] };
    const context = createMockContext();
    context.memory.set({
      key: memoryKeys.step("d1"),
      kind: "step_result",
      value: ["x"],
      source: "d1"
    });
    const executor = new TaskExecutor({
      provider: createMockProvider(),
      model: "m",
      context,
      tools: [],
      task
    });
    const messages = await drain(executor.executeTasks());
    expect(proc.completed).toBe(true);
    expect(messages.filter((m) => m.type === "step_result")).toHaveLength(1);
  });
});
