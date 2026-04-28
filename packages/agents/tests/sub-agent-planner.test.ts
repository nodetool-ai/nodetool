/**
 * Tests for SubAgentPlanner.
 *
 * Covers: constructor, fallback agent generation, plan yielding messages,
 * successful planning via tool call, and retry on invalid responses.
 */

import { describe, it, expect, vi } from "vitest";
import { SubAgentPlanner } from "../src/sub-agent-planner.js";
import type { BaseProvider } from "@nodetool-ai/runtime";
import type { ProcessingMessage } from "@nodetool-ai/protocol";

function createMockProvider(
  responseOverrides?: Partial<{
    content: string;
    toolCalls: Array<{
      id: string;
      name: string;
      args: Record<string, unknown>;
    }>;
  }>
) {
  const defaultResponse = {
    role: "assistant",
    content: responseOverrides?.content ?? "Here's the team.",
    toolCalls: responseOverrides?.toolCalls ?? [
      {
        id: "tc_1",
        name: "create_team",
        args: {
          agents: [
            {
              name: "coordinator",
              role: "Lead coordinator",
              skills: ["planning"]
            },
            {
              name: "researcher",
              role: "Data gatherer",
              skills: ["search", "analysis"]
            }
          ]
        }
      }
    ]
  };

  return {
    provider: "mock",
    hasToolSupport: vi.fn(async () => true),
    generateMessageTraced: vi.fn().mockResolvedValue(defaultResponse),
    getAvailableLanguageModels: vi.fn(async () => [])
  } as unknown as BaseProvider;
}

async function collectMessages(
  gen: AsyncGenerator<ProcessingMessage, unknown>
): Promise<{ messages: ProcessingMessage[]; result: unknown }> {
  const messages: ProcessingMessage[] = [];
  let result: unknown;
  while (true) {
    const { value, done } = await gen.next();
    if (done) {
      result = value;
      break;
    }
    messages.push(value);
  }
  return { messages, result };
}

describe("SubAgentPlanner constructor", () => {
  it("accepts provider, model, and optional tools", () => {
    const provider = createMockProvider();
    const planner = new SubAgentPlanner({
      provider,
      model: "gpt-4",
      tools: []
    });
    expect(planner).toBeDefined();
  });

  it("defaults tools to empty array", () => {
    const provider = createMockProvider();
    const planner = new SubAgentPlanner({
      provider,
      model: "gpt-4"
    });
    expect(planner).toBeDefined();
  });
});

describe("SubAgentPlanner.plan with successful tool call", () => {
  it("returns SubAgentConfig array from create_team tool call", async () => {
    const provider = createMockProvider();
    const planner = new SubAgentPlanner({ provider, model: "gpt-4" });

    const gen = planner.plan("Build a website", 2);
    const { result } = await collectMessages(gen);

    expect(Array.isArray(result)).toBe(true);
    const configs = result as Array<{
      name: string;
      role: string;
      skills: string[];
    }>;
    expect(configs).toHaveLength(2);
    expect(configs[0].name).toBe("coordinator");
    expect(configs[1].name).toBe("researcher");
    expect(configs[0].skills).toContain("planning");
  });

  it("yields planning_update messages during generation", async () => {
    const provider = createMockProvider();
    const planner = new SubAgentPlanner({ provider, model: "gpt-4" });

    const gen = planner.plan("Build a website", 2);
    const { messages } = await collectMessages(gen);

    const planningUpdates = messages.filter(
      (m) => m.type === "planning_update"
    );
    expect(planningUpdates.length).toBeGreaterThanOrEqual(2);

    // First should be initialization
    const initMsg = planningUpdates[0] as any;
    expect(initMsg.phase).toBe("initialization");
    expect(initMsg.status).toBe("started");

    // Should have a completion message
    const completeMsg = planningUpdates.find(
      (m: any) => m.phase === "complete"
    );
    expect(completeMsg).toBeDefined();
  });
});

describe("SubAgentPlanner.plan with text response (JSON extraction)", () => {
  it("extracts team from JSON in text when no tool call", async () => {
    const provider = createMockProvider({
      content: JSON.stringify({
        agents: [{ name: "analyst", role: "Data analyst", skills: ["data"] }]
      }),
      toolCalls: []
    });
    const planner = new SubAgentPlanner({ provider, model: "gpt-4" });

    const gen = planner.plan("Analyze data", 1);
    const { result } = await collectMessages(gen);

    const configs = result as Array<{
      name: string;
      role: string;
      skills: string[];
    }>;
    expect(configs).toHaveLength(1);
    expect(configs[0].name).toBe("analyst");
  });
});

describe("SubAgentPlanner.plan fallback", () => {
  it("falls back to generic agents after retries exhausted", async () => {
    const provider = createMockProvider({
      content: "I don't understand",
      toolCalls: []
    });
    // Make extractJSON return null for this text
    const planner = new SubAgentPlanner({ provider, model: "gpt-4" });

    const gen = planner.plan("Do something", 3);
    const { messages, result } = await collectMessages(gen);

    const configs = result as Array<{
      name: string;
      role: string;
      skills: string[];
    }>;
    expect(configs.length).toBeGreaterThan(0);
    // Should be fallback agents
    expect(configs[0].name).toBe("coordinator");

    // Should have a log_update warning about fallback
    const logUpdates = messages.filter((m) => m.type === "log_update");
    expect(logUpdates.length).toBeGreaterThanOrEqual(1);
  });

  it("fallback agents are limited to requested count", async () => {
    const provider = createMockProvider({
      content: "no valid JSON here",
      toolCalls: []
    });
    const planner = new SubAgentPlanner({ provider, model: "gpt-4" });

    const gen = planner.plan("Do something", 2);
    const { result } = await collectMessages(gen);

    const configs = result as Array<{ name: string }>;
    expect(configs).toHaveLength(2);
  });

  it("fallback returns at most 4 agents even if more requested", async () => {
    const provider = createMockProvider({
      content: "invalid",
      toolCalls: []
    });
    const planner = new SubAgentPlanner({ provider, model: "gpt-4" });

    const gen = planner.plan("Do something", 10);
    const { result } = await collectMessages(gen);

    const configs = result as Array<{ name: string }>;
    expect(configs).toHaveLength(4); // max templates available
  });
});

describe("SubAgentPlanner.plan error handling", () => {
  it("retries when provider throws", async () => {
    const provider = createMockProvider();
    let callCount = 0;
    (provider as any).generateMessageTraced = vi.fn(async () => {
      callCount++;
      if (callCount < 3) {
        throw new Error("Network error");
      }
      return {
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "tc_1",
            name: "create_team",
            args: {
              agents: [{ name: "recovered", role: "test", skills: ["test"] }]
            }
          }
        ]
      };
    });

    const planner = new SubAgentPlanner({ provider, model: "gpt-4" });
    const gen = planner.plan("test", 1);
    const { result } = await collectMessages(gen);

    const configs = result as Array<{ name: string }>;
    expect(configs[0].name).toBe("recovered");
  });
});

describe("SubAgentPlanner.plan with tools info", () => {
  it("includes tool descriptions in the user prompt", async () => {
    const provider = createMockProvider();
    const tool = {
      name: "web_search",
      description: "Search the web",
      inputSchema: {},
      process: vi.fn(),
      toProviderTool: vi.fn()
    } as any;

    const planner = new SubAgentPlanner({
      provider,
      model: "gpt-4",
      tools: [tool]
    });
    const gen = planner.plan("Research topic", 2);
    await collectMessages(gen);

    // Verify the provider was called with messages containing tool info
    const calls = (provider as any).generateMessageTraced.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const messages = calls[0][0].messages;
    const userMsg = messages.find((m: any) => m.role === "user");
    expect(userMsg.content).toContain("web_search");
    expect(userMsg.content).toContain("Search the web");
  });
});

describe("SubAgentPlanner agent config mapping", () => {
  it("maps missing name to 'agent'", async () => {
    const provider = createMockProvider({
      toolCalls: [
        {
          id: "tc_1",
          name: "create_team",
          args: {
            agents: [{ role: "helper", skills: ["help"] }]
          }
        }
      ]
    });
    const planner = new SubAgentPlanner({ provider, model: "gpt-4" });
    const gen = planner.plan("test", 1);
    const { result } = await collectMessages(gen);

    const configs = result as Array<{ name: string }>;
    expect(configs[0].name).toBe("agent");
  });

  it("maps missing role to 'general assistant'", async () => {
    const provider = createMockProvider({
      toolCalls: [
        {
          id: "tc_1",
          name: "create_team",
          args: {
            agents: [{ name: "bot", skills: ["stuff"] }]
          }
        }
      ]
    });
    const planner = new SubAgentPlanner({ provider, model: "gpt-4" });
    const gen = planner.plan("test", 1);
    const { result } = await collectMessages(gen);

    const configs = result as Array<{ role: string }>;
    expect(configs[0].role).toBe("general assistant");
  });

  it("maps non-array skills to empty array", async () => {
    const provider = createMockProvider({
      toolCalls: [
        {
          id: "tc_1",
          name: "create_team",
          args: {
            agents: [{ name: "bot", role: "helper", skills: "not-an-array" }]
          }
        }
      ]
    });
    const planner = new SubAgentPlanner({ provider, model: "gpt-4" });
    const gen = planner.plan("test", 1);
    const { result } = await collectMessages(gen);

    const configs = result as Array<{ skills: string[] }>;
    expect(configs[0].skills).toEqual([]);
  });
});
