import React, { memo } from "react";
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

const VALID_COLOR = "#22c55e";
const INVALID_COLOR = "#ef4444";
const DEFAULT_COLOR = "#111";

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
  const connectionValidation = useConnectionStore(
    (state) => state.connectionValidation
  );
  const className = connectType?.type || undefined;

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

  const strokeColor = connectionValidation
    ? connectionValidation.valid
      ? VALID_COLOR
      : INVALID_COLOR
    : DEFAULT_COLOR;

  const strokeDasharray = connectionValidation?.valid === false ? "6 4" : undefined;

  const width = 12;
  const height = 12;
  const offsetX = width / 2;
  const offsetY = height / 2;

  return (
    <g className={"custom-connection-line"}>
      <path
        fill="none"
        stroke={strokeColor}
        strokeWidth={connectionValidation?.valid === false ? 2 : 1.5}
        strokeDasharray={strokeDasharray}
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
        stroke={strokeColor}
        strokeWidth={connectionValidation?.valid === false ? 2 : 1}
      />
    </g>
  );
};

export default memo(ConnectionLine, isEqual);
