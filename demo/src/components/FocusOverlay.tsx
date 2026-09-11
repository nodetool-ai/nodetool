import React from "react";
import { AbsoluteFill } from "remotion";
import type { Rect, Viewport } from "../camera";
import type { FocusEmphasis } from "../types";
import {
  TUTORIAL_FOCUS_BORDER_WIDTH,
  TUTORIAL_FOCUS_COLOR,
  TUTORIAL_FOCUS_DIM,
  TUTORIAL_FOCUS_GLOW,
  TUTORIAL_FOCUS_RADIUS,
} from "../tutorialTheme";

interface FocusOverlayProps {
  bounds: Rect;
  viewport: Viewport;
  emphasis?: FocusEmphasis;
  opacity?: number;
}

export const FocusOverlay: React.FC<FocusOverlayProps> = ({
  bounds,
  viewport,
  emphasis = "outline-dim",
  opacity = 1,
}) => {
  const screen = {
    x: viewport.x + bounds.x * viewport.zoom,
    y: viewport.y + bounds.y * viewport.zoom,
    width: bounds.width * viewport.zoom,
    height: bounds.height * viewport.zoom,
  };
  const outline = emphasis === "outline" || emphasis === "outline-dim";
  const dim = emphasis === "dim" || emphasis === "outline-dim";
  return (
    <AbsoluteFill style={{ pointerEvents: "none", zIndex: 20, opacity }}>
      {dim ? (
        <AbsoluteFill
          style={{
            background: TUTORIAL_FOCUS_DIM,
            clipPath: `polygon(0 0,100% 0,100% 100%,0 100%,0 0,${screen.x}px ${screen.y}px,${screen.x}px ${screen.y + screen.height}px,${screen.x + screen.width}px ${screen.y + screen.height}px,${screen.x + screen.width}px ${screen.y}px,${screen.x}px ${screen.y}px)`,
            clipRule: "evenodd",
          }}
        />
      ) : null}
      {outline ? (
        <div
          style={{
            position: "absolute",
            left: screen.x,
            top: screen.y,
            width: screen.width,
            height: screen.height,
            border: `${TUTORIAL_FOCUS_BORDER_WIDTH}px solid ${TUTORIAL_FOCUS_COLOR}`,
            borderRadius: TUTORIAL_FOCUS_RADIUS,
            boxShadow: `0 0 24px ${TUTORIAL_FOCUS_GLOW}`,
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};
