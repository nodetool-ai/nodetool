/**
 * The guest half of the NodeTool workflow DSL.
 *
 * `@nodetool-ai/dsl`'s own `core.ts` carries two things: the wiring model
 * (`createNode`, `workflow`) and a host runner (`run`) that imports the kernel,
 * the runtime, and the Python bridge. Only the first half is computation, so
 * only the first half is here — a guest module that imported `WorkflowRunner`
 * would fail admission on the first Node builtin behind it.
 *
 * Two things differ from the host DSL, both on purpose:
 *
 *  - Node ids read like the node type (`text_to_image`, `text_to_image_2`)
 *    rather than being UUIDs. A model writes and reads these ids, and an id it
 *    can say out loud is worth more than one that is globally unique.
 *  - `workflow()` returns the kernel graph shape — `{id, type, properties}`
 *    nodes and `{id, source, sourceHandle, target, targetHandle}` edges — which
 *    is what `validate_workflow` and `create_workflow` already take. The host
 *    DSL's `{data, streaming}` node shape is for its own runner.
 *
 * The generated namespace modules import `createNode` from here and nothing
 * else; every type in their signatures is erased at build time.
 */

/** Nodes registered since the last `workflow()` call, by id. */
const registry = new Map();
/** Per-stem counters behind the readable auto ids. */
const counters = new Map();

function autoId(nodeType) {
  const last = String(nodeType).split(".").pop() || "node";
  const stem = last
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9_]/g, "_")
    .toLowerCase();
  let id = stem;
  while (registry.has(id)) {
    const next = (counters.get(stem) || 1) + 1;
    counters.set(stem, next);
    id = stem + "_" + next;
  }
  return id;
}

export function isOutputHandle(value) {
  return (
    value !== null && typeof value === "object" && value.__handle === true
  );
}

/**
 * Find a handle nested inside a prop value — in an array, or under an object
 * key. Returns the path to the first one, or null.
 *
 * A connection is only made from a handle assigned directly to an input (or,
 * for a list input, from an array of handles). One buried deeper is not wired:
 * it used to be written verbatim into the node's properties, the node
 * producing it was never reached, and the graph validated clean with the
 * producer missing entirely. Reporting the path turns that silent hole into an
 * error a caller can act on.
 */
function findNestedHandlePath(value, seen) {
  if (value === null || typeof value !== "object") return null;
  if (seen.indexOf(value) !== -1) return null;
  seen.push(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      if (isOutputHandle(item)) return "[" + i + "]";
      const deeper = findNestedHandlePath(item, seen);
      if (deeper !== null) return "[" + i + "]" + deeper;
    }
    return null;
  }
  for (const key of Object.keys(value)) {
    if (isOutputHandle(value[key])) return "." + key;
    const deeper = findNestedHandlePath(value[key], seen);
    if (deeper !== null) return "." + key + deeper;
  }
  return null;
}

/**
 * Classify one non-handle input value for wiring.
 *
 * An array whose every element is a handle is list fan-in — the same shape the
 * editor produces when several sources feed one `list[...]` input — and wires
 * one edge per element. Anything else holding a handle anywhere inside is
 * refused with the path named.
 */
function classifyInput(name, value) {
  if (Array.isArray(value)) {
    let sawHandle = false;
    let sawLiteral = false;
    for (const item of value) {
      if (isOutputHandle(item)) {
        sawHandle = true;
      } else {
        sawLiteral = true;
      }
    }
    if (!sawHandle) return { kind: "plain" };
    if (sawLiteral) {
      throw new Error(
        'Input "' +
          name +
          '" mixes wired outputs and literal values in one array. Wire the ' +
          "whole list — every element an output() handle — or pass plain " +
          "values only."
      );
    }
    return { kind: "fanin" };
  }
  const nested = findNestedHandlePath(value, []);
  if (nested !== null) {
    throw new Error(
      'Input "' +
        name +
        '" holds a node output at "' +
        name +
        nested +
        '". A connection is only made from a handle assigned directly to an ' +
        "input — one buried in an object is not wired, and the node producing " +
        "it would be left out of the graph. Give each source its own input."
    );
  }
  return { kind: "plain" };
}

function createHandle(nodeId, slot) {
  const handle = {
    __handle: true,
    source: nodeId,
    sourceHandle: slot
  };
  // Interpolating a handle into a string silently yields "[object Object]":
  // no edge is created and the node gets that literal text. Refuse the
  // conversion so the mistake surfaces where it was made.
  //
  // The refusal names both ways out. Told only "pass it as the property
  // value", a model that wants one prompt built from four upstream values has
  // nowhere to go and rewrites the same template eight times; the node that
  // does this is `nodetool.text.Template`, and the message has to say so.
  handle[Symbol.toPrimitive] = function () {
    throw new Error(
      "Cannot use " +
        nodeId +
        "." +
        slot +
        " inside a string. A handle wires an edge; it is not text. Pass it " +
        "as the property value itself — { prompt: " +
        nodeId +
        ".output() }. To build one string out of several handles plus fixed " +
        'text, wire them into a template node: template({ string: "Hi ' +
        '{{name}}, about {{topic}}", name: a.output(), topic: b.output() }) ' +
        'from "@nodetool-ai/sandbox-dsl/nodetool.text" — each extra key is a ' +
        "dynamic input, and its {{key}} placeholder is replaced at run time. " +
        "An Agent node's fixed instructions belong in its `system` property, " +
        "not in the interpolated prompt."
    );
  };
  return Object.freeze(handle);
}

/**
 * Register one node and return its handle factory.
 *
 * Called only by the generated namespace modules, which pin `nodeType` and the
 * output names from the node's own metadata. `opts.id` names the node when the
 * program wants a stable id.
 */
export function createNode(nodeType, inputs, opts) {
  if (typeof nodeType !== "string" || nodeType.length === 0) {
    throw new Error("createNode(nodeType, inputs): nodeType must be a non-empty string");
  }
  if (inputs !== undefined && (inputs === null || typeof inputs !== "object" || Array.isArray(inputs))) {
    throw new Error("createNode(nodeType, inputs): inputs must be an object");
  }
  const explicit = opts && typeof opts.id === "string" && opts.id.length > 0 ? opts.id : undefined;
  if (explicit !== undefined && registry.has(explicit)) {
    throw new Error('Duplicate node id "' + explicit + '"');
  }
  const nodeId = explicit ?? autoId(nodeType);
  const outputNames = opts && opts.outputNames ? [...opts.outputNames] : [];
  const defaultOutput =
    (opts && opts.defaultOutput) ??
    (outputNames.length === 1 && !(opts && opts.multiOutput) ? outputNames[0] : undefined);

  const descriptor = {
    nodeId,
    nodeType,
    inputs: { ...(inputs ?? {}) },
    streaming: Boolean(opts && opts.streaming),
    streamingInput: Boolean(opts && opts.streamingInput)
  };
  registry.set(nodeId, descriptor);

  const known = new Set(outputNames);
  const output = (slot) => {
    const resolved = slot ?? defaultOutput;
    if (!resolved) {
      throw new Error(
        "Node " + nodeType + " has several outputs; name one: node.output(\"" +
          (outputNames[0] ?? "output") + "\")"
      );
    }
    if (known.size > 0 && !known.has(resolved)) {
      throw new Error(
        "Unknown output slot '" + resolved + "' for " + nodeType +
          ". Available: " + outputNames.join(", ")
      );
    }
    return createHandle(nodeId, resolved);
  };

  return Object.freeze({ nodeId, nodeType, inputs: descriptor.inputs, output });
}

/**
 * Collect the graph reachable from `terminals` and reset the registry.
 *
 * Only nodes an edge path reaches from a terminal are included: a node built
 * and then never wired is dead, and a graph that carried it would fail
 * validation for a property nobody meant to set.
 */
export function workflow(...terminals) {
  if (terminals.length === 0) {
    throw new Error("workflow() requires at least one terminal node");
  }

  const reached = new Map();
  const edges = [];
  const queue = [];
  /** Inputs fully supplied by edges; their stored values are not shipped. */
  const wiredInputs = new Set();

  const admit = (node) => {
    const id = node && node.nodeId;
    const descriptor = typeof id === "string" ? registry.get(id) : undefined;
    if (descriptor === undefined) {
      throw new Error(
        "workflow(): not a node from this program" +
          (typeof id === "string" ? ' ("' + id + '")' : "") +
          ". A handle from an earlier workflow() call is already spent."
      );
    }
    if (!reached.has(id)) {
      reached.set(id, descriptor);
      queue.push(id);
    }
  };

  for (const terminal of terminals) admit(terminal);

  while (queue.length > 0) {
    const currentId = queue.shift();
    const descriptor = reached.get(currentId);
    for (const [name, value] of Object.entries(descriptor.inputs)) {
      let sources;
      if (isOutputHandle(value)) {
        sources = [value];
      } else {
        const kind = classifyInput(name, value);
        if (kind.kind !== "fanin") continue;
        sources = value;
      }
      wiredInputs.add(currentId + "." + name);
      for (const handle of sources) {
        edges.push({
          id: "e" + (edges.length + 1) + "_" + handle.source + "_" + currentId,
          source: handle.source,
          sourceHandle: handle.sourceHandle,
          target: currentId,
          targetHandle: name
        });
        admit({ nodeId: handle.source });
      }
    }
  }

  const nodes = [...reached.values()].map((descriptor) => {
    const properties = {};
    for (const [name, value] of Object.entries(descriptor.inputs)) {
      if (
        !isOutputHandle(value) &&
        !wiredInputs.has(descriptor.nodeId + "." + name)
      ) {
        properties[name] = value;
      }
    }
    return {
      id: descriptor.nodeId,
      type: descriptor.nodeType,
      properties,
      ...(descriptor.streaming ? { is_streaming_output: true } : {}),
      ...(descriptor.streamingInput ? { is_streaming_input: true } : {})
    };
  });

  registry.clear();
  counters.clear();

  return { nodes, edges };
}
