import { renderMcpAppHtml } from "./shell.js";

let cached: string | null = null;

export async function getCollectionsAppHtml(): Promise<string> {
  if (cached) return cached;
  cached = await renderMcpAppHtml({
    title: "NodeTool Collections",
    appName: "nodetool-collections",
    css: APP_CSS,
    body: APP_BODY
  });
  return cached;
}

const APP_CSS = `
.coll-card { background: var(--tile-bg); border: 1px solid var(--border); border-radius: 10px;
  padding: 14px; cursor: pointer; transition: border-color 0.15s; display: flex; flex-direction: column; gap: 8px; }
.coll-card:hover { border-color: var(--accent); }
.coll-card .cname { font-weight: 600; font-size: 14px; font-family: ui-monospace, monospace; }
.coll-card .ccount { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
.coll-card .cmeta { font-size: 11px; color: var(--muted); font-family: ui-monospace, monospace; }
.query-bar { display: flex; gap: 6px; align-items: center; margin-bottom: 12px; }
.query-bar input { flex: 1; }
.hit { background: var(--tile-bg); border: 1px solid var(--border); border-radius: 8px;
  padding: 10px 12px; margin-bottom: 8px; }
.hit .hhead { display: flex; gap: 8px; align-items: baseline; margin-bottom: 4px; }
.hit .hid { font-family: ui-monospace, monospace; font-size: 11px; color: var(--muted); }
.hit .hdist { font-size: 10px; color: var(--accent); margin-left: auto; font-variant-numeric: tabular-nums; }
.hit .htext { font-size: 12px; color: var(--fg); white-space: pre-wrap; line-height: 1.4;
  max-height: 120px; overflow: hidden; }
.hit .hmeta { font-size: 11px; color: var(--muted); margin-top: 6px; font-family: ui-monospace, monospace; }
`;

const APP_BODY = `
let allCollections = [];
let selected = null;
let queryText = "";
let hits = null;
let queryError = null;
let querying = false;

function render() {
  root.innerHTML = "";
  if (selected) { renderDetail(); return; }
  root.appendChild(el("div", { class: "mcp-header" }, [
    el("h1", null, "Collections"),
    el("span", { class: "mcp-count" }, allCollections.length + (allCollections.length === 1 ? " collection" : " collections"))
  ]));
  if (!allCollections.length) {
    root.appendChild(el("div", { class: "mcp-empty" }, "No collections."));
    return;
  }
  const grid = el("div", { class: "mcp-grid", style: { gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" } });
  for (const c of allCollections) grid.appendChild(renderCollectionCard(c));
  root.appendChild(grid);
}

function renderCollectionCard(c) {
  const meta = c.metadata || {};
  const card = el("div", { class: "coll-card" }, [
    el("div", { class: "cname" }, c.name),
    el("div", { class: "ccount" }, (typeof c.count === "number" ? c.count : "?") + " documents"),
    c.workflow_name ? el("div", { class: "cmeta" }, "↳ " + c.workflow_name) : null,
    meta.embedding_model ? el("div", { class: "cmeta" }, "model: " + meta.embedding_model) : null
  ]);
  card.addEventListener("click", () => { selected = c; hits = null; queryText = ""; render(); });
  return card;
}

function renderDetail() {
  const back = el("button", { type: "button", class: "mcp-btn" }, "← Back");
  back.addEventListener("click", () => { selected = null; hits = null; render(); });

  root.appendChild(el("div", { class: "mcp-header" }, [back, el("h1", null, selected.name)]));

  const input = el("input", { type: "text", class: "mcp-search", placeholder: "Semantic query…", value: queryText });
  input.addEventListener("input", (e) => { queryText = e.target.value; });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") runQuery(); });
  const runBtn = el("button", { type: "button", class: "mcp-btn mcp-btn-primary" }, querying ? "Searching…" : "Search");
  if (querying) runBtn.disabled = true;
  runBtn.addEventListener("click", runQuery);

  root.appendChild(el("div", { class: "query-bar" }, [input, runBtn]));

  if (queryError) root.appendChild(el("div", { class: "mcp-error" }, queryError));
  if (Array.isArray(hits) && hits.length === 0) root.appendChild(el("div", { class: "mcp-empty" }, "No matches."));
  if (Array.isArray(hits) && hits.length) {
    for (const h of hits) root.appendChild(renderHit(h));
  } else if (!queryError) {
    const meta = selected.metadata || {};
    const summary = el("div", { class: "coll-card" }, [
      el("div", { class: "cname" }, selected.name),
      el("div", { class: "ccount" }, (typeof selected.count === "number" ? selected.count : "?") + " documents indexed"),
      Object.entries(meta).map(([k, v]) =>
        el("div", { class: "cmeta" }, k + ": " + (typeof v === "object" ? JSON.stringify(v) : String(v))))
    ]);
    root.appendChild(summary);
  }

  setTimeout(() => input.focus(), 0);
}

function renderHit(h) {
  return el("div", { class: "hit" }, [
    el("div", { class: "hhead" }, [
      el("span", { class: "hid" }, h.id || ""),
      typeof h.distance === "number" ? el("span", { class: "hdist" }, "d=" + h.distance.toFixed(4)) : null
    ]),
    h.document ? el("div", { class: "htext" }, h.document) : el("div", { class: "htext" }, "(no document text)"),
    h.metadata ? el("div", { class: "hmeta" }, JSON.stringify(h.metadata)) : null
  ]);
}

async function runQuery() {
  if (!selected || !queryText.trim()) return;
  querying = true;
  queryError = null;
  hits = null;
  render();
  try {
    const result = await app.callServerTool({
      name: "query_collection",
      arguments: { name: selected.name, query_texts: [queryText.trim()], n_results: 20 }
    });
    const data = parseToolResult(result);
    if (data && data.error) { queryError = data.error; }
    else hits = normalizeHits(data);
  } catch (err) {
    queryError = err && err.message ? err.message : String(err);
  }
  querying = false;
  render();
}

function normalizeHits(data) {
  if (!data) return [];
  // query_collection returns { ids, documents, metadatas, distances } as parallel
  // 2-D arrays (one per query text). We always send one query.
  const ids = (data.ids && data.ids[0]) || [];
  const docs = (data.documents && data.documents[0]) || [];
  const metas = (data.metadatas && data.metadatas[0]) || [];
  const dists = (data.distances && data.distances[0]) || [];
  return ids.map((id, i) => ({ id, document: docs[i], metadata: metas[i], distance: dists[i] }));
}

function ingest(data) {
  if (!data) { showEmpty("No data."); return; }
  if (data.error) { showError(data.error); return; }
  if (Array.isArray(data.collections)) {
    allCollections = data.collections;
    selected = null;
  } else if (data.name && (data.count !== undefined || data.metadata !== undefined)) {
    // get_collection response — treat as the only entry and drill in.
    allCollections = [data];
    selected = data;
  } else if (data.ids) {
    // query_collection response (shouldn't happen on initial render but handle gracefully).
    hits = normalizeHits(data);
  }
  render();
}

app.ontoolresult = (params) => ingest(parseToolResult(params));
`;
