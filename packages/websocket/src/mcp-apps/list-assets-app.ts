import { renderMcpAppHtml } from "./shell.js";

let cached: string | null = null;

export async function getListAssetsAppHtml(): Promise<string> {
  if (cached) return cached;
  cached = await renderMcpAppHtml({
    title: "NodeTool Assets",
    appName: "nodetool-list-assets",
    css: APP_CSS,
    body: APP_BODY
  });
  return cached;
}

const APP_CSS = `
.tile { position: relative; background: var(--tile-bg); border: 1px solid var(--border);
  border-radius: 10px; overflow: hidden; cursor: pointer; transition: transform 0.1s, border-color 0.15s;
  display: flex; flex-direction: column; }
.tile:hover { border-color: var(--accent); }
.tile:active { transform: scale(0.985); }
.thumb { aspect-ratio: 1 / 1; width: 100%; background: #000; display: flex;
  align-items: center; justify-content: center; color: var(--muted); font-size: 11px; position: relative; }
.thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.play { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  color: white; font-size: 28px; text-shadow: 0 2px 8px rgba(0,0,0,0.6); pointer-events: none; }
.meta { padding: 8px 10px; font-size: 12px; min-width: 0; }
.meta .name { font-weight: 500; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.meta .sub { color: var(--muted); font-size: 11px; margin-top: 2px;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.folder-icon, .file-icon { font-size: 42px; }
.badge { position: absolute; bottom: 6px; right: 6px; padding: 2px 6px;
  background: rgba(0,0,0,0.7); color: white; border-radius: 4px; font-size: 10px;
  font-variant-numeric: tabular-nums; }
.crumbs { display: flex; gap: 4px; font-size: 12px; color: var(--muted); flex-wrap: wrap; }
.crumbs button { background: none; border: none; color: var(--accent); cursor: pointer; padding: 0; font: inherit; }
.crumbs span.sep { color: var(--muted); }
`;

const APP_BODY = `
let allAssets = [];
let currentFilter = "all";
let crumbs = [{ id: null, name: "All assets" }];

function categoryOf(asset) {
  const ct = asset.content_type || "";
  if (ct === "folder") return "folder";
  if (ct.startsWith("image/")) return "image";
  if (ct.startsWith("video/")) return "video";
  if (ct.startsWith("audio/")) return "audio";
  return "other";
}

function renderTile(asset) {
  const cat = categoryOf(asset);
  const thumb = el("div", { class: "thumb" });

  if (cat === "folder") {
    thumb.appendChild(el("span", { class: "folder-icon" }, "📁"));
  } else if (cat === "image" && (asset.thumb_url || asset.get_url)) {
    thumb.appendChild(el("img", { loading: "lazy", src: asset.thumb_url || asset.get_url, alt: asset.name || "" }));
  } else if (cat === "video") {
    if (asset.thumb_url) thumb.appendChild(el("img", { loading: "lazy", src: asset.thumb_url, alt: asset.name || "" }));
    thumb.appendChild(el("div", { class: "play" }, "▶"));
    if (asset.duration) thumb.appendChild(el("div", { class: "badge" }, formatDuration(asset.duration)));
  } else if (cat === "audio") {
    thumb.appendChild(el("span", { class: "file-icon" }, "🎵"));
    if (asset.duration) thumb.appendChild(el("div", { class: "badge" }, formatDuration(asset.duration)));
  } else {
    thumb.appendChild(el("span", { class: "file-icon" }, "📄"));
  }

  const parts = [];
  if (asset.content_type && cat !== "folder") parts.push(asset.content_type);
  if (asset.size) parts.push(formatSize(asset.size));

  const tile = el("div", { class: "tile", "data-category": cat },
    [
      thumb,
      el("div", { class: "meta" }, [
        el("div", { class: "name" }, asset.name || asset.id),
        el("div", { class: "sub" }, parts.join(" · "))
      ])
    ]
  );

  tile.addEventListener("click", () => {
    if (cat === "folder") drillInto(asset);
    else openAsset(asset, cat);
  });
  return tile;
}

function openAsset(asset, cat) {
  if (cat === "image" && asset.get_url) {
    openLightbox(el("img", { src: asset.get_url, alt: asset.name || "" }), asset.name);
  } else if (cat === "video" && asset.get_url) {
    openLightbox(el("video", { src: asset.get_url, controls: "true", autoplay: "true" }), asset.name);
  } else if (cat === "audio" && asset.get_url) {
    openLightbox(el("audio", { src: asset.get_url, controls: "true", autoplay: "true" }), asset.name);
  } else if (asset.get_url) {
    app.openLink({ url: asset.get_url }).catch(() => window.open(asset.get_url, "_blank", "noopener"));
  }
}

async function drillInto(folder) {
  crumbs.push({ id: folder.id, name: folder.name || folder.id });
  showEmpty("Loading…");
  try {
    const result = await app.callServerTool({
      name: "list_assets",
      arguments: { parent_id: folder.id }
    });
    const data = parseToolResult(result);
    ingest(data);
  } catch (err) {
    showError("Drill-down failed: " + (err && err.message ? err.message : String(err)));
  }
}

async function navigateTo(index) {
  crumbs = crumbs.slice(0, index + 1);
  const target = crumbs[crumbs.length - 1];
  showEmpty("Loading…");
  try {
    const args = target.id ? { parent_id: target.id } : {};
    const result = await app.callServerTool({ name: "list_assets", arguments: args });
    ingest(parseToolResult(result));
  } catch (err) {
    showError("Navigation failed: " + (err && err.message ? err.message : String(err)));
  }
}

function render() {
  root.innerHTML = "";

  const header = el("div", { class: "mcp-header" }, [
    el("h1", null, "Assets"),
    el("span", { class: "mcp-count" }, ""),
    el("div", { class: "mcp-actions" }, [
      makeFilter("all", "All"),
      makeFilter("image", "Images"),
      makeFilter("video", "Videos"),
      makeFilter("audio", "Audio"),
      makeFilter("folder", "Folders"),
      makeFilter("other", "Other")
    ])
  ]);
  root.appendChild(header);

  const crumbsEl = el("div", { class: "crumbs" });
  crumbs.forEach((c, i) => {
    if (i > 0) crumbsEl.appendChild(el("span", { class: "sep" }, "/"));
    if (i === crumbs.length - 1) {
      crumbsEl.appendChild(el("span", null, c.name));
    } else {
      const btn = el("button", { type: "button" }, c.name);
      btn.addEventListener("click", () => navigateTo(i));
      crumbsEl.appendChild(btn);
    }
  });
  if (crumbs.length > 1) {
    root.appendChild(crumbsEl);
    root.appendChild(el("div", { style: { height: "8px" } }));
  }

  const filtered = currentFilter === "all" ? allAssets : allAssets.filter((a) => categoryOf(a) === currentFilter);
  header.querySelector(".mcp-count").textContent = filtered.length + (filtered.length === 1 ? " item" : " items");

  if (!filtered.length) {
    root.appendChild(el("div", { class: "mcp-empty" }, "No assets to display."));
    return;
  }
  const grid = el("div", { class: "mcp-grid" });
  for (const asset of filtered) grid.appendChild(renderTile(asset));
  root.appendChild(grid);
}

function makeFilter(key, label) {
  const btn = el("button", { type: "button", class: "mcp-chip" }, label);
  btn.setAttribute("aria-pressed", String(key === currentFilter));
  btn.addEventListener("click", () => { currentFilter = key; render(); });
  return btn;
}

function ingest(data) {
  if (!data) { showEmpty("No data returned."); return; }
  if (data.error) { showError(data.error); return; }
  allAssets = Array.isArray(data.assets) ? data.assets : [];
  render();
}

app.ontoolresult = (params) => ingest(parseToolResult(params));
`;
