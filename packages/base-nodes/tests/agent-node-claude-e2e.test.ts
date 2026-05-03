/**
 * Real E2E test: AgentNode with ClaudeAgentProvider + MCP tool calling.
 *
 * Tests the actual workflow node path (AgentNode.genProcess and runAgentLoop)
 * with real Claude API calls via the Claude Agent SDK.
 *
 * Requires: Claude Code CLI authenticated.
 */

import { describe, it, expect, vi } from "vitest";
import { AgentNode, runAgentLoop } from "../src/nodes/agents.js";
import type { ProcessingContext, BaseProvider } from "@nodetool-ai/runtime";
import { ClaudeAgentProvider } from "@nodetool-ai/runtime";

const MODEL = "claude-sonnet-4-20250514";
const TIMEOUT = 120_000;

let sdkAvailable = false;
try {
  await import("@anthropic-ai/claude-agent-sdk");
  sdkAvailable = true;
} catch {}

const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

// --- Mock tools matching ToolLike interface ---

const calculatorTool = {
  name: "calculator",
  description: "Evaluate a math expression. Returns {expression, result}.",
  inputSchema: {
    type: "object" as const,
    properties: {
      expression: {
        type: "string",
        description: "Math expression, e.g. '2+3*4'"
      }
    },
    required: ["expression"]
  },
  process: async (_ctx: any, params: Record<string, unknown>) => {
    const expr = String(params.expression ?? "");
    const sanitized = expr.replace(/[^0-9+\-*/().% ]/g, "");
    const result = Function(`"use strict"; return (${sanitized})`)();
    return { expression: expr, result: Number(result) };
  },
  toProviderTool() {
    return {
      name: this.name,
      description: this.description,
      inputSchema: this.inputSchema
    };
  }
};

const weatherTool = {
  name: "get_weather",
  description: "Get current weather for a city.",
  inputSchema: {
    type: "object" as const,
    properties: {
      city: { type: "string", description: "City name" }
    },
    required: ["city"]
  },
  process: async (_ctx: any, params: Record<string, unknown>) => {
    const city = String(params.city ?? "Unknown");
    return { city, temperature: 22, condition: "Sunny", unit: "celsius" };
  },
  toProviderTool() {
    return {
      name: this.name,
      description: this.description,
      inputSchema: this.inputSchema
    };
  }
};

function createMockContext(provider: BaseProvider): ProcessingContext {
  return {
    getProvider: vi.fn().mockResolvedValue(provider),
    workspaceDir: "/tmp/nodetool-test-workspace",
    storeStepResult: vi.fn(),
    loadStepResult: vi.fn(),
    set: vi.fn(),
    get: vi.fn(),
    hasControlEventSupport: false
  } as unknown as ProcessingContext;
}

describe.skipIf(!sdkAvailable || !hasApiKey)(
  "AgentNode E2E with ClaudeAgentProvider",
  () => {
    it(
      "runAgentLoop with calculator tool via MCP",
      async () => {
        const provider = new ClaudeAgentProvider();
        const context = createMockContext(provider);

        const result = await runAgentLoop({
          context,
          providerId: "claude_agent",
          modelId: MODEL,
          systemPrompt:
            "You are a helpful math assistant. Use the calculator tool for arithmetic.",
          prompt: "What is 42 * 17? Use the calculator tool.",
          tools: [calculatorTool]
        });

        console.log("runAgentLoop result:", result.text.slice(0, 200));
        console.log("Message count:", result.messages.length);

        expect(result.text.length).toBeGreaterThan(0);
        expect(result.text).toMatch(/714/); // 42 * 17 = 714
      },
      TIMEOUT
    );

    it(
      "runAgentLoop with multiple tools via MCP",
      async () => {
        const provider = new ClaudeAgentProvider();
        const context = createMockContext(provider);

        const result = await runAgentLoop({
          context,
          providerId: "claude_agent",
          modelId: MODEL,
          systemPrompt: "You are a helpful assistant. Use tools when needed.",
          prompt: "What's the weather in Paris? Also calculate 99 + 101.",
          tools: [calculatorTool, weatherTool]
        });

        console.log("Multi-tool result:", result.text.slice(0, 300));

        expect(result.text.length).toBeGreaterThan(0);
        // Should contain weather info and calculation
        expect(result.text).toMatch(/200/); // 99 + 101
      },
      TIMEOUT
    );

    it(
      "AgentNode.genProcess with calculator tool",
      async () => {
        const provider = new ClaudeAgentProvider();
        const context = createMockContext(provider);

        const node = new AgentNode();
        const inputs = {
          prompt: "Calculate (8 * 9) + (6 * 7) using the calculator tool.",
          model: { provider: "claude_agent", id: MODEL, name: "Claude Sonnet" },
          system:
            "You are a math assistant. Always use the calculator tool for arithmetic.",
          tools: [calculatorTool],
          history: [],
          thread_id: "",
          max_tokens: 4096,
          image: {
            type: "image",
            uri: "",
            asset_id: null,
            data: null,
            metadata: null
          },
          audio: {
            type: "audio",
            uri: "",
            asset_id: null,
            data: null,
            metadata: null
          }
        };

        const outputs: Record<string, unknown>[] = [];
        let fullText = "";

        node.assign(inputs);

        for await (const item of node.genProcess(context)) {
          outputs.push(item);
          if (item.text && typeof item.text === "string") {
            fullText = item.text;
          }
          if (item.chunk && typeof (item.chunk as any).content === "string") {
            process.stdout.write(".");
          }
        }
        console.log("\nAgentNode text:", fullText.slice(0, 200));

        expect(fullText.length).toBeGreaterThan(0);
        // (8*9) + (6*7) = 72 + 42 = 114
        expect(fullText).toMatch(/114/);
      },
      TIMEOUT
    );

    it(
      "runAgentLoop without tools (plain text)",
      async () => {
        const provider = new ClaudeAgentProvider();
        const context = createMockContext(provider);

        const result = await runAgentLoop({
          context,
          providerId: "claude_agent",
          modelId: MODEL,
          systemPrompt: "Reply in one short sentence.",
          prompt: "What is the capital of France?",
          tools: []
        });

        console.log("No-tools result:", result.text.slice(0, 200));

        expect(result.text.length).toBeGreaterThan(0);
        expect(result.text.toLowerCase()).toMatch(/paris/);
      },
      TIMEOUT
    );
  }
);
