/**
 * CodePlanner mechanics against a scripted provider — no network, no model
 * quality claims: acceptance, feedback rounds, the round cap, cancellation, and
 * the rule that only an accepted `submit_code` call counts.
 */
import { describe, it, expect } from "vitest";
import { CodePlanner } from "../src/code-planner.js";
import { SubmitCodeTool } from "../src/tools/submit-code-tool.js";
import type {
  BaseProvider,
  ProviderStreamItem,
  ToolCall
} from "@nodetool-ai/runtime";
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import type { CodeGenResponse } from "@nodetool-ai/protocol/api-schemas/code-gen.js";

const STR = { type: "str" };

function submission(overrides: Record<string, unknown> = {}) {
  return {
    title: "Split text into words",
    summary: "Splits the input text on whitespace and counts the words.",
    code: `const words = text.split(" ");\nreturn { words, count: words.length };`,
    inputs: [{ name: "text", type: STR }],
    outputs: [
      { name: "words", type: { type: "list", type_args: [STR] } },
      { name: "count", type: { type: "int" } }
    ],
    ...overrides
  };
}

/** Replays a scripted tool-call list, dispatching each to the tool's execute. */
function createScriptedProvider(
  script: ToolCall[],
  options: { text?: string; onCall?: () => void } = {}
): BaseProvider {
  return {
    provider: "scripted",
    hasToolSupport: async () => true,
    getTotalCost: () => 0,
    async *generateLoop(args: {
      tools?: Array<{
        name: string;
        execute?: (
          a: Record<string, unknown>,
          id?: string
        ) => Promise<string | unknown>;
      }>;
      signal?: AbortSignal;
    }): AsyncGenerator<ProviderStreamItem> {
      if (options.text) {
        yield { type: "chunk", content: options.text, done: false };
      }
      const tools = new Map((args.tools ?? []).map((t) => [t.name, t]));
      for (const call of script) {
        if (args.signal?.aborted) break;
        options.onCall?.();
        yield call as unknown as ProviderStreamItem;
        await tools.get(call.name)?.execute?.(call.args, call.id);
        if (args.signal?.aborted) break;
      }
      yield { type: "chunk", content: "", done: true };
    }
  } as unknown as BaseProvider;
}

async function drain(
  planner: CodePlanner
): Promise<{ result: CodeGenResponse; messages: ProcessingMessage[] }> {
  const messages: ProcessingMessage[] = [];
  const generator = planner.plan();
  let next = await generator.next();
  while (!next.done) {
    messages.push(next.value);
    next = await generator.next();
  }
  return { result: next.value, messages };
}

function makePlanner(
  provider: BaseProvider,
  overrides: Record<string, unknown> = {}
): CodePlanner {
  return new CodePlanner({
    provider,
    model: "scripted-model",
    instruction: "Split the text into words and count them.",
    inputs: [{ name: "text", type: STR }],
    ...overrides
  });
}

describe("CodePlanner", () => {
  it("accepts a valid submission on the first round", async () => {
    const provider = createScriptedProvider([
      { id: "1", name: "submit_code", args: submission() }
    ]);
    const { result, messages } = await drain(makePlanner(provider));

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.submission.title).toBe("Split text into words");
    expect(result.submission.outputs.map((o) => o.name)).toEqual([
      "words",
      "count"
    ]);
    expect(messages.some((m) => m.type === "tool_call_update")).toBe(true);
    expect(
      messages.some(
        (m) => m.type === "planning_update" && m.phase === "complete"
      )
    ).toBe(true);
  });

  it("feeds validation errors back and accepts the fix on round 2", async () => {
    const provider = createScriptedProvider([
      {
        id: "1",
        name: "submit_code",
        args: submission({ code: `return { words: text.split(" ") };` })
      },
      { id: "2", name: "submit_code", args: submission() }
    ]);
    const { result, messages } = await drain(makePlanner(provider));

    expect(result.status).toBe("ok");
    const results = messages.filter((m) => m.type === "tool_result_update");
    expect(results).toHaveLength(2);
    const first = JSON.stringify(results[0]);
    expect(first).toContain("code_rejected");
    expect(first).toContain("count");
    expect(JSON.stringify(results[1])).toContain("code_accepted");
  });

  it("gives up with no_valid_submission after three rejected rounds", async () => {
    const bad = submission({ code: `return { words: [] };` });
    let calls = 0;
    const provider = createScriptedProvider(
      [1, 2, 3, 4].map((n) => ({
        id: String(n),
        name: "submit_code",
        args: bad
      })),
      { onCall: () => calls++ }
    );
    const { result } = await drain(makePlanner(provider));

    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.error.code).toBe("no_valid_submission");
    if (result.error.code !== "no_valid_submission") return;
    expect(result.error.rounds).toBe(3);
    expect(result.error.issues.join(" ")).toContain("count");
    // The fourth scripted call never runs: the cap aborts the loop.
    expect(calls).toBe(3);
  });

  it("reports aborted when cancelled mid-flight", async () => {
    const controller = new AbortController();
    const provider = createScriptedProvider(
      [
        { id: "1", name: "submit_code", args: submission({ code: "return {};" }) },
        { id: "2", name: "submit_code", args: submission() }
      ],
      { onCall: () => controller.abort() }
    );
    const { result } = await drain(
      makePlanner(provider, { signal: controller.signal })
    );

    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.error.code).toBe("aborted");
  });

  it("ignores a code fence in free text when no tool is called", async () => {
    const provider = createScriptedProvider([], {
      text: "```js\nreturn { words: [], count: 0 };\n```"
    });
    const { result } = await drain(makePlanner(provider));

    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.error.code).toBe("no_valid_submission");
    expect(result.error.message).toContain("without calling submit_code");
  });

  it("fails fast when the model cannot call tools", async () => {
    const provider = {
      ...createScriptedProvider([]),
      provider: "scripted",
      hasToolSupport: async () => false
    } as unknown as BaseProvider;
    const { result } = await drain(makePlanner(provider));

    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.error.code).toBe("provider_unavailable");
  });

  it("classifies a provider rate limit", async () => {
    const provider = {
      provider: "scripted",
      hasToolSupport: async () => true,
      async *generateLoop(): AsyncGenerator<ProviderStreamItem> {
        throw new Error("429 rate limit exceeded");
      }
    } as unknown as BaseProvider;
    const { result } = await drain(makePlanner(provider));

    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.error.code).toBe("rate_limited");
  });
});

describe("SubmitCodeTool", () => {
  const context = {} as never;

  it("rejects arguments that fail the transport schema", async () => {
    const tool = new SubmitCodeTool();
    const result = (await tool.process(
      context,
      submission({ inputs: [{ name: "class", type: STR }] })
    )) as { status: string; errors: string[] };

    expect(result.status).toBe("code_rejected");
    expect(result.errors.join(" ")).toContain("reserved word");
  });

  it("rejects a submission with no outputs", async () => {
    const tool = new SubmitCodeTool();
    const result = (await tool.process(
      context,
      submission({ outputs: [] })
    )) as { status: string; errors: string[] };

    expect(result.status).toBe("code_rejected");
    expect(result.errors.join(" ")).toContain("At least one output");
  });

  it("keeps the rejected code for the retry prompt", async () => {
    const tool = new SubmitCodeTool();
    await tool.process(context, submission({ code: "return { words: [] };" }));

    expect(tool.submission).toBeNull();
    expect(tool.lastCode).toBe("return { words: [] };");
    expect(tool.lastErrors.join(" ")).toContain("count");
    expect(tool.rounds).toBe(1);
  });

  it("signals acceptance once", async () => {
    let accepted = 0;
    const tool = new SubmitCodeTool({ onAccepted: () => accepted++ });
    const result = (await tool.process(context, submission())) as {
      status: string;
      outputs: string[];
    };

    expect(result.status).toBe("code_accepted");
    expect(result.outputs).toEqual(["words", "count"]);
    expect(accepted).toBe(1);
    expect(tool.submission?.code).toContain("split");
  });
});
