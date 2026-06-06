/**
 * Shared infrastructure for NodeTool MCP App views.
 *
 * - Loads the ext-apps client bundle once at server startup.
 * - Rewrites the bundle's trailing ESM `export` into a `globalThis`
 *   assignment so it can be inlined as a regular `<script>` tag,
 *   avoiding CSP issues with `data:` URL ESM imports inside the
 *   host's sandboxed iframe.
 * - Wraps a per-app body in a consistent HTML shell with theme
 *   variables, base styles, and standard layout chrome.
 */

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let cachedBundleScript: string | null = null;

async function loadExtAppsBundle(): Promise<string> {
  if (cachedBundleScript) return cachedBundleScript;
  const bundlePath = require.resolve(
    "@modelcontextprotocol/ext-apps/app-with-deps"
  );
  const raw = await readFile(bundlePath, "utf-8");
  cachedBundleScript = inlinableBundle(raw);
  return cachedBundleScript;
}

function inlinableBundle(bundle: string): string {
  const match = bundle.match(/export\s*\{([^}]+)\}\s*;?\s*$/);
  if (!match || match.index === undefined) {
    throw new Error(
      "ext-apps bundle: unable to locate trailing export statement"
    );
  }
  const entries = (match[1] ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const asMatch = entry.match(/^(\S+)\s+as\s+(\S+)$/);
      if (asMatch && asMatch[1] && asMatch[2]) {
        return { local: asMatch[1], exported: asMatch[2] };
      }
      return { local: entry, exported: entry };
    });
  const assignments = entries
    .map((e) => `${e.exported}:${e.local}`)
    .join(",");
  const safeBody = bundle
    .slice(0, match.index)
    .replace(/<\/script/gi, "<\\/script");
  return `${safeBody};globalThis.__mcpExtApps={${assignments}};`;
}

export interface McpAppOptions {
  title: string;
  /** Extra <style> block injected after the shared base styles. */
  css?: string;
  /** Per-app JS that runs after the shell helpers are initialized. */
  body: string;
  /** App name reported in the MCP Apps handshake. */
  appName?: string;
}

/** Build a complete MCP App HTML document. Cached per app shape. */
export async function renderMcpAppHtml(opts: McpAppOptions): Promise<string> {
  const bundle = await loadExtAppsBundle();
  const safeBundle = bundle.replace(/<\/script/gi, "<\\/script");
  const safeBody = opts.body.replace(/<\/script/gi, "<\\/script");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(opts.title)}</title>
<style>${BASE_CSS}</style>
${opts.css ? `<style>${opts.css}</style>` : ""}
</head>
<body>
<div id="root"><div class="mcp-empty">Loading…</div></div>
<div class="mcp-lightbox" id="mcp-lightbox" hidden>
  <button type="button" class="mcp-lightbox-close" id="mcp-lightbox-close" aria-label="Close">&times;</button>
  <div class="mcp-lightbox-content" id="mcp-lightbox-content"></div>
</div>
<script>
${safeBundle}
</script>
<script>
${SHELL_RUNTIME}
${safeBody}

bootstrap(${JSON.stringify(opts.appName ?? `nodetool-${slugify(opts.title)}`)});
</script>
</body>
</html>`;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c
  );
}

const BASE_CSS = `
:root {
  color-scheme: light dark;
  --bg: var(--mcp-color-background, #0b0b0d);
  --fg: var(--mcp-color-foreground, #f5f5f7);
  --muted: var(--mcp-color-muted, #888);
  --tile-bg: var(--mcp-color-surface, #1c1c1f);
  --border: var(--mcp-color-border, rgba(255,255,255,0.08));
  --accent: var(--mcp-color-accent, #7c5cff);
  --good: #34c759;
  --warn: #ff9f0a;
  --bad: #ff453a;
  --info: #5ac8fa;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--bg); color: var(--fg);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
body { padding: 16px; min-height: 100vh; }
button { font: inherit; }
.mcp-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.mcp-header h1 { font-size: 14px; font-weight: 600; margin: 0; letter-spacing: 0.02em; }
.mcp-header .mcp-count { font-size: 12px; color: var(--muted); }
.mcp-header .mcp-actions { margin-left: auto; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.mcp-chip { font: inherit; font-size: 12px; padding: 4px 10px; border-radius: 999px;
  background: var(--tile-bg); color: var(--fg); border: 1px solid var(--border);
  cursor: pointer; transition: background 0.15s, border-color 0.15s; }
.mcp-chip:hover { border-color: var(--accent); }
.mcp-chip[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: white; }
.mcp-btn { font: inherit; font-size: 12px; padding: 4px 10px; border-radius: 6px;
  background: var(--tile-bg); color: var(--fg); border: 1px solid var(--border);
  cursor: pointer; transition: background 0.15s, border-color 0.15s; }
.mcp-btn:hover { border-color: var(--accent); }
.mcp-btn[disabled] { opacity: 0.5; cursor: progress; }
.mcp-btn-primary { background: var(--accent); border-color: var(--accent); color: white; }
.mcp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
.mcp-empty { padding: 48px 12px; text-align: center; color: var(--muted); font-size: 13px; }
.mcp-error { padding: 12px; border-radius: 8px; background: rgba(255, 80, 80, 0.12);
  color: #ff8080; border: 1px solid rgba(255, 80, 80, 0.3); font-size: 12px; white-space: pre-wrap; }
.mcp-search { font: inherit; font-size: 12px; padding: 6px 10px; border-radius: 6px;
  background: var(--tile-bg); color: var(--fg); border: 1px solid var(--border); min-width: 200px; }
.mcp-search:focus { outline: none; border-color: var(--accent); }
.mcp-pill { display: inline-flex; align-items: center; gap: 4px; font-size: 10px;
  padding: 2px 8px; border-radius: 999px; font-weight: 600; letter-spacing: 0.02em;
  text-transform: uppercase; }
.mcp-pill-running { background: rgba(90,200,250,0.18); color: var(--info); }
.mcp-pill-completed { background: rgba(52,199,89,0.18); color: var(--good); }
.mcp-pill-failed { background: rgba(255,69,58,0.18); color: var(--bad); }
.mcp-pill-cancelled { background: rgba(142,142,147,0.18); color: var(--muted); }
.mcp-pill-pending { background: rgba(255,159,10,0.18); color: var(--warn); }
.mcp-lightbox { position: fixed; inset: 0; background: rgba(0,0,0,0.92); display: flex;
  align-items: center; justify-content: center; padding: 24px; z-index: 100; }
.mcp-lightbox[hidden] { display: none !important; }
.mcp-lightbox-content { max-width: 100%; max-height: 100%; display: flex;
  flex-direction: column; align-items: center; gap: 12px; }
.mcp-lightbox img, .mcp-lightbox video, .mcp-lightbox audio { max-width: 90vw; max-height: 78vh;
  border-radius: 8px; background: #000; }
.mcp-lightbox-close { position: absolute; top: 16px; right: 16px; background: transparent;
  border: none; color: white; font-size: 28px; cursor: pointer; line-height: 1; }
`;

/**
 * Shared runtime glue exposed to every per-app body. Defines:
 * - `mcp` global with helpers: el(), text(), pill(), formatSize(),
 *   formatDuration(), formatDate(), openLightbox(), closeLightbox(),
 *   showError(), showEmpty(), parseToolResult().
 * - `bootstrap(appName)` — every app calls it after attaching its
 *   `app.ontoolresult` / `app.ontoolinput` handlers. It connects the
 *   PostMessage transport and surfaces transport errors.
 * - Declares `app` (the MCP App instance) and `root` (root container).
 */
const SHELL_RUNTIME = `
const { App, PostMessageTransport } = globalThis.__mcpExtApps;
const root = document.getElementById("root");
const lightboxEl = document.getElementById("mcp-lightbox");
const lightboxContent = document.getElementById("mcp-lightbox-content");

document.getElementById("mcp-lightbox-close").addEventListener("click", closeLightbox);
lightboxEl.addEventListener("click", (e) => { if (e.target === lightboxEl) closeLightbox(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeLightbox(); });

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "html") node.innerHTML = String(v);
    else node.setAttribute(k, String(v));
  }
  if (children != null) {
    const arr = Array.isArray(children) ? children : [children];
    for (const c of arr) {
      if (c == null || c === false) continue;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
  }
  return node;
}

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = bytes, i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return n.toFixed(n >= 10 || i === 0 ? 0 : 1) + " " + units[i];
}
function formatDuration(s) {
  if (s == null) return "";
  if (s < 60) return s.toFixed(s < 10 ? 1 : 0) + "s";
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  if (m < 60) return m + "m " + sec + "s";
  const h = Math.floor(m / 60);
  return h + "h " + (m % 60) + "m";
}
function formatDate(value) {
  if (!value) return "";
  const d = typeof value === "number" ? new Date(value) : new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  const now = Date.now();
  const diff = (now - d.getTime()) / 1000;
  if (diff < 60) return Math.floor(diff) + "s ago";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  if (diff < 604800) return Math.floor(diff / 86400) + "d ago";
  return d.toLocaleDateString();
}
function pill(status) {
  const s = String(status || "").toLowerCase();
  const cls = ["running", "completed", "failed", "cancelled", "pending"].includes(s)
    ? "mcp-pill-" + s : "mcp-pill-pending";
  return el("span", { class: "mcp-pill " + cls }, s || "unknown");
}

function openLightbox(node, caption) {
  lightboxContent.innerHTML = "";
  lightboxContent.appendChild(node);
  if (caption) lightboxContent.appendChild(el("div", { style: { color: "white", fontSize: "13px", maxWidth: "90vw", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, caption));
  lightboxEl.hidden = false;
}
function closeLightbox() {
  lightboxEl.hidden = true;
  lightboxContent.innerHTML = "";
}

function showError(message) {
  root.innerHTML = "";
  root.appendChild(el("div", { class: "mcp-error" }, String(message)));
}
function showEmpty(message) {
  root.innerHTML = "";
  root.appendChild(el("div", { class: "mcp-empty" }, message || "No results."));
}

function parseToolResult(params) {
  if (!params) return null;
  if (params.isError) {
    const txt = (params.content || []).map(c => c && c.text).filter(Boolean).join("\\n");
    return { error: txt || "Tool returned an error." };
  }
  if (params.structuredContent && typeof params.structuredContent === "object") {
    return params.structuredContent;
  }
  const content = params.content || [];
  for (const item of content) {
    if (item && item.type === "text" && typeof item.text === "string") {
      try { return JSON.parse(item.text); } catch (_) { return { text: item.text }; }
    }
  }
  return null;
}

const app = new App(
  { name: "nodetool-mcp-app", version: "1.0.0" },
  { capabilities: {} }
);

function bootstrap(appName) {
  app._name = appName;
  app.connect(new PostMessageTransport(window.parent, window.parent))
    .catch((err) => showError("Failed to connect to host: " + (err && err.message ? err.message : String(err))));
}
`;
