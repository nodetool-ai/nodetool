import { useMemo } from "react";
import { useNodes } from "../contexts/NodeContext";
import useMetadataStore from "../stores/MetadataStore";

interface CategoryCount {
  name: string;
  count: number;
  color: string;
}

interface WorkflowStats {
  totalNodes: number;
  totalEdges: number;
  categories: CategoryCount[];
  inputNodes: number;
  outputNodes: number;
  processingNodes: number;
  maxDepth: number;
  complexityScore: number;
  complexityLabel: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  input: "#4caf50",
  output: "#2196f3",
  image: "#e91e63",
  text: "#ff9800",
  audio: "#9c27b0",
  video: "#00bcd4",
  agents: "#ff5722",
  comfy: "#795548",
  ollama: "#607d8b",
  huggingface: "#ffc107",
  openai: "#3f51b5",
  anthropic: "#673ab7",
  default: "#9e9e9e"
};

function getCategoryColor(category: string): string {
  const lowerCategory = category.toLowerCase();
  for (const [key, color] of Object.entries(CATEGORY_COLORS)) {
    if (lowerCategory.includes(key)) {
      return color;
    }
  }
  return CATEGORY_COLORS.default;
}

function calculateMaxDepth(
  nodes: Array<{ id: string }>,
  edges: Array<{ source: string; target: string }>
): number {
  if (nodes.length === 0) {
    return 0;
  }

  const adjacencyList = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  nodes.forEach((node) => {
    adjacencyList.set(node.id, []);
    inDegree.set(node.id, 0);
  });

  edges.forEach((edge) => {
    if (adjacencyList.has(edge.source) && adjacencyList.has(edge.target)) {
      adjacencyList.get(edge.source)?.push(edge.target);
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    }
  });

  const depths = new Map<string, number>();
  const queue: string[] = [];

  nodes.forEach((node) => {
    if (inDegree.get(node.id) === 0) {
      queue.push(node.id);
      depths.set(node.id, 1);
    }
  });

  let maxDepth = 0;

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const currentDepth = depths.get(current) || 1;
    maxDepth = Math.max(maxDepth, currentDepth);

    const neighbors = adjacencyList.get(current) || [];
    for (const neighbor of neighbors) {
      const newDepth = currentDepth + 1;
      const existingDepth = depths.get(neighbor) || 0;
      if (newDepth > existingDepth) {
        depths.set(neighbor, newDepth);
      }
      const newInDegree = (inDegree.get(neighbor) || 1) - 1;
      inDegree.set(neighbor, newInDegree);
      if (newInDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  return maxDepth;
}

function calculateComplexity(
  totalNodes: number,
  totalEdges: number,
  maxDepth: number,
  categories: number
): { score: number; label: string } {
  const nodeWeight = totalNodes * 1;
  const edgeWeight = totalEdges * 0.5;
  const depthWeight = maxDepth * 2;
  const categoryWeight = categories * 1.5;

  const score = Math.round(nodeWeight + edgeWeight + depthWeight + categoryWeight);

  let label: string;
  if (score <= 10) {
    label = "Simple";
  } else if (score <= 30) {
    label = "Moderate";
  } else if (score <= 60) {
    label = "Complex";
  } else {
    label = "Advanced";
  }

  return { score, label };
}

export function useWorkflowStats(): WorkflowStats {
  const nodes = useNodes((state) => state.nodes);
  const edges = useNodes((state) => state.edges);
  const getMetadata = useMetadataStore((state) => state.getMetadata);

  return useMemo(() => {
    const categoryMap = new Map<string, number>();
    let inputNodes = 0;
    let outputNodes = 0;

    nodes.forEach((node) => {
      const nodeType = node.type || "";
      const metadata = getMetadata(nodeType);

      const namespace = metadata?.namespace || nodeType.split(".")[0] || "unknown";
      const category = namespace.split(".")[1] || namespace.split(".")[0] || "unknown";

      categoryMap.set(category, (categoryMap.get(category) || 0) + 1);

      if (nodeType.toLowerCase().includes("input")) {
        inputNodes++;
      }
      if (nodeType.toLowerCase().includes("output")) {
        outputNodes++;
      }
    });

    const categories: CategoryCount[] = Array.from(categoryMap.entries())
      .map(([name, count]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        count,
        color: getCategoryColor(name)
      }))
      .sort((a, b) => b.count - a.count);

    const maxDepth = calculateMaxDepth(nodes, edges);
    const processingNodes = nodes.length - inputNodes - outputNodes;
    const { score, label } = calculateComplexity(
      nodes.length,
      edges.length,
      maxDepth,
      categories.length
    );

    return {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      categories,
      inputNodes,
      outputNodes,
      processingNodes,
      maxDepth,
      complexityScore: score,
      complexityLabel: label
    };
  }, [nodes, edges, getMetadata]);
}
