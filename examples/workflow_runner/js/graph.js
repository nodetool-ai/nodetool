/**
 * Workflow Graph Visualization
 * Displays nodes using their defined positions (no layout computation)
 */

function createWorkflowGraph() {
  const container = document.createElement("div");
  container.className = "workflow-graph-container";
  container.id = "workflowGraphInner";
  
  container.innerHTML = `
    <div class="empty-state" id="graphEmptyState">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="7" height="7"></rect>
        <rect x="14" y="3" width="7" height="7"></rect>
        <rect x="14" y="14" width="7" height="7"></rect>
        <path d="M10 14 L3 14"></path>
        <path d="M3 17 L17 17"></path>
        <path d="M17 17 L17 10"></path>
        <path d="M17 10 L10 10"></path>
      </svg>
      <p>Select a workflow to view its structure</p>
    </div>
  `;
  
  return container;
}

function updateWorkflowGraph(workflow, container) {
  if (!workflow?.graph?.nodes || workflow.graph.nodes.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="7" height="7"></rect>
          <rect x="14" y="3" width="7" height="7"></rect>
          <rect x="14" y="14" width="7" height="7"></rect>
          <path d="M10 14 L3 14"></path>
          <path d="M3 17 L17 17"></path>
          <path d="M17 17 L17 10"></path>
          <path d="M17 10 L10 10"></path>
        </svg>
        <p>This workflow has no nodes</p>
      </div>
    `;
    return;
  }

  const graphNodes = workflow.graph.nodes;
  const graphEdges = workflow.graph.edges || [];

  // Filter out comment, group, and preview nodes
  const filteredNodes = graphNodes.filter(
    (n) =>
      !n.type?.includes("Comment") &&
      !n.type?.includes("Group") &&
      !n.type?.includes("Preview")
  );

  // Extract nodes with their positions
  const positionedNodes = filteredNodes.map((node) => ({
    id: node.id,
    type: node.type,
    title: getNodeTitle(node),
    x: node.ui_properties?.position?.x ?? node.ui_properties?.position?.y ?? 0,
    y: node.ui_properties?.position?.y ?? 0,
    width: node.ui_properties?.width,
    height: node.ui_properties?.height
  }));

  // Calculate container dimensions based on node positions
  const padding = 20;
  const defaultNodeWidth = 70;
  const defaultNodeHeight = 24;
  
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  
  positionedNodes.forEach((node) => {
    const nodeW = node.width || defaultNodeWidth;
    const nodeH = node.height || defaultNodeHeight;
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + nodeW);
    maxY = Math.max(maxY, node.y + nodeH);
  });

  // Add padding
  const containerWidth = Math.max(280, maxX - minX + padding * 2);
  const containerHeight = Math.max(180, maxY - minY + padding * 2);

  // Normalize positions to fit in container
  const normalizedNodes = positionedNodes.map((node) => ({
    ...node,
    x: node.x - minX + padding,
    y: node.y - minY + padding,
    width: node.width || defaultNodeWidth,
    height: node.height || defaultNodeHeight
  }));

  const simpleEdges = graphEdges.map((edge) => ({
    source: edge.source,
    target: edge.target
  }));

  // Render the graph with native positions
  renderGraph(container, normalizedNodes, simpleEdges, containerWidth, containerHeight);
}

function getNodeTitle(node) {
  if (node.ui_properties?.title) {
    return node.ui_properties.title;
  }
  if (node.metadata?.title) {
    return node.metadata.title;
  }
  const typeParts = node.type?.split(".") || [];
  return typeParts[typeParts.length - 1] || node.type || "Node";
}

function renderGraph(container, nodes, edges, containerWidth, containerHeight) {
  const nodeWidth = 70;
  const nodeHeight = 24;

  container.innerHTML = `
    <div class="graph-header">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="7" height="7"></rect>
        <rect x="14" y="3" width="7" height="7"></rect>
        <rect x="14" y="14" width="7" height="7"></rect>
        <path d="M10 14 L3 14"></path>
        <path d="M3 17 L17 17"></path>
        <path d="M17 17 L17 10"></path>
        <path d="M17 10 L10 10"></path>
      </svg>
      <span>${nodes.length} node${nodes.length !== 1 ? "s" : ""}</span>
    </div>
    <svg class="graph-svg" width="${containerWidth}" height="${containerHeight}" viewBox="0 0 ${containerWidth} ${containerHeight}">
      ${renderEdges(edges, nodes)}
      ${renderNodes(nodes, nodeWidth, nodeHeight)}
    </svg>
    <div class="graph-legend">
      <span class="legend-item"><span class="legend-dot input"></span>Input</span>
      <span class="legend-item"><span class="legend-dot process"></span>Process</span>
      <span class="legend-item"><span class="legend-dot output"></span>Output</span>
    </div>
  `;
}

function renderEdges(edges, nodes) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const nodeWidth = 70;
  const nodeHeight = 24;

  return edges.map((edge) => {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);

    if (!sourceNode || !targetNode) return "";

    const x1 = sourceNode.x + (sourceNode.width || nodeWidth);
    const y1 = sourceNode.y + (sourceNode.height || nodeHeight) / 2;
    const x2 = targetNode.x;
    const y2 = targetNode.y + (targetNode.height || nodeHeight) / 2;
    
    // Calculate curve control points
    const dx = Math.abs(x2 - x1);
    const midX = (x1 + x2) / 2;

    return `
      <path
        class="graph-edge"
        d="M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}"
        fill="none"
        stroke="var(--border-color)"
        stroke-width="1.5"
      />
    `;
  }).join("");
}

function renderNodes(nodes, defaultWidth, defaultHeight) {
  return nodes.map((node) => {
    const nodeType = getNodeCategory(node.type);
    const width = node.width || defaultWidth;
    const height = node.height || defaultHeight;
    
    return `
      <g class="graph-node ${nodeType}" data-node-id="${node.id}" transform="translate(${node.x}, ${node.y})">
        <rect
          width="${width}"
          height="${height}"
          rx="4"
          fill="var(--bg-glass)"
          stroke="var(--border-color)"
          stroke-width="1"
        />
        <text
          x="${width / 2}"
          y="${height / 2}"
          dy="0.35em"
          text-anchor="middle"
          fill="var(--text-secondary)"
          font-size="9"
          font-weight="500"
        >${truncateText(node.title, Math.floor(width / 7))}</text>
      </g>
    `;
  }).join("");
}

function getNodeCategory(type) {
  if (!type) return "process";
  const lower = type.toLowerCase();
  if (lower.includes("input") || lower.includes("text") || lower.includes("image") || lower.includes("audio") || lower.includes("file")) {
    return "input";
  }
  if (lower.includes("output") || lower.includes("preview") || lower.includes("result")) {
    return "output";
  }
  return "process";
}

function truncateText(text, maxLength) {
  if (!text) return "";
  return text.length > maxLength ? text.slice(0, maxLength - 1) + "…" : text;
}

// Expose functions globally
window.createWorkflowGraph = createWorkflowGraph;
window.updateWorkflowGraph = updateWorkflowGraph;
