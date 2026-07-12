import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import { memoryKeys } from "@nodetool-ai/runtime";
import { createMockContext } from "./_helpers/mock-context.js";

/**
 * We mock StepExecutor so the AgentStepExecutor adapter can be exercised in
 * isolation: no real LLM loop runs, and every constructor call is captured so
 * we can assert what the adapter forwarded (step instructions, filtered tools,
 * systemPrompt, maxIterations) and control the messages it emits.
 */
interface CapturedCtor {
  task: unknown;
  step: { id: string; instructions: string; tools?: string[] };
  context: unknown;
  provider: unknown;
  model: string;
  tools: Array<{ name: string }>;
  systemPrompt?: string;
  maxIterations?: number;
}

const ctorCalls: CapturedCtor[] = [];
let nextMessages: ProcessingMessage[] = [];

vi.mock("../src/step-executor.js", () => {
  return {
    StepExecutor: class {
      private readonly opts: CapturedCtor;
      constructor(opts: CapturedCtor) {
        this.opts = opts;
        ctorCalls.push(opts);
      }
      async *execute(): AsyncGenerator<ProcessingMessage> {
        for (const m of nextMessages) {
          yield m;
        }
      }
    }
  };
});

// Import AFTER the mock is registered.
const { AgentStepExecutor } = await import("../src/agent-step-executor.js");

function makeNode(overrides: Record<string, unknown> = {}) {
  return {
    id: "node_1",
    type: "nodetool.agents.AgentStep",
    properties: {
      instructions: "Do the thing",
      ...overrides
    }
  } as any;
}

function makeOpts(tools: Array<{ name: string }> = []) {
  return {
    provider: { provider: "mock" } as any,
    model: "mock-model",
    tools: tools as any,
    systemPrompt: undefined,
    maxIterations: undefined
  };
}

const stepResultMsg = (result: unknown): ProcessingMessage =>
  ({ type: "step_result", result } as unknown as ProcessingMessage);

const logMsg = (text: string): ProcessingMessage =>
  ({ type: "log_update", content: text } as unknown as ProcessingMessage);

beforeEach(() => {
  ctorCalls.length = 0;
  nextMessages = [];
});

describe("AgentStepExecutor.process", () => {
  it("returns the step_result value under both output and result handles", async () => {
    nextMessages = [logMsg("working"), stepResultMsg({ answer: 42 })];
    const ctx = createMockContext();
    const exec = new AgentStepExecutor(makeNode(), makeOpts());

    const out = await exec.process({}, ctx);

    expect(out).toEqual({ output: { answer: 42 }, result: { answer: 42 } });
  });

  it("returns null result when no step_result message is emitted", async () => {
    nextMessages = [logMsg("nothing produced")];
    const ctx = createMockContext();
    const exec = new AgentStepExecutor(makeNode(), makeOpts());

    const out = await exec.process({}, ctx);

    expect(out).toEqual({ output: null, result: null });
  });

  it("forwards every processing message to context.emit", async () => {
    nextMessages = [logMsg("a"), logMsg("b"), stepResultMsg("done")];
    const ctx = createMockContext();
    const exec = new AgentStepExecutor(makeNode(), makeOpts());

    await exec.process({}, ctx);

    expect(ctx.emit).toHaveBeenCalledTimes(3);
    expect(ctx.emit).toHaveBeenNthCalledWith(1, nextMessages[0]);
    expect(ctx.emit).toHaveBeenNthCalledWith(3, nextMessages[2]);
  });

  it("captures the LAST step_result when multiple are emitted", async () => {
    nextMessages = [stepResultMsg("first"), stepResultMsg("second")];
    const ctx = createMockContext();
    const exec = new AgentStepExecutor(makeNode(), makeOpts());

    const out = await exec.process({}, ctx);

    expect(out.result).toBe("second");
  });

  it("builds the step from the descriptor: instructions, output_schema", async () => {
    nextMessages = [stepResultMsg("x")];
    const ctx = createMockContext();
    const exec = new AgentStepExecutor(
      makeNode({ output_schema: "{\"type\":\"object\"}" }),
      makeOpts()
    );

    await exec.process({}, ctx);

    const call = ctorCalls[0];
    expect(call.step.id).toBe("node_1");
    expect(call.step.instructions).toBe("Do the thing");
    expect((call.step as any).outputSchema).toBe("{\"type\":\"object\"}");
    expect(call.task).toMatchObject({ title: "Do the thing" });
    expect(call.model).toBe("mock-model");
  });

  it("defaults instructions to empty string when the prop is missing/non-string", async () => {
    nextMessages = [stepResultMsg("x")];
    const ctx = createMockContext();
    const node = makeNode();
    delete (node.properties as Record<string, unknown>).instructions;
    const exec = new AgentStepExecutor(node, makeOpts());

    await exec.process({}, ctx);

    expect(ctorCalls[0].step.instructions).toBe("");
  });

  it("leaves outputSchema undefined when output_schema is not a string", async () => {
    nextMessages = [stepResultMsg("x")];
    const ctx = createMockContext();
    const exec = new AgentStepExecutor(
      makeNode({ output_schema: { type: "object" } }),
      makeOpts()
    );

    await exec.process({}, ctx);

    expect((ctorCalls[0].step as any).outputSchema).toBeUndefined();
  });

  it("handles a descriptor with no properties at all", async () => {
    nextMessages = [stepResultMsg("x")];
    const ctx = createMockContext();
    const node = { id: "bare", type: "nodetool.agents.AgentStep" } as any;
    const exec = new AgentStepExecutor(node, makeOpts());

    const out = await exec.process({}, ctx);

    expect(out.result).toBe("x");
    expect(ctorCalls[0].step.instructions).toBe("");
    expect(ctorCalls[0].step.id).toBe("bare");
  });
});

describe("AgentStepExecutor upstream inputs", () => {
  it("prepends an Upstream Results preamble to the step instructions", async () => {
    nextMessages = [stepResultMsg("x")];
    const ctx = createMockContext();
    const exec = new AgentStepExecutor(makeNode(), makeOpts());

    await exec.process({ topic: "cats", count: 3 }, ctx);

    const instr = ctorCalls[0].step.instructions;
    expect(instr).toContain("# Upstream Results");
    expect(instr).toContain('## Input "topic":\ncats');
    // Non-string values are JSON serialized.
    expect(instr).toContain('## Input "count":\n3');
    // Original instructions still present, after the preamble.
    expect(instr.endsWith("Do the thing")).toBe(true);
    expect(instr.indexOf("# Upstream Results")).toBe(0);
  });

  it("does not add a preamble when there are no non-null inputs", async () => {
    nextMessages = [stepResultMsg("x")];
    const ctx = createMockContext();
    const exec = new AgentStepExecutor(makeNode(), makeOpts());

    await exec.process({ a: null, b: undefined }, ctx);

    expect(ctorCalls[0].step.instructions).toBe("Do the thing");
  });

  it("persists non-null inputs into agent memory under input:<nodeId>.<key>", async () => {
    nextMessages = [stepResultMsg("x")];
    const ctx = createMockContext();
    const exec = new AgentStepExecutor(makeNode(), makeOpts());

    await exec.process({ topic: "dogs", skip: null }, ctx);

    const key = memoryKeys.input("node_1.topic");
    expect(ctx.memory.has(key)).toBe(true);
    const entry = ctx.memory.get(key);
    expect(entry?.value).toBe("dogs");
    expect(entry?.kind).toBe("input");
    expect(entry?.source).toBe("node_1");
    // Null-valued input is skipped.
    expect(ctx.memory.has(memoryKeys.input("node_1.skip"))).toBe(false);
  });

  it("serializes object inputs with JSON in the preamble", async () => {
    nextMessages = [stepResultMsg("x")];
    const ctx = createMockContext();
    const exec = new AgentStepExecutor(makeNode(), makeOpts());

    await exec.process({ obj: { a: 1 } }, ctx);

    const instr = ctorCalls[0].step.instructions;
    expect(instr).toContain('## Input "obj":');
    expect(instr).toContain('"a": 1');
  });
});

describe("AgentStepExecutor tool filtering", () => {
  const toolA = { name: "search" } as any;
  const toolB = { name: "http" } as any;
  const toolC = { name: "calc" } as any;

  it("passes all tools through when the step declares no tool subset", async () => {
    nextMessages = [stepResultMsg("x")];
    const ctx = createMockContext();
    const exec = new AgentStepExecutor(makeNode(), makeOpts([toolA, toolB, toolC]));

    await exec.process({}, ctx);

    expect(ctorCalls[0].tools.map((t) => t.name)).toEqual([
      "search",
      "http",
      "calc"
    ]);
  });

  it("filters tools to the subset named in the step's tools array", async () => {
    nextMessages = [stepResultMsg("x")];
    const ctx = createMockContext();
    const exec = new AgentStepExecutor(
      makeNode({ tools: ["http", "calc"] }),
      makeOpts([toolA, toolB, toolC])
    );

    await exec.process({}, ctx);

    expect(ctorCalls[0].tools.map((t) => t.name)).toEqual(["http", "calc"]);
  });

  it("passes all tools when the step tools array is empty", async () => {
    nextMessages = [stepResultMsg("x")];
    const ctx = createMockContext();
    const exec = new AgentStepExecutor(
      makeNode({ tools: [] }),
      makeOpts([toolA, toolB])
    );

    await exec.process({}, ctx);

    expect(ctorCalls[0].tools.map((t) => t.name)).toEqual(["search", "http"]);
  });

  it("yields an empty tool list when the subset matches nothing", async () => {
    nextMessages = [stepResultMsg("x")];
    const ctx = createMockContext();
    const exec = new AgentStepExecutor(
      makeNode({ tools: ["nonexistent"] }),
      makeOpts([toolA, toolB])
    );

    await exec.process({}, ctx);

    expect(ctorCalls[0].tools).toEqual([]);
  });

  it("ignores a non-array tools prop (treated as no subset)", async () => {
    nextMessages = [stepResultMsg("x")];
    const ctx = createMockContext();
    const exec = new AgentStepExecutor(
      makeNode({ tools: "search" }),
      makeOpts([toolA, toolB])
    );

    await exec.process({}, ctx);

    expect(ctorCalls[0].tools.map((t) => t.name)).toEqual(["search", "http"]);
  });
});

describe("AgentStepExecutor forwards executor options", () => {
  it("forwards systemPrompt and maxIterations to the StepExecutor", async () => {
    nextMessages = [stepResultMsg("x")];
    const ctx = createMockContext();
    const exec = new AgentStepExecutor(makeNode(), {
      provider: { provider: "mock" } as any,
      model: "m",
      tools: [] as any,
      systemPrompt: "be terse",
      maxIterations: 7
    });

    await exec.process({}, ctx);

    expect(ctorCalls[0].systemPrompt).toBe("be terse");
    expect(ctorCalls[0].maxIterations).toBe(7);
  });
});
