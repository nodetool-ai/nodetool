/**
 * GraphPlanner -- builds a workflow graph directly via LLM tool calling.
 *
 * Instead of producing a TaskPlan with prose steps, this planner gives the LLM
 * tools to search for nodes, inspect their metadata, and build a DAG node-by-node.
 * The result is a GraphData that goes straight to WorkflowRunner.
 */

import type {
  BaseProvider,
  ProcessingContext,
  Message
} from "@nodetool/runtime";
import type { NodeRegistry } from "@nodetool/node-sdk";
import { createLogger } from "@nodetool/config";
import type {
  GraphData,
  ProcessingMessage,
  Chunk,
  PlanningUpdate
} from "@nodetool/protocol";

import type { Tool } from "./tools/base-tool.js";
import { GraphBuilder } from "./graph-builder.js";
import { AddNodeTool } from "./tools/add-node-tool.js";
import { AddEdgeTool } from "./tools/add-edge-tool.js";
import { FinishGraphTool } from "./tools/finish-graph-tool.js";
import { LocalSearchNodesTool } from "./tools/local-search-nodes-tool.js";
import { LocalGetNodeInfoTool } from "./tools/local-get-node-info-tool.js";
import { LocalListNodesTool } from "./tools/local-list-nodes-tool.js";

const log = createLogger("nodetool.agents.graph-planner");

const MAX_RETRIES = 3;
const MAX_TOOL_CALLS_PER_TURN = 50;

const DEFAULT_GRAPH_PLANNING_SYSTEM_PROMPT = `You are a WorkflowArchitect. Build a workflow graph to achieve the user's objective.

WORKFLOW:
1. SEARCH first: Use search_nodes to find relevant deterministic nodes for the task.
   Search by capability (e.g. "resize image", "split text", "http request").
2. INSPECT: Use get_node_info to see exact input/output names and types before using a node.
3. BUILD: Use add_node for each node, add_edge to connect them.
4. FINALIZE: Call finish_graph when done.

NODE TYPES:
- Deterministic nodes (from registry) — fast, cheap, reproducible. Always prefer these.
- Agent step nodes (type: "nodetool.agents.AgentStep") — for work requiring LLM reasoning.
  Required properties: instructions (string).
  Optional properties: tools (string array), output_schema (JSON schema string).
  Input handles: "input" (receives upstream data). Output handles: "output" (text result).
  IMPORTANT: For LLM tasks, always use "nodetool.agents.AgentStep" — NOT "nodetool.agents.Agent".
  AgentStep nodes automatically use the configured model. Do NOT use registry Agent nodes
  as they require a complex model property that cannot be set via add_node.

RULES:
- SEARCH before building. Don't guess node types — verify with search_nodes and get_node_info.
- INSPECT before adding. Always call get_node_info to see exact property names, types, and defaults.
- SET PROPERTIES: When adding a node, pass all required properties in the "properties" argument.
  For example, a constant String node needs properties: { "value": "your text here" }.
  Nodes without correct properties will produce empty/default outputs!
- MAXIMIZE parallelism: nodes without data dependencies run concurrently automatically.
- Use deterministic nodes when possible (cheaper, faster, reproducible).
- Use agent step nodes ONLY when no deterministic node can do the job.
- Every node needs a unique id (snake_case).
- Connect outputs to inputs with add_edge, using the exact handle names from get_node_info.
- Call finish_graph when you're done building.`;

const GRAPH_CREATION_PROMPT_TEMPLATE = `Build a workflow graph to achieve this objective.

Objective: {{objective}}

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
}

export class GraphPlanner {
  private readonly provider: BaseProvider;
  private readonly model: string;
  private readonly registry: NodeRegistry;
  private readonly tools: Tool[];
  private readonly systemPrompt: string;
  private readonly outputSchema: Record<string, unknown> | undefined;
  private readonly inputs: Record<string, unknown>;
  private readonly maxRetries: number;
  private readonly threadId?: string;

  constructor(opts: GraphPlannerOptions) {
    this.provider = opts.provider;
    this.model = opts.model;
    this.registry = opts.registry;
    this.tools = opts.tools ?? [];
    this.systemPrompt =
      opts.systemPrompt ?? DEFAULT_GRAPH_PLANNING_SYSTEM_PROMPT;
    this.outputSchema = opts.outputSchema;
    this.inputs = opts.inputs ?? {};
    this.maxRetries = opts.maxRetries ?? MAX_RETRIES;
    this.threadId = opts.threadId;
  }

  /**
   * Build a workflow graph from an objective using LLM tool calling.
   * Returns null on repeated failure.
   */
  async *plan(
    objective: string,
    _context: ProcessingContext
  ): AsyncGenerator<ProcessingMessage, GraphData | null> {
    const toolsInfo = this.formatToolsInfo();

    const userPrompt = GRAPH_CREATION_PROMPT_TEMPLATE.replace(
      "{{objective}}",
      objective
    )
      .replace("{{toolsInfo}}", toolsInfo)
      .replace(
        "{{outputSchema}}",
        this.outputSchema
          ? JSON.stringify(this.outputSchema, null, 2)
          : "None specified"
      );

    const messages: Message[] = [
      { role: "system", content: this.systemPrompt },
      { role: "user", content: userPrompt }
    ];

    yield {
      type: "planning_update",
      phase: "initialization",
      status: "started",
      content: "Starting graph-native planning..."
    } satisfies PlanningUpdate;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      log.debug("Building workflow graph", {
        objective: objective.slice(0, 60),
        attempt: attempt + 1
      });

      yield {
        type: "planning_update",
        phase: "generation",
        status: "running",
        content:
          attempt > 0
            ? `Retry attempt ${attempt + 1}/${this.maxRetries}...`
            : "Building workflow graph..."
      } satisfies PlanningUpdate;

      const result = yield* this.runToolLoop(messages);

      if (result.graph) {
        log.info("Graph built", {
          nodes: result.graph.nodes.length,
          edges: result.graph.edges.length
        });

        yield {
          type: "planning_update",
          phase: "complete",
          status: "success",
          content: `Graph built: ${result.graph.nodes.length} nodes, ${result.graph.edges.length} edges`
        } satisfies PlanningUpdate;

        return result.graph;
      }

      const errorMsg =
        result.error ?? `Graph was not finalized on attempt ${attempt + 1}`;

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

      // Feed error back to LLM for retry
      messages.push({
        role: "user",
        content: `Error: ${errorMsg}. Please fix the issues and call finish_graph again.`
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
   * Run the multi-turn tool-calling loop.
   * The LLM can call search/inspect/add tools multiple times before finish_graph.
   */
  private async *runToolLoop(
    messages: Message[]
  ): AsyncGenerator<
    ProcessingMessage,
    { graph?: GraphData; error?: string }
  > {
    const builder = new GraphBuilder();
    const addNodeTool = new AddNodeTool(builder, this.registry);
    const addEdgeTool = new AddEdgeTool(builder, this.registry);
    const finishGraphTool = new FinishGraphTool(builder);
    const searchNodesTool = new LocalSearchNodesTool(this.registry);
    const getNodeInfoTool = new LocalGetNodeInfoTool(this.registry);
    const listNodesTool = new LocalListNodesTool(this.registry);

    const allTools: Tool[] = [
      searchNodesTool,
      getNodeInfoTool,
      listNodesTool,
      addNodeTool,
      addEdgeTool,
      finishGraphTool
    ];

    const providerTools = allTools.map((t) => t.toProviderTool());
    const toolMap = new Map(allTools.map((t) => [t.name, t]));

    let totalToolCalls = 0;

    // Multi-turn loop: LLM may need multiple turns to search, inspect, then build
    while (totalToolCalls < MAX_TOOL_CALLS_PER_TURN) {
      let content = "";
      const pendingToolCalls: Array<{
        name: string;
        args: Record<string, unknown>;
        id: string;
      }> = [];

      const stream = this.provider.generateMessagesTraced({
        messages: [...messages],
        model: this.model,
        tools: providerTools,
        threadId: this.threadId
      });

      for await (const item of stream) {
        if (
          "type" in item &&
          (item as unknown as Record<string, unknown>)["type"] === "chunk"
        ) {
          const chunk = item as { content?: string };
          if (typeof chunk.content === "string") {
            content += chunk.content;
            yield {
              type: "chunk",
              content: chunk.content,
              done: false
            } satisfies Chunk;
          }
        }
        if ("name" in item && typeof item.name === "string") {
          pendingToolCalls.push({
            name: item.name,
            args: (item.args as Record<string, unknown>) ?? {},
            id: (item as { id?: string }).id ?? randomUUID()
          });
        }
      }

      // No tool calls — LLM finished without calling finish_graph
      if (pendingToolCalls.length === 0) {
        if (finishGraphTool.graph) {
          return { graph: finishGraphTool.graph };
        }
        return {
          error:
            "LLM stopped without calling finish_graph. Please build the graph and call finish_graph."
        };
      }

      // Execute tool calls and build message history
      const toolCalls = pendingToolCalls.map((tc) => ({
        id: tc.id,
        name: tc.name,
        args: tc.args
      }));
      messages.push({
        role: "assistant",
        content: content ?? "",
        toolCalls
      });

      for (const tc of pendingToolCalls) {
        totalToolCalls++;
        log.debug("Tool call", { name: tc.name, args: tc.args });
        const tool = toolMap.get(tc.name);
        if (!tool) {
          messages.push({
            role: "tool",
            toolCallId: tc.id,
            content: JSON.stringify({ error: `Unknown tool: ${tc.name}` })
          });
          continue;
        }

        const result = await tool.process(
          {} as ProcessingContext,
          tc.args
        );

        messages.push({
          role: "tool",
          toolCallId: tc.id,
          content:
            typeof result === "string" ? result : JSON.stringify(result)
        });

        // Check if finish_graph succeeded
        if (tc.name === "finish_graph" && finishGraphTool.graph) {
          return { graph: finishGraphTool.graph };
        }

        // If finish_graph failed with validation errors, continue the loop
        // so the LLM can fix them
      }
    }

    return {
      error: `Exceeded maximum tool calls (${MAX_TOOL_CALLS_PER_TURN})`
    };
  }

  private formatToolsInfo(): string {
    if (this.tools.length === 0) return "No execution tools available.";

    const lines: string[] = ["Available execution tools for agent step nodes:"];
    for (const tool of this.tools) {
      let schemaInfo = "";
      const schema = tool.inputSchema;
      if (schema && typeof schema === "object" && "properties" in schema) {
        const props = Object.keys(
          schema.properties as Record<string, unknown>
        );
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

function randomUUID(): string {
  return crypto.randomUUID();
}
