/**
 * Server-side workflow execution using @nodetool packages.
 * Runs entirely within the Next.js API route – no external server needed.
 *
 * Imports only the specific node sub-files needed (text, control, boolean)
 * rather than the full @nodetool/base-nodes barrel, which would transitively
 * load @nodetool/code-runners → isolated-vm (a native module that cannot be
 * bundled or executed during Next.js build-time page-data collection).
 * All @nodetool/* packages are declared in serverExternalPackages so webpack
 * never bundles them; they are resolved by Node.js at runtime instead.
 */

import { WorkflowRunner } from "@nodetool/kernel";
import { NodeRegistry } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import { ProcessingContext } from "@nodetool/runtime";
import type { NodeDescriptor, Edge } from "@nodetool/protocol";
import { randomUUID } from "node:crypto";

// Import only the specific node files we need — NOT the barrel (@nodetool/base-nodes
// index.js) which loads lib-beautifulsoup → jsdom and code-node → isolated-vm.
import { FormatTextNode } from "@nodetool/base-nodes/dist/nodes/text.js";
import { RerouteNode } from "@nodetool/base-nodes/dist/nodes/control.js";
import { CompareNode } from "@nodetool/base-nodes/dist/nodes/boolean.js";

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
    registryCache.register(FormatTextNode as unknown as NodeClass);
    registryCache.register(RerouteNode as unknown as NodeClass);
    registryCache.register(CompareNode as unknown as NodeClass);
  }
  return registryCache;
}

export async function runWorkflow(
  definition: WorkflowDefinition,
  params: Record<string, unknown>
): Promise<WorkflowRunResult> {
  const jobId = randomUUID();
  const registry = getRegistry();

  const resolvedParams = { ...(definition.params ?? {}), ...params };

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
      nodes: definition.graph.nodes as unknown as NodeDescriptor[],
      edges: definition.graph.edges as unknown as Edge[],
    }
  );

  return {
    status: result.status,
    outputs: result.outputs,
    error: result.error,
  };
}
