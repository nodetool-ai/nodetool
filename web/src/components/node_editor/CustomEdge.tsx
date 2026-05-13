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
import { Tooltip } from "../ui_primitives";
import { memo, useMemo } from "react";
import { titleizeString } from "../../utils/titleizeString";

/**
 * A2: minimum pixel distance between source and target endpoint chips before
 * the target chip is suppressed to avoid visual overlap on very short edges.
 */
const ENDPOINT_CHIP_MIN_DISTANCE_PX = 56;

/**
 * A2/OQ-2: when the target node has more than this many input ports the
 * target endpoint chip is hidden by default to keep dense nodes readable;
 * it still appears on hover / when the edge is selected.
 */
const TARGET_CHIP_INPUT_THRESHOLD = 6;

const endpointChipBaseStyle: React.CSSProperties = {
  position: "absolute",
  pointerEvents: "all",
  background: "var(--palette-background-default)",
  color: "var(--palette-text-secondary)",
  padding: "1px 6px",
  borderRadius: 8,
  fontSize: 9,
  fontWeight: 500,
  lineHeight: "12px",
  letterSpacing: "0.01em",
  border:
    "1px solid color-mix(in srgb, var(--palette-text-secondary) 25%, transparent)",
  whiteSpace: "nowrap",
  maxWidth: 120,
  overflow: "hidden",
  textOverflow: "ellipsis",
  userSelect: "none",
  transition: "opacity 120ms ease-out"
};

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
  const sourceTypeColor = data?.sourceTypeColor as string | undefined;
  const sourceHandleName = data?.sourceHandleName as string | undefined;
  const targetHandleName = data?.targetHandleName as string | undefined;
  const targetInputCount = data?.targetInputCount as number | undefined;
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
      color: "white",
      padding: "2px 8px",
      borderRadius: "10px",
      fontSize: "10px",
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

  // A2: pre-compute endpoint chip placements + visibility.
  const endpoints = useMemo(() => {
    const sourceText = sourceHandleName ? titleizeString(sourceHandleName) : "";
    const targetText = targetHandleName ? titleizeString(targetHandleName) : "";
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // Nudge chips along the handle's outward axis so they sit just past the
    // socket and above the wire — keeps them from covering the port itself.
    const sourceShiftX = sourcePosition === "left" ? -10 : 10;
    const targetShiftX = targetPosition === "left" ? -10 : 10;
    const verticalShift = -10;

    const sourceVisible = Boolean(sourceText);
    const dense = (targetInputCount ?? 0) > TARGET_CHIP_INPUT_THRESHOLD;
    const overlapping = dist < ENDPOINT_CHIP_MIN_DISTANCE_PX;
    const targetVisibleAlways = Boolean(targetText) && !dense && !overlapping;
    const targetVisibleOnHover = Boolean(targetText) && (dense || overlapping);

    // translate(-100%, -100%) anchors the chip's bottom-right corner at the
    // handle when the port is on the left side (and vice versa) so the chip
    // never covers the port pin.
    const sourceAnchor =
      sourcePosition === "left" ? "translate(-100%, -100%)" : "translate(0, -100%)";
    const targetAnchor =
      targetPosition === "left" ? "translate(-100%, -100%)" : "translate(0, -100%)";

    return {
      sourceText,
      targetText,
      sourceVisible,
      targetVisibleAlways,
      targetVisibleOnHover,
      sourceTransform: `translate(${sourceX + sourceShiftX}px, ${
        sourceY + verticalShift
      }px) ${sourceAnchor}`,
      targetTransform: `translate(${targetX + targetShiftX}px, ${
        targetY + verticalShift
      }px) ${targetAnchor}`
    };
  }, [
    sourceHandleName,
    targetHandleName,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    targetInputCount
  ]);

  const chipAccentBorder = sourceTypeColor
    ? `color-mix(in srgb, ${sourceTypeColor} 45%, transparent)`
    : endpointChipBaseStyle.borderColor;

  const sourceChipStyle = useMemo<React.CSSProperties>(
    () => ({
      ...endpointChipBaseStyle,
      transform: endpoints.sourceTransform,
      opacity: selected ? 1 : 0.85,
      borderColor: chipAccentBorder
    }),
    [endpoints.sourceTransform, selected, chipAccentBorder]
  );

  const targetChipBaseStyle = useMemo<React.CSSProperties>(
    () => ({
      ...endpointChipBaseStyle,
      transform: endpoints.targetTransform,
      opacity: selected ? 1 : 0.85,
      borderColor: chipAccentBorder
    }),
    [endpoints.targetTransform, selected, chipAccentBorder]
  );

  const targetChipHoverOnlyStyle = useMemo<React.CSSProperties>(
    () => ({
      ...targetChipBaseStyle,
      opacity: selected ? 1 : 0
    }),
    [targetChipBaseStyle, selected]
  );

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={enhancedStyle}
        markerEnd={markerEnd}
      />
      <EdgeLabelRenderer>
        {endpoints.sourceVisible && (
          <div
            className="edge-endpoint-chip edge-endpoint-source nodrag nopan"
            style={sourceChipStyle}
            title={endpoints.sourceText}
          >
            {endpoints.sourceText}
          </div>
        )}
        {endpoints.targetVisibleAlways && (
          <div
            className="edge-endpoint-chip edge-endpoint-target nodrag nopan"
            style={targetChipBaseStyle}
            title={endpoints.targetText}
          >
            {endpoints.targetText}
          </div>
        )}
        {endpoints.targetVisibleOnHover && (
          <div
            className="edge-endpoint-chip edge-endpoint-target edge-endpoint-target--hover nodrag nopan"
            style={targetChipHoverOnlyStyle}
            title={endpoints.targetText}
            data-edge-id={id}
          >
            {endpoints.targetText}
          </div>
        )}
        {showLabel && (
          <Tooltip title={tooltipText} placement="top" arrow delay={300}>
            <div style={labelStyle} className="nodrag nopan">
              {counter}
            </div>
          </Tooltip>
        )}
      </EdgeLabelRenderer>
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
    prevProps.data?.dataTypeLabel === nextProps.data?.dataTypeLabel &&
    prevProps.data?.sourceTypeColor === nextProps.data?.sourceTypeColor &&
    prevProps.data?.sourceHandleName === nextProps.data?.sourceHandleName &&
    prevProps.data?.targetHandleName === nextProps.data?.targetHandleName &&
    prevProps.data?.targetInputCount === nextProps.data?.targetInputCount &&
    prevProps.data?.status === nextProps.data?.status // Compare status for particle animation
  );
});

export default MemoizedCustomEdge;
