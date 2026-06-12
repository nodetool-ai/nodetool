/**
 * Performance Monitor window — Electron's stand-in for Chrome's Task Manager
 * (which isn't available in Electron; `chrome.send('openTaskManager')` only
 * exists on Chrome WebUI pages).
 *
 * Polls `app.getAppMetrics()` once a second and renders per-process CPU and
 * memory into a small self-contained window (data: URL page, no preload, no
 * IPC surface). Renderer processes are labeled with their window title /
 * URL via `webContents.getAllWebContents()`.
 */

import { app, BrowserWindow, webContents } from "electron";
import { hardenWebContents } from "./windowSecurity";

interface MetricRow {
  label: string;
  pid: number;
  cpu: number;
  memoryMb: number;
}

let perfWindow: BrowserWindow | null = null;

const PAGE_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Performance Monitor</title>
<style>
  body { margin: 0; background: #111; color: #ddd; font: 13px/1.5 -apple-system, system-ui, sans-serif; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 4px 12px; white-space: nowrap; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  th { position: sticky; top: 0; background: #1b1b1b; color: #999; font-weight: 600; border-bottom: 1px solid #333; }
  tr:nth-child(even) td { background: #161616; }
  td.label { max-width: 360px; overflow: hidden; text-overflow: ellipsis; }
  .hot { color: #ff9966; }
</style>
</head>
<body>
<table>
  <thead>
    <tr><th>Process</th><th class="num">PID</th><th class="num">CPU %</th><th class="num">Memory</th></tr>
  </thead>
  <tbody id="rows"><tr><td colspan="4" style="padding:16px;color:#777">Collecting…</td></tr></tbody>
</table>
<script>
  window.__updateMetrics = function (rows) {
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    document.getElementById("rows").innerHTML = rows
      .map((r) =>
        "<tr><td class='label' title='" + esc(r.label) + "'>" + esc(r.label) +
        "</td><td class='num'>" + r.pid +
        "</td><td class='num" + (r.cpu >= 50 ? " hot" : "") + "'>" + r.cpu.toFixed(1) +
        "</td><td class='num'>" + r.memoryMb.toFixed(0) + " MB</td></tr>"
      )
      .join("");
  };
</script>
</body>
</html>`;

/** One row per OS process, labeled and sorted by CPU (descending). */
function collectMetrics(): MetricRow[] {
  // Label renderer pids with what they're showing.
  const rendererLabels = new Map<number, string>();
  for (const wc of webContents.getAllWebContents()) {
    try {
      const pid = wc.getOSProcessId();
      const title = wc.getTitle() || wc.getURL() || "renderer";
      const existing = rendererLabels.get(pid);
      rendererLabels.set(pid, existing ? `${existing}, ${title}` : title);
    } catch {
      // WebContents may be mid-destruction; skip it.
    }
  }

  return app
    .getAppMetrics()
    .map((m) => {
      let label: string = m.type;
      if (m.type === "Browser") {
        label = "Main process";
      } else if (m.type === "Tab") {
        label = rendererLabels.get(m.pid) ?? "Renderer";
      } else if (m.name) {
        label = `${m.type}: ${m.name}`;
      } else if (m.serviceName) {
        label = `${m.type}: ${m.serviceName}`;
      }
      return {
        label,
        pid: m.pid,
        cpu: m.cpu?.percentCPUUsage ?? 0,
        memoryMb: (m.memory?.workingSetSize ?? 0) / 1024
      };
    })
    .sort((a, b) => b.cpu - a.cpu);
}

/**
 * Opens (or focuses) the Performance Monitor window.
 */
export function openPerformanceMonitorWindow(): void {
  if (perfWindow && !perfWindow.isDestroyed()) {
    perfWindow.focus();
    return;
  }

  const window = new BrowserWindow({
    width: 700,
    height: 420,
    title: "Performance Monitor",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  perfWindow = window;
  window.setBackgroundColor("#111111");
  hardenWebContents(window.webContents);
  void window.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(PAGE_HTML)}`
  );

  const push = (): void => {
    if (window.isDestroyed()) return;
    const rows = collectMetrics();
    window.webContents
      .executeJavaScript(
        `window.__updateMetrics?.(${JSON.stringify(rows)})`,
        true
      )
      .catch(() => {
        // Page not ready yet or window closing — next tick will retry.
      });
  };

  const timer = setInterval(push, 1000);
  window.webContents.once("did-finish-load", push);
  window.on("closed", () => {
    clearInterval(timer);
    perfWindow = null;
  });
}
