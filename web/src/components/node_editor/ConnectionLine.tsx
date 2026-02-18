import React, { memo, useMemo } from "react";
import {
  ConnectionLineComponent,
  ConnectionLineType,
  getBezierPath,
  getSmoothStepPath,
  getSimpleBezierPath
} from "@xyflow/react";
import useConnectionStore from "../../stores/ConnectionStore";
import { Slugify } from "../../utils/TypeHandler";
import isEqual from "lodash/isEqual";

const CONTROL_EDGE_COLOR = "#f59e0b";
const DEFAULT_EDGE_COLOR = "#111";

const ConnectionLine: ConnectionLineComponent = ({
  fromX,
  fromY,
  fromPosition,
  toPosition,
  toX,
  toY,
  connectionLineType = ConnectionLineType.SimpleBezier
}) => {
  const connectType = useConnectionStore((state) => state.connectType);
  const className = connectType?.type || undefined;
  
  // Use amber color for control edges, black for regular edges
  const strokeColor = useMemo(() => {
    return connectType?.type === "control" ? CONTROL_EDGE_COLOR : DEFAULT_EDGE_COLOR;
  }, [connectType?.type]);

  let dAttr = "";
  const pathParams = {
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition,
    targetX: toX,
    targetY: toY,
    targetPosition: toPosition
  };

  if (connectionLineType === ConnectionLineType.Bezier) {
    // we assume the destination position is opposite to the source position
    [dAttr] = getBezierPath(pathParams);
  } else if (connectionLineType === ConnectionLineType.Step) {
    [dAttr] = getSmoothStepPath({
      ...pathParams,
      borderRadius: 0
    });
  } else if (connectionLineType === ConnectionLineType.SmoothStep) {
    [dAttr] = getSmoothStepPath(pathParams);
  } else if (connectionLineType === ConnectionLineType.SimpleBezier) {
    [dAttr] = getSimpleBezierPath(pathParams);
  } else {
    dAttr = `M${fromX},${fromY} ${toX},${toY}`;
  }
  const width = 12;
  const height = 12;
  const offsetX = width / 2;
  const offsetY = height / 2;

  return (
    <g className={"custom-connection-line"}>
      <path
        fill="none"
        stroke={strokeColor}
        strokeDasharray={connectType?.type === "control" ? "8 4" : undefined}
        className={Slugify(className || "")}
        d={dAttr}
      />
      <rect
        style={{ zIndex: "0" }}
        className={Slugify(className || "")}
        x={toX - offsetX}
        y={toY - offsetY}
        width={width}
        height={height}
        rx="1"
        fill={strokeColor}
      />
    </g>
  );
};

export default memo(ConnectionLine, isEqual);
