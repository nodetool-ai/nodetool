/**
 * Integration tests verifying that the canonical built-in tool list
 * (`BUILTIN_TOOL_CLASSES`) instantiates cleanly, registers via the global
 * tool registry, and round-trips through a SimpleAgent driven by a fake
 * provider that calls one of the registered tools.
 *
 * These tests double as the executable contract used by the chat / agent
 * frontends — every tool ID that the frontend lets a user select must
 * resolve here.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  BUILTIN_TOOL_CLASSES,
  getBuiltinTools,
  registerBuiltinTools
} from "../src/tools/builtin-tools.js";
import { resolveTool, listTools } from "../src/tools/tool-registry.js";
import { SimpleAgent } from "../src/simple-agent.js";
import { CalculatorTool } from "../src/tools/calculator-tool.js";
import type { ProcessingMessage } from "@nodetool-ai/protocol";

// Tool IDs hardcoded in chat / agent frontends. These MUST resolve to
// real built-in tool instances. If a frontend adds a new ID, add it here.
//
// Sources:
//   web/src/components/chat/composer/ToolsSelector.tsx
//   web/src/components/properties/ToolsListProperty.tsx (subset — the
//     dynamic browser_*/sandbox_* IDs come from base-nodes / sandbox-tools)
//   mobile/src/components/chat/ChatOptionsBar.tsx (subset — same)
const FRONTEND_TOOL_IDS = [
  "google_search",
  "google_image_generation",
  "openai_image_generation",
  "openai_text_to_speech",
  "browser",
  "read_file",
  "write_file",
  "list_directory"
];

// ---------------------------------------------------------------------------
// Mock provider — minimal shape needed by SimpleAgent / StepExecutor
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
  const provider: any = {
    provider: "mock",
    hasToolSupport: async () => true,
    generateMessages: async function* () {
      const items = responseSequence[callIndex] ?? [];
      callIndex++;
      for (const item of items) yield item;
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
  };
  return provider;
}

function createMockContext() {
  const store = new Map<string, unknown>();
  return {
    storeStepResult: vi.fn(async (k: string, v: unknown) => {
      store.set(k, v);
      return k;
    }),
    loadStepResult: vi.fn(async (k: string) => store.get(k)),
    set: vi.fn((k: string, v: unknown) => {
      store.set(k, v);
    }),
    get: vi.fn((k: string) => store.get(k))
  } as any;
}

// ---------------------------------------------------------------------------

describe("BUILTIN_TOOL_CLASSES", () => {
  it("instantiates every class without arguments", () => {
    for (const Cls of BUILTIN_TOOL_CLASSES) {
      expect(() => new Cls()).not.toThrow();
    }
  });

  it("each tool exposes a non-empty name, description, and schema", () => {
    const tools = getBuiltinTools();
    for (const tool of tools) {
      expect(tool.name, `class missing name`).toBeTruthy();
      expect(typeof tool.name).toBe("string");
      expect(tool.description, `${tool.name} missing description`).toBeTruthy();
      expect(tool.inputSchema, `${tool.name} missing inputSchema`).toBeTruthy();
    }
  });

  it("tool names are unique across the built-in catalog", () => {
    const names = getBuiltinTools().map((t) => t.name);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    expect(dupes).toEqual([]);
  });

  it("toProviderTool() round-trips name/description/schema", () => {
    for (const tool of getBuiltinTools()) {
      const pt = tool.toProviderTool();
      expect(pt.name).toBe(tool.name);
      expect(pt.description).toBe(tool.description);
      expect(pt.inputSchema).toBe(tool.inputSchema);
    }
  });
});

describe("registerBuiltinTools()", () => {
  beforeEach(() => {
    // Re-register on every test so order/state from sibling tests doesn't
    // affect us. registerBuiltinTools() is idempotent.
    registerBuiltinTools();
  });

  it("registers every built-in name in the global registry", () => {
    const registered = new Set(listTools());
    for (const tool of getBuiltinTools()) {
      expect(registered.has(tool.name), `${tool.name} not registered`).toBe(
        true
      );
    }
  });

  it("resolves frontend-referenced tool IDs", () => {
    for (const id of FRONTEND_TOOL_IDS) {
      const tool = resolveTool(id);
      expect(tool, `${id} did not resolve — frontend selectors will break`).not.toBeNull();
      expect(tool!.name).toBe(id);
    }
  });
});

describe("Agent end-to-end with fake provider + real tools", () => {
  beforeEach(() => {
    registerBuiltinTools();
  });

  it("runs a SimpleAgent that invokes the real CalculatorTool", async () => {
    // The fake provider yields two LLM turns:
    //   1. a `calculate` tool call,
    //   2. a `finish_step` with the final result.
    const provider = createMockProvider([
      [
        { type: "chunk", content: "computing..." },
        {
          id: "tc_calc",
          name: "calculate",
          args: { expression: "2 + 3 * 4" }
        }
      ],
      [
        { type: "chunk", content: "done" },
        {
          id: "tc_finish",
          name: "finish_step",
          args: { result: { answer: 14 } }
        }
      ]
    ]);

    const agent = new SimpleAgent({
      name: "calc-agent",
      objective: "Compute 2 + 3 * 4 using the calculate tool",
      provider,
      model: "fake-model",
      tools: [new CalculatorTool()],
      outputSchema: {
        type: "object",
        properties: { answer: { type: "number" } },
        required: ["answer"]
      }
    });

    const context = createMockContext();
    const messages: ProcessingMessage[] = [];
    for await (const msg of agent.execute(context)) {
      messages.push(msg);
    }

    expect(agent.getResults()).toEqual({ answer: 14 });

    // The real calculator must have run — its tool_call_update should be
    // in the message stream.
    const calcCalls = messages.filter(
      (m) => m.type === "tool_call_update" && (m as any).name === "calculate"
    );
    expect(calcCalls.length).toBeGreaterThan(0);
  });

  it("runs a SimpleAgent that resolves a tool by name from the registry", async () => {
    const calc = resolveTool("calculate");
    expect(calc).not.toBeNull();

    const provider = createMockProvider([
      [
        {
          id: "tc_1",
          name: "calculate",
          args: { expression: "10 / 2" }
        }
      ],
      [
        {
          id: "tc_2",
          name: "finish_step",
          args: { result: { value: 5 } }
        }
      ]
    ]);

    const agent = new SimpleAgent({
      name: "registry-agent",
      objective: "Halve 10",
      provider,
      model: "fake-model",
      tools: [calc!],
      outputSchema: {
        type: "object",
        properties: { value: { type: "number" } }
      }
    });

    const context = createMockContext();
    for await (const _ of agent.execute(context)) {
      // drain
    }

    expect(agent.getResults()).toEqual({ value: 5 });
  });
});
