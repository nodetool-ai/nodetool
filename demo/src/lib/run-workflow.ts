/**
 * Server-side workflow execution using @nodetool packages.
 * Runs entirely within the Next.js API route – no external server needed.
 *
 * Imports only the specific node sub-files needed rather than the full
 * @nodetool/base-nodes barrel, which would transitively load
 * @nodetool/code-runners → isolated-vm (a native module incompatible with
 * Next.js build-time evaluation).
 * All @nodetool/* packages are declared in serverExternalPackages so webpack
 * never bundles them; they are resolved by Node.js at runtime instead.
 *
 * AI features activate automatically when OPENAI_API_KEY is set.  When no
 * API key is configured, AI nodes fall back to heuristic logic (keyword
 * matching for classifiers / extractive summarization).
 */

import { WorkflowRunner } from "@nodetool/kernel";
import { NodeRegistry } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import { ProcessingContext } from "@nodetool/runtime";
import type { NodeDescriptor, Edge } from "@nodetool/protocol";
import { randomUUID } from "node:crypto";

// Import only the specific node files we need — NOT the barrel (@nodetool/base-nodes
// index.js) which loads lib-beautifulsoup → jsdom and code-node → isolated-vm.
import { SummarizerNode, ClassifierNode } from "@nodetool/base-nodes/dist/nodes/agents.js";
import { RerouteNode } from "@nodetool/base-nodes/dist/nodes/control.js";

// Use flexible types so plain workflow JSON (without edge_type etc.) is accepted.
export interface WorkflowGraph {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
}

export interface WorkflowDefinition {
  graph: WorkflowGraph;
  params?: Record<string, unknown>;
}

export interface WorkflowRunResult {
  status: "completed" | "failed" | "cancelled";
  outputs: Record<string, unknown[]>;
  error?: string;
}

// Cache the registry singleton across requests within the same server process.
let registryCache: NodeRegistry | null = null;

function getRegistry(): NodeRegistry {
  if (!registryCache) {
    registryCache = new NodeRegistry();
    registryCache.register(SummarizerNode as unknown as NodeClass);
    registryCache.register(ClassifierNode as unknown as NodeClass);
    registryCache.register(RerouteNode as unknown as NodeClass);
  }
  return registryCache;
}

/**
 * Node types whose `model` property should be set to GPT-4o-mini when
 * OPENAI_API_KEY is available. When the API key is absent the nodes use
 * their built-in heuristic fallback instead.
 */
const AI_NODE_TYPES = new Set([
  "nodetool.agents.Classifier",
  "nodetool.agents.Summarizer",
]);

const OPENAI_MODEL = {
  type: "language_model",
  provider: "openai",
  id: "gpt-4o-mini",
  name: "GPT-4o Mini",
  path: null,
  supported_tasks: ["generate_message"],
};

/**
 * If OPENAI_API_KEY is configured, inject the model spec into every AI node
 * that does not already have a provider set.  This keeps the workflow JSON
 * provider-agnostic while still enabling the AI path at runtime.
 */
function withModel(definition: WorkflowDefinition): WorkflowDefinition {
  if (!process.env.OPENAI_API_KEY) return definition;

  const nodes = definition.graph.nodes.map((node) => {
    if (!AI_NODE_TYPES.has(node.type as string)) return node;
    const props = (node.properties as Record<string, unknown>) ?? {};
    const model = props.model as Record<string, unknown> | undefined;
    // Only inject if the model provider is missing or the empty sentinel.
    // "empty" is the default provider value used by all language_model props in
    // @nodetool/base-nodes when no model has been explicitly selected.
    if (model?.provider && model.provider !== "" && model.provider !== "empty") {
      return node;
    }
    return { ...node, properties: { ...props, model: OPENAI_MODEL } };
  });

  return { ...definition, graph: { ...definition.graph, nodes } };
}

export async function runWorkflow(
  definition: WorkflowDefinition,
  params: Record<string, unknown>
): Promise<WorkflowRunResult> {
  const jobId = randomUUID();
  const registry = getRegistry();
  const resolvedDefinition = withModel(definition);
  const resolvedParams = { ...(resolvedDefinition.params ?? {}), ...params };

  const context = new ProcessingContext({ jobId, workflowId: null });

  const runner = new WorkflowRunner(jobId, {
    resolveExecutor: (node) => {
      if (registry.has(node.type)) {
        return registry.resolve(node);
      }
      // Return a no-op executor for shim node types (e.g. test.Input,
      // nodetool.input.*) that the WorkflowRunner treats as external input
      // placeholders — their param values are dispatched directly by the runner
      // before any actors start, so the executor is never actually called.
      // The executor must still be provided because _initializeGraph() calls
      // resolveExecutor for every node in the graph (to optionally call
      // executor.initialize()), even for nodes that won't execute.
      return { async process() { return {}; } };
    },
    executionContext: context,
  });

  const result = await runner.run(
    { job_id: jobId, params: resolvedParams },
    {
      nodes: resolvedDefinition.graph.nodes as unknown as NodeDescriptor[],
      edges: resolvedDefinition.graph.edges as unknown as Edge[],
    }
  );

  return {
    status: result.status,
    outputs: result.outputs,
    error: result.error,
  };
}
