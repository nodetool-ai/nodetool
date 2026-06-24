/**
 * Custom edge component with tooltip support for stream item counts.
 * Memoized to prevent re-renders for every edge in large workflows.
 *
 * EXPERIMENTAL: Enhanced with data flow particle animation for visual feedback
 * when data is actively flowing through the edge.
 */
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps
} from "@xyflow/react";
import { Tooltip, BORDER_RADIUS, SPACING, getSpacingPx } from "../ui_primitives";
import { memo, useMemo } from "react";

export function CustomEdge({
  id,
  source,
  target,
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
  const sourceTypeColor = data?.sourceTypeColor as string | undefined;
  const showLabel = counter && counter > 1;

  // EXPERIMENTAL: Check if edge has active data flow
  const isActive = data?.status === "message_sent";

  // Memoize tooltip text to avoid recalculating on every render
  const tooltipText = useMemo(() => {
    const formatDataTypeLabel = (
      label: string | undefined,
      count: number
    ): string => {
      if (!label || label === "Any") {
        return "items";
      }
      const lowerLabel = label.toLowerCase();
      return count === 1 ? lowerLabel : `${lowerLabel}s`;
    };
    return `${counter} ${formatDataTypeLabel(dataTypeLabel, counter || 0)} streamed`;
  }, [counter, dataTypeLabel]);

  // Memoize label style to avoid creating new object on each render
  const labelStyle = useMemo(
    () => ({
      position: "absolute" as const,
      transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
      pointerEvents: "all" as const,
      cursor: "default" as const,
      background: "var(--palette-background-default)",
      color: "var(--palette-text-primary)",
      padding: `${getSpacingPx(SPACING.micro)} ${getSpacingPx(SPACING.md)}`,
      borderRadius: BORDER_RADIUS.pill,
      fontSize: "var(--fontSizeSmaller)",
      fontWeight: 600,
      border: selected ? "1px solid var(--palette-background-paper)" : "none",
      // zIndex: "99999"
      zIndex: "var(--zIndex-floating)"
    }),
    [labelX, labelY, selected]
  );

  // A4: Selected edges get a 2px stroke + a subtle outer glow that uses the
  // source type's color so the highlight reads as "this typed wire" rather
  // than a generic UI selection. Unselected edges keep the 1.5px stroke
  // applied in useProcessedEdges. CSS transitions animate the color change.
  const enhancedStyle = useMemo(() => {
    const accent = sourceTypeColor || "currentColor";
    return {
      ...style,
      ...(selected && {
        strokeWidth: 2,
        filter: `drop-shadow(0 0 4px color-mix(in srgb, ${accent} 60%, transparent))`
      }),
      ...(isActive && {
        strokeDasharray: "14 10",
        animation: "edgeFlow 2s linear infinite"
      })
    } as React.CSSProperties;
  }, [style, isActive, selected, sourceTypeColor]);

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={enhancedStyle}
        markerEnd={markerEnd}
      />
      {showLabel && (
        <EdgeLabelRenderer>
          <Tooltip title={tooltipText} placement="top" arrow delay={300}>
            <div style={labelStyle} className="nodrag nopan">
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
    prevProps.sourcePosition === nextProps.sourcePosition &&
    prevProps.targetPosition === nextProps.targetPosition &&
    prevProps.style === nextProps.style &&
    prevProps.data?.counter === nextProps.data?.counter &&
    prevProps.data?.dataTypeLabel === nextProps.data?.dataTypeLabel &&
    prevProps.data?.sourceTypeColor === nextProps.data?.sourceTypeColor &&
    prevProps.data?.status === nextProps.data?.status
  );
});

export default MemoizedCustomEdge;
