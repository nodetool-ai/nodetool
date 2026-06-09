import { renderMcpAppHtml } from "./shell.js";

let cached: string | null = null;

export async function getListWorkflowsAppHtml(): Promise<string> {
  if (cached) return cached;
  cached = await renderMcpAppHtml({
    title: "NodeTool Workflows",
    appName: "nodetool-list-workflows",
    css: APP_CSS,
    body: APP_BODY
  });
  return cached;
}

const APP_CSS = `
.wf-tile { background: var(--tile-bg); border: 1px solid var(--border); border-radius: 10px;
  overflow: hidden; display: flex; flex-direction: column; cursor: pointer;
  transition: border-color 0.15s, transform 0.1s; }
.wf-tile:hover { border-color: var(--accent); }
.wf-tile:active { transform: scale(0.99); }
.wf-thumb { aspect-ratio: 4 / 3; width: 100%; background: linear-gradient(135deg, #1a1a22, #2a2a35);
  display: flex; align-items: center; justify-content: center; color: var(--muted); }
.wf-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.wf-icon { font-size: 36px; opacity: 0.6; }
.wf-body { padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; flex: 1; }
.wf-name { font-weight: 600; font-size: 13px; overflow: hidden; text-overflow: ellipsis;
  display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; }
.wf-desc { font-size: 12px; color: var(--muted); overflow: hidden;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; flex: 1; }
.wf-tags { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
.wf-tag { font-size: 10px; padding: 1px 6px; border-radius: 999px;
  background: rgba(124,92,255,0.15); color: var(--accent); }
.wf-foot { display: flex; align-items: center; gap: 8px; padding: 8px 12px;
  border-top: 1px solid var(--border); font-size: 11px; color: var(--muted); }
.wf-foot .spacer { flex: 1; }
.wf-detail { padding: 16px; background: var(--tile-bg); border: 1px solid var(--border);
  border-radius: 10px; }
.wf-detail h2 { margin: 0 0 8px; font-size: 18px; }
.wf-detail .desc { color: var(--muted); font-size: 13px; margin-bottom: 12px; white-space: pre-wrap; }
.wf-stats { display: flex; gap: 16px; font-size: 12px; color: var(--muted); margin-bottom: 12px; }
.wf-stats b { color: var(--fg); font-weight: 600; }
.wf-run-result { margin-top: 12px; padding: 10px; background: var(--bg);
  border: 1px solid var(--border); border-radius: 8px; font-family: ui-monospace, Menlo, monospace;
  font-size: 11px; white-space: pre-wrap; max-height: 240px; overflow: auto; }
`;

const APP_BODY = `
let allWorkflows = [];
let query = "";
let detail = null;
let runResult = null;
let runError = null;

function countNodes(wf) {
  const g = wf.graph || {};
  return Array.isArray(g.nodes) ? g.nodes.length : 0;
}

function renderTile(wf) {
  const thumb = el("div", { class: "wf-thumb" });
  if (wf.thumbnail_url) {
    thumb.appendChild(el("img", { loading: "lazy", src: wf.thumbnail_url, alt: wf.name || "" }));
  } else {
    thumb.appendChild(el("span", { class: "wf-icon" }, "🧩"));
  }
  const tags = Array.isArray(wf.tags) ? wf.tags : [];
  const body = el("div", { class: "wf-body" }, [
    el("div", { class: "wf-name" }, wf.name || wf.id),
    wf.description ? el("div", { class: "wf-desc" }, wf.description) : null,
    tags.length ? el("div", { class: "wf-tags" }, tags.slice(0, 4).map(t => el("span", { class: "wf-tag" }, String(t)))) : null
  ]);
  const foot = el("div", { class: "wf-foot" }, [
    el("span", null, countNodes(wf) + " nodes"),
    el("span", { class: "spacer" }),
    el("span", null, wf.updated_at ? formatDate(wf.updated_at) : "")
  ]);
  const tile = el("div", { class: "wf-tile" }, [thumb, body, foot]);
  tile.addEventListener("click", () => openDetail(wf));
  return tile;
}

function openDetail(wf) {
  detail = wf;
  runResult = null;
  runError = null;
  render();
}

async function runWorkflow(wf) {
  runResult = null;
  runError = null;
  const btn = root.querySelector("button[data-run]");
  if (btn) { btn.disabled = true; btn.textContent = "Running…"; }
  try {
    const result = await app.callServerTool({
      name: "run_workflow",
      arguments: { workflow_id: wf.id }
    });
    const parsed = parseToolResult(result);
    if (parsed && parsed.error) runError = parsed.error;
    else runResult = parsed;
  } catch (err) {
    runError = err && err.message ? err.message : String(err);
  }
  render();
}

function backToList() { detail = null; runResult = null; runError = null; render(); }

function render() {
  root.innerHTML = "";
  if (detail) { renderDetail(detail); return; }

  const filtered = !query ? allWorkflows : allWorkflows.filter(w => {
    const hay = ((w.name || "") + " " + (w.description || "") + " " + (Array.isArray(w.tags) ? w.tags.join(" ") : "")).toLowerCase();
    return hay.includes(query.toLowerCase());
  });

  const search = el("input", { type: "search", class: "mcp-search", placeholder: "Filter workflows…", value: query });
  search.addEventListener("input", (e) => { query = e.target.value; render(); search.focus(); });

  root.appendChild(el("div", { class: "mcp-header" }, [
    el("h1", null, "Workflows"),
    el("span", { class: "mcp-count" }, filtered.length + (filtered.length === 1 ? " workflow" : " workflows")),
    el("div", { class: "mcp-actions" }, [search])
  ]));

  if (!filtered.length) {
    root.appendChild(el("div", { class: "mcp-empty" }, "No workflows match."));
    return;
  }
  const grid = el("div", { class: "mcp-grid", style: { gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" } });
  for (const wf of filtered) grid.appendChild(renderTile(wf));
  root.appendChild(grid);
}

function renderDetail(wf) {
  const back = el("button", { type: "button", class: "mcp-btn" }, "← Back");
  back.addEventListener("click", backToList);

  const runBtn = el("button", { type: "button", class: "mcp-btn mcp-btn-primary", "data-run": "1" }, "▶ Run");
  runBtn.addEventListener("click", () => runWorkflow(wf));

  const viewGraphBtn = el("button", { type: "button", class: "mcp-btn" }, "View graph");
  viewGraphBtn.addEventListener("click", async () => {
    try {
      const result = await app.callServerTool({
        name: "get_workflow",
        arguments: { workflow_id: wf.id }
      });
      const parsed = parseToolResult(result);
      if (parsed) detail = parsed;
      render();
    } catch (_) {}
  });

  root.appendChild(el("div", { class: "mcp-header" }, [back, el("div", { style: { flex: "1" } }), runBtn, viewGraphBtn]));

  const detailCard = el("div", { class: "wf-detail" }, [
    el("h2", null, wf.name || wf.id),
    wf.description ? el("div", { class: "desc" }, wf.description) : null,
    el("div", { class: "wf-stats" }, [
      el("span", null, [el("b", null, String(countNodes(wf))), " nodes"]),
      el("span", null, [el("b", null, formatDate(wf.updated_at) || "—"), " updated"]),
      el("span", null, [el("b", null, wf.access || "private")])
    ])
  ]);
  if (wf.thumbnail_url) {
    detailCard.appendChild(el("img", { src: wf.thumbnail_url, alt: "", style: { maxWidth: "100%", borderRadius: "6px" } }));
  }
  if (runError) detailCard.appendChild(el("div", { class: "mcp-error", style: { marginTop: "12px" } }, runError));
  if (runResult) detailCard.appendChild(el("div", { class: "wf-run-result" }, typeof runResult === "string" ? runResult : JSON.stringify(runResult, null, 2)));
  root.appendChild(detailCard);
}

function ingest(data) {
  if (!data) { showEmpty("No data."); return; }
  if (data.error) { showError(data.error); return; }
  // Tool can return either { workflows: [...] } (list) or a single workflow object (get).
  if (Array.isArray(data.workflows)) {
    allWorkflows = data.workflows;
    detail = null;
  } else if (data.id && data.graph !== undefined) {
    detail = data;
  } else {
    allWorkflows = [];
  }
  render();
}

app.ontoolresult = (params) => ingest(parseToolResult(params));
`;
