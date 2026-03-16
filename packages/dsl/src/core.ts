/**
 * @nodetool/dsl – Core DSL primitives
 *
 * OutputHandle, Connectable, DslNode, SingleOutput, createNode(), workflow(), run()
 */

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

export interface SingleOutput<T> {
  readonly __singleOutput: true;
  readonly output: OutputHandle<T>;
}

// ---------------------------------------------------------------------------
// DslNode
// ---------------------------------------------------------------------------

export interface DslNode<TOutputs> {
  readonly nodeId: string;
  readonly nodeType: string;
  readonly inputs: Record<string, unknown>;
  readonly output: TOutputs extends SingleOutput<infer U>
    ? OutputHandle<U>
    : never;
  readonly out: TOutputs;
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

interface NodeDescriptor {
  nodeId: string;
  nodeType: string;
  inputs: Record<string, unknown>;
  streaming: boolean;
}

const nodeRegistry = new Map<string, NodeDescriptor>();

// ---------------------------------------------------------------------------
// createNode() — used by generated factories
// ---------------------------------------------------------------------------

export function createNode<TOutputs>(
  nodeType: string,
  inputs: Record<string, unknown>,
  opts?: { streaming?: boolean; multiOutput?: boolean }
): DslNode<TOutputs> {
  const nodeId = crypto.randomUUID();
  const streaming = opts?.streaming ?? false;
  const multiOutput = opts?.multiOutput ?? false;

  const descriptor: NodeDescriptor = { nodeId, nodeType, inputs, streaming };
  nodeRegistry.set(nodeId, descriptor);

  // Lazy proxy for .out — creates OutputHandle for any slot accessed
  const outProxy = new Proxy(
    {} as any,
    {
      get(_target, prop: string) {
        const handle: OutputHandle<any> = Object.freeze({
          __brand: "OutputHandle" as const,
          nodeId,
          slot: prop,
        });
        return handle;
      },
    }
  );

  // For multi-output nodes, .output is undefined at runtime (type is `never`)
  // For single-output nodes, .output is a real OutputHandle
  const outputHandle = multiOutput
    ? undefined
    : Object.freeze({
        __brand: "OutputHandle" as const,
        nodeId,
        slot: "output",
      });

  const node = Object.freeze({
    nodeId,
    nodeType,
    inputs,
    output: outputHandle,
    out: outProxy,
  }) as DslNode<TOutputs>;

  return node;
}

// ---------------------------------------------------------------------------
// workflow() — BFS graph tracing
// ---------------------------------------------------------------------------

export function workflow(...terminals: DslNode<any>[]): Workflow {
  if (terminals.length === 0) {
    throw new Error("workflow() requires at least one terminal node");
  }

  const visited = new Map<string, NodeDescriptor>();
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
          targetHandle: inputName,
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
    return { id: desc.nodeId, type: desc.nodeType, data, streaming: desc.streaming };
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
};

export type WorkflowResult = Record<string, unknown>;

export async function run(
  _wf: Workflow,
  _opts?: RunOptions
): Promise<WorkflowResult> {
  // Placeholder — actual integration with WorkflowRunner deferred
  throw new Error("run() is not yet implemented — use workflow() to build graphs");
}

export async function runGraph(
  ...terminals: DslNode<any>[]
): Promise<WorkflowResult> {
  return run(workflow(...terminals));
}
