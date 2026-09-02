/**
 * The `run_node` chat tool (a one-node kernel run inside a chat turn), the
 * provider-session resume fast path with its `loadFullHistory` fallback, how
 * that path resolves against a compaction record, and the persistence branches
 * for array-content assistant messages.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  COMPACTION_EVENT_TYPE,
  compactionMessageContent,
  initTestDb,
  Message,
  Thread
} from "@nodetool-ai/models";
import { SUPERSEDED_TOOL_RESULT } from "../src/chat-tool-call-repair.js";
import { decidePermission, gateFromContext } from "@nodetool-ai/agents";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  makeChatTurnHarness,
  fakeProvider,
  type ChatTurnHarness,
  type GenerateLoopArgs
} from "./chat-turn-test-harness.js";

function chatTurn(threadId: string, content = "hi"): Record<string, unknown> {
  return { thread_id: threadId, content, provider: "mock", model: "m" };
}

/**
 * Answer every tool approval the turn raises with "allow", the way a user
 * clicking through would. Returns a stop function.
 */
function autoApprove(harness: ChatTurnHarness): () => void {
  const timer = setInterval(() => {
    for (const frame of harness.session.messagesOfType(
      "tool_approval_request"
    )) {
      harness.approvalBridge.resolveResult(String(frame.approval_id), {
        decision: "allow"
      });
    }
  }, 5);
  return () => clearInterval(timer);
}

const echoExecutor = (node: {
  id: string;
  type: string;
  [key: string]: unknown;
}): { process: (inputs: Record<string, unknown>) => Promise<unknown> } => ({
  async process() {
    if (node.type === "test.Boom") throw new Error("node exploded");
    const props =
      typeof node.properties === "object" && node.properties !== null
        ? (node.properties as Record<string, unknown>)
        : {};
    return { output: props.value ?? "" };
  }
});

describe("run_node through the chat tool router", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("runs a single node and returns its output to the provider", async () => {
    const results: unknown[] = [];
    const harness = makeChatTurnHarness({
      session: {
        resolveExecutor: echoExecutor,
        resolveProvider: async () =>
          fakeProvider({
            generateLoop: async function* (args: GenerateLoopArgs) {
              results.push(
                await args.executeTool?.({
                  id: "call_run",
                  name: "run_node",
                  args: {
                    node_type: "test.Echo",
                    inputs: { value: "hello node" }
                  }
                })
              );
              results.push(
                await args.executeTool?.({
                  id: "call_boom",
                  name: "run_node",
                  args: { node_type: "test.Boom" }
                })
              );
              yield { type: "chunk", content: "ok", done: true };
            }
          })
      }
    });
    const stop = autoApprove(harness);
    try {
      await harness.handler.handleChatMessage(chatTurn("t-runnode"));
    } finally {
      stop();
    }
    expect(String(results[0])).toContain("hello node");
    // A failing node answers with an error bag, not a thrown turn.
    expect(String(results[1])).toContain("error");
    expect(String(results[1])).toContain("node exploded");
  });

  it("answers preparation failures without starting the kernel", async () => {
    const results: unknown[] = [];
    let beforeRunJobCalls = 0;
    const harness = makeChatTurnHarness({
      session: {
        resolveExecutor: echoExecutor,
        resolveProvider: async () =>
          fakeProvider({
            generateLoop: async function* (args: GenerateLoopArgs) {
              results.push(
                await args.executeTool?.({
                  id: "call_prep",
                  name: "run_node",
                  args: { node_type: "test.Echo" }
                })
              );
              yield { type: "chunk", content: "ok", done: true };
            }
          })
      },
      deps: {
        hydrateGraph: async () => {
          throw new Error("registry offline");
        },
        beforeRunJob: async () => {
          beforeRunJobCalls++;
        }
      }
    });
    const stop = autoApprove(harness);
    try {
      await harness.handler.handleChatMessage(chatTurn("t-runnode-prep"));
    } finally {
      stop();
    }
    expect(String(results[0])).toContain(
      "Failed to prepare node 'test.Echo'"
    );
    expect(String(results[0])).toContain("registry offline");
    // Hydration failed first, so prerequisites never ran.
    expect(beforeRunJobCalls).toBe(0);
  });

  it("answers a failing prerequisite check as an error bag", async () => {
    const results: unknown[] = [];
    const harness = makeChatTurnHarness({
      session: {
        resolveExecutor: echoExecutor,
        resolveProvider: async () =>
          fakeProvider({
            generateLoop: async function* (args: GenerateLoopArgs) {
              results.push(
                await args.executeTool?.({
                  id: "call_before",
                  name: "run_node",
                  args: { node_type: "test.Echo" }
                })
              );
              yield { type: "chunk", content: "ok", done: true };
            }
          })
      },
      deps: {
        beforeRunJob: async () => {
          throw new Error("python bridge down");
        }
      }
    });
    const stop = autoApprove(harness);
    try {
      await harness.handler.handleChatMessage(chatTurn("t-runnode-before"));
    } finally {
      stop();
    }
    expect(String(results[0])).toContain("Node prerequisites failed");
    expect(String(results[0])).toContain("python bridge down");
  });
});

describe("provider session resume", () => {
  beforeEach(() => {
    initTestDb();
  });

  async function seedResumableThread(threadId: string): Promise<void> {
    await Message.create({
      thread_id: threadId,
      user_id: "1",
      role: "user",
      content: "first question",
      provider: "mock",
      model: "m"
    });
    await Message.create({
      thread_id: threadId,
      user_id: "1",
      role: "assistant",
      content: "first answer",
      provider: "mock",
      model: "m",
      provider_session: {
        providerId: "mock",
        model: "m",
        token: "resume-token",
        systemHash: "h1",
        checkpoint: 3
      }
    });
  }

  it("hands the provider a delta plus a working loadFullHistory fallback", async () => {
    const threadId = "t-resume";
    await seedResumableThread(threadId);

    let receivedSession: Record<string, unknown> | null = null;
    let fullHistory: GenerateLoopArgs["messages"] = [];
    let deltaMessages: GenerateLoopArgs["messages"] = [];
    const harness = makeChatTurnHarness({
      session: {
        resolveProvider: async () =>
          fakeProvider({
            generateLoop: async function* (args: GenerateLoopArgs) {
              deltaMessages = args.messages;
              receivedSession =
                (args.providerSession as Record<string, unknown> | null) ??
                null;
              // A priming fallback: the provider decides it must reload.
              fullHistory = (await args.loadFullHistory?.()) ?? [];
              yield { type: "chunk", content: "resumed", done: true };
            }
          })
      }
    });
    await harness.handler.handleChatMessage(chatTurn(threadId, "and then?"));

    // Fast path: only the turns since the session ride the wire (system +
    // the new user message), not the whole thread.
    expect(
      deltaMessages.filter((m) => m.role === "assistant")
    ).toHaveLength(0);
    expect(receivedSession).toMatchObject({
      token: "resume-token",
      checkpoint: 1
    });
    // The fallback loads the full thread behind a fresh system prompt.
    expect(fullHistory[0].role).toBe("system");
    const flat = JSON.stringify(fullHistory);
    expect(flat).toContain("first question");
    expect(flat).toContain("first answer");
  });
});

describe("assistant message persistence branches", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("persists array content, captures session updates, and logs informational tool calls", async () => {
    const threadId = "t-persist-array";
    const harness = makeChatTurnHarness({
      session: {
        resolveProvider: async () =>
          fakeProvider({
            generateLoop: async function* () {
              // Continuity token arrives first.
              yield {
                type: "session",
                session: {
                  providerId: "mock",
                  model: "m",
                  token: "tok-2",
                  systemHash: "h2",
                  checkpoint: 5
                }
              };
              // Informational tool-call item (executed by the loop itself).
              yield { id: "call_info", name: "some_tool", args: {} };
              // Assistant message whose content is an array of blocks.
              yield {
                type: "message",
                message: {
                  role: "assistant",
                  content: [
                    { type: "text", text: "part one " },
                    { type: "text", text: "and part two" }
                  ],
                  toolCalls: null
                }
              };
              yield { type: "chunk", content: "", done: true };
            }
          })
      }
    });
    await harness.handler.handleChatMessage(chatTurn(threadId));

    const [rows] = await Message.paginate(threadId, { limit: 10 });
    const assistant = rows.find((m) => m.role === "assistant");
    expect(assistant).toBeDefined();
    expect(assistant?.provider_session).toMatchObject({ token: "tok-2" });
    const frames = harness.session
      .messagesOfType("message")
      .filter((m) => m.role === "assistant");
    expect(JSON.stringify(frames[0].content)).toContain("part one");
  });
});

describe("thread bootstrap", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("creates a thread when the message carries none", async () => {
    const harness = makeChatTurnHarness({
      session: {
        resolveProvider: async () =>
          fakeProvider({
            generateLoop: async function* () {
              yield { type: "chunk", content: "ok", done: true };
            }
          }),
        // Present so the turn resolves its workspace through the thread
        // binding rather than skipping the lookup.
        workspaceResolver: async () => null
      }
    });
    await harness.handler.handleChatMessage({
      content: "hi",
      provider: "mock",
      model: "m"
    });
    const done = harness.session
      .messagesOfType("chunk")
      .find((c) => c.done === true);
    const threadId = String(done?.thread_id ?? "");
    expect(threadId).not.toBe("");
    const thread = await Thread.find("1", threadId);
    expect(thread).not.toBeNull();
  });

  it("reuses an existing thread on the next turn", async () => {
    const harness = makeChatTurnHarness({
      session: {
        resolveProvider: async () =>
          fakeProvider({
            generateLoop: async function* () {
              yield { type: "chunk", content: "ok", done: true };
            }
          }),
        workspaceResolver: async () => null
      }
    });
    await harness.handler.handleChatMessage(chatTurn("t-reuse"));
    await harness.handler.handleChatMessage(chatTurn("t-reuse", "again"));
    const threads = await Thread.find("1", "t-reuse");
    expect(threads).not.toBeNull();
    const [rows] = await Message.paginate("t-reuse", { limit: 10 });
    expect(rows.filter((m) => m.role === "user")).toHaveLength(2);
  });
});

describe("the gate a run_node child inherits", () => {
  beforeEach(() => {
    initTestDb();
  });

  /**
   * `run_node` runs the node on a context it builds itself, not on the turn's,
   * so the turn's gate has to be handed across. Without it the node's own
   * agent loop finds nothing on the context and runs headless in `auto` — a
   * write inside the node then runs with no prompt, on the strength of the
   * user having approved "run this node".
   */
  async function runTurnAndReadGate(
    permissionMode: "plan" | "default" | "auto"
  ): Promise<{ modes: string[]; toolResult: string }> {
    const modes: string[] = [];
    const results: unknown[] = [];
    const harness = makeChatTurnHarness({
      session: {
        resolveExecutor: () => ({
          async process(
            _inputs: Record<string, unknown>,
            context?: ProcessingContext
          ) {
            modes.push(gateFromContext(context, "test").mode);
            return { output: "" };
          }
        }),
        resolveProvider: async () =>
          fakeProvider({
            generateLoop: async function* (args: GenerateLoopArgs) {
              results.push(
                await args.executeTool?.({
                  id: "call_run",
                  name: "run_node",
                  args: { node_type: "test.Echo" }
                })
              );
              yield { type: "chunk", content: "ok", done: true };
            }
          })
      }
    });
    const stop = autoApprove(harness);
    try {
      await harness.handler.handleChatMessage({
        ...chatTurn(`t-gate-${permissionMode}`),
        permission_mode: permissionMode
      });
    } finally {
      stop();
    }
    return { modes, toolResult: String(results[0]) };
  }

  it("hands the node the turn's mode, not the headless auto", async () => {
    const { modes } = await runTurnAndReadGate("default");

    // `auto` here would mean the node found no gate: a write inside it would
    // then run without asking.
    expect(modes).toEqual(["default"]);
    expect(decidePermission("default", "write")).toBe("ask");
  });

  it("carries auto through when that is the turn's mode", async () => {
    const { modes } = await runTurnAndReadGate("auto");

    expect(modes).toEqual(["auto"]);
  });

  it("never reaches the node in plan mode: the belt blocks run_node first", async () => {
    const { modes, toolResult } = await runTurnAndReadGate("plan");

    expect(toolResult).toContain("blocked_in_plan_mode");
    expect(modes).toEqual([]);
  });
});

/**
 * A compaction record and a `provider_session` both claim to say where the
 * provider's view of a thread starts. The newest of the two wins.
 */
describe("compaction and the provider-session probe", () => {
  beforeEach(() => {
    initTestDb();
  });

  const at = (n: number) =>
    `2026-01-01T00:00:00.${String(n).padStart(3, "0")}Z`;

  const session = (checkpoint: number) => ({
    providerId: "mock",
    model: "m",
    token: "resume-token",
    systemHash: "h1",
    checkpoint
  });

  /**
   * Sixty rows: a compaction record at position 40, an assistant carrying a
   * session token at `sessionAt`, and a tool-call pair in every other turn.
   */
  async function seed(threadId: string, sessionAt: number): Promise<void> {
    for (let i = 1; i <= 60; i++) {
      const base = { thread_id: threadId, user_id: "1", created_at: at(i) };
      if (i === 40) {
        await Message.create({
          ...base,
          role: "user",
          execution_event_type: COMPACTION_EVENT_TYPE,
          content: compactionMessageContent("The user wants a teal palette.")
        });
      } else if (i === sessionAt) {
        await Message.create({
          ...base,
          role: "assistant",
          content: `answer ${i}`,
          provider: "mock",
          model: "m",
          provider_session: session(i)
        });
      } else if (i % 3 === 1) {
        await Message.create({ ...base, role: "user", content: `ask ${i}` });
      } else if (i % 3 === 2) {
        await Message.create({
          ...base,
          role: "assistant",
          content: `thinking ${i}`,
          tool_calls: [{ id: `call-${i}`, name: "search", args: {} }]
        });
      } else {
        await Message.create({
          ...base,
          role: "tool",
          content: `result ${i}`,
          tool_call_id: `call-${i - 1}`
        });
      }
    }
  }

  /** Run one turn and report what the provider was handed. */
  async function runTurn(threadId: string): Promise<{
    messages: GenerateLoopArgs["messages"];
    providerSession: Record<string, unknown> | null;
  }> {
    let messages: GenerateLoopArgs["messages"] = [];
    let providerSession: Record<string, unknown> | null = null;
    const harness = makeChatTurnHarness({
      session: {
        resolveProvider: async () =>
          fakeProvider({
            generateLoop: async function* (args: GenerateLoopArgs) {
              messages = args.messages;
              providerSession =
                (args.providerSession as Record<string, unknown> | null) ??
                null;
              yield { type: "chunk", content: "ok", done: true };
            }
          })
      }
    });
    await harness.handler.handleChatMessage(chatTurn(threadId, "and then?"));
    return { messages, providerSession };
  }

  const texts = (messages: GenerateLoopArgs["messages"]): string[] =>
    messages.map((m) =>
      typeof m.content === "string" ? m.content : JSON.stringify(m.content)
    );

  it("cuts history at a compaction newer than the session", async () => {
    const threadId = "t-compaction-newest";
    await seed(threadId, 20);

    const { messages, providerSession } = await runTurn(threadId);

    // The system message, the compaction record, rows 41-60, and this turn's
    // own user message.
    expect(messages[0].role).toBe("system");
    expect(messages[1].role).toBe("user");
    expect(texts(messages)[1]).toContain("[Conversation so far]");
    expect(messages).toHaveLength(1 + 1 + 20 + 1);
    const flat = texts(messages).join("\n");
    expect(flat).toContain("ask 43");
    expect(flat).not.toContain("ask 37");
    expect(flat).not.toContain("answer 20");
    // Resuming that session would replay upstream the very history the cut
    // dropped, so the compaction refuses it.
    expect(providerSession).toBeNull();
    // No tool call was separated from its result, so nothing needed patching.
    expect(flat).not.toContain(SUPERSEDED_TOOL_RESULT);
  });

  it("keeps the resume fast path when the session is newer than the compaction", async () => {
    const threadId = "t-session-newest";
    await seed(threadId, 55);

    const { messages, providerSession } = await runTurn(threadId);

    // Only the turns after the session ride the wire; the compaction record is
    // already behind the boundary the provider holds upstream.
    expect(providerSession).toMatchObject({
      token: "resume-token",
      checkpoint: 1
    });
    const flat = texts(messages).join("\n");
    expect(flat).not.toContain("[Conversation so far]");
    expect(flat).not.toContain("ask 43");
    expect(flat).toContain("ask 58");
  });

  it("applies the cut to the priming fallback the resume path hands back", async () => {
    const threadId = "t-session-newest-priming";
    await seed(threadId, 55);

    let full: GenerateLoopArgs["messages"] = [];
    const harness = makeChatTurnHarness({
      session: {
        resolveProvider: async () =>
          fakeProvider({
            generateLoop: async function* (args: GenerateLoopArgs) {
              full = (await args.loadFullHistory?.()) ?? [];
              yield { type: "chunk", content: "ok", done: true };
            }
          })
      }
    });
    await harness.handler.handleChatMessage(chatTurn(threadId, "and then?"));

    expect(full[0].role).toBe("system");
    expect(texts(full)[1]).toContain("[Conversation so far]");
    const flat = texts(full).join("\n");
    expect(flat).toContain("ask 43");
    expect(flat).not.toContain("ask 37");
  });
});
