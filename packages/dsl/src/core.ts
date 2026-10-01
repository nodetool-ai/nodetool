import { ExecutionSession, toRawGraphInput } from "@nodetool-ai/execution";
import type { InputSchema, WorkflowDefinition } from "./authoring.js";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import { usesStreamInputContract } from "@nodetool-ai/node-sdk";
import {
  ProcessingContext,
  type PythonBridgeOptions
} from "@nodetool-ai/runtime";
import {
  buildBuiltinRegistry,
  createExecutorResolver,
  createHasTsExecutor
} from "./registry.js";
import type {
  NodeDescriptor as GraphNodeDescriptor,
  NodeUpdate
} from "@nodetool-ai/protocol";

/** The one node type whose streaming-input mode is decided per instance. */
const CODE_NODE_TYPE = "nodetool.code.Code";

export interface OutputHandle<T> {
  readonly __brand: "OutputHandle";
  readonly nodeId: string;
  readonly slot: string;
  readonly __phantom?: T;
  readonly valueType?: string;
}

export function isOutputHandle(value: unknown): value is OutputHandle<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "__brand" in value &&
    value.__brand === "OutputHandle"
  );
}

export interface SingleOutputNode<T> {
  readonly defaultOutputHandle: OutputHandle<T>;
}

export type Connectable<T> = T | OutputHandle<T> | SingleOutputNode<T>;

export type SingleOutput<T, TSlot extends string = "output"> = {
  readonly [K in TSlot]: T;
};

export type OutputSlot<TOutputs extends object> = Extract<
  keyof TOutputs,
  string
>;

type IsUnion<T, TWhole = T> = T extends TWhole
  ? [TWhole] extends [T]
    ? false
    : true
  : never;

type DefaultOutputSlot<TOutputs extends object> = [
  OutputSlot<TOutputs>
] extends [never]
  ? undefined
  : IsUnion<OutputSlot<TOutputs>> extends false
    ? OutputSlot<TOutputs>
    : undefined;

export interface OutputAccessor<
  TOutputs extends object,
  TDefault extends OutputSlot<TOutputs> | undefined = undefined
> {
  (): TDefault extends OutputSlot<TOutputs>
    ? OutputHandle<TOutputs[TDefault]>
    : never;
  <K extends OutputSlot<TOutputs>>(slot: K): OutputHandle<TOutputs[K]>;
}

export interface DslNode<
  TOutputs extends object,
  TDefault extends OutputSlot<TOutputs> | undefined =
    DefaultOutputSlot<TOutputs>
> {
  readonly defaultOutputHandle: [DefaultOutputSlot<TOutputs>] extends [
    undefined
  ]
    ? undefined
    : TDefault extends OutputSlot<TOutputs>
      ? OutputHandle<TOutputs[TDefault]>
      : undefined;
  readonly nodeId: string;
  readonly nodeType: string;
  readonly inputs: Record<string, unknown>;
  readonly output: OutputAccessor<TOutputs, TDefault>;
}

export type OutputHandles<TOutputs extends object> = {
  readonly [K in OutputSlot<TOutputs>]: OutputHandle<TOutputs[K]>;
};
export type NamedOutputs<TOutputs extends object> = {
  readonly outputs: OutputHandles<TOutputs>;
} & (string extends keyof TOutputs
  ? object
  : {
      readonly [K in Exclude<
        OutputSlot<TOutputs>,
        | keyof DslNode<TOutputs>
        | "outputs"
        | "then"
        | "constructor"
        | "__proto__"
      >]: OutputHandle<TOutputs[K]>;
    });

export type NodeWithOutputs<
  TOutputs extends object,
  TDefault extends OutputSlot<TOutputs> | undefined =
    DefaultOutputSlot<TOutputs>
> = DslNode<TOutputs, TDefault> & NamedOutputs<TOutputs>;

export interface WorkflowNode {
  readonly id: string;
  readonly type: string;
  readonly data: Record<string, unknown>;
  readonly streaming: boolean;
  readonly streamingInput: boolean;
  readonly dynamic_outputs?: Record<
    string,
    { type: string; type_args: never[] }
  >;
  readonly input_mode?: import("@nodetool-ai/protocol").InputMode;
  readonly output_correlation?: Record<
    string,
    import("@nodetool-ai/protocol").OutputCorrelation
  >;
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

export type WorkflowTerminal = Pick<
  DslNode<Record<string, unknown>, string>,
  "nodeId"
>;

interface RegisteredNodeDescriptor {
  nodeId: string;
  nodeType: string;
  inputs: Record<string, unknown>;
  streaming: boolean;
  streamingInput: boolean;
  outputTypes?: Record<string, string>;
  dynamicOutputs?: Record<string, { type: string; type_args: never[] }>;
  inputMode?: import("@nodetool-ai/protocol").InputMode;
  outputCorrelation?: Record<
    string,
    import("@nodetool-ai/protocol").OutputCorrelation
  >;
}

let nodeRegistry = new Map<string, RegisteredNodeDescriptor>();
let nodeScope = "";
let scopeCounters = new Map<string, number>();
let captureConnection:
  | ((handle: OutputHandle<unknown>) => OutputHandle<unknown>)
  | undefined;

/** @internal Isolate a synchronous graph build and restore the enclosing build. */
export function withBuildScope<T>(
  build: () => T,
  capture?: (handle: OutputHandle<unknown>) => OutputHandle<unknown>
): T {
  const previous = {
    nodeRegistry,
    nodeScope,
    scopeCounters,
    captureConnection
  };
  nodeRegistry = new Map();
  nodeScope = "";
  scopeCounters = new Map();
  captureConnection = capture;
  try {
    return build();
  } finally {
    ({ nodeRegistry, nodeScope, scopeCounters, captureConnection } = previous);
  }
}

/** @internal Namespace one composed instantiation without clearing its parent. */
export function withNodeScope<T>(id: string | undefined, build: () => T): T {
  if (id !== undefined && (typeof id !== "string" || !id.length))
    throw new Error("Workflow scope id must be a non-empty string");
  const previous = nodeScope;
  const stem = previous + (id ?? "call");
  const count = (scopeCounters.get(stem) ?? 0) + 1;
  if (id && count > 1) throw new Error(`Duplicate workflow scope "${stem}"`);
  scopeCounters.set(stem, count);
  nodeScope = stem + (id ? "/" : `_${count}/`);
  try {
    return build();
  } finally {
    nodeScope = previous;
  }
}
const dslNodes = new WeakMap<object, RegisteredNodeDescriptor>();
const handleDescriptors = new WeakMap<object, RegisteredNodeDescriptor>();

/** Resolve a symbolic connection, leaving literal values unchanged. */
export function resolveConnection(
  value: unknown
): OutputHandle<unknown> | undefined {
  if (isOutputHandle(value)) {
    const descriptor = handleDescriptors.get(value);
    return captureConnection &&
      descriptor &&
      nodeRegistry.get(value.nodeId) !== descriptor
      ? captureConnection(value)
      : value;
  }
  if (typeof value === "object" && value !== null && dslNodes.has(value)) {
    const node = value as DslNode<Record<string, unknown>, string>;
    if (!node.defaultOutputHandle) {
      throw new Error(`Node ${node.nodeType} requires an explicit output slot`);
    }
    return resolveConnection(node.defaultOutputHandle);
  }
  return undefined;
}

/** @internal Original producer identity, including isolated build scopes. */
export function connectionIdentity(handle: OutputHandle<unknown>): object {
  return handleDescriptors.get(handle) ?? handle;
}

/** @internal Port name shared with the guest handle adapter. */
export function connectionSlot(handle: OutputHandle<unknown>): string {
  return handle.slot;
}

function createOutputHandle<T>(
  nodeId: string,
  slot: string,
  descriptor: RegisteredNodeDescriptor
): OutputHandle<T> {
  const handle: OutputHandle<T> = { __brand: "OutputHandle", nodeId, slot };
  if (descriptor.outputTypes?.[slot]) {
    Object.assign(handle, { valueType: descriptor.outputTypes[slot] });
  }
  Object.freeze(handle);
  handleDescriptors.set(handle, descriptor);
  return handle;
}

/** Optional authored identity shared by generated factories. */
export interface NodeOptions {
  id?: string;
}

export type CreateNodeOptions<
  TOutputs extends object,
  TDefault extends OutputSlot<TOutputs> | undefined = undefined
> = NodeOptions & {
  streaming?: boolean;
  streamingInput?: boolean;
  outputNames?: readonly OutputSlot<TOutputs>[];
  defaultOutput?: TDefault;
  multiOutput?: boolean;
  outputTypes?: Record<string, string>;
  dynamicOutputs?: Record<string, { type: string; type_args: never[] }>;
  inputMode?: import("@nodetool-ai/protocol").InputMode;
  outputCorrelation?: Record<
    string,
    import("@nodetool-ai/protocol").OutputCorrelation
  >;
};

export function createNode<
  TOutputs extends object,
  TDefault extends OutputSlot<TOutputs> | undefined =
    DefaultOutputSlot<TOutputs>
>(
  nodeType: string,
  inputs: Record<string, unknown>,
  opts?: CreateNodeOptions<TOutputs, TDefault>
): NodeWithOutputs<TOutputs, TDefault> {
  if (
    opts?.id !== undefined &&
    (typeof opts.id !== "string" || opts.id.length === 0)
  ) {
    throw new Error("Node id must be a non-empty string");
  }
  const nodeId = nodeScope + (opts?.id ?? crypto.randomUUID());
  if (nodeRegistry.has(nodeId)) {
    throw new Error(`Duplicate node id "${nodeId}"`);
  }
  inputs = Object.fromEntries(
    Object.entries(inputs).map(([key, value]) => [
      key,
      resolveConnection(value) ?? value
    ])
  );
  const streaming = opts?.streaming ?? false;
  // The generated helpers stamp `streamingInput` from per-type metadata, which
  // cannot carry the Code node's answer: its mode is a property of the body.
  // DSL execution preserves these explicit flags rather than hydrating them
  // from a registry, so the probe has to run here or a streaming body would
  // be invoked per item and never see its inputs.
  const streamingInput =
    opts?.streamingInput ??
    (nodeType === CODE_NODE_TYPE &&
      usesStreamInputContract(String(inputs?.["code"] ?? "")));
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
    streaming,
    streamingInput,
    outputTypes: opts?.outputTypes,
    dynamicOutputs: opts?.dynamicOutputs,
    inputMode: opts?.inputMode,
    outputCorrelation: opts?.outputCorrelation
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
    return createOutputHandle(nodeId, resolvedSlot, descriptor);
  }) as OutputAccessor<TOutputs, TDefault>);

  const node = {
    nodeId,
    nodeType,
    inputs,
    output,
    outputs: Object.freeze(
      Object.fromEntries(
        outputNames.map((name) => [name, output(name as OutputSlot<TOutputs>)])
      ) as OutputHandles<TOutputs>
    ),
    defaultOutputHandle: (outputNames.length === 1 &&
    !opts?.multiOutput &&
    defaultOutput
      ? output()
      : undefined) as DslNode<TOutputs, TDefault>["defaultOutputHandle"],
    [Symbol.toPrimitive]: () => {
      throw new Error(
        "Cannot coerce a DSL node to a primitive. Pass it directly to an input or select node.output(slot)."
      );
    }
  };
  const reserved = new Set([
    ...Object.keys(node),
    "then",
    "constructor",
    "__proto__"
  ]);
  for (const name of outputNames) {
    if (!reserved.has(name)) {
      Object.defineProperty(node, name, {
        get: () => output(name as OutputSlot<TOutputs>)
      });
    }
  }
  Object.freeze(node);
  dslNodes.set(node, descriptor);

  return node as NodeWithOutputs<TOutputs, TDefault>;
}

/**
 * Find an {@link OutputHandle} nested inside a prop value — in an array, or
 * under an object key. Returns the path to the first one, or null.
 *
 * `workflow()` derives edges from handles sitting *directly* on an input, so a
 * handle one level down is not a connection: it used to be written verbatim
 * into the node's `data`, the node producing it was never reached, and the
 * graph validated clean with the producer missing entirely. Reporting the path
 * is what turns that silent hole into an error a caller can act on.
 */
function findNestedHandlePath(
  value: unknown,
  seen: Set<object>
): string | null {
  if (typeof value !== "object" || value === null) return null;
  if (seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      if (resolveConnection(item)) return `[${i}]`;
      const deeper = findNestedHandlePath(item, seen);
      if (deeper !== null) return `[${i}]${deeper}`;
    }
    return null;
  }
  for (const [key, item] of Object.entries(value)) {
    if (resolveConnection(item)) return `.${key}`;
    const deeper = findNestedHandlePath(item, seen);
    if (deeper !== null) return `.${key}${deeper}`;
  }
  return null;
}

/**
 * Refuse a prop that buries a node reference where no edge can be drawn from
 * it. The message names the one shape that works: a handle per input, which
 * for a node with dynamic inputs means one named slot per source.
 */
function assertNoNestedHandles(desc: RegisteredNodeDescriptor): void {
  for (const [inputName, value] of Object.entries(desc.inputs)) {
    if (isOutputHandle(value)) continue;
    const path = findNestedHandlePath(value, new Set());
    if (path === null) continue;
    throw new Error(
      `${desc.nodeType} input "${inputName}" holds a node output at ` +
        `"${inputName}${path}". A connection is only made from a handle ` +
        `assigned directly to an input — one nested in an array or object is ` +
        `not wired, and the node producing it is left out of the graph. Give ` +
        `each source its own input (e.g. {video1: a.output(), video2: ` +
        `b.output()}) instead of a list.`
    );
  }
}

export function workflow(...terminals: WorkflowTerminal[]): Workflow {
  if (terminals.length === 0) {
    throw new Error("workflow() requires at least one terminal node");
  }

  const visited = new Map<string, RegisteredNodeDescriptor>();
  const edges: WorkflowEdge[] = [];
  const queue: string[] = [];

  for (const terminal of terminals) {
    const desc = nodeRegistry.get(terminal.nodeId);
    if (!desc || (dslNodes.has(terminal) && dslNodes.get(terminal) !== desc)) {
      throw new Error(
        `Node not found: ${terminal.nodeId} — this handle may belong to a previous workflow() build`
      );
    }
    if (!visited.has(terminal.nodeId)) {
      visited.set(terminal.nodeId, desc);
      queue.push(terminal.nodeId);
    }
  }

  for (let queueIndex = 0; queueIndex < queue.length; queueIndex++) {
    const currentId = queue[queueIndex]!;
    const desc = visited.get(currentId)!;
    assertNoNestedHandles(desc);

    for (const [inputName, value] of Object.entries(desc.inputs)) {
      if (isOutputHandle(value)) {
        if (
          handleDescriptors.has(value) &&
          handleDescriptors.get(value) !== nodeRegistry.get(value.nodeId)
        ) {
          throw new Error(
            `Node not found: ${value.nodeId} — this handle belongs to a previous workflow() build`
          );
        }
        edges.push({
          source: value.nodeId,
          sourceHandle: value.slot,
          target: currentId,
          targetHandle: inputName
        });

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
  for (let queueIndex = 0; queueIndex < topoQueue.length; queueIndex++) {
    const id = topoQueue[queueIndex]!;
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
    const node: WorkflowNode = {
      id: desc.nodeId,
      type: desc.nodeType,
      data,
      streaming: desc.streaming,
      streamingInput: desc.streamingInput
    };
    if (desc.dynamicOutputs) {
      Object.assign(node, { dynamic_outputs: desc.dynamicOutputs });
    }
    if (desc.inputMode) {
      Object.assign(node, { input_mode: desc.inputMode });
    }
    if (desc.outputCorrelation) {
      Object.assign(node, { output_correlation: desc.outputCorrelation });
    }
    return node;
  });

  nodeRegistry.clear();
  scopeCounters.clear();

  return Object.freeze({ nodes, edges });
}

export type SecretResolver = (
  key: string,
  userId: string
) => Promise<string | null | undefined> | string | null | undefined;

export type RunOptions = {
  params?: Record<string, unknown>;
  userId?: string;
  authToken?: string;
  /** Custom node registry; defaults to NodeRegistry.global. */
  registry?: NodeRegistry;
  /**
   * Resolve a credential by name for the running job. Bind your storage
   * backend here — typically `(key, userId) => getSecret(key, userId)` from
   * `@nodetool-ai/models`. Without it the context falls back to env vars
   * only, and any node declaring `requiredSettings` will warn that its
   * secret is missing.
   */
  secretResolver?: SecretResolver;
  /**
   * Python worker bridge options forwarded to {@link createPythonBridge} when
   * the graph contains Python nodes. Omit to rely on the environment
   * (`NODETOOL_WORKER_URL` / `NODETOOL_WORKER_TOKEN`); set `wsUrl`/`workerToken`
   * here to target a specific remote worker programmatically.
   */
  bridgeOptions?: PythonBridgeOptions;
};

export type WorkflowResult = Record<string, unknown>;

export function run<I extends InputSchema, O extends Record<string, unknown>>(
  wf: WorkflowDefinition<I, O>,
  opts?: Omit<RunOptions, "params"> & {
    params?: import("./authoring.js").WorkflowParams<I>;
  }
): Promise<import("./authoring.js").WorkflowValues<O>>;
export function run(
  wf: Workflow & { inputSchema?: never },
  opts?: RunOptions
): Promise<WorkflowResult>;
export async function run(
  wf: Workflow,
  opts?: RunOptions
): Promise<WorkflowResult> {
  const jobId = crypto.randomUUID();
  const nodes: GraphNodeDescriptor[] = wf.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    properties: n.data,
    dynamic_outputs: n.dynamic_outputs,
    output_correlation: n.output_correlation,
    input_mode: n.input_mode,
    is_streaming_output: n.streaming,
    is_streaming_input: n.streamingInput
  }));

  const edges = wf.edges.map((e) => ({
    source: e.source,
    sourceHandle: e.sourceHandle,
    target: e.target,
    targetHandle: e.targetHandle
  }));

  const context = new ProcessingContext({
    jobId,
    // Default to user "1" — matches the CLI's default user-id, so secrets
    // stored via `nodetool secrets store <KEY>` resolve out of the box.
    userId: opts?.userId ?? "1",
    secretResolver: opts?.secretResolver
  });

  const builtinRegistry = await buildBuiltinRegistry();
  const hasTsExecutor = createHasTsExecutor(opts?.registry, builtinRegistry);

  const sessionOptions: Parameters<typeof ExecutionSession.create>[0] = {
    graph: toRawGraphInput({ nodes, edges }),
    jobId,
    context,
    hasTsExecutor,
    params: opts?.params,
    executorResolverFactory: (bridge) => {
      const resolveExecutor = createExecutorResolver(
        opts,
        builtinRegistry,
        bridge
      );
      context.setResolveExecutor((node) =>
        resolveExecutor(node as GraphNodeDescriptor)
      );
      return resolveExecutor;
    },
    preflight: false,
    installHeadlessPermissionGate: false,
    recordCosts: false
  };
  if (opts?.bridgeOptions) {
    sessionOptions.bridgeOptions = opts.bridgeOptions;
  }
  const session = await ExecutionSession.create(sessionOptions);
  const result = await session.result;

  if (result.status === "failed") {
    throw new Error(result.error ?? "Workflow execution failed");
  }

  // Actor failures now fail the run. Keep the legacy message check for
  // error updates retained in other results, including cancellation races.
  const nodeErrors = (result.messages ?? []).filter(
    (m): m is NodeUpdate => m.type === "node_update" && m.status === "error"
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
  ...terminals: DslNode<never>[]
): Promise<WorkflowResult> {
  return run(workflow(...terminals));
}
