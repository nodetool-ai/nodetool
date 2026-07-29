import { describe, it, expect, vi } from "vitest";

/**
 * A fake of the native binding's function-calling surface, matching the real
 * library's observed behavior:
 * - response text (including whatever follows a function call) is delivered
 *   through `onTextChunk`, not just the `prompt()` return value;
 * - `functions[name].handler` receives the parsed arguments and its result is
 *   fed back to the model, which then keeps generating;
 * - aborting from inside a handler only stops quietly if text was already
 *   generated — node-llama-cpp's `res.length === 0` guard rethrows the abort
 *   otherwise, which is the case that matters for capturing a bare tool call.
 */
const capturedHistories: unknown[][] = [];

vi.mock("@nodetool-ai/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@nodetool-ai/config")>();
  return {
    ...actual,
    importOptionalModule: async (name: string) => {
      if (name !== "node-llama-cpp") {
        throw new Error(`Cannot find module '${name}'`);
      }
      return {
        getLlama: async () => ({
          loadModel: async () => ({
            createContext: async () => ({
              getSequence: () => ({}),
              dispose: async () => {}
            })
          })
        }),
        defineChatSessionFunction: (definition: unknown) => definition,
        LlamaChatSession: class {
          setChatHistory(history: unknown[]): void {
            capturedHistories.push(history);
          }
          async prompt(
            text: string,
            options: {
              functions?: Record<
                string,
                { handler: (params: Record<string, unknown>) => Promise<string> }
              >;
              signal?: AbortSignal;
              onTextChunk?: (chunk: string) => void;
            }
          ): Promise<string> {
            const fn = options.functions?.get_weather;
            if (!fn) {
              const answer = `echo: ${text}`;
              options.onTextChunk?.(answer);
              return answer;
            }
            const result = await fn.handler({ city: "Berlin" });
            if (options.signal?.aborted) {
              // Nothing was generated before the call, so the real library
              // rethrows the abort rather than returning quietly.
              throw Object.assign(new Error("This operation was aborted"), {
                name: "AbortError"
              });
            }
            const answer = `The weather is: ${result}`;
            options.onTextChunk?.(answer);
            return answer;
          }
        }
      };
    }
  };
});

import { NodeLlamaCppProvider } from "../../src/providers/node-llama-cpp-provider.js";
import type { ProviderTool } from "../../src/providers/types.js";

const weatherTool: ProviderTool = {
  name: "get_weather",
  description: "Get the weather for a city",
  inputSchema: {
    type: "object",
    properties: { city: { type: "string" } }
  }
};

describe("NodeLlamaCppProvider native function calling", () => {
  it("bridges the handler to onToolCall and returns the resolved turn", async () => {
    const provider = new NodeLlamaCppProvider();
    const onToolCall = vi.fn(
      async (name: string, args: Record<string, unknown>) => {
        expect(name).toBe("get_weather");
        expect(args).toEqual({ city: "Berlin" });
        return "sunny";
      }
    );

    const message = await provider.generateMessage({
      messages: [{ role: "user", content: "What's the weather in Berlin?" }],
      model: "model.gguf",
      tools: [weatherTool],
      onToolCall
    });

    expect(onToolCall).toHaveBeenCalledTimes(1);
    expect(message.content).toBe("The weather is: sunny");
    expect(message.toolCalls).toBeNull();
  });

  it("captures an unexecuted call, swallowing the abort it stops with", async () => {
    const provider = new NodeLlamaCppProvider();

    const message = await provider.generateMessage({
      messages: [{ role: "user", content: "What's the weather in Berlin?" }],
      model: "model.gguf",
      tools: [weatherTool]
    });

    expect(message.toolCalls).toHaveLength(1);
    expect(message.toolCalls?.[0]).toMatchObject({
      name: "get_weather",
      args: { city: "Berlin" }
    });
  });

  it("yields the captured call as a stream item after the done chunk", async () => {
    const provider = new NodeLlamaCppProvider();
    const items = [];
    for await (const item of provider.generateMessages({
      messages: [{ role: "user", content: "What's the weather in Berlin?" }],
      model: "model.gguf",
      tools: [weatherTool]
    })) {
      items.push(item);
    }

    expect(items.at(-1)).toMatchObject({
      name: "get_weather",
      args: { city: "Berlin" }
    });
    expect(items.at(-2)).toMatchObject({ type: "chunk", done: true });
  });

  it("propagates a caller abort as a real error", async () => {
    const provider = new NodeLlamaCppProvider();
    const controller = new AbortController();
    controller.abort();

    await expect(
      provider.generateMessage({
        messages: [{ role: "user", content: "What's the weather in Berlin?" }],
        model: "model.gguf",
        tools: [weatherTool],
        signal: controller.signal
      })
    ).rejects.toThrow(/aborted/i);
  });

  it("replays a prior tool round as a native functionCall history item", async () => {
    const provider = new NodeLlamaCppProvider();
    capturedHistories.length = 0;

    await provider.generateMessage({
      messages: [
        { role: "user", content: "What's the weather in Berlin?" },
        {
          role: "assistant",
          content: null,
          toolCalls: [
            { id: "call_1", name: "get_weather", args: { city: "Berlin" } }
          ]
        },
        { role: "tool", toolCallId: "call_1", content: "sunny" },
        { role: "user", content: "And tomorrow?" }
      ],
      model: "model.gguf"
    });

    expect(capturedHistories).toHaveLength(1);
    expect(capturedHistories[0]).toEqual([
      { type: "user", text: "What's the weather in Berlin?" },
      {
        type: "model",
        response: [
          {
            type: "functionCall",
            name: "get_weather",
            params: { city: "Berlin" },
            result: "sunny",
            startsNewChunk: true
          }
        ]
      }
    ]);
  });
});
