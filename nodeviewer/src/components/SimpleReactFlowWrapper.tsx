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
  MiniMap,
  ReactFlowProvider,
  NodeTypes,
  NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "@xyflow/react/dist/base.css";
import SimpleBaseNode from "./SimpleBaseNode";
import SimpleCommentNode from "./SimpleCommentNode";
import { useSimpleNodeStore } from "../stores/SimpleNodeStore";
import { colorForType } from "../utils/ColorUtils";
import { NodeData } from "../stores/NodeData";
import { Node } from "@xyflow/react";
// Define the ReactFlowWrapper props
interface SimpleReactFlowWrapperProps {
  className?: string;
}

class PreviewNode extends React.Component<NodeProps<Node<NodeData>>> {
  render() {
    return <div>Preview</div>;
  }
}

const SimpleReactFlowWrapper: React.FC<SimpleReactFlowWrapperProps> = ({
  className,
}) => {
  // Get nodes and edges from the store
  const { nodes, edges, metadata, getNodeMetadata } = useSimpleNodeStore();

  // Create a map of node types to node components
  const nodeTypesWithMetadata = React.useMemo(() => {
    const nodeTypes = {
      // Add the comment node type
      "nodetool.workflows.base_node.Comment": SimpleCommentNode,
      "nodetool.workflows.base_node.Preview": PreviewNode,
    };

    // Add other node types from metadata
    return Object.entries(metadata).reduce((acc, [nodeType, metadata]) => {
      acc[nodeType] = (props: any) => (
        <SimpleBaseNode {...props} metadata={metadata} />
      );
      return acc;
    }, nodeTypes as NodeTypes);
  }, [metadata]);

  return (
    <div className={`simple-reactflow-wrapper ${className || ""}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypesWithMetadata}
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
          color="#444"
          style={{ backgroundColor: "rgb(128, 128, 128)" }}
        />
        <Controls />
        <MiniMap
          nodeStrokeColor={(n) => {
            const nodeMetadata = getNodeMetadata(n.type || "");
            if (nodeMetadata?.outputs?.[0]?.type?.type) {
              return colorForType(nodeMetadata.outputs[0].type.type);
            }
            return "#fff";
          }}
          nodeColor={() => "#333"}
          nodeBorderRadius={2}
        />
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
