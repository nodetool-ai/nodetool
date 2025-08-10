/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { IconButton } from "@mui/material";
import CodeIcon from "@mui/icons-material/Code";
import type { MouseEvent, CSSProperties } from "react";

type PanelSide = "left" | "right";

export interface PanelResizeButtonProps {
  side: PanelSide;
  isVisible: boolean;
  panelSize: number;
  onMouseDown: (event: MouseEvent<HTMLButtonElement>) => void;
}

const buttonStyles = css({
  width: "30px",
  position: "absolute",
  zIndex: 1200,
  height: "calc(100vh - 75px)",
  backgroundColor: "transparent",
  border: 0,
  borderRadius: 0,
  top: "72px",
  cursor: "e-resize",
  transition: "background-color 0.3s ease",
  "& svg": {
    fontSize: "0.8em !important",
    color: "var(--palette-grey-200)",
    opacity: 0,
    marginLeft: "1px",
    transition: "all 0.5s ease"
  },
  "&:hover": {
    backgroundColor: "var(--palette-grey-800)",
    "& svg": {
      opacity: 1,
      fontSize: "1em !important"
    }
  }
});

export default function PanelResizeButton({
  side,
  isVisible,
  panelSize,
  onMouseDown
}: PanelResizeButtonProps) {
  const edgePaddingVisible = 12;
  const minOffsetVisible = 30;
  const collapsedOffset = 12;

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
    <IconButton
      disableRipple
      css={buttonStyles}
      tabIndex={-1}
      onMouseDown={(e) => {
        e.stopPropagation();
        onMouseDown(e);
      }}
      style={dynamicStyle as CSSProperties}
      aria-label={side === "right" ? "Resize right panel" : "Resize left panel"}
    >
      <CodeIcon />
    </IconButton>
  );
}
