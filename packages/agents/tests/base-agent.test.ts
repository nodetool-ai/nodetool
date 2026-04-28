/**
 * Tests for BaseAgent abstract class.
 *
 * Since BaseAgent is abstract, we test it via a minimal concrete subclass.
 */

import { describe, it, expect, vi } from "vitest";
import { BaseAgent } from "../src/base-agent.js";
import type { ProcessingContext, BaseProvider } from "@nodetool-ai/runtime";
import type { ProcessingMessage } from "@nodetool-ai/protocol";

/* ------------------------------------------------------------------ */
/*  Minimal concrete subclass for testing                             */
/* ------------------------------------------------------------------ */

class ConcreteAgent extends BaseAgent {
  private yieldItems: ProcessingMessage[];

  constructor(
    opts: ConstructorParameters<typeof BaseAgent>[0],
    yieldItems: ProcessingMessage[] = []
  ) {
    super(opts);
    this.yieldItems = yieldItems;
  }

  async *execute(
    _context: ProcessingContext
  ): AsyncGenerator<ProcessingMessage> {
    for (const item of this.yieldItems) {
      yield item;
    }
    this.results = { done: true };
  }

  getResults(): unknown {
    return this.results;
  }
}

function makeMockProvider(): BaseProvider {
  return {
    provider: "mock",
    hasToolSupport: vi.fn().mockResolvedValue(true),
    generateMessages: vi.fn(),
    generateMessage: vi.fn(),
    getAvailableLanguageModels: vi.fn().mockResolvedValue([])
  } as unknown as BaseProvider;
}

/* ------------------------------------------------------------------ */
/*  Constructor / defaults                                            */
/* ------------------------------------------------------------------ */

describe("BaseAgent constructor", () => {
  const provider = makeMockProvider();

  it("stores required fields", () => {
    const agent = new ConcreteAgent({
      name: "test-agent",
      objective: "do something",
      provider,
      model: "gpt-4"
    });

    expect(agent.name).toBe("test-agent");
    expect(agent.objective).toBe("do something");
    expect(agent.provider).toBe(provider);
    expect(agent.model).toBe("gpt-4");
  });

  it("defaults tools to empty array", () => {
    const agent = new ConcreteAgent({
      name: "a",
      objective: "b",
      provider,
      model: "m"
    });
    expect(agent.tools).toEqual([]);
  });

  it("defaults inputs to empty object", () => {
    const agent = new ConcreteAgent({
      name: "a",
      objective: "b",
      provider,
      model: "m"
    });
    expect(agent.inputs).toEqual({});
  });

  it("defaults systemPrompt to empty string", () => {
    const agent = new ConcreteAgent({
      name: "a",
      objective: "b",
      provider,
      model: "m"
    });
    expect(agent.systemPrompt).toBe("");
  });

  it("defaults maxTokenLimit to 128000", () => {
    const agent = new ConcreteAgent({
      name: "a",
      objective: "b",
      provider,
      model: "m"
    });
    expect(agent.maxTokenLimit).toBe(128000);
  });

  it("accepts custom tools, inputs, systemPrompt, maxTokenLimit", () => {
    const tool = { name: "t", description: "d", inputSchema: {} } as any;
    const agent = new ConcreteAgent({
      name: "a",
      objective: "b",
      provider,
      model: "m",
      tools: [tool],
      inputs: { key: "value" },
      systemPrompt: "Be helpful",
      maxTokenLimit: 4096
    });

    expect(agent.tools).toHaveLength(1);
    expect(agent.inputs).toEqual({ key: "value" });
    expect(agent.systemPrompt).toBe("Be helpful");
    expect(agent.maxTokenLimit).toBe(4096);
  });

  it("initialises results as null and task as null", () => {
    const agent = new ConcreteAgent({
      name: "a",
      objective: "b",
      provider,
      model: "m"
    });
    expect(agent.results).toBeNull();
    expect(agent.task).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  execute / getResults                                              */
/* ------------------------------------------------------------------ */

describe("BaseAgent execute / getResults", () => {
  const provider = makeMockProvider();
  const context = {} as ProcessingContext;

  it("yields messages from concrete subclass", async () => {
    const msg: ProcessingMessage = {
      type: "chunk",
      content: "hello",
      done: false
    } as any;
    const agent = new ConcreteAgent(
      { name: "a", objective: "b", provider, model: "m" },
      [msg]
    );

    const collected: ProcessingMessage[] = [];
    for await (const item of agent.execute(context)) {
      collected.push(item);
    }

    expect(collected).toHaveLength(1);
    expect(collected[0]).toBe(msg);
  });

  it("getResults returns null before execution", () => {
    const agent = new ConcreteAgent({
      name: "a",
      objective: "b",
      provider,
      model: "m"
    });
    expect(agent.getResults()).toBeNull();
  });

  it("getResults returns value set during execution", async () => {
    const agent = new ConcreteAgent({
      name: "a",
      objective: "b",
      provider,
      model: "m"
    });

    // Drain the generator
    for await (const message of agent.execute(context)) {
      void message;
    }

    expect(agent.getResults()).toEqual({ done: true });
  });
});
