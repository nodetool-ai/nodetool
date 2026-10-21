import React, { memo } from "react";
import { Node, NodeProps } from "@xyflow/react";
import { NodeData } from "../../../stores/NodeData";
import { DynamicSchemaNodeShell } from "../DynamicSchemaNodeShell";
import { DynamicReplicateContent } from "./DynamicReplicateContent";
import { ReplicateSchemaLoader } from "./ReplicateSchemaLoader";

const REPLICATE_HEADER_COLOR = "#3D6CEB";

const DynamicReplicateNode: React.FC<NodeProps<Node<NodeData>>> = (props) => (
  <DynamicSchemaNodeShell
    nodeProps={props}
    className="dynamic-replicate-node"
    accentColor={REPLICATE_HEADER_COLOR}
    fallbackTitle="Replicate"
    titleDetail={props.data.model_id}
    Loader={ReplicateSchemaLoader}
    Content={DynamicReplicateContent}
  />
);

export default memo(DynamicReplicateNode);
