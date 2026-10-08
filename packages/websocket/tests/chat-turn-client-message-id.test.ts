/**
 * The user's turn keeps the id the client minted for it.
 *
 * The client names that row later, to rewind the thread from it (Regenerate,
 * edit a sent message), and only learns server-minted ids on a reload. Any
 * id that is not a fresh 32-hex id is replaced, so a client cannot collide
 * with an existing row.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { initTestDb, Message } from "@nodetool-ai/models";
import { BaseProvider } from "@nodetool-ai/runtime";
import type {
  Message as ProviderMessage,
  ProviderStreamItem
} from "@nodetool-ai/runtime";
import { makeChatTurnHarness } from "./chat-turn-test-harness.js";

class EchoProvider extends BaseProvider {
  readonly provider = "openai";

  async generateMessage(): Promise<ProviderMessage> {
    return { role: "assistant", content: "unused" };
  }

  async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
    yield { type: "chunk", content: "ok", done: true };
  }
}

async function sendTurn(threadId: string, id: unknown): Promise<string[]> {
  const provider = new EchoProvider();
  const harness = makeChatTurnHarness({
    session: { resolveProvider: async () => provider }
  });
  await harness.handler.handleChatMessage({
    id,
    thread_id: threadId,
    role: "user",
    content: "hi",
    provider: "openai",
    model: "gpt-4o-mini"
  });
  const [rows] = await Message.paginate(threadId, { limit: 100 });
  return rows.filter((m) => m.role === "user").map((m) => m.id);
}

describe("the user turn's message id", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("is the client's when it is a fresh 32-hex id", async () => {
    const id = "0123456789abcdef0123456789abcdef";
    expect(await sendTurn("t-client-id", id)).toEqual([id]);
  });

  it("is minted by the server when the client's is malformed", async () => {
    const [stored] = await sendTurn("t-bad-id", "not-an-id");
    expect(stored).not.toBe("not-an-id");
    expect(stored).toMatch(/^[0-9a-f]{32}$/);
  });

  it("is minted by the server when the client's is already taken", async () => {
    const id = "fedcba9876543210fedcba9876543210";
    await Message.create({ id, user_id: "someone", thread_id: "elsewhere", role: "user", content: "x" });
    const [stored] = await sendTurn("t-taken-id", id);
    expect(stored).not.toBe(id);
    expect((await Message.find(id))?.thread_id).toBe("elsewhere");
  });
});
