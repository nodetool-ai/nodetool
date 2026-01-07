import { FrontendToolRegistry } from "../frontendTools";
import { optionalWorkflowIdSchema, resolveWorkflowId } from "./workflow";

interface WorkflowExplanationStep {
  order: number;
  nodeId: string;
  nodeType: string;
  description: string;
  inputs: string[];
  outputs: string[];
}

interface WorkflowExplanation {
  summary: string;
  steps: WorkflowExplanationStep[];
  dataFlow: string[];
  potentialIssues: string[];
}

FrontendToolRegistry.register({
  name: "ui_explain_workflow",
  description:
    "Get a detailed explanation of what the current workflow does, step by step.",
  parameters: {
    type: "object",
    properties: {
      workflow_id: optionalWorkflowIdSchema
    },
    required: []
  },
  async execute({ workflow_id }, ctx) {
    const state = ctx.getState();
    const workflowId = resolveWorkflowId(state, workflow_id);
    const nodeStore = state.getNodeStore(workflowId)?.getState();
    if (!nodeStore) {
      throw new Error(`No node store for workflow ${workflowId}`);
    }

    const nodes = nodeStore.nodes;
    const edges = nodeStore.edges;

    if (nodes.length === 0) {
      return {
        ok: true,
        explanation: {
          summary: "This workflow is empty. Add some nodes to get started!",
          steps: [],
          dataFlow: [],
          potentialIssues: ["No nodes found in the workflow"]
        } as WorkflowExplanation
      };
    }

    const nodeMetadata = state.nodeMetadata;
    const explanation: WorkflowExplanation = {
      summary: "",
      steps: [],
      dataFlow: [],
      potentialIssues: []
    };

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const incomingEdges = new Map<string, typeof edges>();
    const outgoingEdges = new Map<string, typeof edges>();

    for (const node of nodes) {
      incomingEdges.set(node.id, []);
      outgoingEdges.set(node.id, []);
    }

    for (const edge of edges) {
      const srcEdges = outgoingEdges.get(edge.source) || [];
      srcEdges.push(edge);
      outgoingEdges.set(edge.source, srcEdges);

      const tgtEdges = incomingEdges.get(edge.target) || [];
      tgtEdges.push(edge);
      incomingEdges.set(edge.target, tgtEdges);
    }

    const sortedNodes = topologicalSort(nodes, edges);

    const nodeDescriptions: string[] = [];
    let stepOrder = 1;

    for (const node of sortedNodes) {
      const nodeType = node.type ?? "unknown";
      const metadata = nodeMetadata[nodeType];
      const nodeEdges = incomingEdges.get(node.id) || [];
      const outEdges = outgoingEdges.get(node.id) || [];

      const inputs = nodeEdges.map((e) => {
        const sourceNode = nodeMap.get(e.source);
        const sourceHandle = e.sourceHandle || "output";
        const sourceType = sourceNode?.type ?? e.source;
        return `${sourceType}${sourceHandle ? ` (${sourceHandle})` : ""}`;
      });

      const outputs = outEdges.map((e) => {
        const targetNode = nodeMap.get(e.target);
        const targetHandle = e.targetHandle || "input";
        const targetType = targetNode?.type ?? e.target;
        return `${targetType}${targetHandle ? ` (${targetHandle})` : ""}`;
      });

      let description = `Node: ${nodeType}`;
      if (metadata?.description) {
        description += ` - ${metadata.description}`;
      }

      const data = node.data as Record<string, any>;
      if (data?.properties) {
        const keyProps = Object.entries(data.properties)
          .filter(([_, v]) => v !== null && v !== undefined && v !== "")
          .slice(0, 3);
        if (keyProps.length > 0) {
          description += `. Key settings: ${keyProps.map(([k, v]) => `${k}=${String(v).slice(0, 30)}`).join(", ")}`;
        }
      }

      explanation.steps.push({
        order: stepOrder++,
        nodeId: node.id,
        nodeType,
        description,
        inputs,
        outputs
      });

      nodeDescriptions.push(`${nodeType} node`);
    }

    if (sortedNodes.length > 0) {
      const firstNode = sortedNodes[0];
      const lastNode = sortedNodes[sortedNodes.length - 1];
      const firstType = firstNode.type ?? "unknown";
      const lastType = lastNode.type ?? "unknown";
      const firstMetadata = nodeMetadata[firstType];
      const lastMetadata = nodeMetadata[lastType];

      explanation.summary = `This workflow processes data through ${sortedNodes.length} node(s): ${nodeDescriptions.join(" → ")}. `;
      explanation.summary += `It starts with ${firstMetadata?.description || firstType} and ends with ${lastMetadata?.description || lastType}.`;

      let currentNode = sortedNodes[0];
      const flow: string[] = [];
      const visited = new Set<string>();

      while (currentNode && !visited.has(currentNode.id)) {
        visited.add(currentNode.id);
        const outEdges = outgoingEdges.get(currentNode.id) || [];

        if (outEdges.length === 0) {
          break;
        }

        const nextEdge = outEdges[0];
        const nextNode = nodeMap.get(nextEdge.target);

        if (nextNode) {
          const currentType = currentNode.type ?? "unknown";
          const nextType = nextNode.type ?? "unknown";
          flow.push(`${currentType} → ${nextEdge.targetHandle || "input"} → ${nextType}`);
          currentNode = nextNode;
        } else {
          break;
        }
      }

      explanation.dataFlow = flow.length > 0 ? flow : ["Single node workflow - no data flow connections"];
    } else {
      explanation.summary = "Empty workflow";
      explanation.dataFlow = [];
    }

    const parallelGroups = identifyParallelExecution(nodes, edges);
    if (parallelGroups.length > 1) {
      explanation.potentialIssues.push(
        `Multiple parallel execution paths detected (${parallelGroups.length} groups). Ensure all paths converge before final output.`
      );
    }

    for (const node of nodes) {
      const nodeType = node.type ?? "unknown";
      const metadata = nodeMetadata[nodeType];
      if (!metadata) {
        explanation.potentialIssues.push(`Unknown node type: ${nodeType}`);
      }
    }

    const sortedNodeIds = new Set(sortedNodes.map((n) => n.id));
    const nodesWithNoInputs = nodes.filter((n) => {
      const edgesToNode = incomingEdges.get(n.id) || [];
      return edgesToNode.length === 0 && sortedNodeIds.has(n.id) && sortedNodes.indexOf(n) > 0;
    });

    if (nodesWithNoInputs.length > 0) {
      explanation.potentialIssues.push(
        `${nodesWithNoInputs.length} node(s) have no inputs: ${nodesWithNoInputs.map((n) => n.type ?? "unknown").join(", ")}. These may produce unexpected results.`
      );
    }

    const nodesWithNoOutputs = nodes.filter((n) => {
      const edgesFromNode = outgoingEdges.get(n.id) || [];
      return edgesFromNode.length === 0 && sortedNodeIds.has(n.id) && sortedNodes.indexOf(n) < sortedNodes.length - 1;
    });

    if (nodesWithNoOutputs.length > 0) {
      explanation.potentialIssues.push(
        `${nodesWithNoOutputs.length} node(s) have no outputs: ${nodesWithNoOutputs.map((n) => n.type ?? "unknown").join(", ")}. These may be disconnected from the main workflow.`
      );
    }

    return {
      ok: true,
      explanation
    };
  }
});

interface NodeInput {
  id: string;
  type?: string;
  data?: Record<string, any>;
}

function topologicalSort(
  nodes: NodeInput[],
  edges: Array<{ source: string; target: string }>
): NodeInput[] {
  const inDegree = new Map<string, number>();
  const graph = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node.id, 0);
    graph.set(node.id, []);
  }

  for (const edge of edges) {
    const targets = graph.get(edge.source) || [];
    targets.push(edge.target);
    graph.set(edge.source, targets);

    const currentInDegree = inDegree.get(edge.target) || 0;
    inDegree.set(edge.target, currentInDegree + 1);
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  const result: NodeInput[] = [];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentNode = nodes.find((n) => n.id === currentId);
    if (currentNode) {
      result.push(currentNode);
    }

    const targets = graph.get(currentId) || [];
    for (const targetId of targets) {
      const currentTargetInDegree = inDegree.get(targetId) || 0;
      inDegree.set(targetId, currentTargetInDegree - 1);

      if (currentTargetInDegree - 1 === 0) {
        queue.push(targetId);
      }
    }
  }

  if (result.length !== nodes.length) {
    console.warn("Topological sort: graph may have cycles, returning partial order");
  }

  return result;
}

function identifyParallelExecution(
  nodes: NodeInput[],
  edges: Array<{ source: string; target: string }>
): string[][] {
  const nodeIds = nodes.map((n) => n.id);
  const visited = new Set<string>();
  const groups: string[][] = [];

  const incomingEdges = new Map<string, string[]>();
  const outgoingEdges = new Map<string, string[]>();

  for (const node of nodes) {
    incomingEdges.set(node.id, []);
    outgoingEdges.set(node.id, []);
  }

  for (const edge of edges) {
    const sources = outgoingEdges.get(edge.source) || [];
    sources.push(edge.target);
    outgoingEdges.set(edge.source, sources);

    const targets = incomingEdges.get(edge.target) || [];
    targets.push(edge.source);
    incomingEdges.set(edge.target, targets);
  }

  function traverseGroup(startId: string): string[] {
    const group: string[] = [];
    const queue = [startId];
    const localVisited = new Set<string>();

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (localVisited.has(currentId)) continue;
      localVisited.add(currentId);

      const outputs = outgoingEdges.get(currentId) || [];
      for (const nextId of outputs) {
        const inputs = incomingEdges.get(nextId) || [];
        const hasMultipleInputs = inputs.length > 1;
        const allInputsVisited = inputs.every((id) => localVisited.has(id));

        if (hasMultipleInputs && allInputsVisited) {
          continue;
        }

        if (!localVisited.has(nextId)) {
          queue.push(nextId);
        }
      }

      group.push(currentId);
    }

    return group;
  }

  for (const nodeId of nodeIds) {
    if (visited.has(nodeId)) continue;

    const inputs = incomingEdges.get(nodeId) || [];
    const hasUnvisitedInputs = inputs.some((id) => !visited.has(id));

    if (hasUnvisitedInputs) continue;

    const group = traverseGroup(nodeId);
    group.forEach((id) => visited.add(id));
    groups.push(group);
  }

  return groups;
}
