/**
 * `authorGraph` — build a workflow graph by letting a CodeAct sub-agent write
 * it with the typed DSL pack.
 *
 * The `GraphPlanner` this replaces had the model author an *untyped* program:
 * `node("some.node.Type", {...})` took the type and every property name as free
 * text, so nothing checked either until `submit_graph` validated the result.
 * `@nodetool-ai/sandbox-dsl` ships one generated function per node type with
 * that node's real inputs, so a type the catalog does not have has no export
 * and the import fails before any code runs.
 *
 * That change makes a bespoke loop unnecessary. Authoring is now ordinary
 * CodeAct: the sub-agent writes an action, imports the namespaces it needs,
 * validates the graph it built, fixes what the validator reports, and hands the
 * graph back through `finish()` — the same structured-result path every other
 * sub-agent settles through. What this module owns is the brief (objective,
 * inputs, execution tools, output schema), the belt, and the pack.
 */

import type {
  BaseProvider,
  ProcessingContext,
  SandboxModuleCatalog,
  TurnBudget
} from "@nodetool-ai/runtime";
import {
  getProcessSandboxModuleCatalog,
  withAgentSpanGen
} from "@nodetool-ai/runtime";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import { createLogger } from "@nodetool-ai/config";
import type {
  GraphData,
  PlanningUpdate,
  ProcessingMessage
} from "@nodetool-ai/protocol";

import type { Tool } from "./tools/base-tool.js";
import { toolForCapabilityName } from "./capabilities/lazy-tool.js";
import {
  UNGATED,
  createCapabilityRun,
  type CreateCapabilityRunOptions
} from "./capabilities/index.js";
import {
  GRAPH_DSL_PACKAGE,
  catalogServesGraphDsl
} from "./codeact/graph-dsl-package.js";
import {
  renderWorkflowAuthoringKnowledge,
  resolveAvailableGenericNodes
} from "./prompts/workflow-authoring-knowledge.js";
import { runSubAgent } from "./subagent.js";

const log = createLogger("nodetool.agents.author-graph");

/** Provider rounds one authoring run may spend. */
export const AUTHOR_GRAPH_MAX_ITERATIONS = 20;

/** Discovery and checking. Authoring itself is the DSL pack, not a tool. */
const AUTHORING_CAPABILITIES = [
  "search_nodes",
  "get_node_info",
  "list_nodes",
  "validate_workflow",
  "validate_code",
  "run_code",
  "test_code"
] as const;

/**
 * The shape `finish()` must carry. Deliberately loose about what a node or an
 * edge holds — `validate_workflow` is what judges that, against the registry.
 */
const GRAPH_RESULT_SCHEMA = {
  type: "object",
  properties: {
    nodes: {
      type: "array",
      items: { type: "object" },
      description: "The graph's nodes, exactly as `workflow()` returned them."
    },
    edges: {
      type: "array",
      items: { type: "object" },
      description: "The graph's edges, exactly as `workflow()` returned them."
    }
  },
  required: ["nodes", "edges"]
} satisfies Record<string, unknown>;

export interface AuthorGraphOptions {
  /** The context the sub-agent runs in — tools, sandbox catalog, memory. */
  context: ProcessingContext;
  provider: BaseProvider;
  model: string;
  registry: NodeRegistry;
  /** Execution tools an `agent` step node may be given. Named in the brief. */
  tools?: Tool[];
  /** Preamble before the authoring knowledge; neither replaces the contract. */
  systemPrompt?: string;
  /** Shape the workflow's outputs should satisfy. */
  outputSchema?: Record<string, unknown>;
  /** Runtime parameters the caller will supply, by name. */
  inputs?: Record<string, unknown>;
  /**
   * Configured providers by id. With them the belt carries `find_model`, so
   * the agent can pick a real `{provider, id}` for a generic AI node.
   */
  providers?: Record<string, BaseProvider>;
  /** External cancellation. Stops the authoring loop mid-flight. */
  signal?: AbortSignal;
  /** Spend admission, consulted before every provider turn. */
  turnBudget?: TurnBudget;
  threadId?: string;
  /** Provider rounds. Defaults to {@link AUTHOR_GRAPH_MAX_ITERATIONS}. */
  maxIterations?: number;
}

/**
 * Author a workflow graph for `objective`.
 *
 * Streams the sub-agent's `ProcessingMessage`s and returns the authored graph,
 * or null when the run produced none — the same generator contract
 * `GraphPlanner.plan()` had, so both callers consume it unchanged.
 */
export async function* authorGraph(
  objective: string,
  opts: AuthorGraphOptions
): AsyncGenerator<ProcessingMessage, GraphData | null> {
  return yield* withAgentSpanGen(
    "plan",
    {
      objective,
      provider: opts.provider.provider,
      model: opts.model,
      extra: { "agent.plan.kind": "graph" }
    },
    () => authorGraphImpl(objective, opts)
  );
}

async function* authorGraphImpl(
  objective: string,
  opts: AuthorGraphOptions
): AsyncGenerator<ProcessingMessage, GraphData | null> {
  const catalog = resolveCatalog(opts.context);
  if (!catalogServesGraphDsl(catalog)) {
    const content =
      `Cannot author a graph: this process serves no \`${GRAPH_DSL_PACKAGE}\` ` +
      "pack, so the sub-agent has nothing to build the graph with. Install the " +
      "sandbox packs (`nodetool packs compile`) or supply a catalog that " +
      "carries the DSL pack.";
    log.error("authorGraph: DSL pack unavailable", {
      objective: objective.slice(0, 120)
    });
    yield {
      type: "planning_update",
      phase: "complete",
      status: "failed",
      content
    } satisfies PlanningUpdate;
    return null;
  }

  yield {
    type: "planning_update",
    phase: "initialization",
    status: "started",
    content: "Authoring workflow graph..."
  } satisfies PlanningUpdate;

  const tools = buildAuthoringBelt(opts);

  log.info("authorGraph started", {
    objective: objective.slice(0, 120),
    provider: opts.provider.provider,
    model: opts.model,
    tools: tools.length,
    executionTools: opts.tools?.length ?? 0
  });

  const outcome = yield* runSubAgent({
    context: opts.context,
    provider: opts.provider,
    model: opts.model,
    tools,
    instructions: buildBrief(objective, opts),
    title: "Author workflow graph",
    outputSchema: GRAPH_RESULT_SCHEMA,
    systemPrompt: buildAuthoringPreamble(opts),
    sandboxPackages: [GRAPH_DSL_PACKAGE],
    maxIterations: opts.maxIterations ?? AUTHOR_GRAPH_MAX_ITERATIONS,
    turnBudget: opts.turnBudget,
    threadId: opts.threadId,
    signal: opts.signal
  });

  if (!outcome.ok) {
    log.warn("authorGraph failed", { error: outcome.error });
    yield {
      type: "planning_update",
      phase: "complete",
      status: "failed",
      content: `Graph authoring failed: ${outcome.error}`
    } satisfies PlanningUpdate;
    return null;
  }

  const graph = asGraphData(outcome.result);
  if (!graph) {
    log.warn("authorGraph returned no usable graph", {
      resultType: typeof outcome.result
    });
    yield {
      type: "planning_update",
      phase: "complete",
      status: "failed",
      content:
        "Graph authoring finished without a {nodes, edges} graph — nothing to run."
    } satisfies PlanningUpdate;
    return null;
  }

  log.info("Graph authored", {
    nodes: graph.nodes.length,
    edges: graph.edges.length
  });

  yield {
    type: "planning_update",
    phase: "complete",
    status: "success",
    content: `Graph built: ${graph.nodes.length} nodes, ${graph.edges.length} edges`
  } satisfies PlanningUpdate;

  return graph;
}

/**
 * The catalog the sub-agent's imports will resolve against. There is no option
 * for it: the guest loader reads the one on the {@link ProcessingContext}, so
 * anything else here would only describe a pack the action cannot import. A
 * host that means "no packs" sets `null` on the context; a plain object with no
 * catalog at all falls back to this process's.
 */
function resolveCatalog(
  context: ProcessingContext
): SandboxModuleCatalog | null {
  const fromContext = context.sandboxModuleCatalog;
  if (fromContext !== undefined) return fromContext;
  return getProcessSandboxModuleCatalog();
}

/**
 * Discovery, graph validation, and the Code-body harness — plus `find_model`
 * when providers are configured. Everything else the agent needs is the pack.
 */
export function buildAuthoringBelt(opts: AuthorGraphOptions): Tool[] {
  const runOptions: CreateCapabilityRunOptions = {
    context: opts.context,
    gate: UNGATED,
    nodeRegistry: opts.registry
  };
  if (opts.providers) runOptions.providers = opts.providers;
  const run = createCapabilityRun(runOptions);
  const names: string[] = [...AUTHORING_CAPABILITIES];
  if (opts.providers && Object.keys(opts.providers).length > 0) {
    names.unshift("find_model");
  } else {
    log.warn(
      "authorGraph has no configured providers — `find_model` is off the belt, so AI work falls back to the model-less Agent node."
    );
  }
  return names.map((name) => toolForCapabilityName(name, run));
}

/**
 * The system-prompt preamble: what the agent has to know to author a NodeTool
 * workflow, plus how this particular run ends. The DSL mechanics are NOT here
 * — the CodeAct prompt renders `GRAPH_DSL_PROMPT_SECTION` itself once the pack
 * is on the session allowlist, and saying it twice only invites the model to
 * follow the copy that suits it.
 */
export function buildAuthoringPreamble(opts: AuthorGraphOptions): string {
  const { available, missing } = resolveAvailableGenericNodes(opts.registry);
  if (missing.length > 0) {
    log.warn(
      "authorGraph: GENERIC_AI_NODES entries missing from the registry; omitting them from the prompt",
      { missing }
    );
  }
  const sections: string[] = [];
  if (opts.systemPrompt?.trim()) sections.push(opts.systemPrompt.trim());
  sections.push(
    "You author one workflow graph and hand it back. You do not save it and " +
      "you do not run it — the caller owns both."
  );
  sections.push(renderWorkflowAuthoringKnowledge(available));
  sections.push(`## Finishing

1. Build the graph: \`const graph = workflow(...terminals);\`
2. Check it: \`await nodetool.workflows.validate(graph)\`. Fix every error it
   reports and validate again. A graph that still has errors is not finished.
3. Hand it back: \`finish(graph)\` — the object itself, not a re-typed copy.

A \`nodetool.code.Code\` body is code, so check it like code: \`validate_code\`
after every edit, \`run_code\` with representative inputs when the body does
anything non-obvious, and \`test_code\` with a case per branch when it does
arithmetic or parsing. That is cheaper than discovering the body is wrong on a
run the user paid for.`);
  return sections.join("\n\n");
}

/** The user message: what to build, with what, and what it must produce. */
export function buildBrief(
  objective: string,
  opts: AuthorGraphOptions
): string {
  const parts = [
    "Build a workflow graph to achieve this objective.",
    `Objective: ${objective}`,
    `Workflow inputs (runtime parameters the caller will supply):\n${formatInputs(opts.inputs ?? {})}`,
    `Execution tools available to agent step nodes:\n${formatTools(opts.tools ?? [])}`,
    `Output schema (for the final result of the workflow):\n${
      opts.outputSchema
        ? JSON.stringify(opts.outputSchema, null, 2)
        : "None specified"
    }`
  ];
  return parts.join("\n\n");
}

/**
 * Render the caller's inputs. The kernel dispatches runtime parameters to
 * `nodetool.input.*` nodes matched by name, so the agent must know which keys
 * exist to wire them in.
 */
function formatInputs(inputs: Record<string, unknown>): string {
  const entries = Object.entries(inputs);
  if (entries.length === 0) {
    return "None — the workflow takes no runtime parameters.";
  }
  const lines = entries.map(([key, value]) => {
    let preview: string;
    try {
      preview = JSON.stringify(value) ?? "undefined";
    } catch {
      preview = String(value);
    }
    if (preview.length > 200) preview = `${preview.slice(0, 197)}...`;
    return `- ${key}: ${preview}`;
  });
  return [
    ...lines,
    "",
    "Add one `nodetool.input.*` node per key above, with its `name` property set to that key EXACTLY, and wire its output into whatever consumes it."
  ].join("\n");
}

function formatTools(tools: Tool[]): string {
  if (tools.length === 0) return "No execution tools available.";
  return tools
    .map((tool) => {
      const schema = tool.inputSchema;
      let args = "";
      if (schema && typeof schema === "object" && "properties" in schema) {
        const props = Object.keys(schema.properties as Record<string, unknown>);
        const required = Array.isArray(schema.required)
          ? (schema.required as string[])
          : [];
        if (props.length > 0) {
          args = ` | Args: ${props
            .map((p) => (required.includes(p) ? `${p} (required)` : p))
            .join(", ")}`;
        }
      }
      return `- ${tool.name}: ${tool.description}${args}`;
    })
    .join("\n");
}

/** Narrow a finished result to a graph, or null when it is not one. */
function asGraphData(result: unknown): GraphData | null {
  if (result === null || typeof result !== "object") return null;
  const record = result as { nodes?: unknown; edges?: unknown };
  if (!Array.isArray(record.nodes) || !Array.isArray(record.edges)) return null;
  return result as GraphData;
}
