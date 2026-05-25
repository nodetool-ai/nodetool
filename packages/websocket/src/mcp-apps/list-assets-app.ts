/**
 * Self-contained HTML for the `list_assets` MCP App view.
 *
 * Rendered inside the host's sandboxed iframe. Subscribes to the host's
 * tool-result notification, parses the JSON payload returned by the
 * `list_assets` tool, and renders a media gallery (images, video,
 * audio, PDFs, folders).
 *
 * The ext-apps client bundle is inlined at server startup so the page is
 * a single resource — no extra fetches, no CSP allowlist work.
 */

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let cachedHtml: string | null = null;

export async function getListAssetsAppHtml(): Promise<string> {
  if (cachedHtml) return cachedHtml;
  const bundlePath = require.resolve(
    "@modelcontextprotocol/ext-apps/app-with-deps"
  );
  const rawBundle = await readFile(bundlePath, "utf-8");
  cachedHtml = buildHtml(inlinableBundle(rawBundle));
  return cachedHtml;
}

/**
 * Convert the ext-apps ESM bundle into a script that publishes its named
 * exports on `globalThis.__mcpExtApps`.
 *
 * The bundle is a single concatenated module ending in a statement like
 * `export{eI as App,Mu as PostMessageTransport,...}` where the LHS names
 * are minified locals. Hosts' CSP typically disallows ESM `import` from
 * `data:` URLs, so we rewrite the trailing export list into a plain
 * `globalThis` assignment and inline the result as a non-module script.
 */
function inlinableBundle(bundle: string): string {
  const match = bundle.match(/export\s*\{([^}]+)\}\s*;?\s*$/);
  if (!match || match.index === undefined) {
    throw new Error(
      "ext-apps bundle: unable to locate trailing export statement"
    );
  }
  const body = match[1] ?? "";
  const entries = body
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
  // Guard against the bundle ever containing a literal `</script>` that
  // would terminate our host <script> block early.
  const safeBody = bundle
    .slice(0, match.index)
    .replace(/<\/script/gi, "<\\/script");
  return `${safeBody};globalThis.__mcpExtApps={${assignments}};`;
}

function buildHtml(extAppsBundle: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>NodeTool Assets</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: var(--mcp-color-background, #0b0b0d);
    --fg: var(--mcp-color-foreground, #f5f5f7);
    --muted: var(--mcp-color-muted, #888);
    --tile-bg: var(--mcp-color-surface, #1c1c1f);
    --border: var(--mcp-color-border, rgba(255,255,255,0.08));
    --accent: var(--mcp-color-accent, #7c5cff);
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--bg); color: var(--fg);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  body { padding: 16px; }
  header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
  header h1 { font-size: 14px; font-weight: 600; margin: 0; letter-spacing: 0.02em; }
  header .count { font-size: 12px; color: var(--muted); }
  .filters { display: flex; gap: 6px; flex-wrap: wrap; margin-left: auto; }
  .chip { font: inherit; font-size: 12px; padding: 4px 10px; border-radius: 999px;
    background: var(--tile-bg); color: var(--fg); border: 1px solid var(--border);
    cursor: pointer; transition: background 0.15s, border-color 0.15s; }
  .chip:hover { border-color: var(--accent); }
  .chip[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: white; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
  .tile { position: relative; background: var(--tile-bg); border: 1px solid var(--border);
    border-radius: 10px; overflow: hidden; cursor: pointer; transition: transform 0.1s, border-color 0.15s;
    display: flex; flex-direction: column; }
  .tile:hover { border-color: var(--accent); }
  .tile:active { transform: scale(0.985); }
  .thumb { aspect-ratio: 1 / 1; width: 100%; background: #000; display: flex;
    align-items: center; justify-content: center; color: var(--muted); font-size: 11px; position: relative; }
  .thumb img, .thumb video { width: 100%; height: 100%; object-fit: cover; display: block; }
  .play { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    color: white; font-size: 28px; text-shadow: 0 2px 8px rgba(0,0,0,0.6); pointer-events: none; }
  .meta { padding: 8px 10px; font-size: 12px; min-width: 0; }
  .meta .name { font-weight: 500; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .meta .sub { color: var(--muted); font-size: 11px; margin-top: 2px;
    overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .folder-icon, .file-icon { font-size: 42px; }
  .empty { padding: 48px 12px; text-align: center; color: var(--muted); font-size: 13px; }
  .error { padding: 12px; border-radius: 8px; background: rgba(255, 80, 80, 0.12);
    color: #ff8080; border: 1px solid rgba(255, 80, 80, 0.3); font-size: 12px; }
  .lightbox { position: fixed; inset: 0; background: rgba(0,0,0,0.92); display: none;
    align-items: center; justify-content: center; padding: 24px; z-index: 100; }
  .lightbox.open { display: flex; }
  .lightbox-content { max-width: 100%; max-height: 100%; display: flex;
    flex-direction: column; align-items: center; gap: 12px; }
  .lightbox img, .lightbox video, .lightbox audio { max-width: 90vw; max-height: 78vh;
    border-radius: 8px; background: #000; }
  .lightbox-close { position: absolute; top: 16px; right: 16px; background: transparent;
    border: none; color: white; font-size: 28px; cursor: pointer; line-height: 1; }
  .lightbox-caption { color: white; font-size: 13px; max-width: 90vw;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badge { position: absolute; bottom: 6px; right: 6px; padding: 2px 6px;
    background: rgba(0,0,0,0.7); color: white; border-radius: 4px; font-size: 10px;
    font-variant-numeric: tabular-nums; }
</style>
</head>
<body>
<header>
  <h1>Assets</h1>
  <span class="count" id="count"></span>
  <div class="filters" id="filters">
    <button type="button" class="chip" data-filter="all" aria-pressed="true">All</button>
    <button type="button" class="chip" data-filter="image">Images</button>
    <button type="button" class="chip" data-filter="video">Videos</button>
    <button type="button" class="chip" data-filter="audio">Audio</button>
    <button type="button" class="chip" data-filter="other">Other</button>
  </div>
</header>
<div id="root"><div class="empty">Waiting for assets…</div></div>
<div class="lightbox" id="lightbox">
  <button type="button" class="lightbox-close" id="lightbox-close" aria-label="Close">&times;</button>
  <div class="lightbox-content" id="lightbox-content"></div>
</div>

<script>
${extAppsBundle}
</script>
<script>
const { App, PostMessageTransport } = globalThis.__mcpExtApps;

const root = document.getElementById("root");
const countEl = document.getElementById("count");
const filtersEl = document.getElementById("filters");
const lightboxEl = document.getElementById("lightbox");
const lightboxContent = document.getElementById("lightbox-content");
document.getElementById("lightbox-close").addEventListener("click", closeLightbox);
lightboxEl.addEventListener("click", (e) => {
  if (e.target === lightboxEl) closeLightbox();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeLightbox();
});

let allAssets = [];
let currentFilter = "all";

filtersEl.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-filter]");
  if (!btn) return;
  currentFilter = btn.dataset.filter;
  filtersEl.querySelectorAll("button").forEach((b) =>
    b.setAttribute("aria-pressed", String(b === btn))
  );
  render();
});

function categoryOf(asset) {
  const ct = asset.content_type || "";
  if (ct === "folder") return "folder";
  if (ct.startsWith("image/")) return "image";
  if (ct.startsWith("video/")) return "video";
  if (ct.startsWith("audio/")) return "audio";
  return "other";
}

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes, i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return n.toFixed(n >= 10 || i === 0 ? 0 : 1) + " " + units[i];
}

function formatDuration(s) {
  if (!s) return "";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m + ":" + String(sec).padStart(2, "0");
}

function renderTile(asset) {
  const cat = categoryOf(asset);
  const tile = document.createElement("div");
  tile.className = "tile";
  tile.dataset.category = cat;

  const thumb = document.createElement("div");
  thumb.className = "thumb";

  if (cat === "folder") {
    thumb.innerHTML = '<span class="folder-icon">📁</span>';
  } else if (cat === "image" && (asset.thumb_url || asset.get_url)) {
    const img = document.createElement("img");
    img.loading = "lazy";
    img.src = asset.thumb_url || asset.get_url;
    img.alt = asset.name || "";
    thumb.appendChild(img);
  } else if (cat === "video") {
    if (asset.thumb_url) {
      const img = document.createElement("img");
      img.loading = "lazy";
      img.src = asset.thumb_url;
      img.alt = asset.name || "";
      thumb.appendChild(img);
    }
    const play = document.createElement("div");
    play.className = "play";
    play.textContent = "▶";
    thumb.appendChild(play);
    if (asset.duration) {
      const badge = document.createElement("div");
      badge.className = "badge";
      badge.textContent = formatDuration(asset.duration);
      thumb.appendChild(badge);
    }
  } else if (cat === "audio") {
    thumb.innerHTML = '<span class="file-icon">🎵</span>';
    if (asset.duration) {
      const badge = document.createElement("div");
      badge.className = "badge";
      badge.textContent = formatDuration(asset.duration);
      thumb.appendChild(badge);
    }
  } else {
    thumb.innerHTML = '<span class="file-icon">📄</span>';
  }

  const meta = document.createElement("div");
  meta.className = "meta";
  const name = document.createElement("div");
  name.className = "name";
  name.textContent = asset.name || asset.id;
  const sub = document.createElement("div");
  sub.className = "sub";
  const parts = [];
  if (asset.content_type && cat !== "folder") parts.push(asset.content_type);
  if (asset.size) parts.push(formatSize(asset.size));
  sub.textContent = parts.join(" · ");
  meta.appendChild(name);
  meta.appendChild(sub);

  tile.appendChild(thumb);
  tile.appendChild(meta);

  tile.addEventListener("click", () => openLightbox(asset));
  return tile;
}

function openLightbox(asset) {
  const cat = categoryOf(asset);
  lightboxContent.innerHTML = "";
  if (cat === "image" && asset.get_url) {
    const img = document.createElement("img");
    img.src = asset.get_url;
    img.alt = asset.name || "";
    lightboxContent.appendChild(img);
  } else if (cat === "video" && asset.get_url) {
    const video = document.createElement("video");
    video.src = asset.get_url;
    video.controls = true;
    video.autoplay = true;
    lightboxContent.appendChild(video);
  } else if (cat === "audio" && asset.get_url) {
    const audio = document.createElement("audio");
    audio.src = asset.get_url;
    audio.controls = true;
    audio.autoplay = true;
    lightboxContent.appendChild(audio);
  } else if (asset.get_url) {
    try {
      app.openLink({ url: asset.get_url });
    } catch (_) {
      window.open(asset.get_url, "_blank", "noopener");
    }
    return;
  } else {
    return;
  }
  const caption = document.createElement("div");
  caption.className = "lightbox-caption";
  caption.textContent = asset.name || asset.id;
  lightboxContent.appendChild(caption);
  lightboxEl.classList.add("open");
}

function closeLightbox() {
  lightboxEl.classList.remove("open");
  lightboxContent.innerHTML = "";
}

function render() {
  const filtered = currentFilter === "all"
    ? allAssets
    : allAssets.filter((a) => categoryOf(a) === currentFilter
        || (currentFilter === "other" && !["image", "video", "audio", "folder"].includes(categoryOf(a))));

  countEl.textContent = filtered.length + (filtered.length === 1 ? " item" : " items");

  if (!filtered.length) {
    root.innerHTML = '<div class="empty">No assets to display.</div>';
    return;
  }
  const grid = document.createElement("div");
  grid.className = "grid";
  for (const asset of filtered) grid.appendChild(renderTile(asset));
  root.innerHTML = "";
  root.appendChild(grid);
}

function renderError(message) {
  root.innerHTML = "";
  const err = document.createElement("div");
  err.className = "error";
  err.textContent = message;
  root.appendChild(err);
}

function ingest(payload) {
  if (!payload) return;
  if (payload.error) { renderError(String(payload.error)); return; }
  allAssets = Array.isArray(payload.assets) ? payload.assets : [];
  render();
}

function parseToolResult(params) {
  if (!params) return;
  if (params.structuredContent && typeof params.structuredContent === "object") {
    ingest(params.structuredContent);
    return;
  }
  const content = params.content || [];
  for (const item of content) {
    if (item && item.type === "text" && typeof item.text === "string") {
      try { ingest(JSON.parse(item.text)); return; } catch (_) { /* fall through */ }
    }
  }
}

const app = new App(
  { name: "nodetool-list-assets", version: "1.0.0" },
  { capabilities: {} }
);
app.ontoolresult = parseToolResult;
app.connect(new PostMessageTransport(window.parent, window.parent)).catch((err) => {
  renderError("Failed to connect to host: " + (err && err.message ? err.message : String(err)));
});
</script>
</body>
</html>`;
}
