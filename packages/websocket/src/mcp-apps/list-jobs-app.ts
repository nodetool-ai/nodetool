import { renderMcpAppHtml } from "./shell.js";

let cached: string | null = null;

export async function getListJobsAppHtml(): Promise<string> {
  if (cached) return cached;
  cached = await renderMcpAppHtml({
    title: "NodeTool Jobs",
    appName: "nodetool-list-jobs",
    css: APP_CSS,
    body: APP_BODY
  });
  return cached;
}

const APP_CSS = `
.jobs-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.jobs-table th, .jobs-table td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); }
.jobs-table th { color: var(--muted); font-weight: 500; font-size: 11px;
  text-transform: uppercase; letter-spacing: 0.04em; }
.jobs-table tr { cursor: pointer; transition: background 0.1s; }
.jobs-table tr:hover { background: rgba(255,255,255,0.03); }
.jobs-table td.mono { font-family: ui-monospace, Menlo, monospace; font-size: 11px; color: var(--muted); }
.jobs-table td.error { color: var(--bad); font-size: 11px; max-width: 360px; overflow: hidden; text-overflow: ellipsis; }
.summary { display: flex; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.summary .card { padding: 10px 14px; background: var(--tile-bg); border: 1px solid var(--border);
  border-radius: 8px; min-width: 90px; }
.summary .card .label { font-size: 10px; text-transform: uppercase; color: var(--muted); letter-spacing: 0.04em; }
.summary .card .value { font-size: 18px; font-weight: 600; margin-top: 2px; font-variant-numeric: tabular-nums; }
`;

const APP_BODY = `
let allJobs = [];
let statusFilter = "all";

function durationOf(job) {
  if (!job.started_at) return null;
  const start = new Date(job.started_at).getTime();
  const end = job.finished_at ? new Date(job.finished_at).getTime() : Date.now();
  return Math.max(0, (end - start) / 1000);
}

function render() {
  root.innerHTML = "";

  const counts = { all: allJobs.length, running: 0, completed: 0, failed: 0, cancelled: 0 };
  for (const j of allJobs) {
    const s = String(j.status || "").toLowerCase();
    if (counts[s] !== undefined) counts[s]++;
  }

  root.appendChild(el("div", { class: "mcp-header" }, [
    el("h1", null, "Jobs"),
    el("span", { class: "mcp-count" }, allJobs.length + " total"),
    el("div", { class: "mcp-actions" },
      ["all", "running", "completed", "failed", "cancelled"].map(s => {
        const b = el("button", { type: "button", class: "mcp-chip" }, s + (s === "all" ? "" : " (" + (counts[s] || 0) + ")"));
        b.setAttribute("aria-pressed", String(s === statusFilter));
        b.addEventListener("click", () => { statusFilter = s; render(); });
        return b;
      }))
  ]));

  root.appendChild(el("div", { class: "summary" }, [
    statCard("Running", counts.running),
    statCard("Completed", counts.completed),
    statCard("Failed", counts.failed),
    statCard("Cancelled", counts.cancelled)
  ]));

  const filtered = statusFilter === "all" ? allJobs : allJobs.filter(j => String(j.status || "").toLowerCase() === statusFilter);
  if (!filtered.length) {
    root.appendChild(el("div", { class: "mcp-empty" }, "No jobs."));
    return;
  }

  const tbl = el("table", { class: "jobs-table" });
  tbl.appendChild(el("thead", null, el("tr", null, [
    th("Status"), th("Job"), th("Workflow"), th("Started"), th("Duration"), th("")
  ])));
  const tbody = el("tbody");
  for (const job of filtered) {
    const tr = el("tr");
    tr.appendChild(el("td", null, pill(job.status)));
    tr.appendChild(el("td", { class: "mono" }, (job.id || "").slice(0, 8)));
    const wfBtn = el("button", { class: "mcp-btn", style: { padding: "2px 8px" } }, job.workflow_id ? job.workflow_id.slice(0, 8) : "—");
    if (job.workflow_id) wfBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      app.callServerTool({ name: "get_workflow", arguments: { workflow_id: job.workflow_id } }).catch(() => {});
    });
    tr.appendChild(el("td", null, wfBtn));
    tr.appendChild(el("td", null, formatDate(job.started_at)));
    const dur = durationOf(job);
    tr.appendChild(el("td", null, dur != null ? formatDuration(dur) : "—"));
    tr.appendChild(el("td", { class: "error" }, job.error ? String(job.error).slice(0, 120) : ""));
    tr.addEventListener("click", () => {
      app.callServerTool({ name: "get_job", arguments: { job_id: job.id } }).catch(() => {});
    });
    tbody.appendChild(tr);
  }
  tbl.appendChild(tbody);
  root.appendChild(tbl);
}

function th(label) { return el("th", null, label); }
function statCard(label, value) {
  return el("div", { class: "card" }, [
    el("div", { class: "label" }, label),
    el("div", { class: "value" }, String(value))
  ]);
}

function ingest(data) {
  if (!data) { showEmpty("No data."); return; }
  if (data.error) { showError(data.error); return; }
  if (Array.isArray(data.jobs)) allJobs = data.jobs;
  else if (data.id && data.status !== undefined) {
    // get_job result — replace list with a single-row view.
    allJobs = [data];
  }
  render();
}

app.ontoolresult = (params) => ingest(parseToolResult(params));
`;
