/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { memo, useRef } from "react";
import { Handle, Node, NodeProps, NodeResizer, Position } from "@xyflow/react";

// utils

// store
import { NodeData } from "../../stores/NodeData";
import { isEqual } from "lodash";
import { Box, Container } from "@mui/material";
import NodeHeader from "./NodeHeader";
import NodeInputs from "./NodeInputs";
import useMetadataStore from "../../stores/MetadataStore";
import NodeOutputs from "./NodeOutputs";
// constants
const styles = (theme: any) =>
  css({
    "&": {
      height: "75px"
    }
  });

const IteratorNode: React.FC<NodeProps<Node<NodeData>>> = (props) => {
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const nodeMetadata = getMetadata("nodetool.workflows.base_node.Iterator");
  if (!nodeMetadata) {
    return null;
  }
  return (
    <Container css={styles} className="node-body">
      <NodeHeader
        id={props.id}
        data={props.data}
        hasParent={false}
        metadataTitle="Iterator"
      />
      <NodeInputs
        id={props.id}
        nodeType={props.type}
        properties={nodeMetadata.properties}
        data={props.data}
        showFields={false}
        showHandle={true}
        basicFields={["input_list"]}
        showAdvancedFields={true}
      />
      <NodeOutputs id={props.id} outputs={nodeMetadata.outputs} />
    </Container>
  );
};

export default memo(IteratorNode, isEqual);
