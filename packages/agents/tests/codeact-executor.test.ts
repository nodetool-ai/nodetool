/**
 * CodeActExecutor harness tests — a scripted provider drives code actions
 * through the real QuickJS sandbox and tool bridge. No network, no model.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  CodeActExecutor,
  FINISH_CONTRACT_NUDGE,
  REPEATED_ACTION_LIMIT
} from "../src/codeact/codeact-executor.js";
import { MAX_ACTION_RESULT_CHARS } from "../src/constants.js";
import { Tool } from "../src/tools/base-tool.js";
import type { Step, Task } from "../src/types.js";
import type {
  Message,
  ProcessingContext,
  ProviderStreamItem,
  RunBudget,
  ToolCall
} from "@nodetool-ai/runtime";
import {
  BaseProvider,
  createCounter,
  createRunBudget,
  createSemaphore,
  generationRegistry
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

  it("reports what each bridged call returned", async () => {
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
             await finish({answer: first.sum});`
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

    const results: Array<Record<string, unknown>> = [];
    for await (const msg of executor.execute()) {
      if (msg.type === "tool_result_update") {
        results.push(msg as unknown as Record<string, unknown>);
      }
    }

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      name: "add",
      is_error: false,
      result: { sum: 3 }
    });
    expect(results[0].tool_call_id).toBe(
      "codeact_1"
    );
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

  /**
   * Six paid clips came back and the action died on the deadline before it
   * wrote their URIs down. The assets were saved; nothing said so, and the next
   * turn generated them again.
   */
  it("names the generations it already paid for when the deadline stops it", async () => {
    const { step, task } = makeStep(ANSWER_SCHEMA);
    const context = createMockContext();
    generationRegistry.reset();
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
          ? {
              kind: "deadline" as const,
              detail: "run deadline of 1000ms reached"
            }
          : null;
      }
    };
    // The generation completes inside the step, as a paid call does, and the
    // deadline trips on the same call — the shape that lost the six clips.
    const tick = new TickTool(() => {
      generationRegistry.register("gen-1", {
        userId: "test-user",
        abort: () => {}
      });
      generationRegistry.settle("gen-1", {
        status: "completed",
        asset_ids: ["asset-9"],
        receipt: null
      });
      outOfTime = true;
    });

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
        await tool?.execute?.({
          code: `import { tick } from "@nodetool-ai/sandbox-nodetool/session";
                 await tick({});
                 await tick({});
                 await finish({answer: 1});`
        });
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

    expect(tick.calls).toBe(1);
    expect(step.error).toContain("run deadline of 1000ms reached");
    expect(step.error).toContain("gen-1");
    expect(step.error).toContain("asset-9");
    expect(step.error).toContain("reuse them instead of generating again");
    generationRegistry.reset();
  });

  it("says nothing about paid work when the step generated none", async () => {
    const { step, task } = makeStep(ANSWER_SCHEMA);
    const context = createMockContext();
    const provider = new ScriptedTurnProvider(1);
    generationRegistry.reset();

    const executor = new CodeActExecutor({
      task,
      step,
      context: context as never,
      provider,
      model: "gpt-4o-mini",
      tools: [],
      turnBudget: runBudget({ deadlineMs: 0 })
    });
    for await (const msg of executor.execute()) void msg;

    expect(step.error).toContain("run deadline");
    expect(step.error).not.toContain("reuse them");
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

/**
 * The finish nudge asks a model to complete work it already did. Asked without
 * the observations that work produced, it is a repetition of the brief.
 */
describe("CodeActExecutor finish nudge", () => {
  /** Acts once, then answers in prose — the shape that earns a nudge. */
  class ActThenProseProvider extends BaseProvider {
    readonly provider = "openai" as const;
    turns = 0;

    async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
      this.turns++;
      if (this.turns === 1) {
        yield {
          id: "call_1",
          name: "execute_code",
          args: { code: "return { partial: 41 };" }
        };
        return;
      }
      yield { type: "chunk", content: "The partial answer is 41.", done: true };
    }

    async generateMessage(): Promise<never> {
      throw new Error("not used");
    }
  }

  it("carries the round's observations into the nudged request", async () => {
    const { step, task } = makeStep(ANSWER_SCHEMA);
    const context = createMockContext();
    const provider = new ActThenProseProvider();
    const requests: Message[][] = [];
    const inner = provider.generateLoop.bind(provider);
    provider.generateLoop = ((args: { messages: Message[] }) => {
      // Snapshot per round: the executor passes its own `history` array and
      // keeps appending to it, so the live reference would read as the last
      // round for every round.
      requests.push([...args.messages]);
      return inner(args as never);
    }) as typeof provider.generateLoop;

    const executor = new CodeActExecutor({
      task,
      step,
      context: context as never,
      provider,
      model: "gpt-4o-mini",
      tools: []
    });
    for await (const msg of executor.execute()) void msg;

    expect(requests.length).toBeGreaterThan(1);
    const nudged = requests[1] as Message[];

    // The observation the first round computed from is in the second round's
    // request, not just the prose the model closed on.
    const observations = nudged.filter((m) => m.role === "tool");
    expect(observations).toHaveLength(1);
    expect(String(observations[0]?.content)).toContain("partial");
    expect(String(observations[0]?.content)).toContain("41");

    // The action that produced it rides along, so the result is not orphaned.
    const action = nudged.find(
      (m) => m.role === "assistant" && (m.toolCalls?.length ?? 0) > 0
    );
    expect(action?.toolCalls?.[0]?.id).toBe(observations[0]?.toolCallId);

    // And the nudge is still the last thing the model is asked.
    expect(nudged[nudged.length - 1]).toEqual({
      role: "user",
      content: FINISH_CONTRACT_NUDGE
    });
  });
});

/**
 * Wraps a loop provider so every `execute_code` observation it hands back is
 * recorded, and the system prompt of the first request is kept.
 */
function recordObservations(provider: BaseProvider): {
  observations: string[];
  systemPrompt: () => string;
} {
  const observations: string[] = [];
  let systemPrompt = "";
  const inner = provider.generateLoop.bind(provider);
  provider.generateLoop = ((args: {
    tools?: Array<{
      name: string;
      execute?: (a: Record<string, unknown>) => Promise<unknown>;
    }>;
    messages: Array<{ role: string; content?: unknown }>;
  }) => {
    systemPrompt = String(
      args.messages.find((m) => m.role === "system")?.content ?? ""
    );
    const tools = (args.tools ?? []).map((tool) => {
      if (tool.name !== "execute_code" || !tool.execute) return tool;
      const execute = tool.execute;
      return {
        ...tool,
        execute: async (a: Record<string, unknown>) => {
          const out = await execute(a);
          observations.push(
            typeof out === "string"
              ? out
              : String((out as Array<{ text?: string }>)[0]?.text ?? "")
          );
          return out;
        }
      };
    });
    return inner({ ...args, tools } as never);
  }) as typeof provider.generateLoop;
  return { observations, systemPrompt: () => systemPrompt };
}

describe("CodeActExecutor closed sandbox", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    (globalThis as { fetch: typeof originalFetch }).fetch = originalFetch;
  });

  it("refuses bare fetch and getSecret inside a step action", async () => {
    const hostFetch = vi.fn(async () => new Response("{}", { status: 200 }));
    (globalThis as { fetch: unknown }).fetch = hostFetch;
    const { step, task } = makeStep(ANSWER_SCHEMA);
    const context = createMockContext();
    context.getSecret = vi.fn(async () => "sk-live-secret");
    const provider = createLoopProvider([
      {
        toolCalls: [
          codeAction(
            "tc_1",
            `const errors = [];
             try { await getSecret("OPENAI_API_KEY"); } catch (e) { errors.push(e.message); }
             try { await fetch("https://example.com/exfil"); } catch (e) { errors.push(e.message); }
             return { errors };`
          )
        ]
      }
    ]);
    const { observations } = recordObservations(provider);
    const executor = new CodeActExecutor({
      task,
      step,
      context: context as never,
      provider,
      model: "m",
      tools: []
    });
    for await (const msg of executor.execute()) void msg;

    const observation = JSON.parse(observations[0]) as {
      ok: boolean;
      result: { errors: string[] };
    };
    expect(observation.ok).toBe(true);
    expect(observation.result.errors).toHaveLength(2);
    expect(observation.result.errors[0]).toMatch(/declares no secrets/);
    expect(observation.result.errors[1]).toMatch(/Fetch limit exceeded \(max 0/);
    expect(hostFetch).not.toHaveBeenCalled();
    expect(context.getSecret).not.toHaveBeenCalled();
  });
});

describe("CodeActExecutor observation envelope", () => {
  it("keeps finished:false and the note ahead of a result that had to be cut", async () => {
    const { step, task } = makeStep(ANSWER_SCHEMA);
    const context = createMockContext();
    const provider = createLoopProvider([
      {
        toolCalls: [
          codeAction(
            "tc_1",
            `return { answer: 1, blob: "x".repeat(${MAX_ACTION_RESULT_CHARS * 4}) };`
          )
        ]
      },
      { toolCalls: [codeAction("tc_2", `await finish({answer: 1});`)] }
    ]);
    const { observations } = recordObservations(provider);
    const executor = new CodeActExecutor({
      task,
      step,
      context: context as never,
      provider,
      model: "m",
      tools: []
    });
    for await (const msg of executor.execute()) void msg;

    const text = observations[0];
    // The whole envelope parses: the cut landed inside `result`, not across
    // the JSON.
    const observation = JSON.parse(text) as {
      ok: boolean;
      finished: boolean;
      note: string;
      result: unknown;
    };
    expect(observation.ok).toBe(true);
    expect(observation.finished).toBe(false);
    expect(observation.note).toMatch(/NOT finished/);
    expect(typeof observation.result).toBe("string");
    expect(observation.result).toContain("tool result truncated");
    expect(observation.result).toContain("compact summary");
    expect(Object.keys(observation).indexOf("finished")).toBeLessThan(
      Object.keys(observation).indexOf("result")
    );
    expect(text.length).toBeLessThan(MAX_ACTION_RESULT_CHARS + 2000);
  });

  it("bounds chatty logs on their own and says how many lines were cut", async () => {
    const { step, task } = makeStep(ANSWER_SCHEMA);
    const context = createMockContext();
    const provider = createLoopProvider([
      {
        toolCalls: [
          codeAction(
            "tc_1",
            `for (let i = 0; i < 400; i++) console.log("line " + i + " " + "y".repeat(100));
             return { answer: 2 };`
          )
        ]
      },
      { toolCalls: [codeAction("tc_2", `await finish({answer: 2});`)] }
    ]);
    const { observations } = recordObservations(provider);
    const executor = new CodeActExecutor({
      task,
      step,
      context: context as never,
      provider,
      model: "m",
      tools: []
    });
    for await (const msg of executor.execute()) void msg;

    const observation = JSON.parse(observations[0]) as {
      finished: boolean;
      result: { answer: number };
      logs: string[];
    };
    expect(observation.finished).toBe(false);
    expect(observation.result).toEqual({ answer: 2 });
    expect(observation.logs.length).toBeLessThan(400);
    expect(observation.logs[observation.logs.length - 1]).toMatch(
      /of 400 log lines omitted/
    );
  });
});

describe("CodeActExecutor repeated failure", () => {
  it("tells the model the same program already failed the same way", async () => {
    const { step, task } = makeStep(ANSWER_SCHEMA);
    const context = createMockContext();
    const crashing = `const x = null; return x.answer;`;
    const provider = createLoopProvider([
      { toolCalls: [codeAction("tc_1", crashing)] },
      { toolCalls: [codeAction("tc_2", crashing)] },
      { toolCalls: [codeAction("tc_3", `await finish({answer: 5});`)] }
    ]);
    const { observations } = recordObservations(provider);
    const executor = new CodeActExecutor({
      task,
      step,
      context: context as never,
      provider,
      model: "m",
      tools: []
    });
    for await (const msg of executor.execute()) void msg;

    expect(REPEATED_ACTION_LIMIT).toBe(2);
    const first = JSON.parse(observations[0]) as {
      ok: boolean;
      error: string;
      repeated?: boolean;
    };
    const second = JSON.parse(observations[1]) as {
      ok: boolean;
      error: string;
      repeated?: boolean;
    };
    expect(first.ok).toBe(false);
    expect(first.repeated).toBeUndefined();
    expect(second.ok).toBe(false);
    expect(second.repeated).toBe(true);
    expect(second.error).toMatch(/already run 2 times in a row/);
    expect(second.error).toContain(first.error);
    // Counted against the budget like any action, and the step goes on.
    expect(step.completed).toBe(true);
    expect(executor.getResult()).toEqual({ answer: 5 });
  });

  it("does not flag a different program that fails the same way", async () => {
    const { step, task } = makeStep(ANSWER_SCHEMA);
    const context = createMockContext();
    const provider = createLoopProvider([
      { toolCalls: [codeAction("tc_1", `const x = null; return x.answer;`)] },
      { toolCalls: [codeAction("tc_2", `const y = null; return y.answer;`)] },
      { toolCalls: [codeAction("tc_3", `await finish({answer: 5});`)] }
    ]);
    const { observations } = recordObservations(provider);
    const executor = new CodeActExecutor({
      task,
      step,
      context: context as never,
      provider,
      model: "m",
      tools: []
    });
    for await (const msg of executor.execute()) void msg;
    const second = JSON.parse(observations[1]) as { repeated?: boolean };
    expect(second.repeated).toBeUndefined();
  });
});

describe("CodeAct resident tools past the defer threshold", () => {
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

  it("renders the full signature of a resident tool no direct offer or object model covers", async () => {
    const { step, task } = makeStep(ANSWER_SCHEMA);
    const context = createMockContext();
    const provider = createLoopProvider([
      { toolCalls: [codeAction("tc_1", `await finish({answer: 1});`)] }
    ]);
    const { systemPrompt } = recordObservations(provider);
    // `run_search` is resident, is not in DIRECT_TOOL_NAMES, and the object
    // model wraps no `run_search`; the fillers push the catalog past the
    // threshold so the split actually runs.
    const executor = new CodeActExecutor({
      task,
      step,
      context: context as never,
      provider,
      model: "m",
      tools: [
        new NamedTool("run_search", "Delegate a read-only search."),
        new NamedTool("lookup_customer", "Look up a customer record by id."),
        ...Array.from(
          { length: 20 },
          (_, i) => new NamedTool(`filler_tool_${i}`, `Filler tool ${i}.`)
        )
      ]
    });
    for await (const msg of executor.execute()) void msg;

    const prompt = systemPrompt();
    expect(prompt).toContain("await run_search(");
    expect(prompt).toContain("lookup_customer");
    expect(prompt).not.toContain("await lookup_customer(");
  });
});
