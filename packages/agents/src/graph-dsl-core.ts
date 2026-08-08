/**
 * Graph DSL core — the one guest-side implementation of node/edge wiring,
 * shared by the two surfaces that let an LLM build a workflow graph in code:
 * the GraphPlanner's `submit_graph` program (`src/graph-dsl.ts`) and the
 * CodeAct sandbox's `nodetool.graph()` builder (`src/codeact/nodetool-api.ts`).
 * One implementation means one wiring semantics — the same auto ids, the same
 * argument validation, the same handle guards — so a program that works in one
 * surface works in the other, and a validation fix lands in both.
 *
 * `__graphDslBuilder()` returns an instance-based builder: `node(type, props,
 * {id})` registers a node and returns a ref whose `.output(slot?)` produces a
 * wiring handle ({__handle, source, sourceHandle}); a handle passed as a
 * property value becomes an edge immediately. `connect()` refuses ids the
 * graph does not have, and a handle interpolated into a string throws instead
 * of silently becoming "[object Object]".
 */

export const GRAPH_DSL_CORE_PRELUDE = `function __graphJsonOf(source) {
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
          "property (an Agent node's system property)."
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
