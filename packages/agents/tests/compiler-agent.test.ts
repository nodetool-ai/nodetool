/**
 * CompilerAgent — final synthesis pass that runs after a TaskPlan finishes.
 * Reads the gathered memory and produces a schema-conformant final result via
 * `finish_step`.
 *
 * The compiler must:
 *   1. List memory, decide which keys to read.
 *   2. Read those keys via `memory_read`.
 *   3. Call `finish_step` exactly once with a result matching the schema.
 *
 * These tests drive the compiler with a scripted fake provider that walks
 * those three steps deterministically.
 */

import { describe, expect, it, vi } from "vitest";
import { memoryKeys } from "@nodetool-ai/runtime";
import { CompilerAgent } from "../src/compiler-agent.js";
import { createMockContext } from "./_helpers/mock-context.js";

type ProviderResponse = {
  text?: string;
  toolCalls?: Array<{ id: string; name: string; args: Record<string, unknown> }>;
};

function createScriptedProvider(responses: ProviderResponse[]) {
  let i = 0;
  return {
    provider: "scripted",
    hasToolSupport: async () => true,
    async *generateMessagesTraced() {
      const next = responses[i++] ?? { text: "" };
      if (next.text) {
        yield { type: "chunk" as const, content: next.text, done: false };
      }
      for (const tc of next.toolCalls ?? []) yield tc;
    },
    generateMessageTraced: vi.fn(),
    generateMessage: vi.fn(),
    generateMessages: vi.fn(),
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
  } as never;
}

function seedTaskResults(context: ReturnType<typeof createMockContext>) {
  context.memory.set({
    key: memoryKeys.task("research"),
    kind: "task_result",
    value: { sources: ["alpha.com", "beta.com"] },
    source: "research",
    title: "Research findings"
  });
  context.memory.set({
    key: memoryKeys.task("analyze"),
    kind: "task_result",
    value: { score: 0.87, label: "positive" },
    source: "analyze",
    title: "Analysis"
  });
}

describe("CompilerAgent", () => {
  it("reads task results from memory and emits a schema-conformant result via finish_step", async () => {
    const context = createMockContext();
    seedTaskResults(context);

    const provider = createScriptedProvider([
      // Round 1: ask to read both task results.
      {
        toolCalls: [
          {
            id: "tc_1",
            name: "memory_read",
            args: { keys: ["task:research", "task:analyze"] }
          }
        ]
      },
      // Round 2: produce the final synthesized result.
      {
        toolCalls: [
          {
            id: "tc_2",
            name: "finish_step",
            args: {
              result: {
                summary: "Two sources analyzed positively.",
                sources: ["alpha.com", "beta.com"],
                score: 0.87
              }
            }
          }
        ]
      }
    ]);

    const compiler = new CompilerAgent({
      objective: "Summarize research with analysis score",
      outputSchema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          sources: { type: "array", items: { type: "string" } },
          score: { type: "number" }
        },
        required: ["summary", "sources", "score"]
      },
      provider,
      model: "scripted-model",
      context: context as never
    });

    const events: unknown[] = [];
    const gen = compiler.compile();
    let next = await gen.next();
    while (!next.done) {
      events.push(next.value);
      next = await gen.next();
    }

    const result = next.value as Record<string, unknown>;
    expect(result).toEqual({
      summary: "Two sources analyzed positively.",
      sources: ["alpha.com", "beta.com"],
      score: 0.87
    });

    // Compiler should yield at least one tool_call_update for memory_read,
    // one for finish_step, and a step_result.
    const tcUpdates = events.filter(
      (e) => (e as { type?: string }).type === "tool_call_update"
    );
    const names = tcUpdates.map((e) => (e as { name: string }).name);
    expect(names).toContain("memory_read");
    expect(names).toContain("finish_step");
    expect(
      events.some(
        (e) =>
          (e as { type?: string }).type === "step_result" &&
          (e as { is_task_result?: boolean }).is_task_result === true
      )
    ).toBe(true);
  });

  it("returns null when the model never calls finish_step within the round budget", async () => {
    const context = createMockContext();
    seedTaskResults(context);

    // Provider keeps emitting plain text, never calls a tool.
    const provider = createScriptedProvider([
      { text: "thinking..." },
      { text: "still thinking..." },
      { text: "no tool call" }
    ]);

    const compiler = new CompilerAgent({
      objective: "Whatever",
      outputSchema: {
        type: "object",
        properties: { ok: { type: "boolean" } },
        required: ["ok"]
      },
      provider,
      model: "scripted-model",
      context: context as never,
      maxRounds: 3
    });

    const gen = compiler.compile();
    let next = await gen.next();
    while (!next.done) next = await gen.next();
    expect(next.value).toBeNull();
  });

  it("includes the task plan structure in the user prompt when supplied", async () => {
    const context = createMockContext();
    seedTaskResults(context);

    let capturedPrompt = "";
    const provider = {
      provider: "scripted",
      hasToolSupport: async () => true,
      async *generateMessagesTraced(opts: { messages: { content: string }[] }) {
        capturedPrompt = opts.messages.map((m) => m.content).join("\n---\n");
        yield {
          id: "tc",
          name: "finish_step",
          args: { result: { ok: true } }
        };
      },
      generateMessageTraced: vi.fn(),
      generateMessage: vi.fn(),
      generateMessages: vi.fn(),
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
    } as never;

    const compiler = new CompilerAgent({
      objective: "Write a brief about competitors",
      outputSchema: {
        type: "object",
        properties: { ok: { type: "boolean" } },
        required: ["ok"]
      },
      provider,
      model: "scripted-model",
      context: context as never,
      taskPlan: {
        title: "Competitor brief",
        tasks: [
          {
            id: "research",
            title: "Research competitors",
            dependsOn: [],
            completed: true,
            steps: [
              {
                id: "research_search",
                instructions: "Use google_search to find top 3 competitors.",
                completed: true,
                dependsOn: [],
                logs: []
              }
            ]
          },
          {
            id: "analyze",
            title: "Analyze findings",
            dependsOn: ["research"],
            completed: true,
            steps: [
              {
                id: "analyze_score",
                instructions: "Score each competitor on price/quality.",
                completed: true,
                dependsOn: [],
                logs: []
              }
            ]
          }
        ]
      }
    });

    const gen = compiler.compile();
    let next = await gen.next();
    while (!next.done) next = await gen.next();

    expect(capturedPrompt).toContain("Plan executed");
    expect(capturedPrompt).toContain("task:research");
    expect(capturedPrompt).toContain("task:analyze");
    expect(capturedPrompt).toContain("[depends_on: research]");
    expect(capturedPrompt).toContain("research_search");
  });

  it("succeeds with no memory entries by working from the objective alone", async () => {
    const context = createMockContext();
    // No memory seeded.

    const provider = createScriptedProvider([
      {
        toolCalls: [
          {
            id: "tc_1",
            name: "finish_step",
            args: { result: { greeting: "hello" } }
          }
        ]
      }
    ]);

    const compiler = new CompilerAgent({
      objective: "Greet the user",
      outputSchema: {
        type: "object",
        properties: { greeting: { type: "string" } },
        required: ["greeting"]
      },
      provider,
      model: "scripted-model",
      context: context as never
    });

    const gen = compiler.compile();
    let next = await gen.next();
    while (!next.done) next = await gen.next();
    expect(next.value).toEqual({ greeting: "hello" });
  });
});
