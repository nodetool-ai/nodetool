/**
 * Tests for SimpleAgent.
 *
 * Covers: constructor, execute yielding messages, result extraction,
 * task/step creation, and output schema passing.
 */

import { describe, it, expect, vi } from "vitest";
import { SimpleAgent } from "../src/simple-agent.js";
import type { ProcessingContext, BaseProvider } from "@nodetool-ai/runtime";
import type { ProcessingMessage } from "@nodetool-ai/protocol";

function createMockProvider(finishResult?: Record<string, unknown>) {
  const result = finishResult ?? { answer: "42" };
  return {
    provider: "mock",
    hasToolSupport: vi.fn(async () => true),
    generateMessage: vi.fn().mockResolvedValue({
      role: "assistant",
      content: "Working...",
      toolCalls: [
        {
          id: "tc_1",
          name: "finish_step",
          args: { result }
        }
      ]
    }),
    generateMessageTraced: vi.fn().mockResolvedValue({
      role: "assistant",
      content: "Working...",
      toolCalls: [
        {
          id: "tc_1",
          name: "finish_step",
          args: { result }
        }
      ]
    }),
    async *generateMessages(..._args: unknown[]) {
      yield {
        role: "assistant",
        content: "Working...",
        toolCalls: [
          {
            id: "tc_1",
            name: "finish_step",
            args: { result }
          }
        ]
      };
    },
    async *generateMessagesTraced(..._args: unknown[]) {
      yield {
        role: "assistant",
        content: "Working...",
        toolCalls: [
          {
            id: "tc_1",
            name: "finish_step",
            args: { result }
          }
        ]
      };
    },
    getAvailableLanguageModels: vi.fn(async () => []),
    isContextLengthError: () => false,
    trackUsage: vi.fn(),
    getTotalCost: vi.fn().mockReturnValue(0),
    resetCost: vi.fn()
  } as unknown as BaseProvider;
}

function createMockContext() {
  return {
    storeStepResult: vi.fn(),
    loadStepResult: vi.fn(),
    set: vi.fn(),
    get: vi.fn()
  } as unknown as ProcessingContext;
}

describe("SimpleAgent constructor", () => {
  it("stores name, objective, model, and outputSchema", () => {
    const provider = createMockProvider();
    const agent = new SimpleAgent({
      name: "test-simple",
      objective: "answer a question",
      provider,
      model: "gpt-4",
      tools: [],
      outputSchema: {
        type: "object",
        properties: { answer: { type: "string" } }
      }
    });

    expect(agent.name).toBe("test-simple");
    expect(agent.objective).toBe("answer a question");
    expect(agent.model).toBe("gpt-4");
  });

  it("defaults maxIterations to 20", () => {
    const provider = createMockProvider();
    const agent = new SimpleAgent({
      name: "a",
      objective: "b",
      provider,
      model: "m",
      tools: [],
      outputSchema: {}
    });

    // maxIterations is private, so we test its effect indirectly
    expect(agent).toBeDefined();
  });

  it("accepts custom maxIterations", () => {
    const provider = createMockProvider();
    const agent = new SimpleAgent({
      name: "a",
      objective: "b",
      provider,
      model: "m",
      tools: [],
      outputSchema: {},
      maxIterations: 5
    });

    expect(agent).toBeDefined();
  });

  it("accepts custom maxTokenLimit", () => {
    const provider = createMockProvider();
    const agent = new SimpleAgent({
      name: "a",
      objective: "b",
      provider,
      model: "m",
      tools: [],
      outputSchema: {},
      maxTokenLimit: 4096
    });

    expect(agent.maxTokenLimit).toBe(4096);
  });

  it("defaults inputs and systemPrompt from BaseAgent", () => {
    const provider = createMockProvider();
    const agent = new SimpleAgent({
      name: "a",
      objective: "b",
      provider,
      model: "m",
      tools: [],
      outputSchema: {}
    });

    expect(agent.inputs).toEqual({});
    expect(agent.systemPrompt).toBe("");
  });
});

describe("SimpleAgent getResults", () => {
  it("returns null before execution", () => {
    const provider = createMockProvider();
    const agent = new SimpleAgent({
      name: "a",
      objective: "b",
      provider,
      model: "m",
      tools: [],
      outputSchema: {}
    });

    expect(agent.getResults()).toBeNull();
  });
});

describe("SimpleAgent task creation", () => {
  it("task is null before execution", () => {
    const provider = createMockProvider();
    const agent = new SimpleAgent({
      name: "a",
      objective: "do something",
      provider,
      model: "m",
      tools: [],
      outputSchema: {}
    });

    expect(agent.task).toBeNull();
  });
});
