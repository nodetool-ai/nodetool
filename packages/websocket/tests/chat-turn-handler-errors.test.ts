/**
 * The plain-chat turn's failure and routing branches: provider errors
 * classified into connection / HTTP-status / generic frames, the tool router
 * (`executeTool`) a provider drives, the superseded drain cap, and the
 * volatile memory block the turn pastes into its last user message.
 *
 * Each test runs a full `handleChatMessage` turn against a provider double
 * whose `generateLoop` the test scripts.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { initTestDb, Memory, Message } from "@nodetool-ai/models";
import { SUPERSEDED_TOOL_RESULT } from "../src/chat-tool-call-repair.js";
import { unroutableToolMessage } from "../src/session/chat-prompt.js";
import {
  makeChatTurnHarness,
  fakeProvider,
  type ChatTurnHarness,
  type GenerateLoopArgs
} from "./chat-turn-test-harness.js";

function chatTurn(threadId: string, content = "hi"): Record<string, unknown> {
  return { thread_id: threadId, content, provider: "mock", model: "m" };
}

function throwingProvider(error: unknown): ChatTurnHarness {
  return makeChatTurnHarness({
    session: {
      resolveProvider: async () =>
        fakeProvider({
          // eslint-disable-next-line require-yield
          generateLoop: async function* () {
            throw error;
          }
        })
    }
  });
}

function errorFrame(harness: ChatTurnHarness): Record<string, unknown> {
  const frames = harness.session.messagesOfType("error");
  expect(frames).toHaveLength(1);
  return frames[0];
}

async function assistantErrorRow(threadId: string): Promise<string> {
  const [rows] = await Message.paginate(threadId, { limit: 10 });
  const assistant = rows.find((m) => m.role === "assistant");
  expect(assistant).toBeDefined();
  return String(assistant?.content ?? "");
}

describe("provider error classification", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("classifies ECONNREFUSED as a connection error", async () => {
    const harness = throwingProvider(
      new Error("connect ECONNREFUSED 127.0.0.1:11434")
    );
    await harness.handler.handleChatMessage(chatTurn("t-err-conn"));
    const frame = errorFrame(harness);
    expect(frame.error_type).toBe("connection_error");
    expect(String(frame.message)).toMatch(/^Connection error: /);
    // Done chunk still arrives, and the failure is persisted as a turn.
    expect(
      harness.session.messagesOfType("chunk").some((c) => c.done === true)
    ).toBe(true);
    expect(await assistantErrorRow("t-err-conn")).toContain(
      "connection error"
    );
  });

  it("explains an unresolvable hostname", async () => {
    const harness = throwingProvider(
      new Error("getaddrinfo ENOTFOUND api.example.com")
    );
    await harness.handler.handleChatMessage(chatTurn("t-err-dns"));
    const frame = errorFrame(harness);
    expect(frame.error_type).toBe("connection_error");
    expect(String(frame.message)).toContain("Unable to resolve hostname");
  });

  it.each([
    [400, /^Bad request: /],
    [401, /^Authentication failed/],
    [403, /^Access forbidden/],
    [404, /^Not found/],
    [429, /^Rate limited/],
    [503, /^Server error \(503\)/],
    [418, /^HTTP error \(418\)/]
  ])("formats HTTP %d", async (status, pattern) => {
    const harness = throwingProvider(
      Object.assign(new Error(`upstream ${status}`), { status })
    );
    await harness.handler.handleChatMessage(chatTurn(`t-err-${status}`));
    const frame = errorFrame(harness);
    expect(frame.error_type).toBe("http_status_error");
    expect(frame.status_code).toBe(status);
    expect(String(frame.message)).toMatch(pattern);
    expect(await assistantErrorRow(`t-err-${status}`)).toContain(
      `API error (HTTP ${status})`
    );
  });

  it("prefers the message the response body carried", async () => {
    const harness = throwingProvider(
      Object.assign(new Error("500 from upstream"), {
        status: 500,
        body: { error: { message: "billing hard cap reached" } }
      })
    );
    await harness.handler.handleChatMessage(chatTurn("t-err-body"));
    const frame = errorFrame(harness);
    expect(frame.message).toBe("billing hard cap reached");
    expect(frame.status_code).toBe(500);
  });

  it("stringifies a non-Error throw", async () => {
    const harness = throwingProvider("the provider said no");
    await harness.handler.handleChatMessage(chatTurn("t-err-string"));
    const frame = errorFrame(harness);
    expect(frame.error_type).toBe("error");
    expect(frame.message).toBe("the provider said no");
    expect(await assistantErrorRow("t-err-string")).toContain(
      "I encountered an error: the provider said no"
    );
  });
});

describe("tool routing through executeTool", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("round-trips a client tool through the bridge and prefers the renderer for document tools", async () => {
    const routed: unknown[] = [];
    const harness = makeChatTurnHarness({
      session: {
        resolveProvider: async () =>
          fakeProvider({
            generateLoop: async function* (args: GenerateLoopArgs) {
              routed.push(
                await args.executeTool?.({
                  id: "call_client",
                  name: "my_client_tool",
                  args: { a: 1 }
                })
              );
              routed.push(
                await args.executeTool?.({
                  id: "call_doc",
                  name: "ui_get_graph",
                  args: {}
                })
              );
              yield { type: "chunk", content: "ok", done: true };
            }
          })
      },
      deps: {
        clientTools: () => ({
          my_client_tool: {
            description: "a client tool",
            parameters: { type: "object", properties: {} }
          },
          // ui_get_graph is also a server tool; the renderer must win.
          ui_get_graph: {
            description: "live graph",
            inputSchema: { type: "object", properties: {} }
          }
        })
      }
    });

    const turnDone = harness.handler.handleChatMessage(chatTurn("t-tools"));

    await vi.waitFor(() => {
      expect(
        harness.session
          .messagesOfType("tool_call")
          .some((f) => f.tool_call_id === "call_client")
      ).toBe(true);
    });
    harness.handler.resolveToolResult("call_client", {
      result: { ok: true }
    });

    await vi.waitFor(() => {
      expect(
        harness.session
          .messagesOfType("tool_call")
          .some((f) => f.tool_call_id === "call_doc")
      ).toBe(true);
    });
    harness.handler.resolveToolResult("call_doc", { content: "graph-here" });

    await turnDone;
    expect(routed[0]).toBe(JSON.stringify({ ok: true }));
    expect(routed[1]).toBe("graph-here");
  });

  it("answers an unroutable tool call instead of throwing", async () => {
    let observed: unknown;
    const harness = makeChatTurnHarness({
      session: {
        resolveProvider: async () =>
          fakeProvider({
            generateLoop: async function* (args: GenerateLoopArgs) {
              // The `tools.` prefix a CodeAct-primed model sometimes emits
              // must be stripped before routing.
              observed = await args.executeTool?.({
                id: "call_bogus",
                name: "tools.bogus_tool",
                args: {}
              });
              yield { type: "chunk", content: "ok", done: true };
            }
          })
      }
    });
    await harness.handler.handleChatMessage(chatTurn("t-tools-bogus"));
    expect(observed).toBe(
      JSON.stringify({ error: unroutableToolMessage("bogus_tool") })
    );
  });
});

describe("superseded turn drain cap", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("stops reading a provider that keeps producing and stands in for the open call", async () => {
    let yielded = 0;
    let releaseFlood!: () => void;
    const floodGate = new Promise<void>((r) => {
      releaseFlood = r;
    });
    let announceCall!: () => void;
    const callAnnounced = new Promise<void>((r) => {
      announceCall = r;
    });

    const harness = makeChatTurnHarness({
      session: {
        resolveProvider: async () =>
          fakeProvider({
            generateLoop: async function* () {
              yield {
                type: "message",
                message: {
                  role: "assistant",
                  content: null,
                  toolCalls: [
                    { id: "call_open", name: "some_tool", args: {} }
                  ]
                }
              };
              announceCall();
              await floodGate;
              // A provider that ignores the abort: it floods chunks and never
              // answers the tool call.
              for (let i = 0; i < 1000; i++) {
                yielded++;
                yield { type: "chunk", content: `c${i}`, done: false };
              }
            }
          })
      }
    });

    const threadId = "t-drain";
    const turnDone = harness.handler.handleChatMessage(
      chatTurn(threadId),
      harness.handler.currentRequestSeq
    );
    await callAnnounced;
    // A newer message supersedes the turn.
    harness.handler.bumpRequestSeq();
    releaseFlood();
    await turnDone;

    // The drain cap (200) stopped the read well short of the flood.
    expect(yielded).toBeLessThan(300);
    // No completion chunk for a turn the user abandoned.
    expect(
      harness.session.messagesOfType("chunk").filter((c) => c.done === true)
    ).toHaveLength(0);
    // The open call got its stand-in row so the thread stays well-formed.
    const [rows] = await Message.paginate(threadId, { limit: 20 });
    const standIn = rows.find(
      (m) => m.role === "tool" && m.tool_call_id === "call_open"
    );
    expect(standIn?.content).toBe(SUPERSEDED_TOOL_RESULT);
  });
});

describe("the turn's volatile memory block", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("pastes this thread's memories into the last user message", async () => {
    const threadId = "t-mem";
    await Memory.create({
      user_id: "1",
      thread_id: threadId,
      kind: "note",
      title: "palette locked",
      content: "the campaign grade is teal-orange"
    });
    await Memory.create({
      user_id: "1",
      thread_id: "some-other-thread",
      kind: "note",
      title: "elsewhere",
      content: "unrelated"
    });

    let seen: GenerateLoopArgs["messages"] = [];
    const harness = makeChatTurnHarness({
      session: {
        resolveProvider: async () =>
          fakeProvider({
            generateLoop: async function* (args: GenerateLoopArgs) {
              seen = args.messages;
              yield { type: "chunk", content: "ok", done: true };
            }
          })
      }
    });
    await harness.handler.handleChatMessage(chatTurn(threadId));

    const wire = JSON.stringify(seen);
    // This thread's memory rides in full; the other thread's only as a count,
    // never by content.
    expect(wire).toContain("the campaign grade is teal-orange");
    expect(wire).not.toContain("unrelated");
  });
});
