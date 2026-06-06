import { renderMcpAppHtml } from "./shell.js";

let cached: string | null = null;

export async function getGetWorkflowAppHtml(): Promise<string> {
  if (cached) return cached;
  cached = await renderMcpAppHtml({
    title: "NodeTool Workflow Graph",
    appName: "nodetool-get-workflow",
    css: APP_CSS,
    body: APP_BODY
  });
  return cached;
}

const APP_CSS = `
.gw-shell { display: flex; flex-direction: column; height: calc(100vh - 32px); min-height: 480px; }
.gw-canvas { flex: 1; min-height: 0; background: var(--tile-bg); border: 1px solid var(--border);
  border-radius: 10px; overflow: hidden; position: relative; cursor: grab; user-select: none; }
.gw-canvas.dragging { cursor: grabbing; }
.gw-svg { width: 100%; height: 100%; display: block; }
.gw-node { fill: rgba(28,28,31,0.95); stroke: rgba(255,255,255,0.18); stroke-width: 1; rx: 8; ry: 8; }
.gw-node-selected { stroke: var(--accent); stroke-width: 2; }
.gw-node-label { fill: var(--fg); font-size: 11px; font-family: -apple-system, sans-serif; pointer-events: none; }
.gw-node-type { fill: var(--muted); font-size: 9px; font-family: ui-monospace, monospace; pointer-events: none; }
.gw-edge { fill: none; stroke: rgba(124,92,255,0.55); stroke-width: 1.6; }
.gw-edge-arrow { fill: rgba(124,92,255,0.55); }
.gw-port { fill: var(--accent); }
.gw-info { padding: 12px; background: var(--tile-bg); border: 1px solid var(--border);
  border-radius: 10px; margin-bottom: 12px; }
.gw-info h2 { margin: 0 0 4px; font-size: 16px; }
.gw-info .meta { color: var(--muted); font-size: 12px; }
.gw-zoom { position: absolute; bottom: 12px; right: 12px; display: flex; gap: 4px; flex-direction: column; }
.gw-zoom button { width: 28px; height: 28px; border-radius: 6px; border: 1px solid var(--border);
  background: rgba(0,0,0,0.5); color: var(--fg); cursor: pointer; font-size: 14px; }
.gw-zoom button:hover { border-color: var(--accent); }
.gw-tooltip { position: absolute; pointer-events: none; background: rgba(0,0,0,0.92);
  color: white; padding: 8px 10px; border-radius: 6px; font-size: 11px; max-width: 280px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.5); z-index: 10; line-height: 1.4; }
.gw-tooltip .ttype { color: var(--accent); font-family: ui-monospace, monospace; font-size: 10px; display: block; margin-bottom: 4px; }
`;

const APP_BODY = `
let workflow = null;
let layout = null;
let viewport = { x: 0, y: 0, scale: 1 };
let dragState = null;
let tooltip = null;

const NODE_W = 160;
const NODE_H = 56;
const COL_W = 220;
const ROW_H = 80;

function computeLayout(graph) {
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const byId = new Map(nodes.map(n => [n.id, n]));
  // Topological sort with depth assignment.
  const incoming = new Map(nodes.map(n => [n.id, []]));
  const outgoing = new Map(nodes.map(n => [n.id, []]));
  for (const e of edges) {
    const src = e.source ?? e.source_id ?? e.from;
    const dst = e.target ?? e.target_id ?? e.to;
    if (incoming.has(dst)) incoming.get(dst).push(src);
    if (outgoing.has(src)) outgoing.get(src).push(dst);
  }
  const depth = new Map();
  function depthOf(id, seen) {
    if (depth.has(id)) return depth.get(id);
    if (seen.has(id)) return 0;
    seen.add(id);
    const ins = incoming.get(id) || [];
    let d = 0;
    for (const p of ins) if (byId.has(p)) d = Math.max(d, depthOf(p, seen) + 1);
    depth.set(id, d);
    return d;
  }
  for (const n of nodes) depthOf(n.id, new Set());

  const cols = new Map();
  for (const [id, d] of depth) {
    if (!cols.has(d)) cols.set(d, []);
    cols.get(d).push(id);
  }
  const positions = new Map();
  let maxX = 0, maxY = 0;
  for (const [d, ids] of [...cols.entries()].sort((a, b) => a[0] - b[0])) {
    ids.forEach((id, i) => {
      const node = byId.get(id);
      // Respect server-provided position when present.
      let x, y;
      if (node && node.position && typeof node.position.x === "number") {
        x = node.position.x;
        y = node.position.y;
      } else if (node && node.ui_properties && typeof node.ui_properties.position?.x === "number") {
        x = node.ui_properties.position.x;
        y = node.ui_properties.position.y;
      } else {
        x = d * COL_W;
        y = i * ROW_H;
      }
      positions.set(id, { x, y });
      maxX = Math.max(maxX, x + NODE_W);
      maxY = Math.max(maxY, y + NODE_H);
    });
  }
  return { nodes, edges, positions, bounds: { w: maxX, h: maxY } };
}

function buildSvg() {
  if (!layout) return null;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("gw-svg");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  defs.innerHTML = '<marker id="gw-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" class="gw-edge-arrow" /></marker>';
  svg.appendChild(defs);
  const root = document.createElementNS("http://www.w3.org/2000/svg", "g");
  svg.appendChild(root);
  root.setAttribute("transform", \`translate(\${viewport.x},\${viewport.y}) scale(\${viewport.scale})\`);

  // Edges
  for (const e of layout.edges) {
    const src = e.source ?? e.source_id ?? e.from;
    const dst = e.target ?? e.target_id ?? e.to;
    const a = layout.positions.get(src);
    const b = layout.positions.get(dst);
    if (!a || !b) continue;
    const x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2;
    const x2 = b.x, y2 = b.y + NODE_H / 2;
    const dx = Math.max(40, (x2 - x1) * 0.5);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", \`M \${x1} \${y1} C \${x1 + dx} \${y1}, \${x2 - dx} \${y2}, \${x2} \${y2}\`);
    path.setAttribute("class", "gw-edge");
    path.setAttribute("marker-end", "url(#gw-arrow)");
    root.appendChild(path);
  }

  // Nodes
  for (const n of layout.nodes) {
    const p = layout.positions.get(n.id);
    if (!p) continue;
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("transform", \`translate(\${p.x},\${p.y})\`);

    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("width", String(NODE_W));
    rect.setAttribute("height", String(NODE_H));
    rect.setAttribute("class", "gw-node");
    g.appendChild(rect);

    const title = document.createElementNS("http://www.w3.org/2000/svg", "text");
    title.setAttribute("x", "10");
    title.setAttribute("y", "20");
    title.setAttribute("class", "gw-node-label");
    title.textContent = truncate(n.title || nameFromType(n.type) || n.id, 22);
    g.appendChild(title);

    const type = document.createElementNS("http://www.w3.org/2000/svg", "text");
    type.setAttribute("x", "10");
    type.setAttribute("y", "38");
    type.setAttribute("class", "gw-node-type");
    type.textContent = truncate(n.type || "", 28);
    g.appendChild(type);

    const inPort = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    inPort.setAttribute("cx", "0"); inPort.setAttribute("cy", String(NODE_H / 2)); inPort.setAttribute("r", "3");
    inPort.setAttribute("class", "gw-port"); g.appendChild(inPort);

    const outPort = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    outPort.setAttribute("cx", String(NODE_W)); outPort.setAttribute("cy", String(NODE_H / 2)); outPort.setAttribute("r", "3");
    outPort.setAttribute("class", "gw-port"); g.appendChild(outPort);

    g.addEventListener("mouseenter", (e) => showTooltip(n, e));
    g.addEventListener("mouseleave", hideTooltip);
    root.appendChild(g);
  }
  return svg;
}

function nameFromType(type) {
  if (!type) return "";
  const parts = type.split(".");
  return parts[parts.length - 1] || type;
}
function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }

function showTooltip(node, evt) {
  hideTooltip();
  const canvas = root.querySelector(".gw-canvas");
  if (!canvas) return;
  const t = el("div", { class: "gw-tooltip" });
  t.appendChild(el("span", { class: "ttype" }, node.type || ""));
  if (node.title) t.appendChild(el("div", null, node.title));
  if (node.description) t.appendChild(el("div", { style: { color: "#bbb", marginTop: "4px" } }, node.description));
  canvas.appendChild(t);
  const rect = canvas.getBoundingClientRect();
  t.style.left = (evt.clientX - rect.left + 12) + "px";
  t.style.top = (evt.clientY - rect.top + 12) + "px";
  tooltip = t;
}
function hideTooltip() { if (tooltip) { tooltip.remove(); tooltip = null; } }

function render() {
  root.innerHTML = "";
  if (!workflow) { showEmpty("No workflow loaded."); return; }
  if (!layout) layout = computeLayout(workflow.graph || {});

  const shell = el("div", { class: "gw-shell" });
  const info = el("div", { class: "gw-info" }, [
    el("h2", null, workflow.name || workflow.id),
    el("div", { class: "meta" }, [
      el("span", null, (layout.nodes.length || 0) + " nodes · " + (layout.edges.length || 0) + " edges"),
      workflow.description ? el("span", null, " · " + workflow.description) : null
    ].filter(Boolean))
  ]);
  shell.appendChild(info);

  const canvas = el("div", { class: "gw-canvas" });
  const svg = buildSvg();
  if (svg) canvas.appendChild(svg);

  const zoom = el("div", { class: "gw-zoom" }, [
    btn("+", () => zoomBy(1.25)),
    btn("−", () => zoomBy(0.8)),
    btn("⌂", () => fitToView())
  ]);
  canvas.appendChild(zoom);

  let mode = null;
  canvas.addEventListener("mousedown", (e) => {
    if (e.target.closest(".gw-zoom")) return;
    mode = "pan";
    dragState = { x: e.clientX, y: e.clientY, vx: viewport.x, vy: viewport.y };
    canvas.classList.add("dragging");
  });
  window.addEventListener("mousemove", (e) => {
    if (mode === "pan" && dragState) {
      viewport.x = dragState.vx + (e.clientX - dragState.x);
      viewport.y = dragState.vy + (e.clientY - dragState.y);
      updateTransform(canvas);
    }
  });
  window.addEventListener("mouseup", () => { mode = null; dragState = null; canvas.classList.remove("dragging"); });
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    const oldScale = viewport.scale;
    viewport.scale = Math.max(0.1, Math.min(3, viewport.scale * factor));
    viewport.x = cx - (cx - viewport.x) * (viewport.scale / oldScale);
    viewport.y = cy - (cy - viewport.y) * (viewport.scale / oldScale);
    updateTransform(canvas);
  }, { passive: false });

  shell.appendChild(canvas);
  root.appendChild(shell);
  fitToView();
}

function btn(label, onClick) {
  const b = el("button", { type: "button" }, label);
  b.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
  return b;
}

function zoomBy(factor) {
  const canvas = root.querySelector(".gw-canvas");
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const cx = rect.width / 2, cy = rect.height / 2;
  const old = viewport.scale;
  viewport.scale = Math.max(0.1, Math.min(3, viewport.scale * factor));
  viewport.x = cx - (cx - viewport.x) * (viewport.scale / old);
  viewport.y = cy - (cy - viewport.y) * (viewport.scale / old);
  updateTransform(canvas);
}

function fitToView() {
  if (!layout) return;
  const canvas = root.querySelector(".gw-canvas");
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  if (!layout.bounds.w || !layout.bounds.h) return;
  const scale = Math.min((rect.width - 40) / layout.bounds.w, (rect.height - 40) / layout.bounds.h, 1.2);
  viewport.scale = Math.max(0.1, scale);
  viewport.x = (rect.width - layout.bounds.w * viewport.scale) / 2;
  viewport.y = (rect.height - layout.bounds.h * viewport.scale) / 2;
  updateTransform(canvas);
}

function updateTransform(canvas) {
  const g = canvas.querySelector("g");
  if (g) g.setAttribute("transform", \`translate(\${viewport.x},\${viewport.y}) scale(\${viewport.scale})\`);
}

function ingest(data) {
  if (!data) { showEmpty("No workflow data."); return; }
  if (data.error) { showError(data.error); return; }
  workflow = data;
  layout = null;
  viewport = { x: 0, y: 0, scale: 1 };
  render();
}

app.ontoolresult = (params) => ingest(parseToolResult(params));
window.addEventListener("resize", () => fitToView());
`;
