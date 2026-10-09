import React, { memo, useMemo } from "react";
import { FlexColumn } from "../../ui_primitives";
import { NodeInputs } from "../NodeInputs";
import NodePortBand from "../NodePortBand";
import NodeProgress from "../NodeProgress";
import { AppLoader } from "./AppLoader";
import type { NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";

/** Stored by the loader; the node body shows the app picker instead. */
const HIDDEN_PROPERTIES = new Set(["app_id", "app_json"]);

interface AppNodeContentProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  status?: string;
  workflowId: string;
}

/**
 * Body of the App node: the app picker, then one input per app input and one
 * output per app output. Ports come from the app, so they are not editable.
 */
export const AppNodeContent: React.FC<AppNodeContentProps> = memo(
  ({ id, nodeType, nodeMetadata, data, status, workflowId }) => {
    const visibleProperties = useMemo(
      () =>
        nodeMetadata.properties.filter((p) => !HIDDEN_PROPERTIES.has(p.name)),
      [nodeMetadata.properties]
    );

    return (
      <FlexColumn
        sx={{
          position: "relative",
          width: "100%",
          height: "100%",
          minHeight: 0,
          paddingTop: 1
        }}
      >
        <NodePortBand id={id} outputs={nodeMetadata.outputs} />
        <AppLoader nodeId={id} data={data} />
        <FlexColumn
          className="app-node-inputs"
          sx={{ flex: "1 1 auto", minHeight: 40, overflow: "visible" }}
        >
          <NodeInputs
            id={id}
            nodeMetadata={nodeMetadata}
            layout={nodeMetadata.layout}
            properties={visibleProperties}
            nodeType={nodeType}
            data={data}
            showHandle={true}
            editableDynamicInputs={false}
          />
        </FlexColumn>
        {status === "running" && (
          <NodeProgress id={id} workflowId={workflowId} />
        )}
      </FlexColumn>
    );
  }
);

AppNodeContent.displayName = "AppNodeContent";
