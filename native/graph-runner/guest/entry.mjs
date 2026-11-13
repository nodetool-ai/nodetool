// Guest side of the native graph runner. The C++ kernel schedules the graph
// and calls into this object to create node instances and run their bodies.
// Every value crosses the boundary as a JSON string, with bytes tagged as
// values.mjs describes.
//
// `types()` lists the registry entry for every class, in the shape the
// server's createGraphNodeTypeResolver returns, so the kernel can normalize a
// graph the way the server does before running it.
//
// Host functions the kernel installs as `globalThis.__host` before the bundle
// runs:
//   log(level, message)
//   next(ioId, handle | null)            -> Promise<json {done, handle, data, lineage, source_edge_id}>
//   emit(ioId, slot, valueJson?, lineageJson?) -> Promise<void>
//   emitGroup(ioId, valuesJson, lineageJson?)  -> Promise<void>
//   drop(ioId, slot, lineageJson)        -> Promise<void>
//   complete(ioId, slot)
//   hasBuffered(ioId, handle) / hasStream(ioId, handle) -> boolean
//   scopeFor(ioId, handle) / invocationScope(ioId)      -> json string[]
//   <capability>.<function>              host capabilities (src/host/), used
//                                        by the context and modules in host/
// First, so every module below sees the guest's globals (env/index.mjs).
import "./env/index.mjs";
import { forkContext } from "./subgraph-context.mjs";
import { resetProcessEnvironment } from "./host/process.mjs";
import { applyDynamicSlotTypes, rewriteBypassedNodes, prepareInnerGraph } from "./scheduler-support.mjs";
import * as constant from "@nodetool-ai/core-nodes/nodes/constant";
import * as control from "@nodetool-ai/core-nodes/nodes/control";
import * as input from "@nodetool-ai/core-nodes/nodes/input";
import * as subgraph from "@nodetool-ai/core-nodes/nodes/subgraph";
import * as variable from "@nodetool-ai/core-nodes/nodes/variable";
import * as triggers from "@nodetool-ai/automation-nodes/nodes/triggers";
import {
  createGraphNodeTypeResolver,
  hasStreamingOutput,
  NodeRegistry
} from "@nodetool-ai/node-sdk";
import { AUDIO_RUN_KEY, resolveAudioRun, supportsPlatform } from "@nodetool-ai/protocol";
import { createContext } from "./host/context.mjs";
import { outputValue } from "./host/output.mjs";
import { fromJson, fromReply, fromWire, toJson, toWire, wireReply } from "./values.mjs";
// `{ nodeType: [{ spec, name, reason, note }] }`: the unavailable exports of
// the module contract each node type's code reaches, computed when the
// bundle is built (guest/module-contract-build.mjs).
import nodeRequirements from "nodetool:node-requirements";

const host = () => globalThis.__host;

const classes = new Map();
for (const mod of [constant, control, input, subgraph, variable, triggers]) {
  for (const value of Object.values(mod)) {
    if (typeof value === "function" && typeof value.nodeType === "string" && value.nodeType) {
      classes.set(value.nodeType, value);
    }
  }
}

// Lazy node modules (guest/parity/profile.mjs, PT7): set by the generated
// node entry, which evaluates before this body. With a type snapshot, types()
// and describe() of a bare type answer from it, and the kernel calls
// ensure(type) before it needs a type's class.
const lazyNodes = globalThis.__nodetoolLazyNodes?.snapshot ? globalThis.__nodetoolLazyNodes : null;

const NEVER_ABORTED = {
  aborted: false,
  reason: undefined,
  addEventListener() {},
  removeEventListener() {},
  throwIfAborted() {}
};

// The ProcessingContext node code sees (host/context.mjs), one per run as
// the TypeScript runner builds one per job. begin() replaces it.
const newContext = (jobId, workflowId) => createContext(jobId, workflowId);
let context = newContext("job", "wf");

const contexts = new Map();
const instances = new Map();
const generators = new Map();
let nextId = 1;

function errorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

function settle(promise) {
  return Promise.resolve(promise).then(
    (value) => wireReply({ ok: true, value }),
    (err) => JSON.stringify({ ok: false, error: errorMessage(err) })
  );
}

/** The validation message for a node type that needs unavailable exports, or null. */
function unavailableMessage(type) {
  const needs = nodeRequirements[type];
  if (!needs?.length) return null;
  return needs.map((r) => `${r.spec}.${r.name} is unavailable in the native runner (${r.reason}: ${r.note})`).join("; ");
}

function describe(cls, node) {
  const requires = nodeRequirements[cls.nodeType];
  return {
    ...(requires?.length ? { requires } : {}),
    is_streaming_input: cls.resolveStreamingInput?.(node) ?? cls.isStreamingInput,
    is_streaming_output: hasStreamingOutput(cls),
    is_controlled: cls.isControlled,
    is_join_node: cls.isJoinNode,
    is_trigger: cls.isTrigger,
    retry_safe: cls.retrySafe,
    always_emit_output_updates: cls.alwaysEmitOutputUpdates,
    audio_sink: cls.audioSink,
    input_mode: cls.inputMode,
    output_correlation: cls.outputCorrelation,
    has_run: typeof cls.prototype.run === "function"
  };
}

function envelopeOf(r) {
  return {
    data: r.data,
    metadata: {},
    timestamp: 0,
    event_id: "",
    correlation_lineage: r.lineage ?? {},
    source_edge_id: r.source_edge_id ?? ""
  };
}

class HostInputs {
  constructor(io, executionContext) {
    this._io = io;
    this._context = executionContext;
  }
  get signal() {
    return this._context.signal ?? NEVER_ABORTED;
  }
  scopeFor(handle) {
    return JSON.parse(host().scopeFor(this._io, handle));
  }
  invocationScope() {
    return JSON.parse(host().invocationScope(this._io));
  }
  async _next(handle) {
    const r = fromReply(await host().next(this._io, handle ?? null));
    return r.done ? null : r;
  }
  async first(name, defaultValue) {
    const r = await this._next(name);
    return r ? r.data : defaultValue;
  }
  async firstWithEnvelope(name, defaultValue) {
    const r = await this._next(name);
    return r ? envelopeOf(r) : defaultValue;
  }
  async *stream(name) {
    for (let r = await this._next(name); r; r = await this._next(name)) yield r.data;
  }
  async *streamWithEnvelope(name) {
    for (let r = await this._next(name); r; r = await this._next(name)) yield envelopeOf(r);
  }
  async *any() {
    for (let r = await this._next(null); r; r = await this._next(null)) yield [r.handle, r.data];
  }
  async *anyWithEnvelope() {
    for (let r = await this._next(null); r; r = await this._next(null)) yield [r.handle, envelopeOf(r)];
  }
  hasBuffered(name) {
    return host().hasBuffered(this._io, name);
  }
  hasStream(name) {
    return host().hasStream(this._io, name);
  }
}

const lineageJson = (opts) => (opts?.lineage === undefined ? undefined : JSON.stringify(opts.lineage));

class HostOutputs {
  constructor(io) {
    this._io = io;
    this._collected = {};
  }
  async emitGroup(values, opts) {
    for (const [slot, value] of Object.entries(values)) this._collected[slot] = value;
    const wire = toWire(values);
    await host().emitGroup(this._io, wire.text, lineageJson(opts), wire.blobs);
  }
  async emit(slot, value, opts) {
    const resolved = slot || "output";
    this._collected[resolved] = value;
    const wire = toWire(value);
    await host().emit(this._io, resolved, wire.text, lineageJson(opts), wire.blobs);
  }
  async default(value) {
    await this.emit("output", value);
  }
  async forward(slot, envelope, ...override) {
    const value = override.length > 0 ? override[0] : envelope.data;
    await this.emit(slot, value, { lineage: envelope.correlation_lineage });
  }
  async drop(slot, envelope) {
    await host().drop(this._io, slot || "output", JSON.stringify(envelope.correlation_lineage ?? {}));
  }
  complete(slot) {
    host().complete(this._io, slot || "output");
  }
  collected() {
    return { ...this._collected };
  }
}

function executorOf(id) {
  const entry = instances.get(id);
  if (!entry) throw new Error(`No node instance ${id}`);
  return entry.executor;
}

globalThis.__nodetool = {
  // Without `blobs` the bytes stayed in the kernel, and the markers that
  // name them pass through as plain objects.
  prepareInputs(nodeJson, inputsJson, blobs) {
    try { return wireReply({ ok: true, value: applyDynamicSlotTypes(fromJson(nodeJson), fromWire(inputsJson, blobs)) }); }
    catch (error) { return JSON.stringify({ ok: false, error: errorMessage(error) }); }
  },
  prepareInnerGraph(graphJson) { return toJson(prepareInnerGraph(fromJson(graphJson))); },
  forkContext(parentId) {
    const id = nextId++;
    contexts.set(id, forkContext(contexts.get(parentId)));
    return id;
  },
  releaseContext(id) { contexts.get(id)?.closeAllChannels(); contexts.delete(id); },
  triggerEvent(nodeId, eventJson, ioId) {
    return settle((async () => {
      const entry = [...instances.values()].find((item) => item.node.id === nodeId);
      if (!entry?.executor.emitTriggerEvent) return { supported: false };
      const outputs = new HostOutputs(ioId);
      await entry.executor.emitTriggerEvent(fromJson(eventJson), outputs);
      return { supported: true, outputs: outputs.collected() };
    })());
  },
  prepareGraph(graphJson) {
    const graph = rewriteBypassedNodes(fromJson(graphJson));
    // begin() creates this run's context before Runner::run prepares the graph.
    if (!context.get(AUDIO_RUN_KEY)) context.set(AUDIO_RUN_KEY, resolveAudioRun(graph.nodes.map(node => ({
      ...node,
      audio_sink: lazyNodes?.snapshot.flags[node.type]?.audio_sink ?? classes.get(node.type)?.audioSink
    }))));
    return toJson(graph);
  },
  /** Starts a run: sets the context identity and drops any leftover instances. */
  begin(jobId, workflowId) {
    resetProcessEnvironment();
    context._models?.close();
    context = newContext(jobId, workflowId);
    // Only this run's explicit host grant reaches the virtual environment.
    for (const [key, value] of Object.entries(context.environment)) {
      if (typeof value !== "string") throw new TypeError(`Context environment ${key} must be a string`);
      globalThis.process.env[key] = value;
    }
    contexts.clear(); contexts.set(0, context);
    instances.clear();
    generators.clear();
  },

  /** Promise of json `{[nodeType]: resolved}`; the resolver's closures are dropped. */
  types() {
    if (lazyNodes) return Promise.resolve(JSON.stringify(lazyNodes.snapshot.types));
    const registry = new NodeRegistry();
    for (const cls of classes.values()) registry.register(cls);
    const { resolveNodeType } = createGraphNodeTypeResolver(registry);
    return Promise.all(
      [...classes.keys()].map(async (type) => {
        const { resolveInstanceFlags, resolveInstanceSlots, ...resolved } =
          (await resolveNodeType(type)) ?? {};
        return [type, resolved];
      })
    ).then((entries) => JSON.stringify(Object.fromEntries(entries)));
  },

  /**
   * Flags the kernel reads from the class; json `null` for an unknown type.
   * `requires` lists the unavailable exports the type's code reaches.
   */
  describe(nodeJson) {
    const node = fromJson(nodeJson);
    const cls = classes.get(node.type);
    if (!cls && lazyNodes?.pendingModule(node.type)) return JSON.stringify(lazyNodes.snapshot.flags[node.type] ?? null);
    return cls ? JSON.stringify(describe(cls, node)) : "null";
  },

  /**
   * Property and platform issues, as `registry.createNodeValidator()` plus
   * the "node" platform check, and one issue for a node type whose code
   * reaches an unavailable export, so the run fails before any node starts.
   */
  validate(nodeJson, connectedJson) {
    const node = fromJson(nodeJson);
    const cls = classes.get(node.type);
    if (!cls) return "[]";
    const issues = cls.validateProperties(node.properties ?? {}, {
      connectedHandles: new Set(JSON.parse(connectedJson)),
      nodeId: node.id,
      dynamicSlots: node.dynamic_inputs,
      dynamicValues: node.dynamic_properties
    });
    const unavailable = unavailableMessage(node.type);
    if (unavailable) {
      issues.push({ nodeId: node.id, nodeType: node.type, property: "*", code: "unavailable_in_native_runner", message: unavailable });
    }
    if (!supportsPlatform(cls.platforms, "node")) {
      const supported = cls.platforms?.length ? cls.platforms.join(", ") : "node";
      issues.push({
        nodeId: node.id,
        nodeType: node.type,
        property: "*",
        code: "unsupported_platform",
        message: `Node ${node.type} is not supported on platform 'node' (supports: ${supported})`
      });
    }
    return JSON.stringify(issues);
  },

  /** Mirrors `NodeRegistry.resolve()`: construct, stamp identity, wrap as executor. */
  create(nodeJson) {
    const node = fromJson(nodeJson);
    const cls = classes.get(node.type);
    if (!cls) throw new Error(`Unknown node type: ${node.type}`);
    const properties = node.properties ?? {};
    const instance = new cls(
      node.dynamic_inputs ? { _dynamic_inputs: node.dynamic_inputs, ...properties } : properties
    );
    instance.__node_id = node.id;
    instance.__node_name = node.name ?? node.type;
    if (node.dynamic_outputs) instance._dynamic_outputs = node.dynamic_outputs;
    if (node.dynamic_inputs) instance._dynamic_inputs = node.dynamic_inputs;
    const id = nextId++;
    instances.set(id, { instance, node, context: contexts.get(node.__context_id ?? 0) ?? context, executor: instance.toExecutor() });
    return id;
  },

  /** Whether `type` needs ensure() before its class is used. */
  pending(type) {
    return !classes.has(type) && lazyNodes?.pendingModule(type) !== undefined;
  },

  /** Evaluates the deferred module of `type` and registers its classes. */
  ensure(type) {
    return lazyNodes.ensure(type).then((found) => {
      for (const [name, cls] of Object.entries(found)) if (!classes.has(name)) classes.set(name, cls);
    });
  },

  /**
   * json `{buildId, types, flags}` for the bundle assets' types.json, from a
   * guest that loaded every module, or "null" for a bundle without lazy modules.
   */
  snapshot() {
    const buildId = globalThis.__nodetoolLazyNodes?.buildId;
    if (!buildId || lazyNodes) return Promise.resolve("null");
    return globalThis.__nodetool.types().then((typesJson) => {
      const flags = {};
      for (const cls of classes.values()) flags[cls.nodeType] = describe(cls, { type: cls.nodeType });
      return JSON.stringify({ buildId, types: JSON.parse(typesJson), flags });
    });
  },

  /** Drops a node instance or an unfinished generator. */
  release(id) {
    instances.delete(id);
    generators.delete(id);
  },

  /** `initialize` | `preProcess` | `finalize` | `process`. */
  call(id, method, inputsJson, blobs) {
    return settle(
      (async () => {
        const executor = executorOf(id);
        if (method === "process") return executor.process(applyDynamicSlotTypes(instances.get(id).node, fromWire(inputsJson, blobs)), instances.get(id).context);
        await executor[method]?.();
        return null;
      })()
    );
  },

  /**
   * A live property change of a node instance: `executor.applyProperties`.
   * False when the executor takes none.
   */
  apply(id, propertiesJson, blobs) {
    const executor = executorOf(id);
    if (!executor.applyProperties) return false;
    executor.applyProperties(fromWire(propertiesJson, blobs));
    return true;
  },

  genStart(id, inputsJson, blobs) {
    const iterator = executorOf(id).genProcess(applyDynamicSlotTypes(instances.get(id).node, fromWire(inputsJson, blobs)), instances.get(id).context);
    const gid = nextId++;
    generators.set(gid, iterator);
    return gid;
  },

  genNext(gid) {
    return generators
      .get(gid)
      .next()
      .then(
        (r) => {
          if (r.done) generators.delete(gid);
          return wireReply({ ok: true, done: !!r.done, value: r.done ? null : r.value });
        },
        (err) => {
          generators.delete(gid);
          return JSON.stringify({ ok: false, error: errorMessage(err) });
        }
      );
  },

  /** Variable channels on the run's context: "register" | "done" | "closeAll". */
  variableChannel(op, name, contextId = 0) {
    const context = contexts.get(contextId);
    if (op === "register") context.registerChannelWriters(name, 1);
    else if (op === "done") context.markChannelWriterDone(name);
    else if (op === "closeAll") context.closeAllChannels();
  },

  /** The Output node's value step for a media value; see host/output.mjs. */
  outputValue(nodeId, valueJson, blobs) {
    return settle(outputValue(fromWire(valueJson, blobs), context, nodeId));
  },

  run(id, ioId) {
    const outputs = new HostOutputs(ioId);
    return settle(
      (async () => {
        await executorOf(id).run(new HostInputs(ioId, instances.get(id).context), outputs, instances.get(id).context);
        return outputs.collected();
      })()
    );
  }
};
