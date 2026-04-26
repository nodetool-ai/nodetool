/**
 * End-to-end telemetry integration test.
 *
 * Wires up the real OTel SDK to write spans through the JSONL file exporter,
 * then drives a fake provider through generateMessageTraced and asserts that
 * the resulting trace file contains the expected span hierarchy and token
 * usage attributes.
 */

import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  initTelemetry,
  _resetTelemetryForTest
} from "../src/telemetry.js";
import { withAgentSpan } from "../src/tracing-helpers.js";
import type { TraceRecord } from "../src/trace-exporters.js";
import { BaseProvider } from "../src/providers/base-provider.js";
import type {
  Message,
  ProviderId,
  ProviderStreamItem
} from "../src/providers/types.js";

class TestProvider extends BaseProvider {
  constructor() {
    super("anthropic" as ProviderId);
  }
  async generateMessage(args: { messages: Message[]; model: string }): Promise<Message> {
    this.trackUsage(args.model, { inputTokens: 100, outputTokens: 50 });
    return { role: "assistant", content: "hello world" };
  }
  async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
    yield* [];
  }
}

let traceDir: string;
let traceFile: string;

beforeAll(async () => {
  traceDir = await mkdtemp(join(tmpdir(), "nodetool-trace-int-"));
  traceFile = join(traceDir, "trace.jsonl");
  _resetTelemetryForTest();
  await initTelemetry({
    traceFile,
    silent: true
  });
});

afterAll(async () => {
  await rm(traceDir, { recursive: true, force: true });
  _resetTelemetryForTest();
});

describe("telemetry integration", () => {
  it("writes nested agent → llm.chat spans with token usage to JSONL", async () => {
    const provider = new TestProvider();

    await withAgentSpan(
      "execute",
      { objective: "test objective", provider: "anthropic", model: "claude-sonnet-4-6" },
      async () => {
        await provider.generateMessageTraced({
          messages: [{ role: "user", content: "hi" }],
          model: "claude-sonnet-4-6"
        });
      }
    );

    // Force flush — SimpleSpanProcessor writes synchronously, but the file
    // stream is buffered.
    await new Promise((r) => setTimeout(r, 100));

    const contents = await readFile(traceFile, "utf8");
    const lines = contents
      .trim()
      .split("\n")
      .filter((l) => l.length > 0);
    const records = lines.map((l) => JSON.parse(l) as TraceRecord);

    // We expect at least: one agent.execute span and one llm.chat span.
    const agentSpan = records.find((r) => r.name === "agent.execute");
    const llmSpan = records.find((r) => r.name.startsWith("llm.chat"));
    expect(agentSpan).toBeDefined();
    expect(llmSpan).toBeDefined();

    // Hierarchy: llm.chat should be parented to agent.execute
    expect(llmSpan?.parent_span_id).toBe(agentSpan?.span_id);

    // Agent attributes
    expect(agentSpan?.attributes["agent.objective"]).toBe("test objective");
    expect(agentSpan?.attributes["agent.kind"]).toBe("execute");
    expect(agentSpan?.attributes["agent.model"]).toBe("claude-sonnet-4-6");

    // LLM usage attributes (gen_ai semconv)
    expect(llmSpan?.attributes["gen_ai.usage.input_tokens"]).toBe(100);
    expect(llmSpan?.attributes["gen_ai.usage.output_tokens"]).toBe(50);
    expect(llmSpan?.attributes["gen_ai.usage.total_tokens"]).toBe(150);
    expect(llmSpan?.attributes["llm.provider"]).toBe("anthropic");
    expect(llmSpan?.attributes["llm.model"]).toBe("claude-sonnet-4-6");
  });
});
