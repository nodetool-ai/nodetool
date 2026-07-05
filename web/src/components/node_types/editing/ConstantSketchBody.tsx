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

export const CONSTANT_SKETCH_NODE_TYPE = "nodetool.constant.Sketch";

const bodyStyles = () =>
  css({
    "&.constant-sketch-body": {
      position: "relative",
      minHeight: 0
    },
    ".constant-sketch-body__preview": {
      flex: "1 1 auto",
      minHeight: 0,
      width: "100%"
    },
    ".constant-sketch-body__fields": {
      flex: "0 0 auto",
      width: "100%",
      ".input-property": {
        marginTop: 0,
        marginBottom: 0
      }
    }
  });

export interface ConstantSketchBodyProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  workflowId: string;
  status?: string;
  isOutputNode: boolean;
}

const ConstantSketchBody: React.FC<ConstantSketchBodyProps> = ({
  id,
  nodeType,
  nodeMetadata,
  data,
  workflowId,
  status,
  isOutputNode
}) => {
  const styles = useMemo(() => bodyStyles(), []);
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
      css={styles}
      className="constant-sketch-body"
      data-bespoke-body="ConstantSketch"
      fullWidth
      fullHeight
      padding={PADDING.compact}
      gap={GAP.tight}
    >
      <FlexColumn className="constant-sketch-body__preview" fullWidth>
        <OutputRenderer value={value} showTextActions={false} />
      </FlexColumn>
      {valueProperties.length > 0 && (
        <FlexColumn className="constant-sketch-body__fields" fullWidth>
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

export default memo(ConstantSketchBody);
