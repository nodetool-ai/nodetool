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
import {
  initTestDb,
  Memory,
  Message,
  Prediction,
  Thread
} from "@nodetool-ai/models";
import {
  annotateGroqRequestFailure,
  markContextExceeded,
  annotateProviderError
} from "@nodetool-ai/runtime";
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
    expect(await assistantErrorRow("t-err-conn")).toContain("connection error");
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
    [404, /^Model .* was not found/],
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

  it("does not treat an undefined status as an HTTP status", async () => {
    const harness = throwingProvider(
      Object.assign(new Error("provider stream failed"), {
        status: undefined
      })
    );
    await harness.handler.handleChatMessage(chatTurn("t-err-no-status"));
    const frame = errorFrame(harness);
    expect(frame.error_type).toBe("error");
    expect(frame.status_code).toBeUndefined();
    expect(String(frame.message)).not.toContain("undefined");
  });

  it.each([false, true])(
    "explains organization verification with provider annotation %s",
    async (annotated) => {
      const error = Object.assign(
        new Error("Your organization must be verified to use the model gpt-5."),
        {
          status: 403,
          body: {
            error: {
              message:
                "Your organization must be verified to use the model gpt-5."
            }
          }
        }
      );
      if (annotated) {
        annotateProviderError(error, { provider: "openai", model: "gpt-5" });
      }
      const harness = throwingProvider(error);
      await harness.handler.handleChatMessage({
        ...chatTurn("t-err-verification"),
        provider: "openai",
        model: "gpt-5"
      });
      const frame = errorFrame(harness);
      expect(frame.message).toContain("Verify your provider organization");
      expect(frame.status_code).toBe(403);
      expect(await assistantErrorRow("t-err-verification")).toContain(
        "Verify your provider organization"
      );
    }
  );

  it("does not send database diagnostics in a generic error", async () => {
    const harness = throwingProvider(
      new Error("SQLITE_ERROR: SELECT token FROM secrets WHERE id = ?")
    );
    await harness.handler.handleChatMessage(chatTurn("t-err-internal"));
    const frame = errorFrame(harness);
    expect(frame.message).toBe(
      "Something went wrong while processing your request. Please try again."
    );
    expect(String(frame.message)).not.toContain("SELECT");
    expect(await assistantErrorRow("t-err-internal")).not.toContain("SELECT");
  });

  it("suppresses provider failures raised after cancellation", async () => {
    const controller = new AbortController();
    const harness = makeChatTurnHarness({
      session: {
        resolveProvider: async () =>
          fakeProvider({
            // eslint-disable-next-line require-yield
            generateLoop: async function* () {
              controller.abort();
              throw new Error("request was aborted");
            }
          })
      }
    });
    await harness.handler.handleChatMessage(
      chatTurn("t-err-cancelled"),
      undefined,
      controller.signal
    );
    expect(harness.session.messagesOfType("error")).toHaveLength(0);
    expect(
      harness.session.messagesOfType("chunk").filter((chunk) => chunk.done)
    ).toHaveLength(0);
    const [rows] = await Message.paginate("t-err-cancelled", { limit: 10 });
    expect(rows.filter((row) => row.role === "assistant")).toHaveLength(0);
  });

  it("extracts actionable quota details from Gemini's wrapped JSON error", async () => {
    const payload = JSON.stringify({
      error: {
        code: 429,
        status: "RESOURCE_EXHAUSTED",
        message:
          "Quota exceeded for quota metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 0"
      }
    });
    const harness = throwingProvider(
      new Error(`Gemini API error 429: ${payload}`)
    );
    await harness.handler.handleChatMessage({
      ...chatTurn("t-err-gemini-quota"),
      provider: "gemini",
      model: "gemini-2.5-flash"
    });
    const frame = errorFrame(harness);
    expect(frame.status_code).toBe(429);
    expect(String(frame.message)).toContain("quota exhausted");
    expect(String(frame.message)).not.toContain(
      "generativelanguage.googleapis"
    );
    expect(await assistantErrorRow("t-err-gemini-quota")).not.toContain(
      "RESOURCE_EXHAUSTED"
    );
  });

  it("keeps Groq's bounded token diagnostic over a generic body message", async () => {
    const harness = throwingProvider(
      annotateGroqRequestFailure(
        Object.assign(new Error("429 rate limit reached"), {
          status: 429,
          body: { error: { message: "rate limit reached" } }
        }),
        {
          kind: "quota_exhausted",
          requestedTokens: 8000,
          limitTokens: 10000,
          estimate: {
            inputTokens: 8000,
            systemTokens: 100,
            messageTokens: 7500,
            toolTokens: 400
          }
        }
      )
    );
    await harness.handler.handleChatMessage({
      ...chatTurn("t-err-groq-diagnostic"),
      provider: "groq",
      model: "llama-3.3-70b"
    });
    const frame = errorFrame(harness);
    expect(String(frame.message)).toContain("local estimate 8,000");
    expect(String(frame.message)).toContain("tools 400");
    expect(String(frame.message)).not.toBe(
      "Rate limited: Too many requests or insufficient provider quota. Check your provider plan and try again later."
    );
  });

  it("does not trust a provider string that imitates a Groq diagnostic", async () => {
    const harness = throwingProvider(
      Object.assign(
        new Error("Groq rejected an oversized request API_KEY=private-value"),
        { status: 413 }
      )
    );
    await harness.handler.handleChatMessage({
      ...chatTurn("t-err-groq-untrusted"),
      provider: "groq"
    });
    expect(String(errorFrame(harness).message)).not.toContain("private-value");
    expect(await assistantErrorRow("t-err-groq-untrusted")).not.toContain(
      "private-value"
    );
  });
});

const GROQ_DIAGNOSTIC = {
  kind: "quota_exhausted",
  requestedTokens: 8000,
  limitTokens: 10000,
  estimate: {
    inputTokens: 8000,
    systemTokens: 100,
    messageTokens: 7500,
    toolTokens: 400
  }
} as const;

function geminiWrapped(code: number, message: string): Error {
  const payload = JSON.stringify({ error: { code, message } });
  return new Error(`Gemini API error ${code}: ${payload}`);
}

describe("provider failure message branches", () => {
  beforeEach(() => {
    initTestDb();
  });

  async function failureFor(
    threadId: string,
    error: unknown,
    turn: Record<string, unknown> = {}
  ): Promise<Record<string, unknown>> {
    const harness = throwingProvider(error);
    await harness.handler.handleChatMessage({ ...chatTurn(threadId), ...turn });
    return errorFrame(harness);
  }

  describe("organization verification", () => {
    const orgText = "Your organization must be verified to use this model.";
    const verifiedMessage =
      "This model requires a verified OpenAI organization. Verify your provider organization or choose a model your account can access.";

    it("reports a plain error when the failure carries no status", async () => {
      const frame = await failureFor("t-org-nostatus", new Error(orgText), {
        provider: "openai"
      });
      expect(frame.error_type).toBe("error");
      expect(frame.status_code).toBeUndefined();
      expect(frame.message).toBe(verifiedMessage);
    });

    it("reports an HTTP status error when the failure carries one", async () => {
      const frame = await failureFor(
        "t-org-status",
        Object.assign(new Error(orgText), { status: 403 }),
        { provider: "openai" }
      );
      expect(frame.error_type).toBe("http_status_error");
      expect(frame.status_code).toBe(403);
      expect(frame.message).toBe(verifiedMessage);
    });

    it("applies only to the openai provider", async () => {
      const frame = await failureFor(
        "t-org-other-provider",
        Object.assign(new Error(orgText), { status: 403 })
      );
      expect(String(frame.message)).toMatch(/^Access forbidden/);
    });

    it("reads the response body in preference to the error message", async () => {
      const frame = await failureFor(
        "t-org-body-wins",
        Object.assign(new Error(orgText), {
          status: 403,
          body: { error: { message: "denied" } }
        }),
        { provider: "openai" }
      );
      expect(String(frame.message)).toMatch(/^Access forbidden/);
    });

    it("reads a body that carries its message at the top level", async () => {
      const frame = await failureFor(
        "t-org-flat-body",
        Object.assign(new Error("403 denied"), {
          status: 403,
          response: { message: orgText }
        }),
        { provider: "openai" }
      );
      expect(frame.message).toBe(verifiedMessage);
    });
  });

  describe("annotated provider failures", () => {
    it("names the provider and model when the context window overflows", async () => {
      const frame = await failureFor(
        "t-ctx",
        markContextExceeded(
          Object.assign(new Error("too long"), { status: 400 }),
          "openai"
        ),
        { provider: "openai", model: "gpt-5" }
      );
      expect(frame.error_type).toBe("error");
      expect(frame.status_code).toBe(400);
      expect(frame.message).toBe(
        "The openai/gpt-5 request is too large for the model context window. Shorten the conversation or remove some attachments and try again."
      );
    });

    it("omits the status when the overflow carried none", async () => {
      const frame = await failureFor(
        "t-ctx-nostatus",
        markContextExceeded(new Error("too long"), "openai"),
        { provider: "openai", model: "gpt-5" }
      );
      expect(frame.status_code).toBeUndefined();
      expect(String(frame.message)).toMatch(/^The openai\/gpt-5 request/);
    });

    it("sends users to Settings when the credential was rejected", async () => {
      const frame = await failureFor(
        "t-auth-detail",
        annotateProviderError(
          Object.assign(new Error("Incorrect API key"), { status: 401 }),
          { provider: "openai", model: "gpt-5" }
        ),
        { provider: "openai", model: "gpt-5" }
      );
      expect(frame.error_type).toBe("error");
      expect(frame.status_code).toBe(401);
      expect(frame.message).toBe(
        "Authentication failed: openai rejected the configured credentials. Check the API key in Settings → Models & Providers."
      );
    });
  });

  describe("without a status", () => {
    it("forwards a Gemini failure's own message", async () => {
      const frame = await failureFor(
        "t-gemini-nostatus",
        new Error("Gemini API error: quota exceeded for this key"),
        { provider: "gemini", model: "gemini-2.5-flash" }
      );
      expect(frame.error_type).toBe("error");
      expect(frame.status_code).toBeUndefined();
      expect(frame.message).toBe("quota exceeded for this key");
    });
  });

  describe("Gemini classification", () => {
    it("reports an unavailable model", async () => {
      const frame = await failureFor(
        "t-gemini-model",
        geminiWrapped(404, "models/gemini-x is not found for API version v1"),
        { provider: "gemini", model: "gemini-x" }
      );
      expect(frame.message).toBe(
        "Model gemini-x is unavailable on gemini. Choose another model or check that your account has access to it."
      );
      expect(frame.status_code).toBe(404);
    });

    it("reports a model that cannot use the requested tools", async () => {
      const frame = await failureFor(
        "t-gemini-tools",
        geminiWrapped(400, "Function calling is not enabled for this model"),
        { provider: "gemini", model: "gemini-2.5-flash" }
      );
      expect(frame.message).toBe(
        "Model gemini-2.5-flash does not support the requested tools on gemini. Choose a model with tool support or disable tools."
      );
      expect(frame.status_code).toBe(400);
    });

    it("takes precedence over the status class", async () => {
      const frame = await failureFor(
        "t-gemini-precedence",
        geminiWrapped(500, "billing account disabled"),
        { provider: "gemini", model: "gemini-2.5-flash" }
      );
      expect(frame.message).toBe(
        "Account quota exhausted for gemini/gemini-2.5-flash. Check your gemini quota or billing and try again later."
      );
      expect(frame.status_code).toBe(500);
    });

    it("leaves an unclassified Gemini failure to its status class", async () => {
      const frame = await failureFor(
        "t-gemini-unclassified",
        geminiWrapped(503, "backend overloaded"),
        { provider: "gemini", model: "gemini-2.5-flash" }
      );
      expect(frame.message).toBe(
        "Server error (503): The service is temporarily unavailable"
      );
    });
  });

  describe("status classes", () => {
    it("explains 401 and 402 and 403 and 404", async () => {
      const messages = [];
      for (const status of [401, 402, 403, 404]) {
        const frame = await failureFor(
          `t-class-${status}`,
          Object.assign(new Error(`upstream ${status}`), { status })
        );
        messages.push(frame.message);
      }
      expect(messages).toEqual([
        "Authentication failed: Invalid API key or token",
        "Account billing or credit limit reached for mock. Check your mock plan or billing.",
        "Access forbidden: You don't have permission for this resource. Check the provider key's model and account access.",
        "Model m was not found or is unavailable on mock. Choose another model or check account access."
      ]);
    });

    it("quotes the body message on a 400", async () => {
      const frame = await failureFor(
        "t-400-body",
        Object.assign(new Error("upstream 400"), {
          status: 400,
          body: { error: { message: "bad field" } }
        })
      );
      expect(frame.message).toBe("Bad request: bad field");
    });

    it("quotes the error message on a 400 without a body", async () => {
      const frame = await failureFor(
        "t-400-plain",
        Object.assign(new Error("upstream 400"), { status: 400 })
      );
      expect(frame.message).toBe("Bad request: upstream 400");
    });

    it("prefers the Groq diagnostic on a 400", async () => {
      const frame = await failureFor(
        "t-400-groq",
        annotateGroqRequestFailure(
          Object.assign(new Error("upstream 400"), {
            status: 400,
            body: { error: { message: "bad field" } }
          }),
          GROQ_DIAGNOSTIC
        ),
        { provider: "groq" }
      );
      expect(String(frame.message)).toMatch(
        /^Bad request: Groq's token allowance is temporarily exhausted/
      );
    });

    it("quotes the error message on a 413", async () => {
      const frame = await failureFor(
        "t-413-plain",
        Object.assign(new Error("payload too large"), { status: 413 })
      );
      expect(frame.message).toBe(
        "Request is too large for the provider (payload too large). Shorten the conversation or remove some attachments and try again."
      );
    });

    it("quotes the body message on a 413", async () => {
      const frame = await failureFor(
        "t-413-body",
        Object.assign(new Error("upstream 413"), {
          status: 413,
          body: { error: { message: "body too big" } }
        })
      );
      expect(frame.message).toBe(
        "Request is too large for the provider (body too big). Shorten the conversation or remove some attachments and try again."
      );
    });

    it("drops a 413 detail that is only the generic message", async () => {
      const frame = await failureFor(
        "t-413-generic",
        Object.assign(new Error("SELECT secret FROM vault"), { status: 413 })
      );
      expect(frame.message).toBe(
        "Request is too large for the provider. Shorten the conversation or remove some attachments and try again."
      );
    });

    it("prefers the Groq diagnostic on a 413", async () => {
      const frame = await failureFor(
        "t-413-groq",
        annotateGroqRequestFailure(
          Object.assign(new Error("upstream 413"), { status: 413 }),
          GROQ_DIAGNOSTIC
        ),
        { provider: "groq" }
      );
      expect(String(frame.message)).toMatch(
        /^Groq's token allowance is temporarily exhausted/
      );
    });

    it("gives a plain 429 the rate-limit advice", async () => {
      const frame = await failureFor(
        "t-429-plain",
        Object.assign(new Error("upstream 429"), {
          status: 429,
          body: { error: { message: "ignored body" } }
        })
      );
      expect(frame.message).toBe(
        "Rate limited: Too many requests or insufficient provider quota. Check your provider plan and try again later."
      );
    });

    it("reports a 5xx without detail as a temporary outage", async () => {
      const frame = await failureFor(
        "t-503-plain",
        Object.assign(new Error("upstream 503"), { status: 503 })
      );
      expect(frame.message).toBe(
        "Server error (503): The service is temporarily unavailable"
      );
    });

    it("prefers the Groq diagnostic over the body on a 5xx", async () => {
      const frame = await failureFor(
        "t-500-groq",
        annotateGroqRequestFailure(
          Object.assign(new Error("upstream 500"), {
            status: 500,
            body: { error: { message: "internal body" } }
          }),
          GROQ_DIAGNOSTIC
        ),
        { provider: "groq" }
      );
      expect(String(frame.message)).toMatch(
        /^Groq's token allowance is temporarily exhausted/
      );
    });

    it("formats a status outside the named classes with the error message", async () => {
      const frame = await failureFor(
        "t-302",
        Object.assign(new Error("moved"), { status: 302 })
      );
      expect(frame.message).toBe("HTTP error (302): moved");
    });

    it("ignores a body whose message is not a string", async () => {
      const frame = await failureFor(
        "t-body-nonstring",
        Object.assign(new Error("upstream 500"), {
          status: 500,
          body: { error: { message: 42 } }
        })
      );
      expect(frame.message).toBe(
        "Server error (500): The service is temporarily unavailable"
      );
    });

    it("ignores a body message that is only the generic message", async () => {
      const frame = await failureFor(
        "t-body-generic",
        Object.assign(new Error("upstream 500"), {
          status: 500,
          body: { error: { message: "SELECT secret FROM vault" } }
        })
      );
      expect(frame.message).toBe(
        "Server error (500): The service is temporarily unavailable"
      );
    });
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
                  toolCalls: [{ id: "call_open", name: "some_tool", args: {} }]
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

describe("generation recovery on a later agent turn", () => {
  beforeEach(() => initTestDb());

  it("supplies saved generation results without needing the original tool response", async () => {
    const threadId = "t-recover-generation";
    for (const [id, userId, thread, status] of [
      ["gen-completed", "1", threadId, "completed"],
      ["gen-running", "1", threadId, "running"],
      ["gen-other-user", "2", threadId, "completed"],
      ["gen-other-thread", "1", "elsewhere", "completed"]
    ]) {
      await Prediction.create({
        id,
        user_id: userId,
        thread_id: thread,
        status,
        provider: "fal",
        model: "video",
        capability: "text_to_video",
        asset_ids: status === "completed" ? [`asset-${id}`] : []
      });
    }
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
    await harness.handler.handleChatMessage(
      chatTurn(threadId, "Recover my renders")
    );
    const wire = JSON.stringify(seen);
    expect(wire).toContain("asset://asset-gen-completed");
    expect(wire).toContain("gen-running");
    expect(wire).not.toContain("gen-other-user");
    expect(wire).not.toContain("gen-other-thread");
    expect(
      JSON.stringify(seen.filter((message) => message.role === "system"))
    ).not.toContain("gen-completed");
    const [history] = await Message.paginate(threadId, { limit: 10 });
    expect(
      JSON.stringify(history.map((message) => message.content))
    ).not.toContain("asset-gen-completed");
  });
});

describe("thread ownership", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("does not take over another user's thread named by id", async () => {
    const victim = await Thread.create({
      user_id: "victim",
      project_id: "default",
      title: "Private"
    });
    await Message.create({
      thread_id: victim.id,
      user_id: "victim",
      role: "user",
      content: "victim secret"
    });
    const seen: unknown[] = [];
    const harness = makeChatTurnHarness({
      session: {
        userId: "attacker",
        resolveProvider: async () =>
          fakeProvider({
            generateLoop: async function* (args: GenerateLoopArgs) {
              seen.push(...args.messages.map((m) => m.content));
              yield { type: "chunk", content: "ok", done: true };
            }
          })
      }
    });

    await harness.handler
      .handleChatMessage(chatTurn(victim.id))
      .catch(() => undefined);

    const row = await Thread.get<Thread>(victim.id);
    expect(row?.user_id).toBe("victim");
    expect(row?.title).toBe("Private");
    expect(JSON.stringify(seen)).not.toContain("victim secret");
  });
});
