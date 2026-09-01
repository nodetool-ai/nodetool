/**
 * CodeActExecutor harness tests — a scripted provider drives code actions
 * through the real QuickJS sandbox and tool bridge. No network, no model.
 */
import { describe, it, expect } from "vitest";
import { CodeActExecutor } from "../src/codeact/codeact-executor.js";
import { Tool } from "../src/tools/base-tool.js";
import type { Step, Task } from "../src/types.js";
import type {
  ProcessingContext,
  ProviderStreamItem,
  RunBudget,
  ToolCall
} from "@nodetool-ai/runtime";
import {
  BaseProvider,
  createCounter,
  createRunBudget,
  createSemaphore
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
            `import { add } from "@nodetool-ai/sandbox-nodetool/session";
             const first = await add({a: 1, b: 2});
             const second = await add({a: first.sum, b: 39});
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

  it("injects no state global — cross-action carry is thread memory", async () => {
    const { step, task } = makeStep(ANSWER_SCHEMA);
    const context = createMockContext();
    const provider = createLoopProvider([
      { toolCalls: [codeAction("tc_1", `return state.x;`)] },
      {
        toolCalls: [codeAction("tc_2", `await finish({answer: 41});`)]
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
    expect(executor.getResult()).toEqual({ answer: 41 });
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
            `import { always_fails } from "@nodetool-ai/sandbox-nodetool/session";
             let failed = false;
             try {
               await always_fails({});
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
    expect(prompt).toContain("await web_search(");
    expect(prompt).toContain('from "@nodetool-ai/sandbox-nodetool/web";');
    expect(prompt).toContain("lookup_customer");
    expect(prompt).not.toContain("await lookup_customer(");
    expect(prompt).toContain('nodetool.searchTools("query")');
  });

  it("tells the model that independent calls run concurrently", async () => {
    const { buildCodeActSystemPrompt } = await import("../src/codeact/prompt.js");
    // The sandbox parallelizes host calls, but a model that does not know it
    // writes `for (const x of xs) await foo(x)` and pays one round trip
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

  it("discovers a deferred tool via nodetool.searchTools and calls it", async () => {
    const { step, task } = makeStep(ANSWER_SCHEMA);
    const context = createMockContext();
    const provider = createLoopProvider([
      {
        toolCalls: [
          codeAction(
            "tc_1",
            `const hits = await nodetool.searchTools("+lookup customer");
             return { importLine: hits[0] && hits[0].import };`
          )
        ]
      },
      {
        // The hit's own \`import\` line, written verbatim into the next
        // action — which is the whole loop now that the belt is imports.
        toolCalls: [
          codeAction(
            "tc_2",
            `import { lookup_customer } from "@nodetool-ai/sandbox-nodetool/session";
             const r = await lookup_customer({value: "c42"});
             await finish({
               answer:
                 r.echoed === "c42" &&
                 r.via === "lookup_customer"
                   ? 1
                   : 0
             });`
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
    // And the prompt points at it there, not at a `read_file(` signature.
    expect(systemPrompt).toContain("# Direct tools");
    expect(systemPrompt).not.toContain("await read_file(");
    expect(systemPrompt).toContain("await lookup_customer(");
  });

  it("offers model and node discovery as direct tools too", async () => {
    // A lookup is one question with one answer. Behind `execute_code` it cost
    // a sandbox round trip and the answer arrived only as whatever the action
    // chose to return.
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
        new NamedTool("find_model", "Find a model."),
        new NamedTool("search_nodes", "Search node types."),
        new NamedTool("get_node_info", "Describe a node type."),
        new NamedTool("run_node", "Run one node."),
        new NamedTool("lookup_customer", "Look up a customer record by id.")
      ]
    });
    for await (const msg of executor.execute()) void msg;

    for (const name of ["find_model", "search_nodes", "get_node_info"]) {
      expect(offered, `${name} should be a direct tool`).toContain(name);
    }
    // Running a node is execution, not discovery — it stays in the sandbox.
    expect(offered).not.toContain("run_node");
    expect(offered).not.toContain("lookup_customer");
    expect(systemPrompt).toContain("# Direct tools");
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
            `import { read_file } from "@nodetool-ai/sandbox-nodetool/files";
             const r = await read_file({value: "x"});
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

describe("CodeAct sandbox packages", () => {
  const DIGEST = "c".repeat(64);
  const source = "export const twice = (n) => n * 2;";
  const catalog = {
    summaries: () => [
      {
        specifier: "@acme/geo",
        packName: "@acme/nodetool-geo",
        kind: "js" as const,
        description: "Doubles a number."
      }
    ],
    diagnostics: () => [],
    resolveForExecution: () => ({
      modules: [
        {
          specifier: "@acme/geo",
          packName: "@acme/nodetool-geo",
          contentDigest: DIGEST,
          moduleId: "sandbox/geo.js",
          kind: "js" as const,
          source,
          graph: [
            {
              id: "sandbox/geo.js",
              kind: "js" as const,
              source,
              dependencies: [],
              internal: false
            }
          ]
        }
      ],
      statuses: []
    })
  };

  it("mounts an allowlisted import and advertises it in the prompt", async () => {
    const { step, task } = makeStep(ANSWER_SCHEMA);
    const context = createMockContext() as Record<string, unknown>;
    context["sandboxModuleCatalog"] = catalog;
    const provider = createLoopProvider([
      {
        toolCalls: [
          codeAction(
            "tc_1",
            `import { twice } from "@acme/geo";\nawait finish({answer: twice(21)});`
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
      tools: [],
      sandboxPackages: ["@acme/geo"]
    });
    for await (const _ of executor.execute()) void _;
    expect(executor.getResult()).toEqual({ answer: 42 });
  }, 60_000);

  it("refuses an import the session never allowed, as the observation", async () => {
    const { step, task } = makeStep();
    const context = createMockContext() as Record<string, unknown>;
    context["sandboxModuleCatalog"] = catalog;
    const observations: string[] = [];
    // A provider that keeps the observation the executor hands back, which is
    // the whole point: the model reads the refusal and can correct itself.
    const provider = {
      provider: "fake",
      hasToolSupport: async () => true,
      async *generateLoop(args: {
        tools?: Array<{
          name: string;
          execute?: (a: Record<string, unknown>) => Promise<string | unknown>;
        }>;
      }) {
        const tool = (args.tools ?? []).find((t) => t.name === "execute_code");
        const result = await tool?.execute?.({
          code: `import { twice } from "@acme/geo";\nreturn twice(1);`
        });
        observations.push(String(result));
        yield {
          type: "message",
          message: { role: "assistant", content: "cannot import that" }
        };
        yield { type: "chunk", content: "", done: true };
      }
    } as unknown as BaseProvider;

    const executor = new CodeActExecutor({
      task,
      step,
      context: context as never,
      provider,
      model: "m",
      tools: []
    });
    for await (const _ of executor.execute()) void _;

    const observation = JSON.parse(observations[0] ?? "{}") as {
      ok: boolean;
      error?: string;
    };
    expect(observation.ok).toBe(false);
    expect(observation.error).toContain("@acme/geo");
    expect(observation.error).toContain("allowlist");
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

/**
 * The run's bounds, seen from a step: `maxIterations` is what the whole step
 * may spend on model turns (nudge rounds included), and a deadline stops the
 * work in flight. Both failures have to name themselves — a step that ran out
 * of budget and reports "ended without calling finish()" sends the reader
 * looking for a prompt bug (invariants I-3, I-5).
 */
describe("CodeActExecutor run budget", () => {
  /**
   * Drives the real `BaseProvider.generateLoop`, so `maxIterations` and turn
   * admission behave exactly as they do in production. Every turn calls
   * `execute_code` except every `proseEvery`-th, which ends in prose — the one
   * shape that earns a finish-nudge round.
   */
  class ScriptedTurnProvider extends BaseProvider {
    readonly provider = "openai" as const;
    turns = 0;

    constructor(private readonly proseEvery: number) {
      super();
    }

    async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
      this.turns++;
      if (this.turns % this.proseEvery === 0) {
        yield { type: "chunk", content: "I will finish next time.", done: true };
        return;
      }
      yield {
        id: `call_${this.turns}`,
        name: "execute_code",
        args: { code: "return 1;" }
      };
    }

    async generateMessage(): Promise<never> {
      throw new Error("not used");
    }
  }

  /** A belt tool that reports each call, so a test can act on the first one. */
  class TickTool extends Tool {
    readonly name = "tick";
    readonly description = "Records a call.";
    calls = 0;
    constructor(private readonly onCall: () => void) {
      super();
    }
    async process(): Promise<unknown> {
      this.calls++;
      this.onCall();
      return { ok: true };
    }
  }

  const runBudget = (opts: Partial<Parameters<typeof createRunBudget>[0]>) =>
    createRunBudget({
      capUsd: null,
      maxOutputTokens: 2048,
      unpricedTokenCeiling: 400_000,
      deadlineMs: 600_000,
      maxConcurrency: 4,
      maxTurns: 1000,
      ...opts
    });

  it("spends maxIterations across the whole step, not once per nudge round", async () => {
    const { step, task } = makeStep(ANSWER_SCHEMA);
    const context = createMockContext();
    // Round shape: three tool turns then prose, which is what triggers a nudge.
    const provider = new ScriptedTurnProvider(4);

    const executor = new CodeActExecutor({
      task,
      step,
      context: context as never,
      provider,
      model: "gpt-4o-mini",
      tools: [],
      maxIterations: 4
    });
    const results: Array<{ type: string; error?: string }> = [];
    for await (const msg of executor.execute()) {
      results.push(msg as { type: string; error?: string });
    }

    // Two nudges used to hand each round the full four, for twelve turns.
    expect(provider.turns).toBe(4);
    expect(step.completed).toBe(false);
    expect(results.find((m) => m.type === "step_result")?.error).toContain(
      "exceeded 4 iterations"
    );
  });

  it("fails with the deadline reason when the run is already out of time", async () => {
    const { step, task } = makeStep(ANSWER_SCHEMA);
    const context = createMockContext();
    const provider = new ScriptedTurnProvider(1);
    const budget = runBudget({ deadlineMs: 0 });

    const executor = new CodeActExecutor({
      task,
      step,
      context: context as never,
      provider,
      model: "gpt-4o-mini",
      tools: [],
      turnBudget: budget
    });
    for await (const msg of executor.execute()) void msg;

    expect(provider.turns).toBe(0);
    expect(step.failed).toBe(true);
    expect(budget.exhausted?.kind).toBe("deadline");
    expect(step.error).toContain("run deadline");
    expect(step.error).not.toContain("without calling finish()");
  });

  it("aborts the action through the sandbox signal when the deadline passes mid-action", async () => {
    const { step, task } = makeStep(ANSWER_SCHEMA);
    const context = createMockContext();
    // A deadline the first bridged tool call trips, so expiry lands *inside*
    // the running action rather than before it starts.
    let outOfTime = false;
    const budget: RunBudget = {
      turns: { reserve: () => true, commit: () => {}, spentUsd: 0 },
      deadline: {
        at: Number.POSITIVE_INFINITY,
        remainingMs: () => (outOfTime ? 0 : 1000),
        expired: () => outOfTime
      },
      concurrency: createSemaphore(1),
      turnCount: createCounter(10),
      get exhausted() {
        return outOfTime
          ? { kind: "deadline" as const, detail: "run deadline of 1000ms reached" }
          : null;
      }
    };
    const tick = new TickTool(() => {
      outOfTime = true;
    });

    const observations: string[] = [];
    const provider = {
      provider: "fake",
      hasToolSupport: async () => true,
      async *generateLoop(args: {
        tools?: Array<{
          name: string;
          execute?: (a: Record<string, unknown>) => Promise<string | unknown>;
        }>;
      }) {
        const tool = (args.tools ?? []).find((t) => t.name === "execute_code");
        const result = await tool?.execute?.({
          code: `import { tick } from "@nodetool-ai/sandbox-nodetool/session";
                 await tick({});
                 await tick({});
                 await finish({answer: 1});`
        });
        observations.push(String(result));
        yield {
          type: "message",
          message: { role: "assistant", content: "ran out of time" }
        };
        yield { type: "chunk", content: "", done: true };
      }
    } as unknown as BaseProvider;

    const executor = new CodeActExecutor({
      task,
      step,
      context: context as never,
      provider,
      model: "m",
      tools: [tick],
      turnBudget: budget
    });
    for await (const msg of executor.execute()) void msg;

    // The second call never reached the tool, and the program never finished.
    expect(tick.calls).toBe(1);
    expect(step.completed).toBe(false);
    const observation = JSON.parse(observations[0] ?? "{}") as {
      ok: boolean;
      error?: string;
    };
    expect(observation.ok).toBe(false);
    // "Execution cancelled" is what the sandbox reports for an aborted run —
    // the action stopped on the signal, it did not merely see a failing call.
    expect(observation.error).toBe("Execution cancelled");
    expect(step.error).toContain("run deadline of 1000ms reached");
    expect(step.error).not.toContain("without calling finish()");
  });

  it("fails naming the cost cap when the budget refuses the first turn", async () => {
    const { step, task } = makeStep(ANSWER_SCHEMA);
    const context = createMockContext();
    const provider = new ScriptedTurnProvider(1);
    // Below one turn's worst case on a priced model.
    const budget = runBudget({ capUsd: 0.000001 });

    const executor = new CodeActExecutor({
      task,
      step,
      context: context as never,
      provider,
      model: "gpt-4o-mini",
      tools: [],
      turnBudget: budget
    });
    for await (const msg of executor.execute()) void msg;

    expect(provider.turns).toBe(0);
    expect(step.failed).toBe(true);
    expect(step.error).toContain("turn budget of $");
    expect(step.error).not.toContain("without calling finish()");
  });
});
