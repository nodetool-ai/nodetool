import React, { CSSProperties, ReactNode } from "react";
import { CANVAS, typeColor } from "./tokens";

/**
 * The editor canvas backdrop: dark fill with the dotted grid. Host absolutely
 * positioned <FlowNode>s and <FlowEdge>s inside it.
 */
export function NodeCanvas({
  children,
  style,
  className,
}: {
  children?: ReactNode;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        position: "relative",
        background: CANVAS.bg,
        backgroundImage: `radial-gradient(circle, ${CANVAS.grid} 1px, transparent 1px)`,
        backgroundSize: `${CANVAS.gridSize}px ${CANVAS.gridSize}px`,
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * A bezier connection between two points, matched to ReactFlow's default edge
 * (horizontal control-point offset). Coordinates are relative to the canvas.
 */
export function FlowEdge({
  from,
  to,
  color = "any",
  width = 1.5,
}: {
  from: [number, number];
  to: [number, number];
  color?: string;
  width?: number;
}) {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
  const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  return (
    <svg
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        overflow: "visible",
        pointerEvents: "none",
        zIndex: 0,
      }}
    >
      <path
        d={d}
        fill="none"
        stroke={typeColor(color)}
        strokeWidth={width}
        strokeOpacity={0.95}
        strokeLinecap="round"
      />
    </svg>
  );
}
