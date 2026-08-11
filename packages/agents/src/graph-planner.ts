/**
 * GraphPlanner -- builds a workflow graph from one LLM-authored DSL program.
 *
 * The LLM discovers nodes with a few read-only tools (search_nodes,
 * get_node_info, list_nodes, find_model), then one-shots the ENTIRE workflow
 * as a graph DSL program submitted through `submit_graph`. Validation errors
 * round-trip as tool results so the model fixes the program over feedback
 * rounds instead of mutating the graph one add_node/add_edge call at a time.
 * The accepted program's graph goes straight to WorkflowRunner.
 */

import type {
  BaseProvider,
  ProcessingContext,
  Message,
  SandboxModuleCatalog,
  ToolCall,
  TurnBudget
} from "@nodetool-ai/runtime";
import {
  getProcessSandboxModuleCatalog,
  withAgentSpanGen
} from "@nodetool-ai/runtime";
import { linkAbort } from "./utils/link-abort.js";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import { createLogger } from "@nodetool-ai/config";
import type {
  GraphData,
  ProcessingMessage,
  Chunk,
  PlanningUpdate,
  ToolCallUpdate,
  ToolResultUpdate
} from "@nodetool-ai/protocol";

import { Tool } from "./tools/base-tool.js";
import { SubmitGraphTool } from "./tools/submit-graph-tool.js";
import { toolForCapabilityName } from "./capabilities/lazy-tool.js";
import {
  UNGATED,
  createCapabilityRun,
  type CapabilityRun
} from "./capabilities/index.js";
import {
  buildGraphPlannerSystemPrompt,
  resolveAvailableGenericNodes
} from "./prompts/graph-planner-prompt.js";
import { installedSandboxPacks } from "./prompts/sandbox-pack-catalog.js";
import { refineCodeNodes } from "./code-node-refine.js";

const log = createLogger("nodetool.agents.graph-planner");

const MAX_RETRIES = 3;
/**
 * Per-attempt tool-call budget: discovery lookups plus a handful of
 * submit_graph feedback rounds. Far below the old per-node budget because the
 * graph arrives as one program, not one call per node/edge.
 */
const MAX_TOOL_CALLS_PER_TURN = 20;

const GRAPH_CREATION_PROMPT_TEMPLATE = `Build a workflow graph to achieve this objective.

Objective: {{objective}}

Workflow inputs (runtime parameters the caller will supply):
{{inputsInfo}}

Available execution tools for agent step nodes:
{{toolsInfo}}

Output schema (for the final result of the workflow):
{{outputSchema}}`;

export interface GraphPlannerOptions {
  provider: BaseProvider;
  model: string;
  registry: NodeRegistry;
  tools?: Tool[];
  systemPrompt?: string;
  outputSchema?: Record<string, unknown>;
  inputs?: Record<string, unknown>;
  maxRetries?: number;
  threadId?: string;
  /**
   * Configured BaseProvider instances by id. When supplied, the planner
   * exposes a `find_model` tool so the agent can pick a real
   * `{provider, model_id}` for generic AI nodes.
   */
  providers?: Record<string, BaseProvider>;
  /** External cancellation. Aborts the planning provider loop mid-flight. */
  signal?: AbortSignal;
  /**
   * Spend admission, consulted before every planning turn. A refusal ends the
   * loop, so the planner returns null rather than overrunning a caller's cap.
   */
  turnBudget?: TurnBudget;
  /**
   * Re-author every `nodetool.code.Code` body through `CodePlanner` once the
   * graph is accepted. On by default: a body written inline as one string in a
   * whole-graph program gets none of the sandbox reference or the feedback
   * rounds the code path has. Turn it off to keep graph planning to one model
   * loop — an eval measuring the planner alone, or a caller on a tight budget.
   */
  refineCodeNodes?: boolean;
  /**
   * The sandbox packs the prompt may advertise. Omit it and the planner reads
   * the catalog off the {@link ProcessingContext} it plans with, then off this
   * process — which is what a server or CLI run wants. Pass `null` to
   * advertise no pack at all.
   */
  sandboxModuleCatalog?: SandboxModuleCatalog | null;
}

export class GraphPlanner {
  private readonly provider: BaseProvider;
  private readonly model: string;
  private readonly registry: NodeRegistry;
  private readonly tools: Tool[];
  private readonly explicitSystemPrompt: string | undefined;
  private readonly sandboxModuleCatalog: SandboxModuleCatalog | null | undefined;
  /** Built on the first `plan`, once a context can supply the catalog. */
  private defaultSystemPrompt: string | undefined;
  private readonly outputSchema: Record<string, unknown> | undefined;
  private readonly inputs: Record<string, unknown>;
  private readonly maxRetries: number;
  private readonly threadId?: string;
  private readonly signal?: AbortSignal;
  private readonly turnBudget?: TurnBudget;
  private readonly providers?: Record<string, BaseProvider>;
  private readonly hasFindModel: boolean;
  private readonly refineCode: boolean;

  constructor(opts: GraphPlannerOptions) {
    this.provider = opts.provider;
    this.model = opts.model;
    this.registry = opts.registry;
    this.tools = opts.tools ?? [];
    this.providers = opts.providers;
    this.hasFindModel =
      !!opts.providers && Object.keys(opts.providers).length > 0;
    this.explicitSystemPrompt = opts.systemPrompt;
    this.sandboxModuleCatalog = opts.sandboxModuleCatalog;
    this.outputSchema = opts.outputSchema;
    this.inputs = opts.inputs ?? {};
    this.maxRetries = opts.maxRetries ?? MAX_RETRIES;
    this.threadId = opts.threadId;
    this.signal = opts.signal;
    this.turnBudget = opts.turnBudget;
    this.refineCode = opts.refineCodeNodes ?? true;

    if (!this.hasFindModel) {
      log.warn(
        "GraphPlanner constructed without configured providers — `find_model` tool will not be registered. The agent will fall back to a model-less Agent node for AI work."
      );
    }
  }

  /**
   * The prompt this run plans with: the caller's, else the default one built
   * once against the catalog in force.
   */
  private resolveSystemPrompt(context: ProcessingContext): string {
    if (this.explicitSystemPrompt !== undefined) return this.explicitSystemPrompt;
    this.defaultSystemPrompt ??= this.buildDefaultSystemPrompt(
      this.resolveCatalog(context)
    );
    return this.defaultSystemPrompt;
  }

  /**
   * The catalog in force: the caller's option, else the context's, else this
   * process's. A caller that means "no packs" says so with `null`; only an
   * absent value falls through to the next source.
   */
  private resolveCatalog(context: ProcessingContext): SandboxModuleCatalog | null {
    if (this.sandboxModuleCatalog !== undefined) return this.sandboxModuleCatalog;
    const fromContext: SandboxModuleCatalog | null | undefined =
      context.sandboxModuleCatalog;
    if (fromContext !== undefined) return fromContext;
    return getProcessSandboxModuleCatalog();
  }

  /**
   * Build the default planner prompt, advertising only the generic AI nodes
   * the registry actually has and only the sandbox packs this machine has
   * installed. A renamed/removed catalog entry is logged rather than offered
   * to the agent (which would waste a build attempt on an unknown node type).
   */
  private buildDefaultSystemPrompt(
    catalog: SandboxModuleCatalog | null
  ): string {
    const { available, missing } = resolveAvailableGenericNodes(this.registry);
    if (missing.length > 0) {
      log.warn(
        "GraphPlanner: GENERIC_AI_NODES entries missing from the registry; omitting them from the planner prompt",
        { missing }
      );
    }
    return buildGraphPlannerSystemPrompt({
      hasFindModel: this.hasFindModel,
      genericNodes: available,
      sandboxPacks: installedSandboxPacks(catalog ?? undefined)
    });
  }

  /**
   * Build a workflow graph from an objective via one-shot DSL authoring.
   * Returns null on repeated failure.
   */
  async *plan(
    objective: string,
    context: ProcessingContext
  ): AsyncGenerator<ProcessingMessage, GraphData | null> {
    return yield* withAgentSpanGen(
      "plan",
      {
        objective,
        provider: this.provider.provider,
        model: this.model,
        extra: { "agent.plan.kind": "graph" }
      },
      () => this._planImpl(objective, context)
    );
  }

  private async *_planImpl(
    objective: string,
    context: ProcessingContext
  ): AsyncGenerator<ProcessingMessage, GraphData | null> {
    const toolsInfo = this.formatToolsInfo();

    const userPrompt = GRAPH_CREATION_PROMPT_TEMPLATE.replace(
      "{{objective}}",
      objective
    )
      .replace("{{inputsInfo}}", this.formatInputsInfo())
      .replace("{{toolsInfo}}", toolsInfo)
      .replace(
        "{{outputSchema}}",
        this.outputSchema
          ? JSON.stringify(this.outputSchema, null, 2)
          : "None specified"
      );

    const messages: Message[] = [
      { role: "system", content: this.resolveSystemPrompt(context) },
      { role: "user", content: userPrompt }
    ];

    yield {
      type: "planning_update",
      phase: "initialization",
      status: "started",
      content: "Starting graph-native planning..."
    } satisfies PlanningUpdate;

    log.info("GraphPlanner.plan started", {
      objective: objective.slice(0, 120),
      provider: this.provider.provider,
      model: this.model,
      maxRetries: this.maxRetries,
      maxToolCalls: MAX_TOOL_CALLS_PER_TURN,
      hasFindModel: this.hasFindModel,
      executionToolsCount: this.tools.length
    });

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      log.info("GraphPlanner attempt", {
        objective: objective.slice(0, 60),
        attempt: attempt + 1,
        maxRetries: this.maxRetries
      });

      yield {
        type: "planning_update",
        phase: "generation",
        status: "running",
        content:
          attempt > 0
            ? `Retry attempt ${attempt + 1}/${this.maxRetries}...`
            : "Writing workflow graph program..."
      } satisfies PlanningUpdate;

      const result = yield* this.runDslLoop(messages);

      if (result.graph) {
        log.info("Graph built", {
          nodes: result.graph.nodes.length,
          edges: result.graph.edges.length
        });

        if (this.refineCode) {
          yield* this.refineCodeBodies(result.graph, objective);
        }

        yield {
          type: "planning_update",
          phase: "complete",
          status: "success",
          content: `Graph built: ${result.graph.nodes.length} nodes, ${result.graph.edges.length} edges`
        } satisfies PlanningUpdate;

        return result.graph;
      }

      const errorMsg =
        result.error ?? `Graph was not accepted on attempt ${attempt + 1}`;

      log.warn("Graph building retry", {
        attempt: attempt + 1,
        reason: errorMsg
      });

      yield {
        type: "planning_update",
        phase: "validation",
        status: "failed",
        content: errorMsg
      } satisfies PlanningUpdate;

      // The provider loop copies the message array, so the model has no
      // memory of its previous attempt — carry the last submitted program and
      // its errors forward so "fix and resubmit" is actionable rather than a
      // restart from nothing.
      messages.push({
        role: "user",
        content: this.buildRetryMessage(errorMsg, result)
      });
    }

    log.error("Graph building failed", { attempts: this.maxRetries });

    yield {
      type: "chunk",
      content: `\nFailed to build workflow graph after ${this.maxRetries} attempts.\n`,
      done: true
    } satisfies Chunk;

    yield {
      type: "planning_update",
      phase: "complete",
      status: "failed",
      content: `Graph building failed after ${this.maxRetries} attempts`
    } satisfies PlanningUpdate;

    return null;
  }

  /**
   * Hand the accepted graph's Code nodes to `CodePlanner`. The pass never
   * fails the plan: it patches what it can improve, keeps the authored body
   * for everything else, and reports the rest as warnings.
   */
  private async *refineCodeBodies(
    graph: GraphData,
    objective: string
  ): AsyncGenerator<ProcessingMessage, void> {
    try {
      const report = yield* refineCodeNodes(graph, {
        provider: this.provider,
        model: this.model,
        registry: this.registry,
        objective,
        ...(this.signal ? { signal: this.signal } : {}),
        ...(this.threadId ? { threadId: this.threadId } : {})
      });
      if (report.eligible > 0) {
        log.info("Code node refinement", {
          eligible: report.eligible,
          refined: report.refined,
          warnings: report.warnings.length
        });
      }
    } catch (error) {
      log.warn("Code node refinement failed; keeping the authored bodies", {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private buildRetryMessage(
    errorMsg: string,
    result: { lastCode?: string; lastErrors?: string[] }
  ): string {
    const parts = [`Error: ${errorMsg}`];
    if (result.lastCode) {
      parts.push(
        `Your last submitted program:\n\`\`\`js\n${result.lastCode}\n\`\`\``
      );
    }
    if (result.lastErrors && result.lastErrors.length > 0) {
      parts.push(
        `Validation errors:\n${result.lastErrors.map((e) => `- ${e}`).join("\n")}`
      );
    }
    parts.push(
      "Fix the issues and call submit_graph with the FULL corrected program."
    );
    return parts.join("\n\n");
  }

  /**
   * Run one planning attempt: discovery tool calls plus submit_graph feedback
   * rounds, until a submission is accepted or the budget is spent.
   */
  private async *runDslLoop(
    messages: Message[]
  ): AsyncGenerator<
    ProcessingMessage,
    { graph?: GraphData; error?: string; lastCode?: string; lastErrors?: string[] }
  > {
    // `submit_graph` is only *conditionally* terminal: an accepted graph ends
    // the loop; a failed submission returns its errors as the tool result and
    // does NOT abort, so the model fixes the program within the budget. The
    // static `terminal` flag can't express that, so the AbortController stops
    // the loop on acceptance. It also short-circuits when the per-turn
    // tool-call budget is spent.
    const abort = new AbortController();
    const unlinkAbort = linkAbort(abort, this.signal);
    let exhausted = false;

    const submitGraphTool = new SubmitGraphTool(this.registry, {
      signal: abort.signal
    });

    // The three discovery capabilities read the registry off the run, so the
    // planner builds one that carries its own.
    const registry = this.registry;
    const discoveryRun = (context: ProcessingContext): CapabilityRun =>
      createCapabilityRun({ context, gate: UNGATED, nodeRegistry: registry });

    const allTools: Tool[] = [
      toolForCapabilityName("search_nodes", discoveryRun),
      toolForCapabilityName("get_node_info", discoveryRun),
      toolForCapabilityName("list_nodes", discoveryRun),
      submitGraphTool
    ];

    if (this.hasFindModel && this.providers) {
      const providers = this.providers;
      allTools.unshift(
        toolForCapabilityName("find_model", (context: ProcessingContext) =>
          createCapabilityRun({ context, gate: UNGATED, providers })
        )
      );
    }

    let totalToolCalls = 0;
    // Tool results are produced inside the `execute` closures the provider
    // drives, off the event stream. Park them here and drain into the stream
    // so the UI can resolve each running tool-call card.
    const pendingResults: ToolResultUpdate[] = [];

    // The provider drives the tool loop, so backends that run their own agent
    // loop (e.g. the Claude Agent SDK) work. Each tool carries its own
    // `execute` closure.
    const makeExecute =
      (tool: Tool) =>
      async (
        args: Record<string, unknown>,
        toolCallId?: string
      ): Promise<string> => {
        totalToolCalls++;
        log.info("GraphPlanner tool call", {
          totalToolCalls,
          name: tool.name,
          args:
            tool.name === submitGraphTool.name
              ? { codeChars: String((args?.code as string) ?? "").length }
              : args
        });

        const toolStartedAt = Date.now();
        const result = await Tool.executeTool(
          tool,
          {} as ProcessingContext,
          args ?? {}
        );
        const resultStr =
          typeof result === "string" ? result : JSON.stringify(result);

        log.info("GraphPlanner tool result", {
          name: tool.name,
          durationMs: Date.now() - toolStartedAt,
          resultLength: resultStr.length,
          resultPreview: resultStr.slice(0, 240)
        });

        if (toolCallId) {
          pendingResults.push({
            type: "tool_result_update",
            node_id: "graph_planner",
            tool_call_id: toolCallId,
            name: tool.name,
            result: { result: resultStr }
          });
        }

        if (tool.name === submitGraphTool.name && submitGraphTool.graph) {
          log.info("GraphPlanner submit_graph accepted", {
            nodes: submitGraphTool.graph.nodes.length,
            edges: submitGraphTool.graph.edges.length
          });
          // Accepted graph captured — end the loop promptly. A failed
          // submission returns its errors as the tool result (no abort) so
          // the model can fix the program and resubmit within the budget.
          abort.abort();
        } else if (totalToolCalls >= MAX_TOOL_CALLS_PER_TURN) {
          exhausted = true;
          abort.abort();
        }

        return resultStr;
      };

    const providerTools = allTools.map((tool) => ({
      ...tool.toProviderTool(),
      execute: makeExecute(tool)
    }));

    const stream = this.provider.generateLoop({
      messages,
      model: this.model,
      tools: providerTools,
      threadId: this.threadId,
      maxIterations: MAX_TOOL_CALLS_PER_TURN,
      sequentialTools: true,
      ...(this.turnBudget ? { turnBudget: this.turnBudget } : {}),
      signal: abort.signal
    });

    try {
      for await (const item of stream) {
        while (pendingResults.length > 0) yield pendingResults.shift()!;
        if ("id" in item && "name" in item && "args" in item) {
          const tc = item as ToolCall;
          const args = (tc.args as Record<string, unknown>) ?? {};
          yield {
            type: "tool_call_update",
            tool_call_id: tc.id,
            name: tc.name,
            args,
            message:
              Tool.extractMessage(args) ??
              this.formatToolCallMessage(tc.name, args),
            node_id: "graph_planner"
          } satisfies ToolCallUpdate;
          continue;
        }
        if ("type" in item && (item as { type?: string }).type === "chunk") {
          const chunk = item as { content?: string; done?: boolean };
          if (
            typeof chunk.content === "string" &&
            chunk.content.length > 0 &&
            !chunk.done
          ) {
            yield {
              type: "chunk",
              content: chunk.content,
              done: false
            } satisfies Chunk;
          }
          continue;
        }
      }
    } finally {
      unlinkAbort();
    }
    // The last tool's result lands after the stream ends (the accepted
    // submit_graph aborts the loop from inside its own execute).
    while (pendingResults.length > 0) yield pendingResults.shift()!;

    if (submitGraphTool.graph) {
      return { graph: submitGraphTool.graph };
    }

    const carry = {
      lastCode: submitGraphTool.lastCode ?? undefined,
      lastErrors:
        submitGraphTool.lastErrors.length > 0
          ? submitGraphTool.lastErrors
          : undefined
    };

    if (exhausted) {
      log.warn("GraphPlanner hit MAX_TOOL_CALLS_PER_TURN", {
        totalToolCalls,
        max: MAX_TOOL_CALLS_PER_TURN
      });
      return {
        error: `Exceeded maximum tool calls (${MAX_TOOL_CALLS_PER_TURN})`,
        ...carry
      };
    }

    log.warn("GraphPlanner stopped without an accepted submit_graph", {
      totalToolCalls,
      submitted: submitGraphTool.lastCode != null
    });
    return {
      error:
        submitGraphTool.lastCode != null
          ? "The last submitted program did not pass validation."
          : "LLM stopped without calling submit_graph. Write the graph program and submit it via submit_graph.",
      ...carry
    };
  }

  private formatToolCallMessage(
    name: string,
    args: Record<string, unknown>
  ): string {
    switch (name) {
      case "search_nodes":
        return `Searching nodes for "${String(args.query ?? "")}"`;
      case "get_node_info":
        return `Inspecting ${String(args.node_type ?? "node")}`;
      case "list_nodes":
        return `Listing nodes in ${String(args.namespace ?? "all")}`;
      case "find_model":
        return `Finding model for ${String(args.task ?? args.capability ?? "task")}`;
      case "submit_graph":
        return "Submitting workflow graph";
      default:
        return `Calling ${name}`;
    }
  }

  /**
   * Render caller-supplied inputs for the planning prompt. The kernel
   * dispatches runtime params to `nodetool.input.*` nodes matched by name, so
   * the planner must know which keys exist to wire them in.
   */
  private formatInputsInfo(): string {
    const entries = Object.entries(this.inputs);
    if (entries.length === 0)
      return "None — the workflow takes no runtime parameters.";
    const lines = entries.map(([key, value]) => {
      let preview: string;
      try {
        preview = JSON.stringify(value) ?? "undefined";
      } catch {
        preview = String(value);
      }
      if (preview.length > 200) preview = preview.slice(0, 197) + "...";
      return `- ${key}: ${preview}`;
    });
    return [
      ...lines,
      "",
      "For EACH input above, add a matching `nodetool.input.*` node (e.g. `nodetool.input.StringInput`, `ImageInput`, `FloatInput`) with its `name` property set to the input key EXACTLY — the runtime delivers the value to the node by that name. Wire each input node's output into the nodes that consume it."
    ].join("\n");
  }

  private formatToolsInfo(): string {
    if (this.tools.length === 0) return "No execution tools available.";

    const lines: string[] = ["Available execution tools for agent step nodes:"];
    for (const tool of this.tools) {
      let schemaInfo = "";
      const schema = tool.inputSchema;
      if (schema && typeof schema === "object" && "properties" in schema) {
        const props = Object.keys(schema.properties as Record<string, unknown>);
        const required = Array.isArray(schema.required)
          ? (schema.required as string[])
          : [];
        const propDetails = props.map((p) => {
          const isReq = required.includes(p) ? " (required)" : "";
          return `${p}${isReq}`;
        });
        if (propDetails.length > 0) {
          schemaInfo = ` | Args: ${propDetails.join(", ")}`;
        }
      }
      lines.push(`- ${tool.name}: ${tool.description}${schemaInfo}`);
    }
    return lines.join("\n");
  }
}
