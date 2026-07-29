import { describe, expect, it } from "vitest";
import { BaseProvider } from "../../src/providers/base-provider.js";
import {
  isProviderMessageEvent,
  type Message,
  type ProviderStreamItem,
  type ToolCall
} from "../../src/providers/types.js";

class ToolResultProvider extends BaseProvider {
  private turn = 0;

  constructor() {
    super("test");
  }

  async generateMessage(): Promise<Message> {
    return { role: "assistant", content: "done" };
  }

  async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
    this.turn++;
    if (this.turn === 1) {
      yield { id: "call_1", name: "lookup", args: {} } satisfies ToolCall;
      return;
    }
    yield { type: "chunk", content: "done", done: true };
  }
}

describe("provider tool-result contract", () => {
  it("marks thrown tool failures as error results", async () => {
    const provider = new ToolResultProvider();
    const events: ProviderStreamItem[] = [];

    for await (const event of provider.generateLoop({
      messages: [{ role: "user", content: "run" }],
      model: "test-model",
      executeTool: async () => {
        throw new Error("unavailable");
      }
    })) {
      events.push(event);
    }

    const toolEvent = events
      .filter(isProviderMessageEvent)
      .find((event) => event.message.role === "tool");
    expect(toolEvent?.message.isError).toBe(true);
    expect(toolEvent?.message.content).toBe(
      'Error executing tool "lookup": unavailable'
    );
  });

  it("preserves an explicitly structured error result", async () => {
    const provider = new ToolResultProvider();
    const events: ProviderStreamItem[] = [];

    for await (const event of provider.generateLoop({
      messages: [{ role: "user", content: "run" }],
      model: "test-model",
      executeTool: async () => ({ content: "permission denied", isError: true })
    })) {
      events.push(event);
    }

    const toolEvent = events
      .filter(isProviderMessageEvent)
      .find((event) => event.message.role === "tool");
    expect(toolEvent?.message).toMatchObject({
      content: "permission denied",
      isError: true,
      toolCallId: "call_1"
    });
  });
});
