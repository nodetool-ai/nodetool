/**
 * SimpleReactFlowWrapper renders a React Flow graph without interactive functionality
 */
import React from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  ConnectionLineType,
  Controls,
  ReactFlowProvider,
  NodeTypes,
  NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "@xyflow/react/dist/base.css";
import SimpleBaseNode from "./SimpleBaseNode";
import SimpleCommentNode from "./SimpleCommentNode";
import { NodeData } from "../../stores/NodeData";
import { Node, Edge } from "@xyflow/react";
// import Metadata from "@/stores/nodetool-base.json";
import {
  Workflow,
  GraphNode,
  GraphEdge,
  graphNodeToReactFlowNode,
  graphEdgeToReactFlowEdge,
} from "./types";

// Stub metadata for now - this component is not currently used
const Metadata: { nodes: Record<string, { node_type: string; [key: string]: any }> } = { nodes: {} };
import "@/styles/base.css";
import "@/styles/simple-nodes.css";
import "@xyflow/react/dist/style.css";
import "@xyflow/react/dist/base.css";
import SimpleLoopNode from "./SimpleLoopNode";

// Define the ReactFlowWrapper props
interface SimpleReactFlowWrapperProps {
  className?: string;
  workflow: Workflow;
}

class PreviewNode extends React.Component<NodeProps<Node<NodeData>>> {
  render() {
    return null;
  }
}
const nodeTypes: NodeTypes = {
  // Add the comment node type
  "nodetool.workflows.base_node.Comment": SimpleCommentNode,
  "nodetool.workflows.base_node.Preview": PreviewNode,
};

Object.entries(Metadata.nodes).reduce((acc, [index, metadata]) => {
  acc[metadata.node_type] = (props: any) => (
    <SimpleBaseNode {...props} metadata={metadata} />
  );
  return acc;
}, nodeTypes);

nodeTypes["nodetool.workflows.base_node.Group"] = SimpleLoopNode;

const SimpleReactFlowWrapper: React.FC<SimpleReactFlowWrapperProps> = ({
  className,
  workflow,
}) => {
  const nodes = workflow.graph.nodes.map((node: GraphNode) =>
    graphNodeToReactFlowNode(workflow, node)
  );
  const edges = workflow.graph.edges.map((edge: GraphEdge) =>
    graphEdgeToReactFlowEdge(edge)
  );
  return (
    <div className={`simple-reactflow-wrapper ${className || ""}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-left"
        minZoom={0.1}
        maxZoom={2}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        connectionLineType={ConnectionLineType.Bezier}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={12}
          size={1}
          color="var(--c-editor-grid-color)"
          style={{ backgroundColor: "var(--c-editor-bg-color)" }}
        />
        <Controls />
      </ReactFlow>
    </div>
  );
};

// Export the wrapped component with ReactFlowProvider
export const SimpleReactFlowWrapperWithProvider: React.FC<
  SimpleReactFlowWrapperProps
> = (props) => {
  return (
    <ReactFlowProvider>
      <SimpleReactFlowWrapper {...props} />
    </ReactFlowProvider>
  );
};

export default SimpleReactFlowWrapperWithProvider;
