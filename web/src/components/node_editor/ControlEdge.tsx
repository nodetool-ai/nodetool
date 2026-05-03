/**
 * Control edge component for Agent → Node control connections.
 * Renders a dashed line to visually distinguish control edges from data edges.
 */
import {
  BaseEdge,
  getBezierPath,
  type EdgeProps
} from "@xyflow/react";
import { memo, useMemo } from "react";

const CONTROL_EDGE_COLOR = "#f59e0b";

export function ControlEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition
  });

  const style = useMemo(
    () => ({
      stroke: CONTROL_EDGE_COLOR,
      strokeWidth: selected ? 3 : 2,
      strokeDasharray: "8 4",
      strokeOpacity: selected ? 1 : 0.7
    }),
    [selected]
  );

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={style}
    />
  );
}

const MemoizedControlEdge = memo(ControlEdge, (prevProps, nextProps) => {
  return (
    prevProps.id === nextProps.id &&
    prevProps.selected === nextProps.selected &&
    prevProps.sourceX === nextProps.sourceX &&
    prevProps.sourceY === nextProps.sourceY &&
    prevProps.targetX === nextProps.targetX &&
    prevProps.targetY === nextProps.targetY
  );
});

export default MemoizedControlEdge;
