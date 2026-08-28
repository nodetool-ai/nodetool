/**
 * Graph DSL core — the guest-side implementation of node/edge wiring behind
 * the free-form `node(type, props)` program `evaluateGraphDsl` runs
 * (`src/graph-dsl.ts`). A CodeAct action authors graphs the other way, through
 * the generated wrappers in `@nodetool-ai/sandbox-dsl`; both produce the same
 * `{nodes, edges}` shape, and both refuse a handle interpolated into a
 * string.
 *
 * `__graphDslBuilder()` returns an instance-based builder: `node(type, props,
 * {id})` registers a node and returns a ref whose `.output(slot?)` produces a
 * wiring handle ({__handle, source, sourceHandle}); a handle passed as a
 * property value becomes an edge immediately. `connect()` refuses ids the
 * graph does not have, and a handle interpolated into a string throws instead
 * of silently becoming "[object Object]".
 */

/**
 * The graph normalizer on its own: every shape a caller may hold a graph in —
 * a builder, a bare `{nodes, edges}`, a workflow record, or what the sandbox
 * DSL pack's `workflow()` returns — reduced to `{nodes, edges}`. The
 * `nodetool.workflows` methods take any of them and need nothing else from
 * this file.
 */
export const GRAPH_JSON_PRELUDE = `function __graphJsonOf(source) {
  if (source && typeof source.toJSON === "function") return source.toJSON();
  if (source && Array.isArray(source.nodes)) {
    return { nodes: source.nodes, edges: source.edges || [] };
  }
  if (source && source.graph && Array.isArray(source.graph.nodes)) {
    return { nodes: source.graph.nodes, edges: source.graph.edges || [] };
  }
  throw new Error(
    "expected a graph builder, a {nodes, edges} graph, or a workflow " +
    "record with a .graph"
  );
}
`;

export const GRAPH_DSL_CORE_PRELUDE = `${GRAPH_JSON_PRELUDE}
function __graphDslBuilder() {
  const nodes = [];
  const edges = [];
  const byId = Object.create(null);
  const counters = Object.create(null);

  const autoId = (hint) => {
    const last = String(hint).split(".").pop() || "node";
    const stem = last
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .replace(/[^A-Za-z0-9_]/g, "_")
      .toLowerCase();
    let id = stem;
    while (byId[id]) {
      const n = (counters[stem] = (counters[stem] || 1) + 1);
      id = stem + "_" + n;
    }
    return id;
  };

  const isHandle = (value) =>
    value !== null && typeof value === "object" && value.__handle === true;

  const findNestedHandlePath = (value, seen) => {
    if (value === null || typeof value !== "object") return null;
    if (seen.indexOf(value) !== -1) return null;
    seen.push(value);
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (isHandle(item)) return "[" + i + "]";
        const deeper = findNestedHandlePath(item, seen);
        if (deeper !== null) return "[" + i + "]" + deeper;
      }
      return null;
    }
    for (const key of Object.keys(value)) {
      if (isHandle(value[key])) return "." + key;
      const deeper = findNestedHandlePath(value[key], seen);
      if (deeper !== null) return "." + key + deeper;
    }
    return null;
  };

  /**
   * Classify one non-handle property value for wiring. An array whose every
   * element is a handle is list fan-in — the same shape the editor produces
   * when several sources feed one list input — and wires one edge per
   * element. Anything else holding a handle anywhere inside is refused with
   * the path named.
   */
  const classifyValue = (key, value) => {
    if (Array.isArray(value)) {
      let sawHandle = false;
      let sawLiteral = false;
      for (const item of value) {
        if (isHandle(item)) sawHandle = true;
        else sawLiteral = true;
      }
      if (!sawHandle) return "plain";
      if (sawLiteral) {
        throw new Error(
          'Property "' +
            key +
            '" mixes wired outputs and literal values in one array. Wire ' +
            "the whole list — every element an output() handle — or pass " +
            "plain values only."
        );
      }
      return "fanin";
    }
    const nested = findNestedHandlePath(value, []);
    if (nested !== null) {
      throw new Error(
        'Property "' +
          key +
          '" holds a node output at "' +
          key +
          nested +
          '". A connection is only made from a handle assigned directly to ' +
          "a property — one buried in an object is not wired, and the node " +
          "producing it would be left out of the graph. Give each source " +
          "its own property."
      );
    }
    return "plain";
  };

  const makeHandle = (nodeId, slot) => {
    if (slot !== undefined && (typeof slot !== "string" || slot.length === 0)) {
      throw new Error("output(slot): slot must be a non-empty string");
    }
    const handle = {
      __handle: true,
      source: nodeId,
      sourceHandle: slot || "output"
    };
    // Interpolating a handle into a string silently yields "[object
    // Object]": no edge is created and the node gets that literal text.
    // Refuse the conversion so the mistake surfaces where it was made.
    handle[Symbol.toPrimitive] = function () {
      throw new Error(
        "Cannot use " +
          nodeId +
          ".output() inside a string. A handle wires an edge; it is not text. " +
          "Pass it as the property value itself — { prompt: " +
          nodeId +
          ".output() } — and put any fixed instructions in a separate " +
          "property (an Agent node's system property). To build one string " +
          "out of several handles plus fixed text, wire them into a " +
          'nodetool.text.Template node: { string: "Hi {{name}}, about ' +
          '{{topic}}", name: a.output(), topic: b.output() } — each extra ' +
          "property is a dynamic input replacing its {{key}} placeholder."
      );
    };
    return handle;
  };

  const addEdge = (source, sourceHandle, target, targetHandle) => {
    const edge = {
      id: "e" + (edges.length + 1) + "_" + source + "_" + target,
      source: source,
      sourceHandle: sourceHandle || "output",
      target: target,
      targetHandle: targetHandle
    };
    edges.push(edge);
    return edge;
  };

  const wireProps = (targetId, props) => {
    const plain = {};
    for (const key of Object.keys(props || {})) {
      const value = props[key];
      if (isHandle(value)) {
        addEdge(value.source, value.sourceHandle, targetId, key);
      } else if (classifyValue(key, value) === "fanin") {
        for (const handle of value) {
          addEdge(handle.source, handle.sourceHandle, targetId, key);
        }
      } else {
        plain[key] = value;
      }
    }
    return plain;
  };

  const makeRef = (raw) => {
    const ref = {
      id: raw.id,
      type: raw.type,
      properties: raw.properties,
      output: (slot) => makeHandle(raw.id, slot),
      set(props) {
        Object.assign(raw.properties, wireProps(raw.id, props));
        return ref;
      }
    };
    byId[raw.id] = ref;
    return ref;
  };

  const notFound = (id) =>
    new Error(
      "Node not found: " + id + ". Known: " + Object.keys(byId).join(", ")
    );

  const refId = (ref) => {
    const id = typeof ref === "string" ? ref : ref && ref.id;
    if (typeof id !== "string" || id.length === 0 || !byId[id]) {
      throw notFound(typeof id === "string" && id.length > 0 ? id : String(ref));
    }
    return id;
  };

  const g = {
    nodes: nodes,
    edges: edges,
    node(type, properties, opts) {
      if (typeof type !== "string" || type.length === 0) {
        throw new Error(
          "node(type, properties): type must be a non-empty string"
        );
      }
      if (
        properties !== undefined &&
        (properties === null ||
          typeof properties !== "object" ||
          Array.isArray(properties))
      ) {
        throw new Error("node(type, properties): properties must be an object");
      }
      const explicit =
        opts && typeof opts.id === "string" && opts.id.length > 0
          ? opts.id
          : undefined;
      if (explicit && byId[explicit]) {
        throw new Error('Duplicate node id "' + explicit + '"');
      }
      const id = explicit || autoId(type);
      const raw = { id: id, type: type, properties: {} };
      nodes.push(raw);
      const ref = makeRef(raw);
      Object.assign(raw.properties, wireProps(id, properties));
      return ref;
    },
    connect(source, sourceHandle, target, targetHandle) {
      const sourceId = refId(source);
      const targetId = refId(target);
      if (typeof targetHandle !== "string" || targetHandle.length === 0) {
        throw new Error(
          "connect(source, sourceHandle, target, targetHandle): " +
            "targetHandle must be a non-empty string"
        );
      }
      return addEdge(sourceId, sourceHandle, targetId, targetHandle);
    },
    get(id) {
      const found = byId[id];
      if (!found) throw notFound(id);
      return found;
    },
    /**
     * Copy another graph (builder, {nodes, edges}, or workflow record) into
     * this one. Ids that collide are remapped; returns { idMap, refs } where
     * refs is keyed by the SOURCE id, so wiring into copied nodes never
     * needs the remapped name.
     */
    copyFrom(source, opts) {
      const src = __graphJsonOf(source);
      const prefix = (opts && opts.prefix) || "";
      const idMap = {};
      const refs = {};
      for (const n of src.nodes) {
        const props = Object.assign(
          {},
          n.properties ||
            (n.data && n.data.properties ? n.data.properties : n.data) ||
            {}
        );
        let id = prefix + n.id;
        if (byId[id]) id = autoId(id);
        idMap[n.id] = id;
        const raw = { id: id, type: n.type, properties: props };
        nodes.push(raw);
        refs[n.id] = makeRef(raw);
      }
      for (const e of src.edges || []) {
        if (idMap[e.source] === undefined || idMap[e.target] === undefined) {
          continue;
        }
        addEdge(
          idMap[e.source],
          e.sourceHandle || e.source_output,
          idMap[e.target],
          e.targetHandle || e.target_input
        );
      }
      return { idMap: idMap, refs: refs };
    },
    toJSON() {
      return {
        nodes: nodes.map((n) => ({
          id: n.id,
          type: n.type,
          properties: Object.assign({}, n.properties)
        })),
        edges: edges.map((e) => Object.assign({}, e))
      };
    }
  };
  return g;
}
`;
