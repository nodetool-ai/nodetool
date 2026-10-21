import React, { memo } from "react";
import { Node, NodeProps } from "@xyflow/react";
import { NodeData } from "../../../stores/NodeData";
import { DynamicSchemaNodeShell } from "../DynamicSchemaNodeShell";
import { DynamicFalSchemaContent } from "./DynamicFalSchemaContent";
import { FalSchemaLoader } from "./FalSchemaLoader";

/** FAL node accent (distinct from input/output/generic) */
const FAL_HEADER_COLOR = "#8B5CF6";

/** Dedicated React Flow node for fal.DynamicFal. */
const DynamicFalSchemaNode: React.FC<NodeProps<Node<NodeData>>> = (props) => {
  const { endpoint_id } = props.data;
  return (
    <DynamicSchemaNodeShell
      nodeProps={props}
      className="dynamic-fal-schema-node"
      accentColor={FAL_HEADER_COLOR}
      fallbackTitle="Fal AI"
      titleDetail={endpoint_id?.replace("fal-ai/", "")}
      externalLink={endpoint_id ? `https://fal.ai/models/${endpoint_id}` : undefined}
      externalLinkTitle="View on fal.ai"
      Loader={FalSchemaLoader}
      Content={DynamicFalSchemaContent}
    />
  );
};

export default memo(DynamicFalSchemaNode);
