/**
 * The local (no-server) chat turn runs in CodeAct: the provider is offered
 * `execute_code` (+ `view_image`) and the toolbelt moves into the sandbox
 * session, never onto the provider. The agents package is stubbed here (see
 * vitest.config.ts), so this covers the CLI's wiring; the mechanism itself is
 * covered in packages/chat/tests/codeact-turn.test.ts.
 */
import { describe, it, expect, vi } from "vitest";

class StubTool {
  readonly name: string = "";
  readonly description: string = "";
  get inputSchema(): unknown {
    return { type: "object", properties: {} };
  }
  async process(
    _context: unknown,
    _params: Record<string, unknown>
  ): Promise<unknown> {
    return null;
  }
  userMessage(): string {
    return `Running ${this.name}`;
  }
  static async executeTool(
    tool: StubTool,
    context: unknown,
    params: Record<string, unknown>,
    options: { toolCallId?: string } = {}
  ): Promise<unknown> {
    executedCalls.push({ name: tool.name, params, options });
    return tool.process(context, params);
  }
}

const executedCalls: Array<{
  name: string;
  params: Record<string, unknown>;
  options: { toolCallId?: string };
}> = [];

const sessionsCreated: Array<{ toolNames: string[] }> = [];

vi.mock("@nodetool-ai/agents", () => ({
  Tool: StubTool,
  createChatCodeActSession: (options: {
    tools: Array<{ name: string }>;
    executeTool: (call: {
      id: string;
      name: string;
      args: Record<string, unknown>;
    }) => Promise<unknown>;
  }) => {
    sessionsCreated.push({ toolNames: options.tools.map((t) => t.name) });
    return {
      providerTool: {
        name: "execute_code",
        description: "Execute a JavaScript action in the sandbox.",
        inputSchema: { type: "object", properties: { code: { type: "string" } } }
      },
      systemPromptSection: "CODEACT CONTRACT",
      executeAction: async (args: Record<string, unknown>) =>
        JSON.stringify({ ok: true, ran: args["code"] }),
      toolCallCount: () => 0,
      // Test handle onto the bridge the session would call from the sandbox.
      __executeTool: options.executeTool
    };
  }
}));

const { applySystemPrompt, createCliCodeActTurn } = await import(
  "../src/chat-codeact.js"
);

class EchoTool extends StubTool {
  override readonly name = "echo";
  override readonly description = "Echo a string back.";
  override async process(
    _context: unknown,
    params: Record<string, unknown>
  ): Promise<unknown> {
    return { echoed: params["text"] };
  }
}

class ViewImageTool extends StubTool {
  override readonly name = "view_image";
  override readonly description = "Load an image into view.";
}

const context = {} as never;

describe("createCliCodeActTurn", () => {
  it("offers execute_code and view_image, never the raw toolbelt", () => {
    const turn = createCliCodeActTurn({
      tools: [new EchoTool() as never, new ViewImageTool() as never],
      context
    });
    expect(turn.tools.map((t) => t.name)).toEqual([
      "execute_code",
      "view_image"
    ]);
    // The belt moves inside the sandbox — minus view_image, which is the one
    // channel that can put pixels into the model's context.
    expect(sessionsCreated.at(-1)?.toolNames).toEqual(["echo"]);
    expect(turn.systemPrompt).toBe("CODEACT CONTRACT");
  });

  it("omits view_image when the belt does not carry it", () => {
    const turn = createCliCodeActTurn({
      tools: [new EchoTool() as never],
      context
    });
    expect(turn.tools.map((t) => t.name)).toEqual(["execute_code"]);
  });

  it("runs a code action through the session", async () => {
    const turn = createCliCodeActTurn({
      tools: [new EchoTool() as never],
      context
    });
    const observation = await turn.tools[0].process(context, {
      code: "return 1;"
    });
    expect(JSON.parse(String(observation))).toEqual({ ok: true, ran: "return 1;" });
  });

  it("bridges a sandbox tool call to the local tool with its call id", async () => {
    executedCalls.length = 0;
    const turn = createCliCodeActTurn({
      tools: [new EchoTool() as never],
      context
    });
    const bridge = (
      turn.session as unknown as {
        __executeTool: (call: {
          id: string;
          name: string;
          args: Record<string, unknown>;
        }) => Promise<unknown>;
      }
    ).__executeTool;

    await expect(
      bridge({ id: "codeact_1", name: "echo", args: { text: "hi" } })
    ).resolves.toEqual({ echoed: "hi" });
    expect(executedCalls).toEqual([
      {
        name: "echo",
        params: { text: "hi" },
        options: { toolCallId: "codeact_1" }
      }
    ]);

    await expect(
      bridge({ id: "codeact_2", name: "nope", args: {} })
    ).rejects.toThrow('Tool "nope" not available');
  });
});

describe("applySystemPrompt", () => {
  it("prepends the prompt when the history has none", () => {
    const messages = [{ role: "user" as const, content: "hi" }];
    applySystemPrompt(messages, "catalog");
    expect(messages[0]).toEqual({ role: "system", content: "catalog" });
  });

  it("replaces the previous turn's prompt instead of stacking one", () => {
    const messages = [
      { role: "system" as const, content: "old catalog" },
      { role: "user" as const, content: "hi" }
    ];
    applySystemPrompt(messages, "new catalog");
    expect(messages.filter((m) => m.role === "system")).toHaveLength(1);
    expect(messages[0].content).toBe("new catalog");
  });
});
