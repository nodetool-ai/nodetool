import { memo, useMemo } from "react";
import {
  ConnectionLineComponent,
  ConnectionLineType,
  getBezierPath,
  getSmoothStepPath,
  getSimpleBezierPath
} from "@xyflow/react";
import useConnectionStore from "../../stores/ConnectionStore";
import { colorForType } from "../../config/data_types";
import { Slugify } from "../../utils/TypeHandler";
import isEqual from "fast-deep-equal";

const CONTROL_EDGE_COLOR = "#f59e0b";
const DEFAULT_EDGE_COLOR = "#888";

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

  // Use type-aware color: amber for control, data-type color for regular, fallback to grey
  const strokeColor = useMemo(() => {
    if (connectType?.type === "control") return CONTROL_EDGE_COLOR;
    if (connectType?.type) return colorForType(connectType.type);
    return DEFAULT_EDGE_COLOR;
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
  const radius = 6;
  const isControl = connectType?.type === "control";

  return (
    <g className={"custom-connection-line"}>
      {/* Glow effect behind the connection line */}
      <path
        fill="none"
        stroke={strokeColor}
        strokeWidth={6}
        strokeOpacity={0.15}
        d={dAttr}
      />
      <path
        fill="none"
        stroke={strokeColor}
        strokeWidth={2.5}
        strokeDasharray={isControl ? "8 4" : undefined}
        className={Slugify(className || "")}
        d={dAttr}
      />
      {/* Circular cursor indicator */}
      <circle
        cx={toX}
        cy={toY}
        r={radius}
        fill={strokeColor}
        fillOpacity={0.9}
        stroke={strokeColor}
        strokeWidth={1.5}
        strokeOpacity={0.4}
      />
    </g>
  );
};

export default memo(ConnectionLine, isEqual);
