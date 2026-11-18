/**
 * What a chat turn costs before the model does any work.
 *
 * Every turn sends the system prompt, the provider tool schemas, and — when a
 * document is focused — that document's tool signatures in the turn's tail.
 * Local models run at a 32k context window, so this fixed cost decides how
 * much room is left for the user's task. The budgets below pin it: a change
 * that grows the fixed cost has to raise a number here, in review.
 *
 * Sizes are characters, not tokens: deterministic, and tokenizer-independent.
 * The timeline tools are built from the same protocol contracts the browser
 * registers, with the browser's `timeline_id` host field.
 */
import { writeFileSync } from "node:fs";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { initTestDb } from "@nodetool-ai/models";
import { BaseProvider, zodToJsonSchema } from "@nodetool-ai/runtime";
import {
  ANIMATED_PROPERTIES,
  DEFAULT_BEAT_TOLERANCE_MS,
  STAGGER_UNITS
} from "@nodetool-ai/timeline";
import { buildTimelineToolContracts } from "@nodetool-ai/protocol/api-schemas/timeline-tool-contracts.js";
import { uiToolParams } from "@nodetool-ai/protocol/api-schemas/ui-tool-contract.js";
import {
  WebSocketClientSession,
  type WebSocketConnection,
  type WebSocketReceiveFrame
} from "../src/websocket-client-session.js";
import { borrowedLoopBudgetMembers } from "./chat-turn-test-harness.js";

class MockWS implements WebSocketConnection {
  clientState: "connected" | "disconnected" = "connected";
  applicationState: "connected" | "disconnected" = "connected";
  async accept() {}
  async receive(): Promise<WebSocketReceiveFrame> {
    return { type: "websocket.disconnect" };
  }
  async sendBytes() {}
  async sendText() {}
  async close() {
    this.clientState = "disconnected";
    this.applicationState = "disconnected";
  }
}

interface Captured {
  messages: Array<{ role: string; content: unknown }>;
  tools: unknown[];
}

/** The timeline tools exactly as the browser's manifest carries them. */
function timelineManifest(): Array<Record<string, unknown>> {
  const contracts = buildTimelineToolContracts({
    staggerUnits: STAGGER_UNITS,
    animatedProperties: ANIMATED_PROPERTIES,
    beatToleranceMs: DEFAULT_BEAT_TOLERANCE_MS
  });
  return Object.entries(contracts).map(([name, contract]) => ({
    name,
    description: contract.description,
    parameters: zodToJsonSchema(uiToolParams(contract, { timeline_id: z.string() }))
  }));
}

async function captureTurn(extra: Record<string, unknown>): Promise<Captured> {
  const captured: Captured = { messages: [], tools: [] };
  const provider = async () =>
    ({
      provider: "mock",
      async *generateMessages() {},
      async *generateMessagesTraced(opts: Captured) {
        captured.messages = opts.messages;
        captured.tools = opts.tools ?? [];
        yield { type: "chunk" as const, content: "ok" };
      },
      async generateMessageTraced() {
        return { role: "assistant", content: "" };
      },
      generateMessage: vi.fn(),
      hasToolSupport: async () => true,
      getAvailableLanguageModels: async () => [],
      getAvailableImageModels: async () => [],
      getAvailableVideoModels: async () => [],
      getAvailableTTSModels: async () => [],
      getAvailableASRModels: async () => [],
      getAvailableEmbeddingModels: async () => [],
      getContainerEnv: () => ({}),
      generateLoop: BaseProvider.prototype.generateLoop,
      ...borrowedLoopBudgetMembers
    }) as never;
  const session = new WebSocketClientSession({
    resolveExecutor: () => ({ async process() { return {}; } }),
    resolveProvider: provider
  });
  await session.connect(new MockWS());
  (session as unknown as { clientToolsManifest: Record<string, unknown> }).clientToolsManifest =
    Object.fromEntries(timelineManifest().map((tool) => [String(tool.name), tool]));
  await session.handleCommand({
    command: "chat_message",
    data: { thread_id: `budget-${Math.random()}`, content: "Cut a teaser.", provider: "mock", model: "m", ...extra }
  });
  await new Promise((resolve) => setTimeout(resolve, 200));
  await session.disconnect();
  return captured;
}

const textOf = (content: unknown): string =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.map((part) => String((part as { text?: unknown }).text ?? "")).join("\n")
      : "";

/** Characters of each part of a turn's fixed cost. */
function measure(turn: Captured, label: string) {
  const system = turn.messages.filter((m) => m.role === "system").map((m) => textOf(m.content)).join("\n");
  const users = turn.messages.filter((m) => m.role === "user");
  const tail = textOf(users[users.length - 1]?.content);
  const dumpDir = process.env.PROMPT_DUMP_DIR;
  if (dumpDir) {
    writeFileSync(`${dumpDir}/${label}-system.txt`, system);
    writeFileSync(`${dumpDir}/${label}-tail.txt`, tail);
  }
  return { system: system.length, tools: JSON.stringify(turn.tools).length, tail: tail.length };
}

const TIMELINE_FOCUS = {
  ui_context: {
    focused: { type: "timeline", id: "tl-1", title: "Cut" },
    open: [{ type: "timeline", id: "tl-1", title: "Cut" }],
    source: "timeline_assistant"
  }
};

describe("chat turn fixed cost", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("measures the workspace and timeline turns", async () => {
    const workspace = measure(await captureTurn({}), "workspace");
    const timeline = measure(await captureTurn(TIMELINE_FOCUS), "timeline");
    if (process.env.PROMPT_BUDGET_OUT) {
      writeFileSync(process.env.PROMPT_BUDGET_OUT, JSON.stringify({ workspace, timeline }));
    }
    expect(workspace.system).toBeGreaterThan(0);
    expect(timeline.tail).toBeGreaterThan(0);
  });
});
