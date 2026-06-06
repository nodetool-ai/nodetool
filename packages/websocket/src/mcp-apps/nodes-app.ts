import { renderMcpAppHtml } from "./shell.js";

let cached: string | null = null;

export async function getNodesAppHtml(): Promise<string> {
  if (cached) return cached;
  cached = await renderMcpAppHtml({
    title: "NodeTool Nodes",
    appName: "nodetool-nodes",
    css: APP_CSS,
    body: APP_BODY
  });
  return cached;
}

const APP_CSS = `
.nodes-layout { display: grid; grid-template-columns: 220px 1fr; gap: 12px; }
.ns-list { background: var(--tile-bg); border: 1px solid var(--border); border-radius: 10px;
  padding: 6px; max-height: calc(100vh - 120px); overflow: auto; }
.ns-item { padding: 6px 8px; border-radius: 6px; font-size: 12px; cursor: pointer;
  display: flex; justify-content: space-between; align-items: center; }
.ns-item:hover { background: rgba(255,255,255,0.05); }
.ns-item[aria-pressed="true"] { background: var(--accent); color: white; }
.ns-item .badge { font-size: 10px; color: var(--muted); padding: 1px 6px;
  background: rgba(255,255,255,0.05); border-radius: 999px; }
.ns-item[aria-pressed="true"] .badge { color: white; background: rgba(255,255,255,0.2); }
.node-card { background: var(--tile-bg); border: 1px solid var(--border); border-radius: 10px;
  padding: 12px; cursor: pointer; transition: border-color 0.15s; }
.node-card:hover { border-color: var(--accent); }
.node-card .ntype { font-family: ui-monospace, monospace; font-size: 10px; color: var(--accent);
  display: block; margin-bottom: 4px; }
.node-card .ntitle { font-weight: 600; font-size: 13px; margin-bottom: 4px; }
.node-card .ndesc { font-size: 12px; color: var(--muted); display: -webkit-box;
  -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.node-card .nscore { font-size: 10px; color: var(--muted); margin-top: 6px;
  font-variant-numeric: tabular-nums; }
.results-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; }
@media (max-width: 700px) {
  .nodes-layout { grid-template-columns: 1fr; }
  .ns-list { max-height: 200px; }
}
`;

const APP_BODY = `
let allNodes = [];
let mode = "list"; // "list" or "search"
let query = "";
let namespaceFilter = null;

function uniqueNamespaces() {
  const set = new Map();
  for (const n of allNodes) {
    const ns = n.namespace || "";
    set.set(ns, (set.get(ns) || 0) + 1);
  }
  return [...set.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function render() {
  root.innerHTML = "";
  const searchInput = el("input", {
    type: "search",
    class: "mcp-search",
    placeholder: mode === "search" ? "Press Enter to search…" : "Filter…",
    value: query
  });
  searchInput.addEventListener("input", (e) => { query = e.target.value; if (mode === "list") render(); });
  searchInput.addEventListener("keydown", async (e) => {
    if (e.key === "Enter" && mode === "search" && query.trim()) {
      try {
        const result = await app.callServerTool({
          name: "search_nodes",
          arguments: { query: query.trim().split(/\\s+/), n_results: 50 }
        });
        const data = parseToolResult(result);
        if (data && Array.isArray(data)) { allNodes = data; render(); }
      } catch (err) { showError(String(err)); }
    }
  });
  setTimeout(() => searchInput.focus(), 0);

  const modeBtn = el("button", { type: "button", class: "mcp-chip" }, mode === "search" ? "Server search" : "Local filter");
  modeBtn.setAttribute("aria-pressed", String(mode === "search"));
  modeBtn.addEventListener("click", () => { mode = mode === "search" ? "list" : "search"; render(); });

  root.appendChild(el("div", { class: "mcp-header" }, [
    el("h1", null, "Nodes"),
    el("span", { class: "mcp-count" }, allNodes.length + " " + (mode === "search" ? "results" : "nodes")),
    el("div", { class: "mcp-actions" }, [searchInput, modeBtn])
  ]));

  const layout = el("div", { class: "nodes-layout" });
  const nsList = el("div", { class: "ns-list" });
  const nsAll = el("div", { class: "ns-item" }, [el("span", null, "All"), el("span", { class: "badge" }, String(allNodes.length))]);
  nsAll.setAttribute("aria-pressed", String(namespaceFilter == null));
  nsAll.addEventListener("click", () => { namespaceFilter = null; render(); });
  nsList.appendChild(nsAll);
  for (const [ns, count] of uniqueNamespaces()) {
    const item = el("div", { class: "ns-item" }, [el("span", null, ns || "(none)"), el("span", { class: "badge" }, String(count))]);
    item.setAttribute("aria-pressed", String(namespaceFilter === ns));
    item.addEventListener("click", () => { namespaceFilter = ns; render(); });
    nsList.appendChild(item);
  }
  layout.appendChild(nsList);

  let filtered = namespaceFilter == null ? allNodes : allNodes.filter(n => (n.namespace || "") === namespaceFilter);
  if (mode === "list" && query) {
    const q = query.toLowerCase();
    filtered = filtered.filter(n => (
      (n.node_type || "").toLowerCase().includes(q) ||
      (n.title || "").toLowerCase().includes(q) ||
      (n.description || "").toLowerCase().includes(q)
    ));
  }

  const right = el("div");
  if (!filtered.length) {
    right.appendChild(el("div", { class: "mcp-empty" }, "No nodes."));
  } else {
    const grid = el("div", { class: "results-grid" });
    for (const n of filtered) grid.appendChild(renderNode(n));
    right.appendChild(grid);
  }
  layout.appendChild(right);
  root.appendChild(layout);
}

function renderNode(n) {
  const card = el("div", { class: "node-card" }, [
    el("span", { class: "ntype" }, n.node_type || ""),
    el("div", { class: "ntitle" }, n.title || (n.node_type || "").split(".").pop() || "—"),
    n.description ? el("div", { class: "ndesc" }, n.description) : null,
    typeof n.score === "number" ? el("div", { class: "nscore" }, "score " + n.score.toFixed(3)) : null
  ]);
  card.addEventListener("click", () => {
    app.callServerTool({ name: "get_node_info", arguments: { node_type: n.node_type } }).catch(() => {});
  });
  return card;
}

function ingest(data) {
  if (!data) { showEmpty("No data."); return; }
  if (data.error) { showError(data.error); return; }
  if (Array.isArray(data)) {
    allNodes = data;
    // search_nodes returns ranked results; list_nodes does too.
    mode = data.some(d => typeof d.score === "number") ? "search" : "list";
  } else if (data.node_type) {
    // get_node_info: single record — show it as a one-item view.
    allNodes = [data];
  }
  render();
}

app.ontoolresult = (params) => ingest(parseToolResult(params));
`;
