/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Button } from "@mui/material";
import type { MouseEvent, CSSProperties } from "react";
import { memo, useCallback } from "react";

type PanelSide = "left" | "right";

export interface PanelResizeButtonProps {
  side: PanelSide;
  isVisible: boolean;
  panelSize: number;
  onMouseDown: (event: MouseEvent<HTMLButtonElement>) => void;
}

const buttonStyles = css({
  width: "25px",
  minWidth: "unset",
  position: "absolute",
  zIndex: 1200,
  height: "calc(100vh - 75px)",
  backgroundColor: "transparent",
  border: 0,
  borderRadius: 0,
  top: "72px",
  cursor: "e-resize",
  transition: "background-color 0.3s ease",
  // Hide the visible handle so the drawer handle disappears visually
  "& .resize-handle": {
    display: "none"
  },
  // Keep any icons hidden (none are rendered currently)
  "& svg": {
    fontSize: "0.8em !important",
    color: "var(--palette-grey-200)",
    opacity: 0,
    marginLeft: "1px",
    transition: "all 0.5s ease"
  },
  // Do not show any hover background so it remains invisible
  "&:hover": {
    backgroundColor: "transparent"
  }
});

const PanelResizeButton = memo(function PanelResizeButton({
  side,
  isVisible,
  panelSize,
  onMouseDown
}: PanelResizeButtonProps) {
  const edgePaddingVisible = 0;
  const minOffsetVisible = 24;
  const collapsedOffset = 12;

  const handleMouseDown = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      onMouseDown(e);
    },
    [onMouseDown]
  );

  const dynamicStyle =
    side === "right"
      ? {
          padding: isVisible ? "6px" : "2px",
          right: isVisible
            ? `${Math.max(panelSize + edgePaddingVisible, minOffsetVisible)}px`
            : `${collapsedOffset}px`
        }
      : {
          padding: isVisible ? "6px" : "2px",
          left: isVisible
            ? `${Math.max(panelSize + edgePaddingVisible, minOffsetVisible)}px`
            : `${collapsedOffset}px`
        };

  return (
    <Button
      className="panel-resize-button"
      disableRipple
      css={buttonStyles}
      tabIndex={-1}
      onMouseDown={handleMouseDown}
      style={dynamicStyle as CSSProperties}
      aria-label={side === "right" ? "Resize right panel" : "Resize left panel"}
    >
      {/* <CodeIcon /> */}
      <div className="resize-handle" />
    </Button>
  );
});

export default PanelResizeButton;
