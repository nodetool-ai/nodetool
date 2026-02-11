/**
 * Custom edge component with tooltip support for stream item counts.
 * Memoized to prevent re-renders for every edge in large workflows.
 */
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps
} from "@xyflow/react";
import { Tooltip } from "@mui/material";
import { memo, useMemo } from "react";

export function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data,
  selected
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition
  });

  const counter = data?.counter as number | undefined;
  const dataTypeLabel = data?.dataTypeLabel as string | undefined;
  const showLabel = counter && counter > 1;

  // Memoize tooltip text to avoid recalculating on every render
  const tooltipText = useMemo(() => {
    const formatDataTypeLabel = (label: string | undefined, count: number): string => {
      if (!label || label === "Any") {return "items";}
      const lowerLabel = label.toLowerCase();
      return count === 1 ? lowerLabel : `${lowerLabel}s`;
    };
    return `${counter} ${formatDataTypeLabel(dataTypeLabel, counter || 0)} streamed`;
  }, [counter, dataTypeLabel]);

  // Memoize label style to avoid creating new object on each render
  const labelStyle = useMemo(() => ({
    position: "absolute" as const,
    transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
    pointerEvents: "all" as const,
    cursor: "default" as const,
    background: "rgba(0, 0, 0, 0.5)",
    color: "white",
    padding: "2px 8px",
    borderRadius: "10px",
    fontSize: "10px",
    fontWeight: 600,
    border: selected ? "1px solid #fff" : "none",
    zIndex: 1000
  }), [labelX, labelY, selected]);

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={style}
        markerEnd={markerEnd}
      />
      {showLabel && (
        <EdgeLabelRenderer>
          <Tooltip
            title={tooltipText}
            placement="top"
            arrow
            enterDelay={300}
          >
            <div
              style={labelStyle}
              className="nodrag nopan"
            >
              {counter}
            </div>
          </Tooltip>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

// Memoize CustomEdge to prevent unnecessary re-renders
// Critical for performance in workflows with 100+ nodes (200+ edges)
const MemoizedCustomEdge = memo(CustomEdge, (prevProps, nextProps) => {
  return (
    prevProps.id === nextProps.id &&
    prevProps.selected === nextProps.selected &&
    prevProps.sourceX === nextProps.sourceX &&
    prevProps.sourceY === nextProps.sourceY &&
    prevProps.targetX === nextProps.targetX &&
    prevProps.targetY === nextProps.targetY &&
    prevProps.style === nextProps.style &&
    prevProps.data?.counter === nextProps.data?.counter &&
    prevProps.data?.dataTypeLabel === nextProps.data?.dataTypeLabel
  );
});

export default MemoizedCustomEdge;
