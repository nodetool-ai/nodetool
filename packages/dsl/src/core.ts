/**
 * @nodetool/dsl – Core DSL primitives
 *
 * OutputHandle, Connectable, DslNode, SingleOutput, createNode(), workflow(), run()
 */

import { WorkflowRunner } from "@nodetool/kernel";
import { NodeRegistry } from "@nodetool/node-sdk";
import { ProcessingContext } from "@nodetool/runtime";
import type {
  NodeDescriptor as GraphNodeDescriptor,
  Edge,
  NodeUpdate
} from "@nodetool/protocol";

// ---------------------------------------------------------------------------
// OutputHandle
// ---------------------------------------------------------------------------

export interface OutputHandle<T> {
  readonly __brand: "OutputHandle";
  readonly nodeId: string;
  readonly slot: string;
  readonly __phantom?: T;
}

export function isOutputHandle(value: unknown): value is OutputHandle<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as any).__brand === "OutputHandle"
  );
}

// ---------------------------------------------------------------------------
// Connectable
// ---------------------------------------------------------------------------

export type Connectable<T> = T | OutputHandle<T>;

// ---------------------------------------------------------------------------
// SingleOutput
// ---------------------------------------------------------------------------

export type SingleOutput<T, TSlot extends string = "output"> = {
  readonly [K in TSlot]: T;
};

export type OutputSlot<TOutputs extends object> = Extract<
  keyof TOutputs,
  string
>;

export interface OutputAccessor<
  TOutputs extends object,
  TDefault extends OutputSlot<TOutputs> | undefined = undefined
> {
  (): TDefault extends OutputSlot<TOutputs>
    ? OutputHandle<TOutputs[TDefault]>
    : never;
  <K extends OutputSlot<TOutputs>>(slot: K): OutputHandle<TOutputs[K]>;
}

// ---------------------------------------------------------------------------
// DslNode
// ---------------------------------------------------------------------------

export interface DslNode<
  TOutputs extends object,
  TDefault extends OutputSlot<TOutputs> | undefined =
    TOutputs extends SingleOutput<infer _TValue, infer TSlot>
      ? Extract<TSlot, OutputSlot<TOutputs>>
      : undefined
> {
  readonly nodeId: string;
  readonly nodeType: string;
  readonly inputs: Record<string, unknown>;
  readonly output: OutputAccessor<TOutputs, TDefault>;
}

// ---------------------------------------------------------------------------
// WorkflowNode / WorkflowEdge / Workflow
// ---------------------------------------------------------------------------

export interface WorkflowNode {
  readonly id: string;
  readonly type: string;
  readonly data: Record<string, unknown>;
  readonly streaming: boolean;
}

export interface WorkflowEdge {
  readonly source: string;
  readonly sourceHandle: string;
  readonly target: string;
  readonly targetHandle: string;
}

export interface Workflow {
  readonly nodes: WorkflowNode[];
  readonly edges: WorkflowEdge[];
}

// ---------------------------------------------------------------------------
// Node Registry (internal)
// ---------------------------------------------------------------------------

interface RegisteredNodeDescriptor {
  nodeId: string;
  nodeType: string;
  inputs: Record<string, unknown>;
  streaming: boolean;
}

const nodeRegistry = new Map<string, RegisteredNodeDescriptor>();

function createOutputHandle<T>(nodeId: string, slot: string): OutputHandle<T> {
  return Object.freeze({
    __brand: "OutputHandle" as const,
    nodeId,
    slot
  });
}

export type CreateNodeOptions<
  TOutputs extends object,
  TDefault extends OutputSlot<TOutputs> | undefined = undefined
> = {
  streaming?: boolean;
  outputNames?: readonly OutputSlot<TOutputs>[];
  defaultOutput?: TDefault;
  multiOutput?: boolean;
};

// ---------------------------------------------------------------------------
// createNode() — used by generated factories
// ---------------------------------------------------------------------------

export function createNode<
  TOutputs extends object,
  TDefault extends OutputSlot<TOutputs> | undefined =
    TOutputs extends SingleOutput<infer _TValue, infer TSlot>
      ? Extract<TSlot, OutputSlot<TOutputs>>
      : undefined
>(
  nodeType: string,
  inputs: Record<string, unknown>,
  opts?: CreateNodeOptions<TOutputs, TDefault>
): DslNode<TOutputs, TDefault> {
  const nodeId = crypto.randomUUID();
  const streaming = opts?.streaming ?? false;
  const outputNames = opts?.outputNames
    ? [...opts.outputNames]
    : opts?.multiOutput
      ? []
      : [opts?.defaultOutput ?? "output"];
  const defaultOutput =
    opts?.defaultOutput ??
    (outputNames.length === 1 && !opts?.multiOutput
      ? outputNames[0]
      : undefined);

  const descriptor: RegisteredNodeDescriptor = {
    nodeId,
    nodeType,
    inputs,
    streaming
  };
  nodeRegistry.set(nodeId, descriptor);

  const knownOutputs = new Set<string>(outputNames);
  const output = Object.freeze(((slot?: string) => {
    const resolvedSlot = slot ?? defaultOutput;
    if (!resolvedSlot) {
      throw new Error(`Node ${nodeType} requires an explicit output slot`);
    }
    if (knownOutputs.size > 0 && !knownOutputs.has(resolvedSlot)) {
      throw new Error(
        `Unknown output slot '${resolvedSlot}' for node type ${nodeType}`
      );
    }
    return createOutputHandle(nodeId, resolvedSlot);
  }) as OutputAccessor<TOutputs, TDefault>);

  const node = Object.freeze({
    nodeId,
    nodeType,
    inputs,
    output
  }) as DslNode<TOutputs, TDefault>;

  return node;
}

// ---------------------------------------------------------------------------
// workflow() — BFS graph tracing
// ---------------------------------------------------------------------------

export function workflow(...terminals: DslNode<any>[]): Workflow {
  if (terminals.length === 0) {
    throw new Error("workflow() requires at least one terminal node");
  }

  const visited = new Map<string, RegisteredNodeDescriptor>();
  const edges: WorkflowEdge[] = [];
  const queue: string[] = [];

  // Seed BFS with terminal nodes
  for (const terminal of terminals) {
    const desc = nodeRegistry.get(terminal.nodeId);
    if (!desc) {
      throw new Error(
        `Node not found: ${terminal.nodeId} — this handle may belong to a previous workflow() build`
      );
    }
    if (!visited.has(terminal.nodeId)) {
      visited.set(terminal.nodeId, desc);
      queue.push(terminal.nodeId);
    }
  }

  // BFS
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const desc = visited.get(currentId)!;

    for (const [inputName, value] of Object.entries(desc.inputs)) {
      if (isOutputHandle(value)) {
        // Create edge
        edges.push({
          source: value.nodeId,
          sourceHandle: value.slot,
          target: currentId,
          targetHandle: inputName
        });

        // Enqueue source if not visited
        if (!visited.has(value.nodeId)) {
          const sourceDesc = nodeRegistry.get(value.nodeId);
          if (!sourceDesc) {
            throw new Error(
              `Node not found: ${value.nodeId} — this handle may belong to a previous workflow() build`
            );
          }
          visited.set(value.nodeId, sourceDesc);
          queue.push(value.nodeId);
        }
      }
    }
  }

  // Topological sort + cycle detection (Kahn's algorithm)
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();
  for (const id of visited.keys()) {
    inDegree.set(id, 0);
    adjList.set(id, []);
  }
  for (const edge of edges) {
    adjList.get(edge.source)!.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  const topoQueue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) topoQueue.push(id);
  }
  const sorted: string[] = [];
  while (topoQueue.length > 0) {
    const id = topoQueue.shift()!;
    sorted.push(id);
    for (const neighbor of adjList.get(id)!) {
      const newDeg = inDegree.get(neighbor)! - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) topoQueue.push(neighbor);
    }
  }
  if (sorted.length !== visited.size) {
    throw new Error("Workflow contains a cycle");
  }

  // Build WorkflowNodes — strip OutputHandle values from data
  const nodes: WorkflowNode[] = sorted.map((id) => {
    const desc = visited.get(id)!;
    const data: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(desc.inputs)) {
      if (!isOutputHandle(val)) {
        data[key] = val;
      }
    }
    return {
      id: desc.nodeId,
      type: desc.nodeType,
      data,
      streaming: desc.streaming
    };
  });

  // Clear registry
  nodeRegistry.clear();

  return Object.freeze({ nodes, edges });
}

// ---------------------------------------------------------------------------
// run() / runGraph() — execution helpers
// ---------------------------------------------------------------------------

export type RunOptions = {
  userId?: string;
  authToken?: string;
  /** Custom node registry; defaults to NodeRegistry.global. */
  registry?: NodeRegistry;
};

export type WorkflowResult = Record<string, unknown>;

export async function run(
  wf: Workflow,
  opts?: RunOptions
): Promise<WorkflowResult> {
  const jobId = crypto.randomUUID();
  const nodes: GraphNodeDescriptor[] = wf.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    properties: n.data,
    is_streaming_output: n.streaming
  }));

  const edges = wf.edges.map((e) => ({
    source: e.source,
    sourceHandle: e.sourceHandle,
    target: e.target,
    targetHandle: e.targetHandle
  })) as Edge[];

  const context = new ProcessingContext({
    jobId,
    userId: opts?.userId
  });

  const builtinRegistry = new NodeRegistry();
  const { registerBaseNodes } = await import("@nodetool/base-nodes");
  registerBaseNodes(builtinRegistry);
  try {
    const { registerElevenLabsNodes } =
      await import("@nodetool/elevenlabs-nodes");
    registerElevenLabsNodes(builtinRegistry);
  } catch {
    // Some environments do not have the ElevenLabs node package in a runnable state.
  }

  const resolveExecutor = (node: { id: string; type: string }) => {
    if (opts?.registry?.has(node.type)) {
      return opts.registry.resolve(node);
    }
    if (NodeRegistry.global.has(node.type)) {
      return NodeRegistry.global.resolve(node);
    }
    if (builtinRegistry.has(node.type)) {
      return builtinRegistry.resolve(node);
    }
    throw new Error(`Unknown node type: ${node.type}`);
  };

  const runner = new WorkflowRunner(jobId, {
    resolveExecutor,
    executionContext: context
  });

  const result = await runner.run({ job_id: jobId }, { nodes, edges });

  if (result.status === "failed") {
    throw new Error(result.error ?? "Workflow execution failed");
  }

  // Surface node-level errors: actors catch exceptions and return them as
  // node_update messages with status "error" without failing the whole run.
  const nodeErrors = (result.messages ?? []).filter(
    (m): m is NodeUpdate =>
      m.type === "node_update" && (m as NodeUpdate).status === "error"
  );
  if (nodeErrors.length > 0) {
    throw new Error(nodeErrors[0].error ?? "A node failed during execution");
  }

  const outputs: WorkflowResult = {};
  for (const [name, values] of Object.entries(result.outputs)) {
    if (values.length > 0) {
      outputs[name] = values[values.length - 1];
    }
  }
  return outputs;
}

export async function runGraph(
  ...terminals: DslNode<any>[]
): Promise<WorkflowResult> {
  return run(workflow(...terminals));
}
