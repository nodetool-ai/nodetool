/**
 * The composer's reasoning level reaches the provider as `effort`, and only
 * for a model that accepts it. A level picked for one model must not follow
 * the user to a model that would reject it.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { initTestDb } from "@nodetool-ai/models";
import { BaseProvider } from "@nodetool-ai/runtime";
import type {
  Message as ProviderMessage,
  ProviderStreamItem
} from "@nodetool-ai/runtime";
import { makeChatTurnHarness } from "./chat-turn-test-harness.js";

class RecordingProvider extends BaseProvider {
  readonly provider = "anthropic" as const;
  efforts: Array<string | undefined> = [];

  async generateMessage(): Promise<ProviderMessage> {
    return { role: "assistant", content: "unused" };
  }

  async *generateMessages(
    args: Parameters<BaseProvider["generateMessages"]>[0]
  ): AsyncGenerator<ProviderStreamItem> {
    this.efforts.push(args.effort);
    yield { type: "chunk", content: "done", done: true };
  }
}

async function runTurn(
  provider: RecordingProvider,
  threadId: string,
  model: string,
  reasoningEffort: unknown
): Promise<void> {
  const harness = makeChatTurnHarness({
    session: { resolveProvider: async () => provider }
  });
  await harness.handler.handleChatMessage({
    thread_id: threadId,
    content: "hi",
    provider: "anthropic",
    model,
    reasoning_effort: reasoningEffort
  });
}

describe("chat turn reasoning level", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("forwards the level to a model that accepts it", async () => {
    const provider = new RecordingProvider();
    await runTurn(provider, "t-effort-on", "claude-opus-5-5", "low");
    expect(provider.efforts).toEqual(["low"]);
  });

  it("drops the level for a model that would reject it", async () => {
    const provider = new RecordingProvider();
    await runTurn(provider, "t-effort-off", "claude-haiku-4-5", "high");
    expect(provider.efforts).toEqual([undefined]);
  });

  it("drops a value outside the composer levels", async () => {
    const provider = new RecordingProvider();
    await runTurn(provider, "t-effort-bad", "claude-opus-5-5", "max");
    expect(provider.efforts).toEqual([undefined]);
  });
});
