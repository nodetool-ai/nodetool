/**
 * A chat turn whose action space is sandboxed JavaScript: `processChat` is
 * handed the CodeAct session's `execute_code` as an ordinary tool, and the
 * toolbelt lives inside the sandbox. This is the mechanism the CLI's local
 * (no-server) turn runs on. Real QuickJS sandbox, scripted provider.
 */
import { describe, it, expect, vi } from "vitest";
import { processChat } from "../src/message-processor.js";
import { BaseProvider } from "@nodetool-ai/runtime";
import type {
  Message,
  ProcessingContext,
  ProviderStreamItem,
  ProviderTool,
  ToolCall
} from "@nodetool-ai/runtime";
import {
  Tool,
  createChatCodeActSession,
  type ChatCodeActSession
} from "@nodetool-ai/agents";

class EchoTool extends Tool {
  readonly name = "echo";
  readonly description = "Echo a string back.";
  protected override readonly jsonSchema = {
    type: "object",
    properties: { text: { type: "string" } },
    required: ["text"]
  };
  calls: string[] = [];
  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    this.calls.push(String(params["text"]));
    return { echoed: String(params["text"]).toUpperCase() };
  }
}

class PixelTool extends Tool {
  readonly name = "view_image";
  readonly description = "Load an image into view.";
  async process(): Promise<unknown> {
    return {
      note: "Here is the image.",
      image_content: { data: "PIXELBYTES", mimeType: "image/png" }
    };
  }
}

/** The session's one provider tool, wrapped so `processChat` can run it. */
class ExecuteCodeTool extends Tool {
  readonly name = "execute_code";
  readonly description = "Run a JavaScript action.";
  constructor(private readonly session: ChatCodeActSession) {
    super();
  }
  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    return this.session.executeAction(params);
  }
}

function createScriptedProvider(
  sequences: ProviderStreamItem[][],
  seenMessages: Message[][] = []
) {
  let callIndex = 0;
  return {
    provider: "mock",
    hasToolSupport: async () => true,
    generateMessages: async function* (args: {
      messages: Message[];
      model: string;
      tools?: ProviderTool[];
    }): AsyncGenerator<ProviderStreamItem> {
      seenMessages.push(args.messages);
      const seq = sequences[callIndex] ?? [];
      callIndex++;
      for (const item of seq) yield item;
    },
    async *generateMessagesTraced(...args: unknown[]) {
      yield* (this as never as { generateMessages: (...a: unknown[]) => AsyncGenerator<ProviderStreamItem> }).generateMessages(
        ...args
      );
    },
    generateLoop: BaseProvider.prototype.generateLoop,
    generateMessage: vi.fn(),
    getContainerEnv: () => ({}),
    isContextLengthError: () => false
  } as never as BaseProvider;
}

function createMockContext(): ProcessingContext {
  const variables: Record<string, unknown> = {};
  return {
    get: (key: string) => variables[key],
    set: (key: string, value: unknown) => {
      variables[key] = value;
    }
  } as never as ProcessingContext;
}

function toolCall(
  id: string,
  args: Record<string, unknown>
): ProviderStreamItem {
  return { id, name: "execute_code", args } as ToolCall;
}

describe("a CodeAct chat turn", () => {
  it("calls belt tools from sandboxed code and answers from the observation", async () => {
    // A real QuickJS worker thread starts for this run, which can take
    // longer than the default 5s under contended CI load.
    const echo = new EchoTool();
    const context = createMockContext();
    const session = createChatCodeActSession({
      tools: [
        {
          name: echo.name,
          description: echo.description,
          inputSchema: echo.inputSchema
        }
      ],
      executeTool: async (call) =>
        Tool.executeTool(echo, context, call.args, { toolCallId: call.id }),
      context
    });

    const provider = createScriptedProvider([
      [
        toolCall("tc_1", {
          title: "Echoing",
          code: `const r = await tools.echo({text: "hi"});
                 return r.echoed;`
        })
      ],
      [{ type: "chunk", content: "HI", done: true }]
    ]);

    const messages: Message[] = [
      { role: "system", content: session.systemPromptSection }
    ];
    await processChat({
      userInput: "say hi",
      messages,
      model: "m",
      provider,
      context,
      tools: [new ExecuteCodeTool(session)]
    });

    expect(echo.calls).toEqual(["hi"]);
    expect(session.toolCallCount()).toBe(1);
    const toolMessage = messages.find((m) => m.role === "tool");
    expect(JSON.parse(String(toolMessage?.content))).toMatchObject({
      ok: true,
      result: "HI",
      toolCalls: 1
    });
  }, 20000);

  it("forwards a tool's pixels as an image message, not as base64 text", async () => {
    const context = createMockContext();
    const seenMessages: Message[][] = [];
    const provider = createScriptedProvider(
      [
        [
          {
            id: "tc_1",
            name: "view_image",
            args: { asset_id: "a1" }
          } as ToolCall
        ],
        [{ type: "chunk", content: "A cat.", done: true }]
      ],
      seenMessages
    );

    const messages: Message[] = [];
    await processChat({
      userInput: "what is in the image?",
      messages,
      model: "m",
      provider,
      context,
      tools: [new PixelTool()]
    });

    // The persisted tool message is the light note — no base64 in history.
    const toolMessage = messages.find((m) => m.role === "tool");
    expect(String(toolMessage?.content)).toContain("Here is the image.");
    expect(String(toolMessage?.content)).not.toContain("PIXELBYTES");

    // The pixels reach the model as an image message on the next turn.
    const secondTurn = seenMessages[1] ?? [];
    const imageMessage = secondTurn.find(
      (m) =>
        m.role === "user" &&
        Array.isArray(m.content) &&
        m.content.some((block) => block.type === "image_url")
    );
    expect(imageMessage).toBeDefined();
    const blocks = imageMessage?.content as Array<Record<string, unknown>>;
    expect(blocks.find((b) => b["type"] === "image_url")).toMatchObject({
      image: { data: "PIXELBYTES" }
    });
  });
});
