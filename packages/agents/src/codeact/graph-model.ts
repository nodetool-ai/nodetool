/**
 * CodeAct graph object model — workflow graph and node editing as a JS object
 * model instead of one bridged `ui_*` tool call per mutation.
 *
 * The guest prelude defines `openWorkflow(workflowId?)`, which loads the graph
 * once through `tools.ui_get_graph` and returns a model whose mutators are
 * synchronous: they update a local mirror and queue the equivalent `ui_*`
 * operation. `commit()` replays the queue through the bridged tools — the same
 * contract the renderer and the headless document tools already implement, so
 * client/server routing, validation, and live-editor sync are untouched. One
 * code action can therefore build a whole graph and pay one round trip per
 * mutation only at commit time, with local reads in between.
 *
 * The prelude assumes `CODEACT_PRELUDE` ran first (it uses `tools.*`).
 */

/** The `ui_*` document tools the object model drives. */
export const GRAPH_MODEL_TOOL_NAMES = [
  "ui_get_graph",
  "ui_add_node",
  "ui_connect_nodes",
  "ui_update_node_data",
  "ui_delete_node",
  "ui_delete_edge",
  "ui_move_node",
  "ui_set_node_title"
] as const;

/**
 * The model needs the read plus the two constructive mutations; the rest
 * degrade gracefully (an op whose tool is missing fails at commit with the
 * tool named).
 */
const REQUIRED_TOOL_NAMES = ["ui_get_graph", "ui_add_node", "ui_connect_nodes"];

/** Whether a toolbelt carries enough of the `ui_*` contract for the model. */
export function hasGraphModelTools(toolNames: Iterable<string>): boolean {
  const names = new Set(toolNames);
  return REQUIRED_TOOL_NAMES.every((name) => names.has(name));
}

/**
 * Guest-side prelude defining `openWorkflow()`. Plain QuickJS-safe JS — no
 * host bridges of its own; every effect goes through `tools.ui_*`.
 */
export const GRAPH_MODEL_PRELUDE = `
async function openWorkflow(workflowId) {
  const __wfArgs = (extra) => {
    const args = extra ? Object.assign({}, extra) : {};
    if (workflowId !== undefined && workflowId !== null) {
      args.workflow_id = workflowId;
    }
    return args;
  };
  const __snapNodes = (snap) => (snap && Array.isArray(snap.nodes) ? snap.nodes : []);
  const __snapEdges = (snap) => (snap && Array.isArray(snap.edges) ? snap.edges : []);

  const snap = await tools.ui_get_graph(__wfArgs());
  const ops = [];
  let edgeSeq = 0;

  const model = {
    workflowId: (snap && snap.workflow_id) || workflowId || null,
    nodes: [],
    edges: [],
    node(id) {
      const found = model.nodes.find((n) => n.id === id);
      if (!found) {
        throw new Error(
          "Node not found: " + id + ". Known: " + model.nodes.map((n) => n.id).join(", ")
        );
      }
      return found;
    },
    addNode(id, type, properties, position) {
      if (model.nodes.some((n) => n.id === id)) {
        throw new Error('A node with id "' + id + '" already exists.');
      }
      const pos = position || {
        x: 120 + (model.nodes.length % 6) * 240,
        y: 120 + Math.floor(model.nodes.length / 6) * 160
      };
      ops.push({
        tool: "ui_add_node",
        args: __wfArgs({ id, type, properties: properties || {}, position: pos })
      });
      return __wrapNode({
        id,
        type,
        position: pos,
        data: { properties: properties || {} }
      });
    },
    connect(sourceId, sourceHandle, targetId, targetHandle) {
      ops.push({
        tool: "ui_connect_nodes",
        args: __wfArgs({
          source_node_id: sourceId,
          source_handle: sourceHandle,
          target_node_id: targetId,
          target_handle: targetHandle
        })
      });
      edgeSeq++;
      const edge = {
        id: "pending_edge_" + edgeSeq,
        source: sourceId,
        sourceHandle: sourceHandle,
        target: targetId,
        targetHandle: targetHandle,
        pending: true
      };
      model.edges.push(edge);
      return edge;
    },
    removeNode(id) {
      model.node(id);
      const addIndex = ops.findIndex(
        (op) => op.tool === "ui_add_node" && op.args.id === id
      );
      if (addIndex >= 0) {
        // Never committed: cancel the add and every queued op touching it.
        for (let i = ops.length - 1; i >= 0; i--) {
          const a = ops[i].args;
          if (
            a.id === id ||
            a.node_id === id ||
            a.source_node_id === id ||
            a.target_node_id === id
          ) {
            ops.splice(i, 1);
          }
        }
      } else {
        ops.push({ tool: "ui_delete_node", args: __wfArgs({ node_id: id }) });
      }
      model.nodes = model.nodes.filter((n) => n.id !== id);
      model.edges = model.edges.filter((e) => e.source !== id && e.target !== id);
    },
    removeEdge(edgeId) {
      const edge = model.edges.find((e) => e.id === edgeId);
      if (!edge) throw new Error("Edge not found: " + edgeId);
      if (edge.pending) {
        const opIndex = ops.findIndex(
          (op) =>
            op.tool === "ui_connect_nodes" &&
            op.args.source_node_id === edge.source &&
            op.args.source_handle === edge.sourceHandle &&
            op.args.target_node_id === edge.target &&
            op.args.target_handle === edge.targetHandle
        );
        if (opIndex >= 0) ops.splice(opIndex, 1);
      } else {
        ops.push({ tool: "ui_delete_edge", args: __wfArgs({ edge_id: edgeId }) });
      }
      model.edges = model.edges.filter((e) => e.id !== edgeId);
    },
    pending() {
      return ops.length;
    },
    async commit() {
      let applied = 0;
      while (ops.length > 0) {
        const op = ops[0];
        try {
          await tools[op.tool](op.args);
        } catch (e) {
          throw new Error(
            "commit() failed on " + op.tool + " " + JSON.stringify(op.args).slice(0, 300) +
            ": " + (e && e.message ? e.message : String(e)) +
            ". " + applied + " ops were applied; the failed op and " + (ops.length - 1) +
            " later ops are still queued — fix the problem and call commit() again."
          );
        }
        ops.shift();
        applied++;
      }
      const fresh = await tools.ui_get_graph(__wfArgs());
      __load(fresh);
      return { ok: true, applied, nodes: model.nodes.length, edges: model.edges.length };
    }
  };

  function __wrapNode(raw) {
    const data = raw && raw.data && typeof raw.data === "object" ? raw.data : {};
    const view = {
      id: raw.id,
      type: raw.type,
      position: raw.position || { x: 0, y: 0 },
      title: typeof data.title === "string" ? data.title : null,
      properties:
        data.properties && typeof data.properties === "object" ? data.properties : {},
      set(props) {
        ops.push({
          tool: "ui_update_node_data",
          args: __wfArgs({ node_id: view.id, data: { properties: props } })
        });
        Object.assign(view.properties, props);
        return view;
      },
      setTitle(title) {
        ops.push({
          tool: "ui_set_node_title",
          args: __wfArgs({ node_id: view.id, title })
        });
        view.title = title;
        return view;
      },
      moveTo(x, y) {
        ops.push({
          tool: "ui_move_node",
          args: __wfArgs({ node_id: view.id, position: { x, y } })
        });
        view.position = { x, y };
        return view;
      },
      remove() {
        model.removeNode(view.id);
      }
    };
    model.nodes.push(view);
    return view;
  }

  function __load(fromSnap) {
    model.nodes = [];
    model.edges = __snapEdges(fromSnap).map((e) => Object.assign({}, e));
    const rawNodes = __snapNodes(fromSnap);
    for (const raw of rawNodes) __wrapNode(raw);
  }

  __load(snap);
  return model;
}
`;

/** Prompt section documenting the object model, for codeact system prompts. */
export const GRAPH_MODEL_PROMPT_SECTION = `# Workflow graph editing (object model)

Edit workflow graphs through the object model, not by calling \`tools.ui_*\`
one mutation at a time:

\`\`\`js
const wf = await openWorkflow(workflowId);   // id from the UI context; omit for the focused workflow
const input = wf.addNode("prompt_1", "nodetool.input.StringInput", { name: "prompt" });
const llm = wf.addNode("llm_1", "nodetool.agents.Agent", {}, { x: 400, y: 120 });
wf.connect("prompt_1", "output", "llm_1", "prompt");
llm.setTitle("Draft the note").set({ system: "You draft short notes." });
await wf.commit();                            // applies the queued ops, then reloads
\`\`\`

- \`wf.nodes\` / \`wf.edges\` are local mirrors; \`wf.node(id)\` returns a node
  with \`.set(props)\`, \`.setTitle(t)\`, \`.moveTo(x, y)\`, \`.remove()\`.
- \`wf.removeNode(id)\` / \`wf.removeEdge(id)\` delete; removing a not-yet-
  committed edge just cancels its queued op.
- Mutators are synchronous and only queue work; nothing changes in the editor
  until \`await wf.commit()\`. A failed commit names the failing operation,
  keeps it and later ops queued, and can be retried after a fix.
- Use \`tools.ui_search_nodes(...)\` / \`tools.search_nodes(...)\` first when
  unsure of a node type, and \`await wf.commit()\` before telling the user the
  graph is ready.`;
