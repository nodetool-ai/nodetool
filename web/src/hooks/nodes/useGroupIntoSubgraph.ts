import { useCallback } from "react";
import { useReactFlow, type Edge as RFEdge, type Node as RFNode } from "@xyflow/react";
import { shallow } from "zustand/shallow";
import { useNodes } from "../../contexts/NodeContext";
import useMetadataStore from "../../stores/MetadataStore";
import { reactFlowNodeToGraphNode } from "../../stores/reactFlowNodeToGraphNode";
import { reactFlowEdgeToGraphEdge } from "../../stores/reactFlowEdgeToGraphEdge";
import { SUBGRAPH_NODE_TYPE } from "../../components/node/SubgraphNode";
import type { NodeData } from "../../stores/NodeData";
import type {
  Node as ApiNode,
  Edge as ApiEdge
} from "../../stores/ApiTypes";

const STRING_INPUT_TYPE = "nodetool.input.StringInput";
const OUTPUT_TYPE = "nodetool.output.Output";

const generateId = (): string =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `n_${Math.random().toString(36).slice(2, 12)}`;

const computeCentroid = (nodes: RFNode<NodeData>[]) => {
  if (nodes.length === 0) return { x: 0, y: 0 };
  let xSum = 0;
  let ySum = 0;
  for (const n of nodes) {
    xSum += n.position.x;
    ySum += n.position.y;
  }
  return { x: xSum / nodes.length, y: ySum / nodes.length };
};

interface CrossingPlan {
  innerNodes: ApiNode[];
  innerEdges: ApiEdge[];
  outerEdgesToAdd: RFEdge[];
  outerEdgesToRemove: string[];
}

/**
 * Build the rewrite plan for "Group into Subgraph":
 *  - Internal edges (both endpoints selected) move into the subgraph as-is.
 *  - Incoming crossing edges become outer→subgraph edges, with a new
 *    StringInput node inside the subgraph forwarding to the original target.
 *    Multiple outer edges targeting the same (target,handle) share one input.
 *  - Outgoing crossing edges become subgraph→outer edges, with a new Output
 *    node inside the subgraph receiving from the original source.
 *    Multiple outer edges from the same (source,handle) share one output.
 */
function buildPlan(
  selectedIds: Set<string>,
  selectedNodes: RFNode<NodeData>[],
  allEdges: RFEdge[],
  subgraphId: string,
  selectionCenter: { x: number; y: number }
): CrossingPlan {
  const innerNodes: ApiNode[] = selectedNodes.map(reactFlowNodeToGraphNode);
  const innerEdges: ApiEdge[] = [];
  const outerEdgesToAdd: RFEdge[] = [];
  const outerEdgesToRemove: string[] = [];

  // Dedupe boundary ports by (target,handle) for inputs / (source,handle) for outputs.
  const inputPortByKey = new Map<
    string,
    { portName: string; inputNodeId: string }
  >();
  const outputPortByKey = new Map<
    string,
    { portName: string; outputNodeId: string }
  >();

  let inputCounter = 1;
  let outputCounter = 1;

  // Layout boundary nodes vertically inside the subgraph for readability.
  const inputXY = () => ({ x: -200, y: inputCounter * 80 });
  const outputXY = () => ({ x: 400, y: outputCounter * 80 });

  for (const edge of allEdges) {
    const srcIn = selectedIds.has(edge.source);
    const tgtIn = selectedIds.has(edge.target);

    if (srcIn && tgtIn) {
      innerEdges.push(reactFlowEdgeToGraphEdge(edge));
      outerEdgesToRemove.push(edge.id);
      continue;
    }

    if (!srcIn && tgtIn) {
      // Incoming crossing — needs an InputNode inside the subgraph.
      const handle = edge.targetHandle ?? "";
      const key = `${edge.target}:${handle}`;
      let port = inputPortByKey.get(key);
      if (!port) {
        const portName = `in${inputCounter++}`;
        const inputNodeId = generateId();
        port = { portName, inputNodeId };
        inputPortByKey.set(key, port);
        innerNodes.push({
          id: inputNodeId,
          type: STRING_INPUT_TYPE,
          data: {
            name: portName,
            value: "",
            description: ""
          },
          ui_properties: { position: inputXY() }
        });
        innerEdges.push({
          id: generateId(),
          source: inputNodeId,
          sourceHandle: "output",
          target: edge.target,
          targetHandle: handle,
          edge_type: "data"
        } as ApiEdge);
      }
      outerEdgesToAdd.push({
        ...edge,
        id: generateId(),
        target: subgraphId,
        targetHandle: port.portName
      });
      outerEdgesToRemove.push(edge.id);
      continue;
    }

    if (srcIn && !tgtIn) {
      // Outgoing crossing — needs an OutputNode inside the subgraph.
      const handle = edge.sourceHandle ?? "output";
      const key = `${edge.source}:${handle}`;
      let port = outputPortByKey.get(key);
      if (!port) {
        const portName = `out${outputCounter++}`;
        const outputNodeId = generateId();
        port = { portName, outputNodeId };
        outputPortByKey.set(key, port);
        innerNodes.push({
          id: outputNodeId,
          type: OUTPUT_TYPE,
          data: {
            name: portName,
            value: null,
            description: ""
          },
          ui_properties: { position: outputXY() }
        });
        innerEdges.push({
          id: generateId(),
          source: edge.source,
          sourceHandle: handle,
          target: outputNodeId,
          targetHandle: "value",
          edge_type: "data"
        } as ApiEdge);
      }
      outerEdgesToAdd.push({
        ...edge,
        id: generateId(),
        source: subgraphId,
        sourceHandle: port.portName
      });
      outerEdgesToRemove.push(edge.id);
    }
  }

  // Voids reference to selectionCenter just to keep the signature unsurprising;
  // boundary nodes use the simple grid layout above.
  void selectionCenter;

  return { innerNodes, innerEdges, outerEdgesToAdd, outerEdgesToRemove };
}

export function useGroupIntoSubgraph() {
  const reactFlowInstance = useReactFlow();
  const getMetadata = useMetadataStore((s) => s.getMetadata);
  const { createNode, addNode, addEdge, deleteEdges, deleteNodes, nodes, edges } =
    useNodes((s) => ({
      createNode: s.createNode,
      addNode: s.addNode,
      addEdge: s.addEdge,
      deleteEdges: s.deleteEdges,
      deleteNodes: s.deleteNodes,
      nodes: s.nodes,
      edges: s.edges
    }), shallow);

  return useCallback(
    (selectedIds: string[]): { subgraphNodeId: string } | null => {
      if (selectedIds.length === 0) return null;
      const metadata = getMetadata(SUBGRAPH_NODE_TYPE);
      if (!metadata) {
        console.error("SubgraphNode metadata not loaded");
        return null;
      }

      const idSet = new Set(selectedIds);
      const selectedNodes = nodes.filter((n) => idSet.has(n.id)) as RFNode<NodeData>[];
      if (selectedNodes.length === 0) return null;

      const center = computeCentroid(selectedNodes);
      // Place the new SubgraphNode near the selection centroid.
      const position = reactFlowInstance
        ? { x: center.x, y: center.y }
        : center;

      const subgraphNode = createNode(metadata, position, {
        graph: { nodes: [], edges: [] }
      });

      const plan = buildPlan(
        idSet,
        selectedNodes,
        edges as RFEdge[],
        subgraphNode.id,
        center
      );

      subgraphNode.data.properties = {
        ...(subgraphNode.data.properties ?? {}),
        graph: { nodes: plan.innerNodes, edges: plan.innerEdges }
      };

      addNode(subgraphNode);
      deleteEdges(plan.outerEdgesToRemove);
      deleteNodes(selectedIds);
      for (const edge of plan.outerEdgesToAdd) {
        addEdge(edge);
      }

      return { subgraphNodeId: subgraphNode.id };
    },
    [
      reactFlowInstance,
      getMetadata,
      createNode,
      addNode,
      addEdge,
      deleteEdges,
      deleteNodes,
      nodes,
      edges
    ]
  );
}

export { buildPlan as __testOnly_buildPlan };
