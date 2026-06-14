/**
 * Generate a self-contained HTML report for an E2E workflow run.
 *
 * The report bundles, per workflow: status, timing, params, outputs (with inline
 * media artifacts), per-node IO, logs, errors and a canvas screenshot. It links
 * to the JSONL trace file captured by the backend. The whole thing is written as
 * a single index.html (inline CSS/JS) next to its screenshots so it can be
 * downloaded from a GitHub Actions artifact and opened directly in a browser.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

export interface ReportRecord {
  id: string;
  name: string;
  status: string;
  source?: string;
  tags?: string[];
  durationMs: number | null;
  params: Record<string, unknown>;
  jobId: string | null;
  error: string | null;
  skipReason?: string;
  outputs: Array<{
    node_name?: string;
    output_name?: string;
    output_type?: string;
    value: unknown;
  }>;
  artifacts: Array<{ name: string; contentType: string; dataUrl?: string; uri?: string }>;
  logs: Array<{ ts: number; level?: string; content: string }>;
  nodeIO: Record<string, { node_type?: string; status?: string; error?: string | null }>;
  counts: { nodes: number; outputs: number; errors: number; edgeUpdates: number };
  expectationFailures: string[];
  screenshot?: string;
}

const STATUS_COLOR: Record<string, string> = {
  completed: "#22C55E",
  failed: "#EF4444",
  error: "#EF4444",
  timeout: "#F59E0B",
  cancelled: "#F59E0B",
  skipped: "#94A3B8",
  pending: "#64748B",
  running: "#3B82F6"
};

function esc(s: unknown): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function pretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function isPassed(r: ReportRecord): boolean {
  return r.status === "completed" && r.expectationFailures.length === 0;
}

function renderArtifact(a: ReportRecord["artifacts"][number]): string {
  if (a.dataUrl && a.contentType.startsWith("image/")) {
    return `<div class="artifact"><div class="muted">${esc(a.name)}</div><img src="${esc(a.dataUrl)}" /></div>`;
  }
  if (a.dataUrl && a.contentType.startsWith("audio/")) {
    return `<div class="artifact"><div class="muted">${esc(a.name)}</div><audio controls src="${esc(a.dataUrl)}"></audio></div>`;
  }
  const ref = a.uri ?? a.dataUrl ?? "(no data)";
  return `<div class="artifact"><div class="muted">${esc(a.name)} (${esc(a.contentType)})</div><code>${esc(ref).slice(0, 200)}</code></div>`;
}

function renderRecord(r: ReportRecord): string {
  const color = STATUS_COLOR[r.status] ?? "#64748B";
  const nodeRows = Object.entries(r.nodeIO)
    .map(
      ([id, io]) =>
        `<tr><td>${esc(id)}</td><td>${esc(io.node_type ?? "")}</td><td style="color:${STATUS_COLOR[io.status ?? ""] ?? "#e2e8f0"}">${esc(io.status ?? "")}</td><td>${esc(io.error ?? "")}</td></tr>`
    )
    .join("");
  const outputs = r.outputs
    .map(
      (o) =>
        `<div class="kv"><div class="muted">${esc(o.node_name ?? o.output_name ?? "output")}${o.output_type ? ` · ${esc(o.output_type)}` : ""}</div><pre>${esc(pretty(o.value)).slice(0, 4000)}</pre></div>`
    )
    .join("");
  const logs = r.logs
    .map((l) => `<div class="log"><span class="muted">${esc(l.level ?? "")}</span> ${esc(l.content).slice(0, 1000)}</div>`)
    .join("");

  return `
  <details class="card" ${isPassed(r) ? "" : "open"}>
    <summary>
      <span class="dot" style="background:${color}"></span>
      <span class="name">${esc(r.name)}</span>
      <span class="badge" style="border-color:${color};color:${color}">${esc(r.status)}</span>
      ${r.durationMs != null ? `<span class="muted">${r.durationMs}ms</span>` : ""}
      ${r.counts.outputs ? `<span class="muted">${r.counts.outputs} out</span>` : ""}
      ${r.counts.errors ? `<span class="muted err">${r.counts.errors} err</span>` : ""}
    </summary>
    <div class="body">
      ${r.skipReason ? `<div class="warn">Skipped: ${esc(r.skipReason)}</div>` : ""}
      ${r.error ? `<div class="warn">Error: ${esc(r.error)}</div>` : ""}
      ${r.expectationFailures.length ? `<div class="warn">Expectations: ${esc(r.expectationFailures.join("; "))}</div>` : ""}
      <div class="grid">
        <div class="col">
          ${r.screenshot ? `<div class="muted">Canvas</div><a href="${esc(r.screenshot)}" target="_blank"><img class="shot" src="${esc(r.screenshot)}" /></a>` : ""}
          <div class="muted">Params</div><pre>${esc(pretty(r.params))}</pre>
          ${r.jobId ? `<div class="muted">job_id: <code>${esc(r.jobId)}</code></div>` : ""}
        </div>
        <div class="col">
          <div class="muted">Outputs (${r.outputs.length})</div>
          ${outputs || '<div class="muted">none</div>'}
          ${r.artifacts.length ? `<div class="muted">Artifacts</div>${r.artifacts.map(renderArtifact).join("")}` : ""}
        </div>
      </div>
      <div class="muted">Node IO</div>
      <table><thead><tr><th>id</th><th>type</th><th>status</th><th>error</th></tr></thead><tbody>${nodeRows}</tbody></table>
      ${logs ? `<div class="muted">Logs</div><div class="logs">${logs}</div>` : ""}
    </div>
  </details>`;
}

export function generateReport(
  records: ReportRecord[],
  options: { outDir: string; title?: string; traceFile?: string; generatedAt?: string }
): string {
  const passed = records.filter(isPassed).length;
  const skipped = records.filter((r) => r.status === "skipped").length;
  const failed = records.length - passed - skipped;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(options.title ?? "NodeTool E2E Workflow Report")}</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; background:#0B1120; color:#E2E8F0; font-family: system-ui, sans-serif; font-size:14px; }
  header { padding:20px 24px; border-bottom:1px solid #1E293B; position:sticky; top:0; background:#0B1120; z-index:1; }
  h1 { margin:0 0 8px; font-size:18px; }
  .summary { display:flex; gap:16px; color:#94A3B8; }
  .summary b { color:#E2E8F0; }
  .pass { color:#22C55E; } .fail { color:#EF4444; } .skip { color:#94A3B8; }
  main { padding:16px 24px; max-width:1100px; margin:0 auto; }
  .card { border:1px solid #1E293B; border-radius:8px; margin-bottom:12px; background:#0F172A; }
  summary { padding:12px 16px; cursor:pointer; display:flex; align-items:center; gap:10px; list-style:none; }
  summary::-webkit-details-marker { display:none; }
  .dot { width:10px; height:10px; border-radius:50%; flex:0 0 auto; }
  .name { font-weight:600; flex:1; }
  .badge { border:1px solid; border-radius:999px; padding:1px 10px; font-size:11px; }
  .muted { color:#94A3B8; font-size:12px; margin:8px 0 4px; }
  .muted.err, .err { color:#F87171; }
  .body { padding:0 16px 16px; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  .col { min-width:0; }
  pre { background:#0B1120; border:1px solid #1E293B; border-radius:6px; padding:10px; overflow:auto; max-height:340px; font-size:12px; white-space:pre-wrap; word-break:break-word; }
  table { width:100%; border-collapse:collapse; font-size:12px; margin-bottom:8px; }
  th, td { text-align:left; padding:4px 8px; border-bottom:1px solid #1E293B; }
  th { color:#94A3B8; font-weight:500; }
  img.shot { max-width:100%; border:1px solid #1E293B; border-radius:6px; }
  .artifact img { max-width:100%; border-radius:6px; }
  .warn { background:#3f1d1d; border:1px solid #7f1d1d; color:#fecaca; padding:8px 10px; border-radius:6px; margin-bottom:10px; font-size:13px; }
  .logs { max-height:240px; overflow:auto; font-family:monospace; font-size:11px; background:#0B1120; border:1px solid #1E293B; border-radius:6px; padding:8px; }
  .log { padding:1px 0; }
  a { color:#60A5FA; }
  @media (max-width:760px){ .grid{ grid-template-columns:1fr; } }
</style></head>
<body>
<header>
  <h1>${esc(options.title ?? "NodeTool E2E Workflow Report")}</h1>
  <div class="summary">
    <span><b class="pass">${passed}</b> passed</span>
    <span><b class="fail">${failed}</b> failed</span>
    <span><b class="skip">${skipped}</b> skipped</span>
    <span><b>${records.length}</b> total</span>
    ${options.traceFile ? `<span><a href="${esc(options.traceFile)}">traces.jsonl</a></span>` : ""}
    <span>${esc(options.generatedAt ?? new Date().toISOString())}</span>
  </div>
</header>
<main>
  ${records.map(renderRecord).join("\n")}
</main>
</body></html>`;
  const outPath = resolve(options.outDir, "index.html");
  writeFileSync(outPath, html);
  return outPath;
}
