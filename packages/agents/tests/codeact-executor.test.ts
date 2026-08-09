/**
 * CodeActExecutor harness tests — a scripted provider drives code actions
 * through the real QuickJS sandbox and tool bridge. No network, no model.
 */
import { describe, it, expect } from "vitest";
import { CodeActExecutor } from "../src/codeact/codeact-executor.js";
import { Tool } from "../src/tools/base-tool.js";
import type { Step, Task } from "../src/types.js";
import type {
  BaseProvider,
  ProcessingContext,
  ProviderStreamItem,
  ToolCall
} from "@nodetool-ai/runtime";
import { createMockContext } from "./_helpers/mock-context.js";

class AddTool extends Tool {
  readonly name = "add";
  readonly description = "Add two numbers.";
  protected override readonly jsonSchema = {
    type: "object",
    properties: { a: { type: "number" }, b: { type: "number" } },
    required: ["a", "b"]
  };
  calls = 0;
  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    this.calls++;
    return { sum: Number(params["a"]) + Number(params["b"]) };
  }
}

class FailingTool extends Tool {
  readonly name = "always_fails";
  readonly description = "Fails every time.";
  async process(): Promise<unknown> {
    return { error: "boom", message: "this tool always fails" };
  }
}

/**
 * Minimal provider that owns the loop the way BaseProvider.generateLoop does:
 * each scripted turn is either a batch of tool calls (dispatched to the
 * ProviderTool's own `execute`) or a final assistant text message.
 */
type ScriptTurn = { toolCalls: ToolCall[] } | { assistant: string };

function createLoopProvider(turns: ScriptTurn[]): BaseProvider {
  return {
    provider: "fake",
    hasToolSupport: async () => true,
    async *generateLoop(args: {
      tools?: Array<{
        name: string;
        execute?: (a: Record<string, unknown>) => Promise<string | unknown>;
      }>;
      signal?: AbortSignal;
    }): AsyncGenerator<ProviderStreamItem> {
      const toolMap = new Map((args.tools ?? []).map((t) => [t.name, t]));
      for (const turn of turns) {
        if (args.signal?.aborted) break;
        if ("assistant" in turn) {
          yield {
            type: "message",
            message: { role: "assistant", content: turn.assistant }
          };
          continue;
        }
        for (const tc of turn.toolCalls) {
          if (args.signal?.aborted) break;
          yield tc;
          const tool = toolMap.get(tc.name);
          const content = tool?.execute ? await tool.execute(tc.args) : "";
          yield {
            type: "message",
            message: {
              role: "tool",
              toolCallId: tc.id,
              content:
                typeof content === "string" ? content : JSON.stringify(content)
            }
          };
        }
      }
      yield { type: "chunk", content: "", done: true };
    }
  } as unknown as BaseProvider;
}

function makeStep(outputSchema?: object): { step: Step; task: Task } {
  const step: Step = {
    id: "step_1",
    instructions: "Compute the answer",
    completed: false,
    dependsOn: [],
    logs: [],
    outputSchema: outputSchema ? JSON.stringify(outputSchema) : undefined
  };
  return { step, task: { id: "task_1", title: "T", steps: [step] } };
}

const ANSWER_SCHEMA = {
  type: "object",
  properties: { answer: { type: "number" } },
  required: ["answer"]
};

function codeAction(id: string, code: string): ToolCall {
  return { id, name: "execute_code", args: { code } };
}

describe("CodeActExecutor", () => {
  it("chains multiple tool calls in one action and finishes", async () => {
    const { step, task } = makeStep(ANSWER_SCHEMA);
    const context = createMockContext();
    const add = new AddTool();
    const provider = createLoopProvider([
      {
        toolCalls: [
          codeAction(
            "tc_1",
            `const first = await tools.add({a: 1, b: 2});
             const second = await tools.add({a: first.sum, b: 39});
             await finish({answer: second.sum});`
          )
        ]
      }
    ]);

    const executor = new CodeActExecutor({
      task,
      step,
      context: context as never,
      provider,
      model: "m",
      tools: [add]
    });

    const messages: Array<{ type: string; name?: string }> = [];
    for await (const msg of executor.execute()) {
      messages.push({
        type: msg.type,
        name: (msg as { name?: string }).name
      });
    }

    expect(step.completed).toBe(true);
    expect(executor.getResult()).toEqual({ answer: 42 });
    expect(add.calls).toBe(2);
    expect(context.memory.getValue("step:step_1")).toEqual({ answer: 42 });
    // Inner bridged calls surface as tool_call_update alongside execute_code.
    const toolUpdates = messages.filter((m) => m.type === "tool_call_update");
    expect(toolUpdates.map((m) => m.name)).toEqual([
      "execute_code",
      "add",
      "add"
    ]);
  });

  it("persists state across actions", async () => {
    const { step, task } = makeStep(ANSWER_SCHEMA);
    const context = createMockContext();
    const provider = createLoopProvider([
      { toolCalls: [codeAction("tc_1", `state.x = 41; return "stored";`)] },
      {
        toolCalls: [
          codeAction("tc_2", `await finish({answer: state.x + 1});`)
        ]
      }
    ]);

    const executor = new CodeActExecutor({
      task,
      step,
      context: context as never,
      provider,
      model: "m",
      tools: []
    });
    for await (const msg of executor.execute()) void msg;

    expect(step.completed).toBe(true);
    expect(executor.getResult()).toEqual({ answer: 42 });
  });

  it("rejects a schema-invalid finish and accepts the repaired one", async () => {
    const { step, task } = makeStep(ANSWER_SCHEMA);
    const context = createMockContext();
    const provider = createLoopProvider([
      {
        toolCalls: [
          codeAction("tc_1", `await finish({answer: "not a number"});`)
        ]
      },
      { toolCalls: [codeAction("tc_2", `await finish({answer: 7});`)] }
    ]);

    const executor = new CodeActExecutor({
      task,
      step,
      context: context as never,
      provider,
      model: "m",
      tools: []
    });
    for await (const msg of executor.execute()) void msg;

    expect(step.completed).toBe(true);
    expect(executor.getResult()).toEqual({ answer: 7 });
  });

  it("surfaces a failing tool as a guest exception the action can catch", async () => {
    const { step, task } = makeStep(ANSWER_SCHEMA);
    const context = createMockContext();
    const provider = createLoopProvider([
      {
        toolCalls: [
          codeAction(
            "tc_1",
            `let failed = false;
             try {
               await tools.always_fails({});
             } catch (e) {
               failed = e.message.includes("always fails");
             }
             await finish({answer: failed ? 1 : 0});`
          )
        ]
      }
    ]);

    const executor = new CodeActExecutor({
      task,
      step,
      context: context as never,
      provider,
      model: "m",
      tools: [new FailingTool()]
    });
    for await (const msg of executor.execute()) void msg;

    expect(step.completed).toBe(true);
    expect(executor.getResult()).toEqual({ answer: 1 });
  });

  it("keeps going after a crashed action", async () => {
    const { step, task } = makeStep(ANSWER_SCHEMA);
    const context = createMockContext();
    const provider = createLoopProvider([
      { toolCalls: [codeAction("tc_1", `throw new Error("oops");`)] },
      { toolCalls: [codeAction("tc_2", `await finish({answer: 3});`)] }
    ]);

    const executor = new CodeActExecutor({
      task,
      step,
      context: context as never,
      provider,
      model: "m",
      tools: []
    });
    for await (const msg of executor.execute()) void msg;

    expect(step.completed).toBe(true);
    expect(executor.getResult()).toEqual({ answer: 3 });
  });

  it("finalizes an unschema'd step from a plain assistant message", async () => {
    const { step, task } = makeStep();
    const context = createMockContext();
    const provider = createLoopProvider([
      { assistant: "The capital of France is Paris." }
    ]);

    const executor = new CodeActExecutor({
      task,
      step,
      context: context as never,
      provider,
      model: "m",
      tools: []
    });
    for await (const msg of executor.execute()) void msg;

    expect(step.completed).toBe(true);
    expect(executor.getResult()).toBe("The capital of France is Paris.");
  });

  it("fails the step explicitly when no completion happens", async () => {
    const { step, task } = makeStep(ANSWER_SCHEMA);
    const context = createMockContext();
    const provider = createLoopProvider([
      { toolCalls: [codeAction("tc_1", `return "still thinking";`)] }
    ]);

    const executor = new CodeActExecutor({
      task,
      step,
      context: context as never,
      provider,
      model: "m",
      tools: []
    });

    const results: Array<{ type: string; error?: string }> = [];
    for await (const msg of executor.execute()) {
      results.push(msg as { type: string; error?: string });
    }

    expect(step.completed).toBe(false);
    expect(step.failed).toBe(true);
    const stepResult = results.find((m) => m.type === "step_result");
    expect(stepResult?.error).toContain("Step failed");
  });
});

describe("CodeAct progressive tool disclosure", () => {
  class NamedTool extends Tool {
    constructor(
      readonly name: string,
      readonly description: string
    ) {
      super();
    }
    protected override readonly jsonSchema = {
      type: "object",
      properties: { value: { type: "string" } },
      required: ["value"]
    };
    async process(
      _context: ProcessingContext,
      params: Record<string, unknown>
    ): Promise<unknown> {
      return { echoed: params["value"], via: this.name };
    }
  }

  const bigBelt = () => [
    new NamedTool("web_search", "Search the web."),
    new NamedTool("lookup_customer", "Look up a customer record by id."),
    ...Array.from(
      { length: 16 },
      (_, i) => new NamedTool(`filler_tool_${i}`, `Filler tool number ${i}.`)
    )
  ];

  it("keeps resident tools documented and defers the long tail in the prompt", async () => {
    const { buildCodeActSystemPrompt } = await import("../src/codeact/prompt.js");
    const tools = bigBelt();
    const resident = tools.filter((t) => t.name === "web_search");
    const deferred = tools.filter((t) => t.name !== "web_search");
    const prompt = buildCodeActSystemPrompt({
      tools: resident,
      deferredTools: deferred
    });

    // Resident: full signature. Deferred: name only, discoverable.
    expect(prompt).toContain("await tools.web_search(");
    expect(prompt).toContain("lookup_customer");
    expect(prompt).not.toContain("await tools.lookup_customer(");
    expect(prompt).toContain('searchTools("query")');
  });

  it("tells the model that independent calls run concurrently", async () => {
    const { buildCodeActSystemPrompt } = await import("../src/codeact/prompt.js");
    // The sandbox parallelizes host calls, but a model that does not know it
    // writes `for (const x of xs) await tools.foo(x)` and pays one round trip
    // per item. Both variants need the guidance — chat turns fan out over
    // `tools.*` exactly as steps do.
    for (const variant of ["step", "chat"] as const) {
      const prompt = buildCodeActSystemPrompt({ tools: bigBelt(), variant });
      expect(prompt, variant).toContain("Promise.all");
      expect(prompt, variant).toContain("parallelMap");
      // The helper's signature rides along from the manifest.
      expect(prompt, variant).toContain("await parallelMap(items, fn");
      // And the timers it replaces are still declared absent.
      expect(prompt, variant).toContain("setTimeout");
    }
  });

  it("documents nodetool.batch as THE fan-out primitive when the object model loads", async () => {
    const { buildCodeActSystemPrompt } = await import("../src/codeact/prompt.js");
    const { buildNodetoolApiPromptSection } = await import(
      "../src/codeact/nodetool-api.js"
    );
    const apiSection = buildNodetoolApiPromptSection(["run_workflow"]);
    expect(apiSection).not.toBe("");
    for (const variant of ["step", "chat"] as const) {
      const prompt = buildCodeActSystemPrompt({
        tools: bigBelt(),
        variant,
        extraSections: [apiSection]
      });
      expect(prompt, variant).toContain("nodetool.batch(items");
      expect(prompt, variant).not.toContain("parallelMap");
      // The unbounded form stays documented.
      expect(prompt, variant).toContain("Promise.all");
    }
  });

  it("discovers a deferred tool via searchTools and calls it", async () => {
    const { step, task } = makeStep(ANSWER_SCHEMA);
    const context = createMockContext();
    const provider = createLoopProvider([
      {
        toolCalls: [
          codeAction(
            "tc_1",
            `const hits = await searchTools("+lookup customer");
             const name = hits[0].name;
             const r = await tools[name]({value: "c42"});
             await finish({answer: r.echoed === "c42" && r.via === "lookup_customer" ? 1 : 0});`
          )
        ]
      }
    ]);

    const executor = new CodeActExecutor({
      task,
      step,
      context: context as never,
      provider,
      model: "m",
      tools: bigBelt()
    });
    for await (const msg of executor.execute()) void msg;

    expect(step.completed).toBe(true);
    expect(executor.getResult()).toEqual({ answer: 1 });
  });
});

describe("CodeAct core tools", () => {
  class NamedTool extends Tool {
    constructor(
      readonly name: string,
      readonly description: string
    ) {
      super();
    }
    protected override readonly jsonSchema = {
      type: "object",
      properties: { value: { type: "string" } },
      required: ["value"]
    };
    async process(
      _context: ProcessingContext,
      params: Record<string, unknown>
    ): Promise<unknown> {
      return { echoed: params["value"], via: this.name };
    }
  }

  it("offers the core tools to the provider and documents them as direct", async () => {
    const { step, task } = makeStep(ANSWER_SCHEMA);
    const context = createMockContext();
    let offered: string[] = [];
    let systemPrompt = "";
    const provider = createLoopProvider([
      { toolCalls: [codeAction("tc_1", `await finish({answer: 1});`)] }
    ]);
    const inner = provider.generateLoop.bind(provider);
    provider.generateLoop = ((args: {
      tools?: Array<{ name: string }>;
      messages: Array<{ role: string; content?: unknown }>;
    }) => {
      offered = (args.tools ?? []).map((t) => t.name);
      systemPrompt = String(
        args.messages.find((m) => m.role === "system")?.content ?? ""
      );
      return inner(args as never);
    }) as typeof provider.generateLoop;

    const executor = new CodeActExecutor({
      task,
      step,
      context: context as never,
      provider,
      model: "m",
      tools: [
        new NamedTool("read_file", "Read a file."),
        new NamedTool("lookup_customer", "Look up a customer record by id.")
      ]
    });
    for await (const msg of executor.execute()) void msg;

    // `read_file` mirrors an SDK built-in, so it is a tool call of its own.
    expect(offered).toContain("execute_code");
    expect(offered).toContain("read_file");
    expect(offered).not.toContain("lookup_customer");
    // And the prompt points at it there, not at a `tools.read_file(` signature.
    expect(systemPrompt).toContain("# Direct tools");
    expect(systemPrompt).not.toContain("tools.read_file(");
    expect(systemPrompt).toContain("tools.lookup_customer(");
  });

  it("still reaches a core tool from inside a code action", async () => {
    // The belt keeps them: `nodetool.web`, `nodetool.agents` and any
    // hand-written fan-out call these from code, in one action.
    const { step, task } = makeStep(ANSWER_SCHEMA);
    const context = createMockContext();
    const provider = createLoopProvider([
      {
        toolCalls: [
          codeAction(
            "tc_1",
            `const r = await tools.read_file({value: "x"});
             await finish({answer: r.via === "read_file" ? 1 : 0});`
          )
        ]
      }
    ]);

    const executor = new CodeActExecutor({
      task,
      step,
      context: context as never,
      provider,
      model: "m",
      tools: [new NamedTool("read_file", "Read a file.")]
    });
    for await (const msg of executor.execute()) void msg;

    expect(executor.getResult()).toEqual({ answer: 1 });
  });
});

describe("coercionArtifactPaths", () => {
  it("names the paths carrying [object Object]", async () => {
    const { coercionArtifactPaths } = await import(
      "../src/codeact/codeact-executor.js"
    );
    expect(
      coercionArtifactPaths({
        shout: "[object Object]",
        nested: { list: ["fine", "x [object Object] y"] },
        ok: "SHIP IT",
        n: 3
      })
    ).toEqual(["result.shout", "result.nested.list[1]"]);
    expect(coercionArtifactPaths({ ok: "clean" })).toEqual([]);
  });

  it("flags a JSON-serialized envelope standing in for the value", async () => {
    const { coercionArtifactPaths } = await import(
      "../src/codeact/codeact-executor.js"
    );
    expect(
      coercionArtifactPaths({
        slug: '{"status":"completed","outputs":{"slug":"fox-in-snow"}}',
        shout: '{"shout":"SHIP IT"}'
      })
    ).toEqual(["result.slug", "result.shout"]);
    // Plain values, JSON that is not an envelope, and arrays stay legal.
    expect(
      coercionArtifactPaths({
        text: '{"unrelated":1}',
        list: '["a","b"]',
        word: "SHIP IT"
      })
    ).toEqual([]);
  });
});
