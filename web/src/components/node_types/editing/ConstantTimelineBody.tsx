/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useMemo } from "react";
import type { NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import { FlexColumn, GAP, PADDING } from "../../ui_primitives";
import { NodeInputs } from "../../node/NodeInputs";
import { NodeOutputs } from "../../node/NodeOutputs";
import OutputRenderer from "../../node/OutputRenderer";
import NodeProgress from "../../node/NodeProgress";

export const CONSTANT_TIMELINE_NODE_TYPE = "nodetool.constant.Timeline";

const bodyStyles = css({
  "&.constant-timeline-body": {
    position: "relative",
    minHeight: 0
  },
  ".constant-timeline-body__preview": {
    flex: "1 1 auto",
    minHeight: 0,
    width: "100%"
  },
  ".constant-timeline-body__fields": {
    flex: "0 0 auto",
    width: "100%",
    ".input-property": {
      marginTop: 0,
      marginBottom: 0
    }
  }
});

export interface ConstantTimelineBodyProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  workflowId: string;
  status?: string;
  isOutputNode: boolean;
}

const ConstantTimelineBody: React.FC<ConstantTimelineBodyProps> = ({
  id,
  nodeType,
  nodeMetadata,
  data,
  workflowId,
  status,
  isOutputNode
}) => {
  const value = data.properties?.value;
  const valueProperty = useMemo(
    () => nodeMetadata.properties?.find((property) => property.name === "value"),
    [nodeMetadata.properties]
  );
  const valueProperties = useMemo(
    () => (valueProperty ? [valueProperty] : []),
    [valueProperty]
  );

  return (
    <FlexColumn
      css={bodyStyles}
      className="constant-timeline-body"
      data-bespoke-body="ConstantTimeline"
      fullWidth
      fullHeight
      padding={PADDING.compact}
      gap={GAP.tight}
    >
      <FlexColumn className="constant-timeline-body__preview" fullWidth>
        <OutputRenderer value={value} showTextActions={false} />
      </FlexColumn>
      {valueProperties.length > 0 && (
        <FlexColumn className="constant-timeline-body__fields" fullWidth>
          <NodeInputs
            id={id}
            nodeMetadata={nodeMetadata}
            nodeType={nodeType}
            data={data}
            properties={valueProperties}
            showHandle={false}
          />
        </FlexColumn>
      )}
      {!isOutputNode && <NodeOutputs id={id} outputs={nodeMetadata.outputs} />}
      {status === "running" && <NodeProgress id={id} workflowId={workflowId} />}
    </FlexColumn>
  );
};

export default memo(ConstantTimelineBody);
