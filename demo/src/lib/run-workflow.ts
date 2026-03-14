/**
 * Server-side workflow execution using @nodetool packages.
 * Runs entirely within the Next.js API route – no external server needed.
 *
 * Uses dynamic imports so that the heavy native modules (isolated-vm, etc.)
 * are only loaded at request time, not during Next.js build analysis.
 */

import type { NodeDescriptor, Edge } from "@nodetool/protocol";
import { randomUUID } from "node:crypto";

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

// Cache the registry across requests within the same server process.
let registryPromise: Promise<import("@nodetool/node-sdk").NodeRegistry> | null =
  null;

async function getRegistry(): Promise<import("@nodetool/node-sdk").NodeRegistry> {
  if (!registryPromise) {
    registryPromise = (async () => {
      // Dynamic imports keep these modules out of the webpack bundle and prevent
      // native-module errors (isolated-vm, better-sqlite3, etc.) at build time.
      const [{ NodeRegistry }, textMod, controlMod, booleanMod] =
        await Promise.all([
          import("@nodetool/node-sdk"),
          import("@nodetool/base-nodes/dist/nodes/text.js"),
          import("@nodetool/base-nodes/dist/nodes/control.js"),
          import("@nodetool/base-nodes/dist/nodes/boolean.js"),
        ]);

      type NodeClass = import("@nodetool/node-sdk").NodeClass;
      const registry = new NodeRegistry();
      registry.register(textMod.FormatTextNode as unknown as NodeClass);
      registry.register(controlMod.RerouteNode as unknown as NodeClass);
      registry.register(booleanMod.CompareNode as unknown as NodeClass);
      return registry;
    })();
  }
  return registryPromise;
}

export async function runWorkflow(
  definition: WorkflowDefinition,
  params: Record<string, unknown>
): Promise<WorkflowRunResult> {
  const jobId = randomUUID();

  const [{ WorkflowRunner }, { ProcessingContext }, registry] =
    await Promise.all([
      import("@nodetool/kernel"),
      import("@nodetool/runtime"),
      getRegistry(),
    ]);

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
