/**
 * A turn the server aborts leaves a note; a turn the user aborts does not.
 *
 * Stop and supersede are the user's own action, so a "Stopped:" line there
 * would scold them for using the control. A shutdown is not: the reply stops
 * mid-sentence for a reason nobody in the conversation caused, and silence
 * reads exactly like the model finishing (invariant I-3). The reason rides
 * `signal.reason`, which is what `ChatTurnSession.abort` puts there.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { initTestDb, Message } from "@nodetool-ai/models";
import { BaseProvider } from "@nodetool-ai/runtime";
import type {
  Message as ProviderMessage,
  ProviderStreamItem
} from "@nodetool-ai/runtime";
import { makeChatTurnHarness } from "./chat-turn-test-harness.js";

/**
 * The base loop checks the signal before its first model call, so an already
 * aborted turn yields `PROVIDER_STOP_ABORTED` and nothing else — the same item
 * a mid-stream abort ends with.
 */
class QuietProvider extends BaseProvider {
  readonly provider = "openai";
  calls = 0;

  async generateMessage(): Promise<ProviderMessage> {
    return { role: "assistant", content: "unused" };
  }

  async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
    this.calls++;
    yield { type: "chunk", content: "done", done: true };
  }
}

async function assistantTexts(threadId: string): Promise<string[]> {
  const [rows] = await Message.paginate(threadId, { limit: 100 });
  return rows
    .filter((m) => m.role === "assistant")
    .map((m) => (typeof m.content === "string" ? m.content : ""));
}

async function runAbortedTurn(
  threadId: string,
  reason: string
): Promise<{ texts: string[]; calls: number }> {
  const provider = new QuietProvider();
  const harness = makeChatTurnHarness({
    session: { resolveProvider: async () => provider }
  });
  const controller = new AbortController();
  controller.abort(reason);
  await harness.handler.handleChatMessage(
    {
      thread_id: threadId,
      content: "hi",
      provider: "openai",
      model: "gpt-4o-mini"
    },
    undefined,
    controller.signal
  );
  return { texts: await assistantTexts(threadId), calls: provider.calls };
}

describe("an aborted turn's transcript note", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("records that the server restarted", async () => {
    const { texts, calls } = await runAbortedTurn("t-shutdown", "shutdown");
    expect(calls).toBe(0);
    expect(texts).toContain("Stopped: server restarting");
  });

  it("says nothing when the user pressed Stop", async () => {
    const { texts } = await runAbortedTurn("t-stop", "stop");
    expect(texts.some((t) => t.startsWith("Stopped:"))).toBe(false);
  });

  it("says nothing when a newer turn superseded it", async () => {
    const { texts } = await runAbortedTurn("t-superseded", "superseded");
    expect(texts.some((t) => t.startsWith("Stopped:"))).toBe(false);
  });
});
