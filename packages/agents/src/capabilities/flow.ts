/**
 * The `flow` capability module — running a registry node from guest code.
 *
 * The public "native flow" surface is a typed sandbox pack the guest imports;
 * this is the host half it lands on. Four capabilities, and nothing else,
 * cross the boundary:
 *
 *   invoke_node       — run a node, return its outputs
 *   open_node_stream  — start a node, read its output item by item
 *   take_node_stream  — one item, or {done: true}
 *   close_node_stream — end it early and run the node's cleanup
 *
 * Streaming is cursor-shaped because an async iterable cannot cross the
 * boundary: only plain data can, so the host holds the iterator and the guest
 * pulls one item per call.
 *
 * Execution is the DSL's own native-flow backend (`@nodetool-ai/dsl/flow`) —
 * registry resolve, `process()`/`genProcess()`/`run()`, the same fold the
 * runner applies to terminal outputs. It runs on the **invoking** run's
 * `ProcessingContext`, so cost, secrets and storage belong to the run that
 * asked, not to a fresh flow of its own.
 *
 * That package is loaded through `importHidden`. A static import would close a
 * workspace cycle — `@nodetool-ai/dsl` → `base-nodes` → `code-nodes` →
 * `@nodetool-ai/agents` — which the topological build cannot order. The hidden
 * import keeps the edge out of the package graph and out of every bundler's
 * static analysis; a host that cannot resolve the specifier reports that
 * instead of failing on an unresolved module.
 *
 * A Code node body can invoke a flow containing another Code node, so the
 * depth gate is not optional: `enterFlowInvoke` mirrors `enterJsScript`.
 */

import { importHidden } from "@nodetool-ai/config";
import type { ProcessingContext } from "@nodetool-ai/runtime";

import type {
  CapabilityExport,
  CapabilityModule,
  CapabilityRun
} from "./types.js";
import {
  invokeNodeSpec,
  openNodeStreamSpec,
  takeNodeStreamSpec,
  closeNodeStreamSpec,
  MAX_FLOW_INVOKE_DEPTH,
  MAX_OPEN_NODE_STREAMS
} from "./flow.specs.js";
import { isNonBlankString, isRecord } from "../utils/type-guards.js";

export {
  MAX_FLOW_INVOKE_DEPTH,
  MAX_OPEN_NODE_STREAMS
} from "./flow.specs.js";

/** Context variable carrying how many node invocations deep this run is. */
export const FLOW_INVOKE_DEPTH_KEY = "__flow_invoke_depth";

/** Context variable carrying the node types already on the call chain. */
export const FLOW_INVOKE_CHAIN_KEY = "__flow_invoke_chain";

// ---------------------------------------------------------------------------
// The backend, loaded without closing a package cycle
// ---------------------------------------------------------------------------

/** One `outputs.emit(slot, value)` from a streaming-input node. */
interface StreamEmission {
  slot: string;
  value: unknown;
}

/** What a node call yields: one output record, or one emission. */
type StreamItem = Record<string, unknown> | StreamEmission;

/** A flow handle. Only its lifetime matters here. */
interface FlowHandle {
  close(): Promise<void>;
}

/**
 * The slice of `@nodetool-ai/dsl/flow` this module uses, written out rather
 * than imported as a type: a `typeof import(...)` is still an import, and the
 * point of the hidden load is that no reference to the package survives.
 */
interface FlowBackend {
  createFlowForContext(context: ProcessingContext): Promise<FlowHandle>;
  invoke(
    nodeType: string,
    inputs: Record<string, unknown>,
    opts?: { flow?: FlowHandle }
  ): Promise<Record<string, unknown>>;
  invokeStream(
    nodeType: string,
    inputs: Record<string, unknown>,
    opts?: { flow?: FlowHandle }
  ): AsyncGenerator<StreamItem>;
}

const FLOW_MODULE = "@nodetool-ai/dsl/flow";

let backendPromise: Promise<FlowBackend | null> | null = null;

function loadFlowBackend(): Promise<FlowBackend | null> {
  backendPromise ??= importHidden<FlowBackend>(FLOW_MODULE).catch(() => null);
  return backendPromise;
}

/** Test seam: pin the backend (or `null` to restore the real load). */
export function setFlowBackend(backend: FlowBackend | null): void {
  backendPromise = backend === null ? null : Promise.resolve(backend);
}

async function requireBackend(): Promise<FlowBackend> {
  const backend = await loadFlowBackend();
  if (!backend) {
    throw new Error(
      `Nodes cannot be invoked in this process: "${FLOW_MODULE}" does not ` +
        "resolve here."
    );
  }
  return backend;
}

// ---------------------------------------------------------------------------
// Recursion accounting
// ---------------------------------------------------------------------------

interface FlowDepthGate {
  ok: boolean;
  refusal?: Record<string, unknown>;
  childContext?: ProcessingContext;
}

/**
 * Enter one node invocation: refuse past the depth cap, else return a context
 * copy carrying the deeper chain. The same gate `enterJsScript` applies, over
 * this feature's own two keys — a node can be a Code node, whose body can
 * invoke another node, so without it the recursion has no floor.
 *
 * Unlike a script chain, a repeated node type is not a cycle: invoking
 * `nodetool.text.Concat` twice at different depths is ordinary work. Depth is
 * what bounds this, and the chain rides along so a refusal can say where it
 * came from.
 */
export function enterFlowInvoke(
  context: ProcessingContext,
  nodeType: string,
  maxDepth: number = MAX_FLOW_INVOKE_DEPTH
): FlowDepthGate {
  const depth = context.get<number>(FLOW_INVOKE_DEPTH_KEY) ?? 0;
  const chain = context.get<string[]>(FLOW_INVOKE_CHAIN_KEY) ?? [];

  if (depth >= maxDepth) {
    return {
      ok: false,
      refusal: {
        error: "max_flow_invoke_depth_reached",
        depth,
        max_depth: maxDepth,
        chain: [...chain],
        message:
          `Cannot invoke ${nodeType} — the node invocation depth limit of ` +
          `${maxDepth} is reached (${[...chain, nodeType].join(" → ")}). ` +
          "Finish the work at this level instead."
      }
    };
  }

  const childContext = context.copy();
  childContext.set(FLOW_INVOKE_DEPTH_KEY, depth + 1);
  childContext.set(FLOW_INVOKE_CHAIN_KEY, [...chain, nodeType]);
  return { ok: true, childContext };
}

/**
 * Narrow what the invoked node may read. A list can only take names away from
 * the invoking run's own reach: the filter delegates to the parent context, so
 * a name the caller could not read stays unreadable.
 */
function narrowSecrets(
  parent: ProcessingContext,
  child: ProcessingContext,
  names: unknown
): void {
  if (!Array.isArray(names)) return;
  const allowed = new Set(names.filter(isNonBlankString));
  child.setSecretResolver(async (key: string) =>
    allowed.has(key) ? parent.getSecret(key) : null
  );
}

// ---------------------------------------------------------------------------
// Open streams, per run
// ---------------------------------------------------------------------------

interface OpenStream {
  iterator: AsyncIterator<StreamItem>;
  flow: FlowHandle;
  /** A second concurrent take would reject the generator's pending next(). */
  taking: boolean;
}

/**
 * The stream table lives on the run, not on this module: two runs may hold
 * ids of the same shape, and neither may reach the other's iterator. It is
 * weak so a run that is simply dropped takes its table with it, and every
 * stream is closed when the run's own signal aborts.
 */
const STREAMS = new WeakMap<CapabilityRun, Map<string, OpenStream>>();

function streamTable(run: CapabilityRun): Map<string, OpenStream> {
  const existing = STREAMS.get(run);
  if (existing) return existing;
  const table = new Map<string, OpenStream>();
  STREAMS.set(run, table);
  run.context.signal?.addEventListener(
    "abort",
    () => {
      void closeAllStreams(run);
    },
    { once: true }
  );
  return table;
}

/** Close every stream this run holds. Called when the run is cancelled. */
export async function closeAllStreams(run: CapabilityRun): Promise<void> {
  const table = STREAMS.get(run);
  if (!table) return;
  const open = [...table.keys()];
  table.clear();
  await Promise.all(open.map((id) => releaseStream({ id, table })));
}

/** Every held stream, so the release path is written once. */
const released = new WeakSet<OpenStream>();

async function release(stream: OpenStream): Promise<void> {
  if (released.has(stream)) return;
  released.add(stream);
  // `return()` is what runs the node's own `finally`, which is the whole
  // reason an early close exists rather than dropping the iterator.
  await stream.iterator.return?.(undefined).catch(() => {});
  await stream.flow.close().catch(() => {});
}

async function releaseStream(entry: {
  id: string;
  table: Map<string, OpenStream>;
  stream?: OpenStream;
}): Promise<void> {
  const stream = entry.stream ?? entry.table.get(entry.id);
  entry.table.delete(entry.id);
  if (stream) await release(stream);
}

let streamCounter = 0;

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

function nodeType(params: Record<string, unknown>): string {
  const type = params["type"];
  if (!isNonBlankString(type)) {
    throw new Error(
      "type is required — the node type to run, e.g. nodetool.text.Concat."
    );
  }
  return type.trim();
}

function nodeInputs(params: Record<string, unknown>): Record<string, unknown> {
  const inputs = params["inputs"];
  return isRecord(inputs) ? { ...(inputs as Record<string, unknown>) } : {};
}

/** The context one invocation runs on, or the gate's refusal. */
function childContext(
  run: CapabilityRun,
  type: string,
  secrets: unknown
): { context: ProcessingContext } | { refusal: Record<string, unknown> } {
  const gate = enterFlowInvoke(run.context, type);
  if (!gate.ok || !gate.childContext) {
    return { refusal: gate.refusal ?? { error: "flow_invoke_refused" } };
  }
  narrowSecrets(run.context, gate.childContext, secrets);
  return { context: gate.childContext };
}

const invokeNode: CapabilityExport = {
  spec: invokeNodeSpec,
  impl: async (run, params) => {
    const type = nodeType(params);
    const gated = childContext(run, type, params["secrets"]);
    if ("refusal" in gated) return gated.refusal;

    const backend = await requireBackend();
    const flow = await backend.createFlowForContext(gated.context);
    try {
      // The outputs record itself, keyed by handle — the shape the typed
      // guest pack returns to its caller unchanged.
      return await backend.invoke(type, nodeInputs(params), { flow });
    } finally {
      await flow.close();
    }
  }
};

const openNodeStream: CapabilityExport = {
  spec: openNodeStreamSpec,
  impl: async (run, params) => {
    const type = nodeType(params);
    const table = streamTable(run);
    if (table.size >= MAX_OPEN_NODE_STREAMS) {
      return {
        error: "too_many_open_node_streams",
        open: table.size,
        max_open: MAX_OPEN_NODE_STREAMS,
        message:
          `Cannot open another node stream — ${MAX_OPEN_NODE_STREAMS} are ` +
          "already open. Close one with close_node_stream first."
      };
    }

    // No `secrets` here: the wire shape is {type, inputs}, and a stream reads
    // the invoking run's own reach unchanged.
    const gated = childContext(run, type, undefined);
    if ("refusal" in gated) return gated.refusal;

    const backend = await requireBackend();
    const flow = await backend.createFlowForContext(gated.context);
    const iterator = backend
      .invokeStream(type, nodeInputs(params), { flow })
      [Symbol.asyncIterator]();

    streamCounter += 1;
    const streamId = `node-stream-${streamCounter}`;
    table.set(streamId, { iterator, flow, taking: false });
    return { stream_id: streamId };
  }
};

const takeNodeStream: CapabilityExport = {
  spec: takeNodeStreamSpec,
  impl: async (run, params) => {
    const table = streamTable(run);
    const streamId = params["stream_id"];
    const stream = isNonBlankString(streamId)
      ? table.get(streamId)
      : undefined;
    if (!stream || !isNonBlankString(streamId)) {
      return {
        error: "unknown_node_stream",
        message:
          `No node stream ${JSON.stringify(streamId)} is open. Open one ` +
          "with open_node_stream; a stream that reported done is closed."
      };
    }
    if (stream.taking) {
      return {
        error: "node_stream_busy",
        message:
          `A take on ${streamId} is already in flight. Await it before ` +
          "taking again — one stream serves one reader."
      };
    }

    stream.taking = true;
    try {
      const next = await stream.iterator.next();
      if (next.done === true) {
        await releaseStream({ id: streamId, table, stream });
        return { done: true };
      }
      return { done: false, value: next.value };
    } catch (err) {
      // The node failed. The stream is over either way, so it does not stay
      // in the table waiting for a close nobody will send.
      await releaseStream({ id: streamId, table, stream });
      throw err;
    } finally {
      stream.taking = false;
    }
  }
};

const closeNodeStream: CapabilityExport = {
  spec: closeNodeStreamSpec,
  impl: async (run, params) => {
    const table = streamTable(run);
    const streamId = params["stream_id"];
    if (!isNonBlankString(streamId)) {
      return { error: "unknown_node_stream", message: "stream_id is required." };
    }
    const stream = table.get(streamId);
    await releaseStream({ id: streamId, table, stream });
    return { closed: true, was_open: stream !== undefined };
  }
};

export const FLOW_CAPABILITIES: readonly CapabilityExport[] = [
  invokeNode,
  openNodeStream,
  takeNodeStream,
  closeNodeStream
];

export const module: CapabilityModule = {
  module: "flow",
  exports: FLOW_CAPABILITIES
};

export { invokeNode, openNodeStream, takeNodeStream, closeNodeStream };
