/**
 * Gemini 4 Hydrogen (`gemini-4-hydrogen`) through the Gemini adapter: the
 * thinking levels it takes (low, medium, high, xhigh), the tool combinations
 * Gemini 4 allows, and thought signatures surviving streaming, structured
 * output and multi-step tool loops byte for byte.
 */
import { describe, it, expect, vi } from "vitest";
import { GeminiProvider } from "../../src/providers/gemini-provider.js";
import { generateStructured } from "../../src/providers/structured-output.js";
import { CostCalculator } from "../../src/providers/cost-calculator.js";
import type { ProviderEffort, ToolCall } from "../../src/providers/types.js";

const HYDROGEN = "gemini-4-hydrogen";

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body),
    body: null
  } as unknown as Response;
}

/** One SSE response whose events arrive in separate reads. */
function sseResponse(events: unknown[]): Response {
  const encoder = new TextEncoder();
  const chunks = events.map((event) =>
    encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
  );
  let index = 0;
  const reader = {
    async read() {
      if (index >= chunks.length) return { done: true, value: undefined };
      return { done: false, value: chunks[index++] };
    },
    async cancel() {},
    releaseLock() {}
  };
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    body: { getReader: () => reader }
  } as unknown as Response;
}

function partsEvent(parts: unknown[]): unknown {
  return { candidates: [{ content: { role: "model", parts } }] };
}

function requestBody(fetchFn: ReturnType<typeof vi.fn>, call: number) {
  return JSON.parse(fetchFn.mock.calls[call][1].body);
}

describe("Gemini 4 Hydrogen thinking levels", () => {
  async function sentThinkingConfig(
    model: string,
    effort: ProviderEffort | undefined
  ): Promise<unknown> {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse(partsEvent([{ text: "ok" }]))
    );
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });
    await provider.generateMessage({
      model,
      messages: [{ role: "user", content: "hi" }],
      effort
    });
    return requestBody(fetchFn, 0).generationConfig.thinkingConfig;
  }

  it.each([
    ["low", { thinkingLevel: "low" }],
    ["medium", { thinkingLevel: "medium" }],
    ["high", { thinkingLevel: "high" }],
    ["xhigh", { thinkingLevel: "xhigh" }],
    ["max", { thinkingLevel: "xhigh" }]
  ] as const)("sends %s as %j", async (effort, expected) => {
    expect(await sentThinkingConfig(HYDROGEN, effort)).toEqual(expected);
  });

  it("leaves Google's default (high) in place when no level is picked", async () => {
    expect(await sentThinkingConfig(HYDROGEN, undefined)).toBeUndefined();
  });

  it("never sends a thinking budget to a Gemini 4 model", async () => {
    for (const model of [HYDROGEN, "gemini-4-argon", "gemini-4-neon-preview"]) {
      const config = await sentThinkingConfig(model, "high");
      expect(config).toEqual({ thinkingLevel: "high" });
    }
  });

  it("caps xhigh at the highest level a model without it accepts", async () => {
    expect(await sentThinkingConfig("gemini-4-argon", "xhigh")).toEqual({
      thinkingLevel: "high"
    });
    expect(await sentThinkingConfig("gemini-3.8-flash", "max")).toEqual({
      thinkingLevel: "high"
    });
  });

  it("sends medium to Gemini 3.8 Flash, whose default it is", async () => {
    expect(await sentThinkingConfig("gemini-3.8-flash", "medium")).toEqual({
      thinkingLevel: "medium"
    });
  });
});

describe("Gemini 4 Hydrogen tool combinations", () => {
  it("sends Google Search next to custom functions", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse(partsEvent([{ text: "ok" }]))
    );
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });
    await provider.generateMessage({
      model: HYDROGEN,
      messages: [{ role: "user", content: "search" }],
      tools: [{ name: "web_search" }, { name: "save_note" }]
    });
    const body = requestBody(fetchFn, 0);
    expect(body.tools).toEqual([
      { functionDeclarations: [expect.objectContaining({ name: "save_note" })] },
      { googleSearch: {} }
    ]);
    expect(body.toolConfig).toEqual({ includeServerSideToolInvocations: true });
  });

  it("allows code execution next to custom functions", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse(partsEvent([{ text: "ok" }]))
    );
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });
    await provider.generateMessage({
      model: HYDROGEN,
      messages: [{ role: "user", content: "calculate" }],
      tools: [{ name: "python", type: "code_interpreter" }, { name: "save_note" }]
    });
    const body = requestBody(fetchFn, 0);
    expect(body.tools).toEqual([
      { functionDeclarations: [expect.objectContaining({ name: "save_note" })] },
      { codeExecution: {} }
    ]);
    expect(body.toolConfig).toEqual({ includeServerSideToolInvocations: true });
  });
});

describe("Gemini 4 Hydrogen thought signatures", () => {
  it("streams a signed call split across SSE events and keeps every part apart", async () => {
    const thought = { text: "Plan the lookup.", thought: true, thoughtSignature: "sig-thought" };
    const first = {
      functionCall: { id: "call-1", name: "lookup", args: { q: "a" } },
      thoughtSignature: "sig-call"
    };
    const second = { functionCall: { id: "call-2", name: "lookup", args: { q: "b" } } };
    const fetchFn = vi
      .fn()
      .mockResolvedValue(sseResponse([partsEvent([thought]), partsEvent([first]), partsEvent([second])]));
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });

    const calls: ToolCall[] = [];
    let terminal = 0;
    for await (const item of provider.generateMessages({
      model: HYDROGEN,
      messages: [{ role: "user", content: "look up a and b" }],
      tools: [{ name: "lookup" }],
      effort: "medium"
    })) {
      if ("type" in item && item.type === "chunk") {
        if (item.done) terminal++;
        // The thought text is never shown as answer text.
        expect(item.content).not.toContain("Plan the lookup.");
      } else {
        calls.push(item as ToolCall);
      }
    }

    expect(terminal).toBe(1);
    expect(calls.map((call) => call.id)).toEqual(["call-1", "call-2"]);
    expect(calls[0].thought_signature).toBe("sig-call");
    expect(calls[1].thought_signature).toBeUndefined();
    expect(calls[0]._rawGeminiParts).toEqual([thought, first, second]);
  });

  it("replays every turn's parts unchanged across a multi-step tool loop", async () => {
    const turn1 = [
      { text: "Need data.", thought: true, thoughtSignature: "sig-1a" },
      {
        functionCall: { id: "call-1", name: "lookup", args: { q: "a" } },
        thoughtSignature: "sig-1b"
      }
    ];
    const turn2 = [
      {
        functionCall: { id: "call-2", name: "lookup", args: { q: "b" } },
        thoughtSignature: "sig-2"
      }
    ];
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(sseResponse([partsEvent([turn1[0]]), partsEvent([turn1[1]])]))
      .mockResolvedValueOnce(sseResponse([partsEvent(turn2)]))
      .mockResolvedValueOnce(
        sseResponse([partsEvent([{ text: "Done.", thoughtSignature: "sig-3" }])])
      );
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });
    const executeTool = vi.fn(async (call: ToolCall) => `result for ${String(call.args.q)}`);

    for await (const _item of provider.generateLoop({
      model: HYDROGEN,
      messages: [{ role: "user", content: "look up a, then b" }],
      tools: [{ name: "lookup" }],
      effort: "xhigh",
      executeTool
    })) {
      // Drain the loop.
    }

    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(executeTool).toHaveBeenCalledTimes(2);

    const second = requestBody(fetchFn, 1);
    expect(second.generationConfig.thinkingConfig).toEqual({ thinkingLevel: "xhigh" });
    expect(second.contents[1]).toEqual({ role: "model", parts: turn1 });
    expect(second.contents[2].parts[0].functionResponse).toMatchObject({
      id: "call-1",
      name: "lookup"
    });

    const third = requestBody(fetchFn, 2);
    expect(third.contents[1]).toEqual({ role: "model", parts: turn1 });
    expect(third.contents[3]).toEqual({ role: "model", parts: turn2 });
    expect(third.contents[4].parts[0].functionResponse).toMatchObject({
      id: "call-2",
      name: "lookup"
    });
  });

  it("returns structured output from a signed forced call and keeps the signature", async () => {
    const parts = [
      { text: "Fill the schema.", thought: true, thoughtSignature: "sig-a" },
      {
        functionCall: { name: "emit_result", args: { title: "Hydrogen", score: 9 } },
        thoughtSignature: "sig-b"
      }
    ];
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(partsEvent(parts)));
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });
    const schema = {
      type: "object",
      properties: { title: { type: "string" }, score: { type: "number" } },
      required: ["title", "score"]
    };

    const result = await generateStructured(provider, {
      messages: [{ role: "user", content: "rate it" }],
      model: HYDROGEN,
      schema,
      toolName: "emit_result",
      toolDescription: "Return the result"
    });

    expect(result).toEqual({ title: "Hydrogen", score: 9 });
    const body = requestBody(fetchFn, 0);
    expect(body.toolConfig).toEqual({
      functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["emit_result"] }
    });

    const message = await provider.generateMessage({
      model: HYDROGEN,
      messages: [{ role: "user", content: "rate it" }],
      tools: [{ name: "emit_result", inputSchema: schema }],
      toolChoice: "emit_result"
    });
    expect(message.toolCalls?.[0].thought_signature).toBe("sig-b");
    expect(message._rawGeminiParts).toEqual(parts);
  });
});

describe("Gemini 4 Hydrogen pricing", () => {
  it("prices input, output (thinking included) and cached input per Google's paid tier", () => {
    const cost = CostCalculator.calculate(
      HYDROGEN,
      { inputTokens: 1_000_000, outputTokens: 1_000_000, cachedTokens: 0 },
      "gemini"
    );
    expect(cost).toBeCloseTo(1.5 + 7.5, 6);

    const cached = CostCalculator.calculate(
      HYDROGEN,
      { inputTokens: 1_000_000, outputTokens: 0, cachedTokens: 1_000_000 },
      "gemini_vertex"
    );
    expect(cached).toBeCloseTo(0.075, 6);
  });

  it("does not price an unrelated unknown Gemini model", () => {
    expect(
      CostCalculator.estimateTokenCostUsd(
        "gemini-9-unknown",
        { inputTokens: 1000, outputTokens: 1000 },
        "gemini"
      )
    ).toBeNull();
  });
});
