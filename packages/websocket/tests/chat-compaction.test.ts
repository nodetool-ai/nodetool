/**
 * Chat compaction: when a turn replaces the earlier part of its thread with a
 * summary, what that summary has to carry, and what it costs when it fails.
 *
 * Two triggers are pinned here. The proactive one measures the prompt it is
 * about to send; the reactive one answers the provider's own context-exceeded
 * signal and retries the turn exactly once. Both write one record, at the cut,
 * and the turn then runs against the shortened history.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  COMPACTION_EVENT_TYPE,
  initTestDb,
  isCompactionMessage,
  Message
} from "@nodetool-ai/models";
import { markContextExceeded } from "@nodetool-ai/runtime";
import { chooseCompactionCut } from "../src/session/chat-compaction.js";
import {
  fakeProvider,
  makeChatTurnHarness,
  type GenerateLoopArgs
} from "./chat-turn-test-harness.js";

/** Seeded rows a second apart, so the cut has an unambiguous place to land. */
const at = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString();

function chatTurn(
  threadId: string,
  content = "and then?"
): Record<string, unknown> {
  return { thread_id: threadId, content, provider: "mock", model: "m" };
}

/**
 * Twelve rows: four user turns, each answered by an assistant that called a
 * tool, and the tool result. The first two turns carry an `asset://` uri —
 * they are the ones a cut that keeps two user turns summarizes away.
 */
async function seedThread(threadId: string): Promise<void> {
  for (let turn = 1; turn <= 4; turn++) {
    const base = { thread_id: threadId, user_id: "1" };
    await Message.create({
      ...base,
      created_at: at(turn * 3),
      role: "user",
      content: `ask ${turn}`
    });
    await Message.create({
      ...base,
      created_at: at(turn * 3 + 1),
      role: "assistant",
      content: `answer ${turn}`,
      tool_calls: [{ id: `call-${turn}`, name: "generate_image", args: {} }]
    });
    await Message.create({
      ...base,
      created_at: at(turn * 3 + 2),
      role: "tool",
      tool_call_id: `call-${turn}`,
      content: `saved asset://img-${turn}.png`
    });
  }
}

/** Every `asset://` uri in a blob of text, in order. */
const assetUris = (text: string): string[] =>
  text.match(/asset:\/\/[A-Za-z0-9._~\-/]+/g) ?? [];

interface TurnRecord {
  /** What the provider's loop was handed, per attempt. */
  attempts: Array<GenerateLoopArgs["messages"]>;
  /** What the summarizer was handed, per call. */
  summarized: Array<Array<{ role: string; content: unknown }>>;
}

/**
 * Run one turn against a provider whose loop is scripted by `loop` and whose
 * summarizer echoes back every artifact reference it was shown — so an
 * assertion over the stored summary is an assertion about what reached it.
 */
async function runTurn(
  threadId: string,
  loop: (record: TurnRecord, args: GenerateLoopArgs) => void
): Promise<{ record: TurnRecord; errors: Array<Record<string, unknown>> }> {
  const record: TurnRecord = { attempts: [], summarized: [] };
  const harness = makeChatTurnHarness({
    session: {
      resolveProvider: async () =>
        fakeProvider({
          generateLoop: async function* (args: GenerateLoopArgs) {
            record.attempts.push(args.messages);
            loop(record, args);
            yield { type: "chunk", content: "ok", done: true };
          },
          generateMessageTraced: async (args) => {
            record.summarized.push(args.messages);
            const uris = assetUris(JSON.stringify(args.messages));
            return {
              role: "assistant",
              content: `Artifacts:\n${uris.map((u) => `- ${u}`).join("\n")}`
            };
          }
        })
    }
  });
  await harness.handler.handleChatMessage(chatTurn(threadId));
  return { record, errors: harness.session.messagesOfType("error") };
}

async function compactionRows(threadId: string): Promise<Message[]> {
  const [rows] = await Message.paginate(threadId, { limit: 100 });
  return rows.filter((m) => isCompactionMessage(m));
}

const textOf = (message: { content: unknown }): string =>
  typeof message.content === "string"
    ? message.content
    : JSON.stringify(message.content);

describe("chooseCompactionCut", () => {
  const rows = [
    { role: "user" },
    { role: "assistant" },
    { role: "user" },
    { role: "assistant" },
    { role: "tool" },
    { role: "user" }
  ];

  it("cuts at the Kth user message from the end", () => {
    const cut = chooseCompactionCut(rows, 2);
    expect(cut?.summarize).toHaveLength(2);
    expect(cut?.keep[0]).toEqual({ role: "user" });
    expect(cut?.keep).toHaveLength(4);
  });

  it("has nothing to summarize when every user turn is kept", () => {
    expect(chooseCompactionCut(rows, 3)).toBeNull();
    expect(chooseCompactionCut(rows, 9)).toBeNull();
    expect(chooseCompactionCut([{ role: "assistant" }], 1)).toBeNull();
  });
});

describe("chat compaction", () => {
  beforeEach(() => {
    initTestDb();
    process.env.NODETOOL_CHAT_COMPACTION_KEEP_TURNS = "2";
  });
  afterEach(() => {
    delete process.env.NODETOOL_CHAT_COMPACTION_TOKENS;
    delete process.env.NODETOOL_CHAT_COMPACTION_KEEP_TURNS;
  });

  it("compacts a thread over the threshold and keeps every artifact reference", async () => {
    process.env.NODETOOL_CHAT_COMPACTION_TOKENS = "20";
    const threadId = "t-threshold";
    await seedThread(threadId);

    const { record } = await runTurn(threadId, () => {});

    // One summarizer call, one record — a turn compacts once or not at all.
    expect(record.summarized).toHaveLength(1);
    const rows = await compactionRows(threadId);
    expect(rows).toHaveLength(1);

    // Every reference the summarized region held survives into the record.
    // A paraphrased `asset://` uri names nothing, so this is the one thing the
    // summary is not allowed to lose.
    const summarizedText = JSON.stringify(record.summarized[0]);
    const summarizedUris = assetUris(summarizedText);
    // Four seeded turns plus the one being asked now: keeping two leaves the
    // first three to summarize.
    expect(summarizedUris).toEqual([
      "asset://img-1.png",
      "asset://img-2.png",
      "asset://img-3.png"
    ]);
    const recorded = String(rows[0].content);
    for (const uri of summarizedUris) expect(recorded).toContain(uri);

    // ...and the turn ran against the shortened history: the record, the two
    // kept turns, and this turn's own message.
    expect(record.attempts).toHaveLength(1);
    const sent = record.attempts[0];
    expect(sent[0].role).toBe("system");
    expect(sent[1].role).toBe("user");
    expect(textOf(sent[1])).toContain("[Conversation so far]");
    const flat = sent.map(textOf).join("\n");
    expect(flat).toContain("ask 4");
    expect(flat).not.toContain("ask 1");
    expect(flat).not.toContain("answer 3");
  });

  it("places the record so the rows after it start on a user turn", async () => {
    process.env.NODETOOL_CHAT_COMPACTION_TOKENS = "20";
    const threadId = "t-boundary";
    await seedThread(threadId);

    await runTurn(threadId, () => {});

    // Nothing downstream repairs a `tool_result` whose `tool_use` was cut
    // away — `repairOrphanedToolCalls` patches the opposite defect — so where
    // the record lands is the invariant, not a hint.
    const [rows] = await Message.paginate(threadId, { limit: 100 });
    const marker = rows.findIndex((m) => isCompactionMessage(m));
    expect(marker).toBeGreaterThan(0);
    expect(rows[marker + 1].role).toBe("user");
    const answered = new Set<string>();
    for (const row of rows.slice(marker)) {
      for (const call of (row.tool_calls ?? []) as Array<{ id: string }>) {
        answered.add(call.id);
      }
    }
    const dangling = rows
      .slice(marker)
      .filter((m) => m.role === "tool" && m.tool_call_id)
      .map((m) => m.tool_call_id as string)
      .filter((id) => !answered.has(id));
    expect(dangling).toEqual([]);
  });

  it("leaves the thread uncompacted when the summarizer fails", async () => {
    process.env.NODETOOL_CHAT_COMPACTION_TOKENS = "20";
    const threadId = "t-summary-fails";
    await seedThread(threadId);

    const harness = makeChatTurnHarness({
      session: {
        resolveProvider: async () =>
          fakeProvider({
            generateLoop: async function* (args: GenerateLoopArgs) {
              sent = args.messages;
              yield { type: "chunk", content: "ok", done: true };
            },
            generateMessageTraced: async () => {
              throw new Error("summarizer is down");
            }
          })
      }
    });
    let sent: GenerateLoopArgs["messages"] = [];
    await harness.handler.handleChatMessage(chatTurn(threadId));

    // Fail open on the summary: the alternative is a turn that cannot run.
    expect(await compactionRows(threadId)).toHaveLength(0);
    expect(sent.map(textOf).join("\n")).toContain("ask 1");
    const warning = harness.session
      .messagesOfType("log_update")
      .find((m) => m.severity === "warning");
    expect(String(warning?.content)).toContain("summarizer is down");
    expect(harness.session.messagesOfType("error")).toHaveLength(0);
  });

  it("does not measure a provider that holds the transcript itself", async () => {
    process.env.NODETOOL_CHAT_COMPACTION_TOKENS = "20";
    const threadId = "t-session";
    await seedThread(threadId);
    await Message.create({
      thread_id: threadId,
      user_id: "1",
      created_at: at(60),
      role: "assistant",
      content: "answer 5",
      provider: "mock",
      model: "m",
      provider_session: {
        providerId: "mock",
        model: "m",
        token: "resume-token",
        systemHash: "h1",
        checkpoint: 12
      }
    });

    const { record } = await runTurn(threadId, () => {});

    // It is sent only the turns since its session token, so the estimate would
    // describe a fraction of its prompt. It gets the reactive trigger alone.
    expect(record.summarized).toHaveLength(0);
    expect(await compactionRows(threadId)).toHaveLength(0);
  });

  it("compacts once and retries the turn when the provider says the prompt does not fit", async () => {
    const threadId = "t-overflow-once";
    await seedThread(threadId);

    const { record, errors } = await runTurn(threadId, (r) => {
      if (r.attempts.length === 1) {
        throw markContextExceeded(new Error("prompt is too long"), "mock");
      }
    });

    expect(record.summarized).toHaveLength(1);
    expect(await compactionRows(threadId)).toHaveLength(1);
    // Exactly two passes: the one that overflowed, and the one that ran
    // against the summary.
    expect(record.attempts).toHaveLength(2);
    expect(textOf(record.attempts[1][1])).toContain("[Conversation so far]");
    expect(errors).toHaveLength(0);
  });

  it("surfaces the error when the shortened history does not fit either", async () => {
    const threadId = "t-overflow-twice";
    await seedThread(threadId);

    const { record, errors } = await runTurn(threadId, () => {
      throw markContextExceeded(new Error("prompt is too long"), "mock");
    });

    // The second overflow is an error the user can see, not a second
    // compaction: the summary did not fit either, and summarizing again would
    // buy another call to learn the same thing.
    expect(record.attempts).toHaveLength(2);
    expect(record.summarized).toHaveLength(1);
    expect(await compactionRows(threadId)).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(String(errors[0].message)).toContain("prompt is too long");
  });

  it("does not compact a thread under the threshold", async () => {
    const threadId = "t-under";
    await seedThread(threadId);

    const { record } = await runTurn(threadId, () => {});

    expect(record.summarized).toHaveLength(0);
    expect(await compactionRows(threadId)).toHaveLength(0);
    expect(record.attempts[0].map(textOf).join("\n")).toContain("ask 1");
  });
});
