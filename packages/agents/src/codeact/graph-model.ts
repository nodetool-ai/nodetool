/**
 * CodeAct graph object model — workflow graph and node editing as a JS object
 * model instead of one bridged `ui_*` tool call per mutation.
 *
 * The guest prelude defines `openWorkflow(workflowId?)`, which loads the graph
 * once through `ui_get_graph` and returns a model whose mutators are
 * synchronous: they update a local mirror and queue the equivalent `ui_*`
 * operation. `commit()` replays the queue through the bridged tools — the same
 * contract the renderer and the headless document tools already implement, so
 * client/server routing, validation, and live-editor sync are untouched. One
 * code action can therefore build a whole graph and pay one round trip per
 * mutation only at commit time, with local reads in between.
 *
 * The prelude assumes `CODEACT_PRELUDE` ran first (it calls the belt through
 * `__callBeltTool`).
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

/** Guest names {@link GRAPH_MODEL_PRELUDE} defines. */
export const GRAPH_MODEL_GLOBALS = ["openWorkflow"] as const;

/**
 * Guest-side prelude defining `openWorkflow()`. Plain QuickJS-safe JS — no
 * host bridges of its own; every effect goes through the `ui_*` belt calls.
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

  const snap = await __callBeltTool("ui_get_graph")(__wfArgs());
  const queueRoot =
    typeof __graphQueues === "object" && __graphQueues !== null
      ? __graphQueues
      : {};
  const queueKey = String((snap && snap.workflow_id) || workflowId || "__focused__");

  // A ui_get_graph served from the saved row ("source": "server") is a
  // read-only snapshot: no editor is open, so every queued write would fail at
  // commit with "No node store". Say so here instead, before any op is queued.
  const editable =
    !snap || typeof snap.source !== "string" || snap.source === "editor";
  const __requireEditable = () => {
    if (!editable) {
      throw new Error(
        "openWorkflow(): this snapshot came from the server because no editor " +
          "is open for workflow " + JSON.stringify(queueKey) + " — reads work, " +
          "but every write would fail at commit(). Open it first: " +
          "ui_open_document({type: 'workflow', id: <id>}) or ui_open_workflow" +
          "({workflow_id: <id>}), then reopen it with openWorkflow."
      );
    }
  };
  const storedOps = queueRoot[queueKey];
  const ops = Array.isArray(storedOps) ? storedOps : [];
  queueRoot[queueKey] = ops;
  let edgeSeq = 0;
  for (const op of ops) {
    const match =
      op && typeof op.localEdgeId === "string"
        ? /^pending_edge_(\\d+)$/.exec(op.localEdgeId)
        : null;
    if (match) edgeSeq = Math.max(edgeSeq, Number(match[1]));
  }

  const model = {
    workflowId: (snap && snap.workflow_id) || workflowId || null,
    editable,
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
      __requireEditable();
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
      __requireEditable();
      if (!model.nodes.some((n) => n.id === sourceId)) {
        throw new Error(
          "connect(): source node not found: " + sourceId + ". Known: " +
            model.nodes.map((n) => n.id).join(", ")
        );
      }
      if (!model.nodes.some((n) => n.id === targetId)) {
        throw new Error(
          "connect(): target node not found: " + targetId + ". Known: " +
            model.nodes.map((n) => n.id).join(", ")
        );
      }
      edgeSeq++;
      const localEdgeId = "pending_edge_" + edgeSeq;
      ops.push({
        tool: "ui_connect_nodes",
        localEdgeId,
        args: __wfArgs({
          source_node_id: sourceId,
          source_handle: sourceHandle,
          target_node_id: targetId,
          target_handle: targetHandle
        })
      });
      const edge = {
        id: localEdgeId,
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
      __requireEditable();
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
      __requireEditable();
      const edge = model.edges.find((e) => e.id === edgeId);
      if (!edge) throw new Error("Edge not found: " + edgeId);
      if (edge.pending) {
        const opIndex = ops.findIndex(
          (op) =>
            op.tool === "ui_connect_nodes" &&
            (op.localEdgeId === edgeId ||
              (op.args.source_node_id === edge.source &&
                op.args.source_handle === edge.sourceHandle &&
                op.args.target_node_id === edge.target &&
                op.args.target_handle === edge.targetHandle))
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
      // Queued ops survive between actions, so the queue can outlive its
      // editor: action one queues writes, the tab closes, and this snapshot
      // now comes from the server. Replaying them would fail mid-queue with
      // "No node store" — refuse up front instead. An empty queue is just a
      // refresh and stays allowed on a read-only snapshot.
      if (ops.length > 0 && !editable) {
        throw new Error(
          "commit(): " + ops.length + " operation(s) were queued while an " +
            "editor was open, but workflow " + JSON.stringify(queueKey) +
            " has no editor any more (this snapshot comes from the server). " +
            "Replaying them would fail with 'No node store'. Open the " +
            "workflow again with ui_open_document or ui_open_workflow, reopen " +
            "it here with openWorkflow(), and rebuild the edits."
        );
      }
      let applied = 0;
      while (ops.length > 0) {
        const op = ops[0];
        try {
          const result = await __callBeltTool(op.tool)(op.args);
          if (
            op.tool === "ui_connect_nodes" &&
            typeof op.localEdgeId === "string" &&
            result &&
            typeof result.edge_id === "string"
          ) {
            const edge = model.edges.find((item) => item.id === op.localEdgeId);
            if (edge) {
              edge.id = result.edge_id;
              edge.pending = false;
            }
          }
        } catch (e) {
          throw new Error(
            "commit() failed on " + op.tool + " " + JSON.stringify(op.args).slice(0, 300) +
            ": " + (e && e.message ? e.message : String(e)) +
            ". " + applied + " ops were applied; the failed op and " + (ops.length - 1) +
            " later ops are still queued — fix the problem and call commit() again." +
            " To drop a queued connection instead, call wf.removeEdge('" +
            (op.localEdgeId || "<edge id>") + "') for its pending edge."
          );
        }
        ops.shift();
        applied++;
      }
      const fresh = await __callBeltTool("ui_get_graph")(__wfArgs());
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
        __requireEditable();
        ops.push({
          tool: "ui_update_node_data",
          args: __wfArgs({ node_id: view.id, data: { properties: props } })
        });
        Object.assign(view.properties, props);
        return view;
      },
      setTitle(title) {
        __requireEditable();
        ops.push({
          tool: "ui_set_node_title",
          args: __wfArgs({ node_id: view.id, title })
        });
        view.title = title;
        return view;
      },
      moveTo(x, y) {
        __requireEditable();
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

  function __applyPending(op) {
    if (!op || typeof op !== "object" || !op.args) return;
    const args = op.args;
    if (op.tool === "ui_add_node") {
      if (!model.nodes.some((node) => node.id === args.id)) {
        __wrapNode({
          id: args.id,
          type: args.type,
          position: args.position,
          data: { properties: args.properties || {} }
        });
      }
      return;
    }
    if (op.tool === "ui_connect_nodes") {
      const localEdgeId =
        typeof op.localEdgeId === "string"
          ? op.localEdgeId
          : "pending_edge_" + ++edgeSeq;
      op.localEdgeId = localEdgeId;
      model.edges.push({
        id: localEdgeId,
        source: args.source_node_id,
        sourceHandle: args.source_handle,
        target: args.target_node_id,
        targetHandle: args.target_handle,
        pending: true
      });
      return;
    }
    if (op.tool === "ui_update_node_data") {
      const node = model.nodes.find((item) => item.id === args.node_id);
      const properties = args.data && args.data.properties;
      if (node && properties && typeof properties === "object") {
        Object.assign(node.properties, properties);
      }
      return;
    }
    if (op.tool === "ui_set_node_title") {
      const node = model.nodes.find((item) => item.id === args.node_id);
      if (node) node.title = args.title;
      return;
    }
    if (op.tool === "ui_move_node") {
      const node = model.nodes.find((item) => item.id === args.node_id);
      if (node) node.position = args.position;
      return;
    }
    if (op.tool === "ui_delete_node") {
      model.nodes = model.nodes.filter((node) => node.id !== args.node_id);
      model.edges = model.edges.filter(
        (edge) => edge.source !== args.node_id && edge.target !== args.node_id
      );
      return;
    }
    if (op.tool === "ui_delete_edge") {
      model.edges = model.edges.filter((edge) => edge.id !== args.edge_id);
    }
  }

  __load(snap);
  for (const op of ops) __applyPending(op);
  return model;
}
`;

/** Prompt section documenting the object model, for codeact system prompts. */
export const GRAPH_MODEL_PROMPT_SECTION = `# Workflow graph editing (object model)

Edit workflow graphs through the object model, not by calling the \`ui_*\` tools
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
- Check \`wf.editable\` before editing. \`false\` means no editor is open for
  that workflow (the snapshot came from the server), so writes are refused —
  open the workflow with \`ui_open_document\` and reopen it first.
- \`wf.removeNode(id)\` / \`wf.removeEdge(id)\` delete; removing a not-yet-
  committed edge just cancels its queued op.
- Mutators are synchronous and only queue work; nothing changes in the editor
  until \`await wf.commit()\`. A failed commit names the failing operation,
  keeps it and later ops queued, and can be retried after a fix.
- Use \`ui_search_nodes(...)\` / \`search_nodes(...)\` (imported from
  \`@nodetool-ai/sandbox-nodetool/ui\` and \`.../nodes\`) first when
  unsure of a node type, and \`await wf.commit()\` before telling the user the
  graph is ready.`;
