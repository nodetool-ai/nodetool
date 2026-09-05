/**
 * `authorGraph` — the parts that do not need a live model.
 *
 * The brief, the preamble and the belt are what this module owns, so they are
 * asserted directly. The loop itself is covered end to end by a scripted
 * provider driving one real code action through the real QuickJS sandbox over
 * the real shipped DSL pack: what that proves is the capture path — a graph
 * built inside the sandbox reaches the caller through `finish()`.
 */

import { describe, it, expect } from "vitest";
import type {
  BaseProvider,
  ProcessingContext,
  ProviderStreamItem,
  ProviderTool,
  SandboxModuleCatalog
} from "@nodetool-ai/runtime";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import type { PlanningUpdate, ProcessingMessage } from "@nodetool-ai/protocol";

import {
  authorGraph,
  buildAuthoringBelt,
  buildAuthoringPreamble,
  buildBrief,
  type AuthorGraphOptions
} from "../src/author-graph.js";
import { GRAPH_DSL_PACKAGE } from "../src/codeact/graph-dsl-package.js";
import { PERMISSION_GATE_CONTEXT_KEY } from "../src/types.js";
import type { PermissionGateOptions } from "../src/tools/tool-permissions.js";
import { shippedPackCatalog } from "../src/evals/codeact-sandbox-pack-cases.js";
import { createMockContext } from "./_helpers/mock-context.js";

const registry = {
  has: () => true,
  getMetadata: () => undefined,
  validateNode: () => []
} as unknown as NodeRegistry;

/**
 * A provider that replays one code action, the way `generateLoop` drives it,
 * and keeps the system prompt it was handed.
 */
function scriptedProvider(code: string): BaseProvider & { systemPrompt: string } {
  const provider = {
    provider: "scripted",
    systemPrompt: "",
    hasToolSupport: async () => true,
    getTotalCost: () => 0,
    async *generateLoop(args: {
      messages?: Array<{ role: string; content?: unknown }>;
      tools?: ProviderTool[];
    }): AsyncGenerator<ProviderStreamItem> {
      const system = (args.messages ?? []).find((m) => m.role === "system");
      provider.systemPrompt = String(system?.content ?? "");
      const tool = (args.tools ?? []).find((t) => t.name === "execute_code");
      const call = { title: "Author the graph", code };
      yield { id: "call_1", name: "execute_code", args: call } as ProviderStreamItem;
      await tool?.execute?.(call, "call_1");
      yield { type: "chunk", content: "", done: true } as ProviderStreamItem;
    }
  };
  return provider as unknown as BaseProvider & { systemPrompt: string };
}

/** A mock context carrying the catalog the guest loader will read. */
function contextWith(catalog: SandboxModuleCatalog | null): ProcessingContext {
  return Object.assign(createMockContext(), {
    sandboxModuleCatalog: catalog
  }) as unknown as ProcessingContext;
}

function options(
  overrides: Partial<AuthorGraphOptions> = {}
): AuthorGraphOptions {
  return {
    context: contextWith(null),
    provider: scriptedProvider("await finish({ nodes: [], edges: [] });"),
    model: "m",
    registry,
    ...overrides
  };
}

async function drain(
  gen: AsyncGenerator<ProcessingMessage, unknown>
): Promise<{ messages: ProcessingMessage[]; value: unknown }> {
  const messages: ProcessingMessage[] = [];
  let next = await gen.next();
  while (!next.done) {
    messages.push(next.value);
    next = await gen.next();
  }
  return { messages, value: next.value };
}

const planningUpdates = (messages: ProcessingMessage[]): PlanningUpdate[] =>
  messages.filter((m): m is PlanningUpdate => m.type === "planning_update");

describe("authorGraph brief", () => {
  it("names every runtime parameter and how to wire it", () => {
    const brief = buildBrief("Summarize a page", options({ inputs: { url: "https://x" } }));
    expect(brief).toContain("Objective: Summarize a page");
    expect(brief).toContain("- url: \"https://x\"");
    expect(brief).toContain("`name` property set to that key EXACTLY");
  });

  it("says so when the workflow takes no parameters and offers no tools", () => {
    const brief = buildBrief("Say hi", options());
    expect(brief).toContain("None — the workflow takes no runtime parameters.");
    expect(brief).toContain("No execution tools available.");
    expect(brief).toContain("None specified");
  });

  it("carries the output schema verbatim", () => {
    const brief = buildBrief(
      "Draft",
      options({ outputSchema: { type: "object", properties: { text: { type: "string" } } } })
    );
    expect(brief).toContain('"text"');
  });
});

describe("authorGraph preamble", () => {
  it("renders the shared authoring knowledge and the finishing rule", () => {
    const preamble = buildAuthoringPreamble(options());
    expect(preamble).toContain("## Picking nodes");
    expect(preamble).toContain("nodetool.workflows.validate(graph)");
    expect(preamble).toContain("finish(graph)");
  });

  it("does not repeat the DSL section the CodeAct prompt already renders", () => {
    // `GRAPH_DSL_PROMPT_SECTION`'s own heading — one copy of the mechanics.
    expect(buildAuthoringPreamble(options())).not.toContain(
      "# Authoring a workflow graph"
    );
  });

  it("layers a caller preamble before the knowledge", () => {
    const preamble = buildAuthoringPreamble(
      options({ systemPrompt: "House style: terse." })
    );
    expect(preamble.indexOf("House style: terse.")).toBeLessThan(
      preamble.indexOf("## Picking nodes")
    );
  });
});

describe("authorGraph belt", () => {
  it("carries discovery, graph validation and the code harness", () => {
    const names = buildAuthoringBelt(options()).map((t) => t.name);
    expect(names).toEqual([
      "search_nodes",
      "get_node_info",
      "list_nodes",
      "validate_workflow",
      "validate_code",
      "run_code",
      "test_code"
    ]);
  });

  it("adds find_model only when providers are configured", () => {
    const providers = { openai: {} as BaseProvider };
    expect(buildAuthoringBelt(options({ providers })).map((t) => t.name)).toContain(
      "find_model"
    );
    expect(buildAuthoringBelt(options({ providers: {} })).map((t) => t.name)).not.toContain(
      "find_model"
    );
  });
});

describe("authorGraph belt gate", () => {
  const planGate = (): PermissionGateOptions => ({
    mode: "plan",
    sessionAllow: new Set<string>(),
    requestApproval: async () => "allow"
  });

  it("blocks run_code under a plan-mode gate handed in explicitly", async () => {
    const belt = buildAuthoringBelt(options({ gate: planGate() }));
    const runCode = belt.find((t) => t.name === "run_code");
    expect(runCode).toBeDefined();
    const result = await runCode!.process(contextWith(null), {
      code: "export default () => 1"
    });
    expect(result).toMatchObject({ error: "blocked_in_plan_mode" });
  });

  it("reads the parent run's gate off the context when none is passed", async () => {
    const context = contextWith(null);
    context.set(PERMISSION_GATE_CONTEXT_KEY, planGate());
    const belt = buildAuthoringBelt(options({ context }));
    const testCode = belt.find((t) => t.name === "test_code");
    expect(testCode).toBeDefined();
    const result = await testCode!.process(context, {
      code: "export default () => 1",
      cases: []
    });
    expect(result).toMatchObject({ error: "blocked_in_plan_mode" });
  });

  it("does not gate discovery: search_nodes is read-class in plan mode", async () => {
    const searchable = {
      ...registry,
      listMetadata: () => []
    } as unknown as NodeRegistry;
    const belt = buildAuthoringBelt(
      options({ gate: planGate(), registry: searchable })
    );
    const search = belt.find((t) => t.name === "search_nodes");
    expect(search).toBeDefined();
    const result = await search!.process(contextWith(null), { query: "x" });
    expect(result).not.toMatchObject({ error: "blocked_in_plan_mode" });
  });
});

describe("authorGraph run", () => {
  it("fails fast, without a provider turn, when the DSL pack is not served", async () => {
    let turns = 0;
    const provider = {
      provider: "counting",
      hasToolSupport: async () => true,
      getTotalCost: () => 0,
      async *generateLoop(): AsyncGenerator<ProviderStreamItem> {
        turns += 1;
        yield { type: "chunk", content: "", done: true } as ProviderStreamItem;
      }
    } as unknown as BaseProvider;

    const { messages, value } = await drain(
      authorGraph("Anything", options({ provider }))
    );

    expect(value).toBeNull();
    expect(turns).toBe(0);
    const failure = planningUpdates(messages).at(-1);
    expect(failure?.status).toBe("failed");
    expect(failure?.content).toContain(GRAPH_DSL_PACKAGE);
  });

  it("returns the graph the action built inside the sandbox", async () => {
    const code = [
      `import { workflow } from "${GRAPH_DSL_PACKAGE}";`,
      `import { stringInput } from "${GRAPH_DSL_PACKAGE}/nodetool.input";`,
      `import { output } from "${GRAPH_DSL_PACKAGE}/nodetool.output";`,
      'const topic = stringInput({ name: "topic" });',
      'const graph = workflow(output({ name: "result", value: topic.output() }));',
      "await finish(graph);"
    ].join("\n");

    const provider = scriptedProvider(code);
    const { messages, value } = await drain(
      authorGraph(
        "Echo the topic",
        options({
          provider,
          inputs: { topic: "otters" },
          context: contextWith(shippedPackCatalog())
        })
      )
    );

    const graph = value as { nodes: unknown[]; edges: unknown[] } | null;
    expect(graph).not.toBeNull();
    expect(graph!.nodes).toHaveLength(2);
    expect(graph!.edges).toHaveLength(1);
    expect(planningUpdates(messages).at(-1)?.status).toBe("success");

    // The belt lights up the workflows namespace and the pack is on the
    // allowlist, so the CodeAct prompt renders the DSL mechanics — once.
    const dslHeadings = provider.systemPrompt.match(
      /# Authoring a workflow graph/g
    );
    expect(dslHeadings).toHaveLength(1);
    expect(provider.systemPrompt).toContain("## Picking nodes");
    expect(provider.systemPrompt).toContain(GRAPH_DSL_PACKAGE);
  }, 60_000);

  it("reports a run that never finished as a failure", async () => {
    const { value, messages } = await drain(
      authorGraph(
        "Do nothing",
        options({
          provider: scriptedProvider("1 + 1;"),
          context: contextWith(shippedPackCatalog())
        })
      )
    );

    expect(value).toBeNull();
    expect(planningUpdates(messages).at(-1)?.status).toBe("failed");
  }, 60_000);
});
