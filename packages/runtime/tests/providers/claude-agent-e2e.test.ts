/**
 * E2E tests for ClaudeAgentProvider — hits the real Claude Agent SDK.
 *
 * Requires:
 * - Claude Code CLI installed and authenticated
 * - @anthropic-ai/claude-agent-sdk installed
 *
 * Run with: npx vitest run packages/runtime/tests/providers/claude-agent-e2e.test.ts
 */

import { describe, it, expect } from "vitest";
import { ClaudeAgentProvider } from "../../src/providers/claude-agent-provider.js";
import type { Chunk } from "@nodetool-ai/protocol";
import type {
  ProviderTool,
  ToolCall,
  Message
} from "../../src/providers/types.js";

const MODEL = "claude-sonnet-4-20250514";
const TIMEOUT = 120_000;

// Check if the SDK is available and auth is configured before running.
// Auth can be either ANTHROPIC_API_KEY or an OAuth token (Claude subscription).
let sdkAvailable = false;
try {
  await import("@anthropic-ai/claude-agent-sdk");
  sdkAvailable = true;
} catch {
  // SDK not installed — tests will be skipped
}
const hasAuth =
  Boolean(process.env.ANTHROPIC_API_KEY) ||
  Boolean(process.env.CLAUDE_OAUTH_TOKEN);
// The SDK refuses --dangerously-skip-permissions when running as root
const isRoot = process.getuid?.() === 0;

describe.skipIf(!sdkAvailable || !hasAuth || isRoot)(
  "ClaudeAgentProvider E2E (MCP)",
  () => {
    it(
      "streams a plain text response (no tools)",
      async () => {
        const provider = new ClaudeAgentProvider();
        const chunks: string[] = [];

        for await (const item of provider.generateMessages({
          messages: [
            {
              role: "system",
              content: "You are a helpful assistant. Be very brief."
            },
            {
              role: "user",
              content: "What is 2 + 2? Reply with just the number."
            }
          ],
          model: MODEL
        })) {
          if ("type" in item && (item as Chunk).type === "chunk") {
            const c = item as Chunk;
            if (c.content) chunks.push(c.content);
          }
        }

        const text = chunks.join("");
        console.log("Plain text response:", text);
        expect(text).toContain("4");
      },
      TIMEOUT
    );

    it(
      "calls tools via MCP and returns results",
      async () => {
        const provider = new ClaudeAgentProvider();
        const toolExecutions: Array<{
          name: string;
          args: Record<string, unknown>;
        }> = [];

        const tools: ProviderTool[] = [
          {
            name: "get_weather",
            description: "Get the current weather for a city",
            inputSchema: {
              type: "object",
              properties: {
                city: { type: "string", description: "City name" }
              },
              required: ["city"]
            }
          }
        ];

        const onToolCall = async (
          name: string,
          args: Record<string, unknown>
        ): Promise<string> => {
          toolExecutions.push({ name, args });
          // Return a mock weather result
          return JSON.stringify({
            temperature: 22,
            condition: "sunny",
            city: args.city
          });
        };

        const chunks: string[] = [];
        const toolCalls: ToolCall[] = [];

        for await (const item of provider.generateMessages({
          messages: [
            { role: "system", content: "You are a helpful assistant." },
            { role: "user", content: "What's the weather in Tokyo?" }
          ],
          model: MODEL,
          tools,
          onToolCall
        })) {
          if ("type" in item && (item as Chunk).type === "chunk") {
            const c = item as Chunk;
            if (c.content) chunks.push(c.content);
          }
          if ("id" in item && "name" in item && "args" in item) {
            toolCalls.push(item as ToolCall);
          }
        }

        const text = chunks.join("");
        console.log("Response after tool call:", text);
        console.log(
          "Tool executions:",
          JSON.stringify(toolExecutions, null, 2)
        );
        console.log("Tracked tool calls:", JSON.stringify(toolCalls, null, 2));

        // The onToolCall callback should have been called
        expect(toolExecutions.length).toBeGreaterThanOrEqual(1);
        expect(toolExecutions[0].name).toBe("get_weather");
        expect(toolExecutions[0].args).toHaveProperty("city");

        // Provider should yield tracked ToolCall items
        expect(toolCalls.length).toBeGreaterThanOrEqual(1);
        expect(toolCalls[0].name).toBe("get_weather");

        // Claude should incorporate the tool result in its response
        expect(text.toLowerCase()).toMatch(/tokyo|22|sunny/);
      },
      TIMEOUT
    );

    it(
      "handles plain text when tools are provided but not needed",
      async () => {
        const provider = new ClaudeAgentProvider();
        const toolExecutions: Array<{ name: string }> = [];

        const tools: ProviderTool[] = [
          {
            name: "get_weather",
            description: "Get the current weather for a city",
            inputSchema: {
              type: "object",
              properties: { city: { type: "string" } },
              required: ["city"]
            }
          }
        ];

        const onToolCall = async (
          name: string,
          args: Record<string, unknown>
        ): Promise<string> => {
          toolExecutions.push({ name });
          return JSON.stringify({ temperature: 20 });
        };

        const chunks: string[] = [];

        for await (const item of provider.generateMessages({
          messages: [
            {
              role: "system",
              content: "You are a helpful assistant. Be very brief."
            },
            {
              role: "user",
              content:
                "What is the capital of France? No tools needed for this."
            }
          ],
          model: MODEL,
          tools,
          onToolCall
        })) {
          if ("type" in item && (item as Chunk).type === "chunk") {
            const c = item as Chunk;
            if (c.content) chunks.push(c.content);
          }
        }

        const text = chunks.join("");
        console.log("Text (no tool needed):", text);
        console.log("Tool executions:", toolExecutions.length);

        expect(text.toLowerCase()).toContain("paris");
        expect(toolExecutions).toHaveLength(0);
      },
      TIMEOUT
    );

    it(
      "generateMessage returns toolCalls on Message object",
      async () => {
        const provider = new ClaudeAgentProvider();
        const toolExecutions: string[] = [];

        const tools: ProviderTool[] = [
          {
            name: "search_web",
            description: "Search the web for information",
            inputSchema: {
              type: "object",
              properties: {
                query: { type: "string", description: "Search query" }
              },
              required: ["query"]
            }
          }
        ];

        const onToolCall = async (
          name: string,
          args: Record<string, unknown>
        ): Promise<string> => {
          toolExecutions.push(name);
          return JSON.stringify({
            results: [{ title: "AI News", url: "https://example.com" }]
          });
        };

        const message: Message = await provider.generateMessage({
          messages: [
            { role: "system", content: "You are a helpful assistant." },
            {
              role: "user",
              content: "Search the web for 'latest news about AI'"
            }
          ],
          model: MODEL,
          tools,
          onToolCall
        });

        console.log("Message content:", message.content);
        console.log(
          "Message toolCalls:",
          JSON.stringify(message.toolCalls, null, 2)
        );
        console.log("Tool executions:", toolExecutions);

        expect(message.role).toBe("assistant");
        // Tool should have been called via MCP
        expect(toolExecutions).toContain("search_web");
        // Message should have tracked tool calls
        expect(message.toolCalls).toBeDefined();
        expect(message.toolCalls!.length).toBeGreaterThanOrEqual(1);
        expect(message.toolCalls![0].name).toBe("search_web");
      },
      TIMEOUT
    );

    it(
      "handles multiple tool calls via MCP",
      async () => {
        const provider = new ClaudeAgentProvider();
        const toolExecutions: Array<{
          name: string;
          args: Record<string, unknown>;
        }> = [];

        const tools: ProviderTool[] = [
          {
            name: "get_weather",
            description: "Get weather for a city",
            inputSchema: {
              type: "object",
              properties: { city: { type: "string" } },
              required: ["city"]
            }
          },
          {
            name: "get_time",
            description: "Get the current time in a timezone",
            inputSchema: {
              type: "object",
              properties: { timezone: { type: "string" } },
              required: ["timezone"]
            }
          }
        ];

        const onToolCall = async (
          name: string,
          args: Record<string, unknown>
        ): Promise<string> => {
          toolExecutions.push({ name, args });
          if (name === "get_weather") {
            return JSON.stringify({
              temperature: 18,
              condition: "cloudy",
              city: args.city
            });
          }
          if (name === "get_time") {
            return JSON.stringify({ time: "14:30", timezone: args.timezone });
          }
          return "unknown tool";
        };

        const message: Message = await provider.generateMessage({
          messages: [
            {
              role: "system",
              content:
                "You are a helpful assistant. When asked about weather AND time, use BOTH tools."
            },
            {
              role: "user",
              content: "What's the weather in Tokyo and what time is it there?"
            }
          ],
          model: MODEL,
          tools,
          onToolCall
        });

        console.log("Multi-tool response:", message.content);
        console.log(
          "Tool executions:",
          JSON.stringify(toolExecutions, null, 2)
        );

        // Both tools should have been called via MCP
        const executedNames = toolExecutions.map((t) => t.name);
        expect(executedNames).toContain("get_weather");
        expect(executedNames).toContain("get_time");

        // Response should reference both results
        const text =
          typeof message.content === "string"
            ? message.content.toLowerCase()
            : "";
        expect(text).toMatch(/tokyo|18|cloudy|14:30/);
      },
      TIMEOUT
    );
  }
);
