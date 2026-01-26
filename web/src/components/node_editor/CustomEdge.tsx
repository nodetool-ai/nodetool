/**
 * Custom edge component with tooltip support for stream item counts.
 */
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps
} from "@xyflow/react";
import { Tooltip } from "@mui/material";

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
  selected,
  className
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

  // Format the data type label for display with simple pluralization
  const formatDataTypeLabel = (label: string | undefined, count: number): string => {
    if (!label || label === "Any") {return "items";}
    // Simple pluralization - add 's' for most types
    const lowerLabel = label.toLowerCase();
    return count === 1 ? lowerLabel : `${lowerLabel}s`;
  };

  const tooltipText = `${counter} ${formatDataTypeLabel(dataTypeLabel, counter || 0)} streamed`;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={style}
        markerEnd={markerEnd}
        className={className}
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
              style={{
                position: "absolute",
                transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                pointerEvents: "all",
                cursor: "default",
                background: "rgba(0, 0, 0, 0.5)",
                color: "white",
                padding: "2px 8px",
                borderRadius: "10px",
                fontSize: "10px",
                fontWeight: 600,
                border: selected ? "1px solid #fff" : "none",
                zIndex: 1000
              }}
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

export default CustomEdge;
