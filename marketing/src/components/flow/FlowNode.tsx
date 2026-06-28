import React, { CSSProperties, ReactNode } from "react";
import { NODE, HANDLE, CONTROL_HANDLE, typeColor } from "./tokens";

/**
 * Static, non-interactive replica of the NodeTool ReactFlow node UI.
 * Pixel-matched to the live editor for marketing demos and example graphs.
 * No drag, no connect, no state — purely visual.
 */

type Side = "in" | "out";

// A single port dot. Absolutely positioned; lives inside a relative row and
// centers on it vertically, overhanging the node edge by 6px like the real one.
function Handle({
  side,
  color,
  anchorId,
}: {
  side: Side;
  color: string;
  anchorId?: string;
}) {
  const c = typeColor(color);
  return (
    <span
      aria-hidden
      data-anchor={anchorId}
      style={{
        position: "absolute",
        top: "50%",
        transform: "translateY(-50%)",
        [side === "in" ? "left" : "right"]: -HANDLE.overhang,
        width: HANDLE.width,
        height: HANDLE.height,
        background: c,
        border: `1px solid ${c}`,
        borderRadius: side === "in" ? "2px 0 0 2px" : "0 2px 2px 0",
        boxShadow: HANDLE.shadow,
        zIndex: 2,
      }}
    />
  );
}

/** The amber pill on top of triggerable nodes (agents, etc.). */
function ControlHandle() {
  return (
    <span
      aria-hidden
      style={{
        position: "absolute",
        top: -6,
        left: "50%",
        transform: "translateX(-50%)",
        width: CONTROL_HANDLE.width,
        height: CONTROL_HANDLE.height,
        background: CONTROL_HANDLE.bg,
        border: `1px solid ${CONTROL_HANDLE.border}`,
        borderRadius: "4px 4px 0 0",
        zIndex: 5,
      }}
    />
  );
}

export type FlowNodeProps = {
  title: string;
  icon?: ReactNode;
  width?: number;
  minHeight?: number;
  control?: boolean;
  selected?: boolean;
  /** Position the node on a NodeCanvas, e.g. { left: 40, top: 60 }. */
  style?: CSSProperties;
  children?: ReactNode;
};

export function FlowNode({
  title,
  icon,
  width = 280,
  minHeight = NODE.minHeight,
  control = false,
  selected = false,
  style,
  children,
}: FlowNodeProps) {
  return (
    <div
      style={{
        position: "absolute",
        boxSizing: "border-box",
        width,
        minHeight,
        background: NODE.bg,
        backgroundImage: NODE.gradient,
        border: `1px solid ${NODE.border}`,
        borderRadius: NODE.radius,
        boxShadow: selected ? NODE.shadowSelected : NODE.shadow,
        outline: selected
          ? "2px solid rgba(122,160,226,0.82)"
          : undefined,
        outlineOffset: selected ? -1 : undefined,
        padding: NODE.padding,
        fontFamily: NODE.font,
        color: NODE.textPrimary,
        display: "flex",
        flexDirection: "column",
        ...style,
      }}
    >
      {control && <ControlHandle />}

      {/* highlight overlay (::after equivalent) */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "inherit",
          pointerEvents: "none",
          background: NODE.overlay,
          opacity: 0.8,
          zIndex: 0,
        }}
      />

      {/* Header */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: 24,
          color: NODE.textSecondary,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            minWidth: 0,
            flex: 1,
          }}
        >
          {icon != null && (
            <span
              aria-hidden
              style={{
                width: 20,
                height: 20,
                borderRadius: 4,
                display: "grid",
                placeItems: "center",
                opacity: 0.65,
                marginRight: 4,
                flexShrink: 0,
              }}
            >
              {icon}
            </span>
          )}
          <span
            style={{
              fontSize: 13,
              fontWeight: 400,
              letterSpacing: "0.01em",
              lineHeight: 1.2,
              color: NODE.textSecondary,
              padding: "2px 0",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {title}
          </span>
        </div>
      </div>

      {/* Body */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          marginTop: 2,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** A labeled property with a value, e.g. an input field's "Value". */
export function NodeProperty({
  label,
  children,
  mono = false,
}: {
  label?: string;
  children?: ReactNode;
  mono?: boolean;
}) {
  return (
    <div style={{ padding: "0 8px", marginBottom: 8 }}>
      {label != null && (
        <div
          style={{
            fontSize: 13,
            fontWeight: 400,
            color: NODE.textPrimary,
            marginBottom: 4,
          }}
        >
          {label}
        </div>
      )}
      {children != null && (
        <div
          style={{
            fontSize: 13,
            lineHeight: "18px",
            color: NODE.textPrimary,
            fontFamily: mono
              ? "'JetBrains Mono', monospace"
              : NODE.font,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** A connection row: a port dot plus its name. Use for inputs and outputs. */
export function HandleRow({
  side = "in",
  color = "any",
  label,
  anchorId,
}: {
  side?: Side;
  color?: string;
  label?: ReactNode;
  /** Stable id so a graph can measure this handle's real position. */
  anchorId?: string;
}) {
  return (
    <div
      style={{
        position: "relative",
        minHeight: 18,
        lineHeight: "18px",
        padding: "0 8px",
        marginBottom: 8,
        display: "flex",
        alignItems: "center",
        justifyContent: side === "out" ? "flex-end" : "flex-start",
      }}
    >
      <Handle side={side} color={color} anchorId={anchorId} />
      <span
        style={{
          fontSize: 13,
          fontWeight: 400,
          color: NODE.textSecondary,
        }}
      >
        {label}
      </span>
    </div>
  );
}

/** Freeform body text, e.g. a prompt body. */
export function NodeText({
  children,
  mono = false,
}: {
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div
      style={{
        padding: "0 8px",
        marginBottom: 8,
        fontSize: 13,
        lineHeight: "18px",
        color: NODE.textPrimary,
        fontFamily: mono ? "'JetBrains Mono', monospace" : NODE.font,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {children}
    </div>
  );
}

/** A small inline chip, e.g. the `{{ brief }}` variables on the Prompt node. */
export function NodeChip({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 12,
        lineHeight: "16px",
        color: "#50FA7B",
        background: "rgba(80,250,123,0.08)",
        border: "1px solid rgba(80,250,123,0.2)",
        borderRadius: 4,
        padding: "1px 6px",
        marginRight: 6,
      }}
    >
      {children}
    </span>
  );
}

/** A media preview area (image/video output). */
export function NodePreview({
  src,
  video = false,
  ratio = "16 / 9",
}: {
  src: string;
  video?: boolean;
  ratio?: string;
}) {
  return (
    <div
      style={{
        margin: "0 0 8px",
        borderRadius: 4,
        overflow: "hidden",
        aspectRatio: ratio,
        background: "#0c0d0f",
      }}
    >
      {video ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          src={src}
          autoPlay
          loop
          muted
          playsInline
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}
    </div>
  );
}
