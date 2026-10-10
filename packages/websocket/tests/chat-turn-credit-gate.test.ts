/**
 * A chat turn on the managed `nodetool` provider spends the platform's keys,
 * so it admits against the user's credits like every other managed entry
 * point. A bring-your-own-key provider is never metered.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { initTestDb } from "@nodetool-ai/models";

vi.mock("../src/credit-gate.js", async (orig) => ({
  ...(await orig<typeof import("../src/credit-gate.js")>()),
  admitSpend: vi.fn()
}));

const { admitSpend } = await import("../src/credit-gate.js");
const { makeChatTurnHarness, fakeProvider } = await import(
  "./chat-turn-test-harness.js"
);

function harness() {
  const generateLoop = vi.fn(async function* () {
    yield { type: "chunk", content: "hello", done: true };
  });
  const resolveProvider = vi.fn(async () => fakeProvider({ generateLoop }));
  return {
    ...makeChatTurnHarness({ session: { resolveProvider } }),
    resolveProvider,
    generateLoop
  };
}

describe("chat turn credit gate", () => {
  beforeEach(() => {
    initTestDb();
    vi.mocked(admitSpend).mockReset();
  });

  it("refuses a managed-provider turn the balance cannot cover", async () => {
    vi.mocked(admitSpend).mockResolvedValue({
      allowed: false,
      refusal: "insufficient_credits",
      reason: "Out of credits on the Free plan. Upgrade or top up to continue."
    });
    const h = harness();

    await h.handler.handleChatMessage({
      thread_id: "t-credits",
      content: "hi",
      provider: "nodetool",
      model: "claude-sonnet"
    });

    expect(admitSpend).toHaveBeenCalledWith(expect.any(String), 0, [
      "claude-sonnet"
    ]);
    const errors = h.session.messagesOfType("error");
    expect(errors).toHaveLength(1);
    expect(String(errors[0].message)).toMatch(/Out of credits/);
    expect(h.resolveProvider).not.toHaveBeenCalled();
    expect(h.generateLoop).not.toHaveBeenCalled();
  });

  it("refuses a managed media turn too", async () => {
    vi.mocked(admitSpend).mockResolvedValue({
      allowed: false,
      refusal: "insufficient_credits",
      reason: "Out of credits"
    });
    const h = harness();

    await h.handler.handleChatMessage({
      thread_id: "t-credits-media",
      content: "a cat",
      provider: "nodetool",
      model: "flux",
      media_generation: { mode: "image" }
    });

    expect(h.session.messagesOfType("error")).toHaveLength(1);
    expect(h.resolveProvider).not.toHaveBeenCalled();
  });

  it("does not meter a bring-your-own-key provider", async () => {
    const h = harness();

    await h.handler.handleChatMessage({
      thread_id: "t-byok",
      content: "hi",
      provider: "openai",
      model: "gpt"
    });

    expect(admitSpend).not.toHaveBeenCalled();
    expect(h.resolveProvider).toHaveBeenCalled();
  });
});
