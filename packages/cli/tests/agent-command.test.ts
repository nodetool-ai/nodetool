/**
 * `nodetool agent run` is one CodeAct turn over the chat belt.
 *
 * The provider is real — `ScriptedProvider` driving the real `generateLoop`
 * and the real `processChat`, both imported from source because this package's
 * vitest config stubs unbuilt workspace packages. What is stubbed is the
 * toolbelt itself: the belt's own capabilities are covered in
 * `packages/agents`, and what this file pins is the CLI wiring — that an
 * `execute_code` action reports as a `tool_call_update`, that the run exits 0
 * with the final assistant text, and that `create_plan`/`execute_plan` reach
 * the belt a plan-shaped objective needs.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@nodetool-ai/config", async () => {
  const stub = await import("./__stubs__/nodetool.js");
  const noop = () => {};
  const log = { debug: noop, info: noop, warn: noop, error: noop };
  return {
    ...stub,
    createLogger: () => log,
    configureLogging: noop,
    getNodeBuiltinSync: () => undefined
  };
});

vi.mock("@nodetool-ai/runtime", async () => {
  const stub = await import("./__stubs__/nodetool.js");
  const types = await import("../../runtime/src/providers/types.js");
  const budget = await import("../../runtime/src/turn-budget.js");
  return {
    ...stub,
    ACTIVE_MODEL_CONTEXT_KEY: "active_agent_model",
    // The stub context resolves no media; the real one returns undefined
    // for a context without resolveMessageMediaUris, same as here.
    mediaResolverFor: () => undefined,
    isProviderSessionUpdate: types.isProviderSessionUpdate,
    isProviderMessageEvent: types.isProviderMessageEvent,
    isProviderStop: types.isProviderStop,
    isChunk: types.isChunk,
    isToolCall: types.isToolCall,
    // The real budget: what this file pins is that the CLI builds one and
    // reports the ceiling it hit, which a stub that admits everything could
    // not show.
    createRunBudget: budget.createRunBudget,
    isRunBudget: budget.isRunBudget,
    budgetFromContext: budget.budgetFromContext,
    RUN_BUDGET_CONTEXT_KEY: budget.RUN_BUDGET_CONTEXT_KEY
  };
});

/** The `Tool` base the CLI's CodeAct wiring subclasses. */
class StubTool {
  readonly name: string = "";
  readonly description: string = "";
  protected readonly jsonSchema: unknown = {
    type: "object",
    properties: {}
  };
  get inputSchema(): unknown {
    return this.jsonSchema;
  }
  toProviderTool(): {
    name: string;
    description: string;
    inputSchema: unknown;
  } {
    return {
      name: this.name,
      description: this.description,
      inputSchema: this.inputSchema
    };
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
  static stripMessage(
    args: Record<string, unknown>
  ): Record<string, unknown> {
    return args;
  }
  static async executeTool(
    tool: StubTool,
    context: unknown,
    params: Record<string, unknown>
  ): Promise<unknown> {
    return tool.process(context, params);
  }
}

/** A named belt tool with no behaviour — only its name reaches the session. */
class NamedTool extends StubTool {
  constructor(
    override readonly name: string,
    override readonly description = `${name} tool`
  ) {
    super();
  }
}

/** Names the sandbox session was handed, one entry per built turn. */
const sessionBelts: string[][] = [];
/** Code bodies the scripted `execute_code` action ran. */
const actionsRun: string[] = [];
/** Every `gateTools` call: the names wrapped, and the gate they were given. */
const gatedWith: Array<{ names: string[]; gate: unknown }> = [];
/** Every gate a capability run was built over. */
const runGates: unknown[] = [];
/** Whatever the run put on the context, keyed by the variable name. */
const contextVariables = new Map<string, unknown>();

vi.mock("@nodetool-ai/agents", async () => {
  const agentsStub = await import("./__stubs__/nodetool.js");
  return {
    ...agentsStub,
    Tool: StubTool,
    extractInjectableImages: () => null,
    stripImagePayload: (value: unknown) => value,
    truncateToolResult: (value: string) => value,
    getBuiltinTools: () => [new NamedTool("read_file")],
    getAllMcpTools: () => [new NamedTool("list_workflows")],
    BackgroundSubtaskRegistry: class {},
    // The real classification map, headless gate and context key: the CLI's
    // gate is supposed to be the shared one, not a second table.
    ...(await import("../../agents/src/tools/tool-permissions.js")),
  // The gate contract now lives in runtime, which this suite stubs; the real
  // module goes last so the stubbed re-export cannot shadow it.
  ...(await import("../../runtime/src/permission-gate.js")),
    PERMISSION_GATE_CONTEXT_KEY: "nodetool_permission_gate",
    gateTools: (tools: NamedTool[], gate: unknown) => {
      gatedWith.push({ names: tools.map((t) => t.name), gate });
      return tools;
    },
    contextSecretAvailability: () => new Set<string>(),
    createCapabilityRun: ({ gate }: { gate: unknown }) => {
      runGates.push(gate);
      return {};
    },
    toolForCapabilityName: (
      name: string,
      run?: (context: unknown) => unknown
    ) => {
      // `LazyCapabilityTool` builds the run from the context on each call.
      // Building it here is that same construction, so the gate a delegated
      // loop would carry is observable without invoking the capability.
      if (typeof run === "function") run({});
      return new NamedTool(name);
    },
    createChatCodeActSession: (options: { tools: Array<{ name: string }> }) => {
      sessionBelts.push(options.tools.map((t) => t.name));
      return {
        providerTool: {
          name: "execute_code",
          description: "Run one JavaScript action in the sandbox.",
          inputSchema: { type: "object", properties: {} }
        },
        systemPromptSection: "CODEACT CONTRACT",
        executeAction: async (args: Record<string, unknown>) => {
          actionsRun.push(String(args["code"] ?? ""));
          return JSON.stringify({ ok: true });
        },
        toolCallCount: () => 0
      };
    }
  };
});

vi.mock("@nodetool-ai/chat", async () => {
  const real = await import("../../chat/src/message-processor.js");
  return { processChat: real.processChat };
});

vi.mock("@nodetool-ai/websocket", () => ({ mcpToolHostDeps: () => ({}) }));
vi.mock("../src/node-registry.js", () => ({ buildFullRegistry: () => ({}) }));
vi.mock("../src/chat-context.js", () => ({
  createChatContext: async () => ({
    set: (key: string, value: unknown) => contextVariables.set(key, value),
    registerProvider: () => {}
  })
}));

const scriptedCalls: unknown[][] = [];
vi.mock("../src/providers.js", () => ({
  buildConfiguredProviders: async () => ({}),
  createProvider: async () => currentProvider
}));

const { ScriptedProvider, textScript, toolCallScript } = await import(
  "../../runtime/src/providers/scripted-provider.js"
);
const { runAgentCommand } = await import("../src/commands/agent.js");
const { headlessDenialReason } = await import(
  "../../runtime/src/permission-gate.js"
);

let currentProvider: InstanceType<typeof ScriptedProvider>;

/** stderr/stdout captured for one `runAgentCommand` call. */
async function runWithCapture(
  provider: InstanceType<typeof ScriptedProvider>,
  opts: Record<string, unknown>
): Promise<{ code: number; stdout: string; events: unknown[] }> {
  currentProvider = provider;
  const stdout: string[] = [];
  const stderr: string[] = [];
  const outSpy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: string | Uint8Array) => {
      stdout.push(String(chunk));
      return true;
    });
  const errSpy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((chunk: string | Uint8Array) => {
      stderr.push(String(chunk));
      return true;
    });
  try {
    const code = await runAgentCommand({
      provider: "openai",
      model: "test-model",
      json: true,
      ...opts
    });
    const events = stderr
      .join("")
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line));
    return { code, stdout: stdout.join(""), events };
  } finally {
    outSpy.mockRestore();
    errSpy.mockRestore();
  }
}

beforeEach(() => {
  sessionBelts.length = 0;
  actionsRun.length = 0;
  scriptedCalls.length = 0;
  gatedWith.length = 0;
  runGates.length = 0;
  contextVariables.clear();
});

describe("nodetool agent run", () => {
  it("streams a tool_call_update for an execute_code action and exits 0", async () => {
    const provider = new ScriptedProvider([
      toolCallScript("execute_code", {
        title: "List the workflows",
        code: "await nodetool.workflows.list();"
      }),
      textScript("You have three workflows.")
    ]);

    const { code, stdout, events } = await runWithCapture(provider, {
      objective: "list my workflows"
    });

    const toolCalls = events.filter(
      (e): e is { type: string; name: string } =>
        (e as { type?: string }).type === "tool_call_update"
    );
    expect(toolCalls.map((e) => e.name)).toContain("execute_code");
    expect(actionsRun).toEqual(["await nodetool.workflows.list();"]);
    expect(stdout.trim()).toBe("You have three workflows.");
    expect(code).toBe(0);
  });

  it("puts create_plan and execute_plan on the belt for a plan-shaped objective", async () => {
    const provider = new ScriptedProvider([
      textScript("Planning is available.")
    ]);

    const { code } = await runWithCapture(provider, {
      objective: "plan and run a three-stage research pipeline"
    });

    expect(code).toBe(0);
    expect(sessionBelts).toHaveLength(1);
    expect(sessionBelts[0]).toEqual(
      expect.arrayContaining(["create_plan", "execute_plan"])
    );
  });

  it("fails the run when the turn produced no final assistant text", async () => {
    // A turn that ends on a contentless assistant message: `processChat` drops
    // it, so the transcript carries no answer at all.
    const provider = new ScriptedProvider([() => []]);

    const { code, stdout, events } = await runWithCapture(provider, {
      objective: "list my workflows"
    });

    expect(code).toBe(1);
    expect(stdout).toBe("");
    expect(
      events.some(
        (e) =>
          (e as { type?: string }).type === "error" &&
          String((e as { message?: string }).message).includes("no answer")
      )
    ).toBe(true);
  });

  it("reports a provider failure as an error event and exit code 1", async () => {
    const provider = new ScriptedProvider([
      () => {
        throw new Error("provider exploded");
      }
    ]);

    const { code, events } = await runWithCapture(provider, {
      objective: "list my workflows"
    });

    expect(code).toBe(1);
    expect(
      events.some(
        (e) =>
          (e as { type?: string }).type === "error" &&
          String((e as { message?: string }).message).includes(
            "provider exploded"
          )
      )
    ).toBe(true);
  });
});

describe("the gate a CLI run belts through", () => {
  it("wraps the platform belt and execute_plan in one shared gate", async () => {
    const provider = new ScriptedProvider([textScript("Ready.")]);

    const { code } = await runWithCapture(provider, {
      objective: "list my workflows"
    });

    expect(code).toBe(0);
    // Vitest runs with stdin piped, so this is the headless path: `auto`, with
    // the refusal named once.
    const gate = contextVariables.get("nodetool_permission_gate");
    expect(gate).toMatchObject({ mode: "auto" });

    // The platform belt goes through the ladder, as chat's does...
    const beltNames = gatedWith.flatMap((call) => call.names);
    expect(beltNames).toEqual(
      expect.arrayContaining(["read_file", "list_workflows", "execute_plan"])
    );
    // ...through the gate the host built, not one per call site.
    for (const call of gatedWith) expect(call.gate).toBe(gate);
    // Non-empty first: an identity check over nothing passes on nothing.
    expect(runGates.length).toBeGreaterThan(0);
    for (const runGate of runGates) expect(runGate).toBe(gate);

    // Spawning a child loop is not itself an action: those stay ungated, and
    // the child acts through the gated belt above.
    expect(beltNames).not.toContain("run_subtask");
    expect(beltNames).not.toContain("create_plan");
  });

  it("names the headless refusal once, in the event stream", async () => {
    const provider = new ScriptedProvider([textScript("Ready.")]);

    const { events } = await runWithCapture(provider, {
      objective: "list my workflows"
    });

    const notices = events.filter(
      (e) =>
        (e as { type?: string }).type === "log_update" &&
        String((e as { content?: string }).content).includes(
          "nodetool agent run"
        )
    );
    expect(notices).toHaveLength(1);
    expect(String((notices[0] as { content: string }).content)).toBe(
      headlessDenialReason("nodetool agent run")
    );
  });
});

describe("the budget a CLI run holds", () => {
  it("refuses the run before the first model call when --cost-cap is below one turn", async () => {
    const provider = new ScriptedProvider([textScript("never reached")]);

    const { code, stdout, events } = await runWithCapture(provider, {
      objective: "list my workflows",
      model: "gpt-4o",
      costCap: "0.01"
    });

    // The cap is admission, not accounting: the turn is refused before the
    // provider is asked for anything.
    expect(provider.callLog).toHaveLength(0);
    expect(code).toBe(1);
    expect(stdout).toBe("");
    const errors = events.filter(
      (e) => (e as { type?: string }).type === "error"
    );
    expect(errors).toHaveLength(1);
    expect(String((errors[0] as { message: string }).message)).toContain(
      "turn budget of $0.01 reached"
    );
  });

  it("stops with the deadline reason when --timeout leaves the run no time", async () => {
    const provider = new ScriptedProvider([textScript("never reached")]);

    const { code, events } = await runWithCapture(provider, {
      objective: "list my workflows",
      timeout: "0"
    });

    expect(provider.callLog).toHaveLength(0);
    expect(code).toBe(1);
    const errors = events.filter(
      (e) => (e as { type?: string }).type === "error"
    );
    expect(errors).toHaveLength(1);
    expect(String((errors[0] as { message: string }).message)).toContain(
      "run deadline of 0ms reached"
    );
  });
});
