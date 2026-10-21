import React, { memo } from "react";
import { Node, NodeProps } from "@xyflow/react";
import { NodeData } from "../../../stores/NodeData";
import { DynamicSchemaNodeShell } from "../DynamicSchemaNodeShell";
import { DynamicKieSchemaContent } from "./DynamicKieSchemaContent";
import { KieSchemaLoader } from "./KieSchemaLoader";

const KIE_HEADER_COLOR = "#E55C20";

const DynamicKieSchemaNode: React.FC<NodeProps<Node<NodeData>>> = (props) => (
  <DynamicSchemaNodeShell
    nodeProps={props}
    className="dynamic-kie-schema-node"
    accentColor={KIE_HEADER_COLOR}
    fallbackTitle="Kie AI"
    titleDetail={props.data.model_id}
    Loader={KieSchemaLoader}
    Content={DynamicKieSchemaContent}
  />
);

export default memo(DynamicKieSchemaNode);
