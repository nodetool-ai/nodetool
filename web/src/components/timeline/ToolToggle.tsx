/** @jsxImportSource @emotion/react */
/**
 * ToolToggle — Select / Cut tool buttons plus the Ripple toggle for the
 * timeline editor.
 *
 * Labeled ghost buttons (icon + text). The active button picks up the
 * primary accent + subtle filled background; tooltip carries the shortcut.
 * Pairs with the V (select) / C (cut) keyboard shortcuts in TracksRegion.
 */
import React, { memo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ContentCutOutlinedIcon from "@mui/icons-material/ContentCutOutlined";
import SwapHorizOutlinedIcon from "@mui/icons-material/SwapHorizOutlined";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import KeyboardTabOutlinedIcon from "@mui/icons-material/KeyboardTabOutlined";
import FlipToFrontOutlinedIcon from "@mui/icons-material/FlipToFrontOutlined";
import LinkOutlinedIcon from "@mui/icons-material/LinkOutlined";
import LinkOffOutlinedIcon from "@mui/icons-material/LinkOffOutlined";
import GridGoldenratioOutlinedIcon from "@mui/icons-material/GridGoldenratioOutlined";
import { useTimelineStore } from "../../stores/timeline/TimelineStore";

import {
  FlexRow,
  Tooltip,
  MOTION,
  BORDER_RADIUS,
  SPACING,
  getSpacingPx
} from "../ui_primitives";
import { useTimelineUIStore } from "../../stores/timeline/TimelineUIStore";

/** Custom pointer cursor — monoline, 1.6px stroke. */
const PointerIcon: React.FC = () => (
  <svg
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M5 3.5 5 19.5 9.2 15.2 11.7 21 14.5 19.8 12 14.2 18 14.2 Z" />
  </svg>
);

const buttonStyles = (theme: Theme, active: boolean, compact: boolean) =>
  css({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: compact ? 28 : 24,
    minWidth: compact ? 28 : undefined,
    padding: compact ? 0 : theme.spacing(0, 3, 0, 2),
    background: active ? theme.vars.palette.action.selected : "transparent",
    border: `1px solid ${active ? theme.vars.palette.divider : "transparent"}`,
    color: active
      ? theme.vars.palette.text.primary
      : theme.vars.palette.text.secondary,
    cursor: "pointer",
    fontSize: theme.fontSizeSmall,
    fontWeight: 500,
    letterSpacing: "0.01em",
    fontFamily: theme.typography.fontFamily,
    borderRadius: BORDER_RADIUS.md,
    transition: `background-color ${MOTION.fast}, color ${MOTION.fast}, border-color ${MOTION.fast}`,
    "&:hover": {
      backgroundColor: active
        ? theme.vars.palette.action.selected
        : theme.vars.palette.action.hover,
      color: theme.vars.palette.text.primary,
      borderColor: theme.vars.palette.divider
    },
    "&:focus-visible": {
      outline: "none",
      borderColor: theme.vars.palette.primary.main
    },
    "& svg": {
      fontSize: compact ? 16 : 14
    }
  });

const dividerStyles = css({
  width: 1,
  height: 16,
  margin: `0 ${getSpacingPx(SPACING.xs)}`,
  background: "currentColor",
  opacity: 0.2
});

interface ToolButtonProps {
  label: string;
  shortcut: string;
  active: boolean;
  compact: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

const ToolButton: React.FC<ToolButtonProps> = ({
  label,
  shortcut,
  active,
  compact,
  onClick,
  children
}) => {
  const theme = useTheme();
  return (
    <Tooltip title={`${label} (${shortcut})`}>
      <button
        type="button"
        css={buttonStyles(theme, active, compact)}
        onClick={onClick}
        aria-label={label}
        aria-pressed={active}
      >
        {children}
        {!compact && <span>{label}</span>}
      </button>
    </Tooltip>
  );
};

interface ToolToggleProps {
  /** Phone toolbar: icon-only buttons on a 28px touch target. */
  compact?: boolean;
}

export const ToolToggle: React.FC<ToolToggleProps> = memo(({ compact = false }) => {
  const activeTool = useTimelineUIStore((s) => s.activeTool);
  const setActiveTool = useTimelineUIStore((s) => s.setActiveTool);
  const rippleMode = useTimelineUIStore((s) => s.rippleMode);
  const toggleRippleMode = useTimelineUIStore((s) => s.toggleRippleMode);
  const dropMode = useTimelineUIStore((s) => s.dropMode);
  const setDropMode = useTimelineUIStore((s) => s.setDropMode);
  const snapEnabled = useTimelineUIStore((s) => s.snapEnabled);
  const toggleSnap = useTimelineUIStore((s) => s.toggleSnap);
  const linkedSelection = useTimelineStore((s) => s.linkedSelection);
  const setLinkedSelection = useTimelineStore((s) => s.setLinkedSelection);
  return (
    <FlexRow gap={0.5} align="center">
      <ToolButton
        label="Select"
        shortcut="V"
        active={activeTool === "select"}
        compact={compact}
        onClick={() => setActiveTool("select")}
      >
        <PointerIcon />
      </ToolButton>
      <ToolButton
        label="Cut"
        shortcut="C"
        active={activeTool === "cut"}
        compact={compact}
        onClick={() => setActiveTool("cut")}
      >
        <ContentCutOutlinedIcon />
      </ToolButton>
      <ToolButton
        label="Ripple"
        shortcut="trims and deletes close the gap"
        active={rippleMode}
        compact={compact}
        onClick={toggleRippleMode}
      >
        <SwapHorizOutlinedIcon />
      </ToolButton>
      <span css={dividerStyles} aria-hidden />
      <ToolButton
        label="Overwrite"
        shortcut="drop replaces what it covers"
        active={dropMode === "overwrite"}
        compact={compact}
        onClick={() => setDropMode("overwrite")}
      >
        <FlipToFrontOutlinedIcon />
      </ToolButton>
      <ToolButton
        label="Insert"
        shortcut="drop pushes later clips right · Ctrl+drag"
        active={dropMode === "insert"}
        compact={compact}
        onClick={() => setDropMode("insert")}
      >
        <KeyboardTabOutlinedIcon />
      </ToolButton>
      <ToolButton
        label="Overlap"
        shortcut="drop stacks and cross-fades"
        active={dropMode === "overlap"}
        compact={compact}
        onClick={() => setDropMode("overlap")}
      >
        <LayersOutlinedIcon />
      </ToolButton>
      <span css={dividerStyles} aria-hidden />
      <ToolButton
        label="Snap"
        shortcut="N · Alt-drag bypasses"
        active={snapEnabled}
        compact={compact}
        onClick={toggleSnap}
      >
        <GridGoldenratioOutlinedIcon />
      </ToolButton>
      <ToolButton
        label="Linked"
        shortcut="video and its audio move together"
        active={linkedSelection}
        compact={compact}
        onClick={() => setLinkedSelection(!linkedSelection)}
      >
        {linkedSelection ? <LinkOutlinedIcon /> : <LinkOffOutlinedIcon />}
      </ToolButton>
    </FlexRow>
  );
});
ToolToggle.displayName = "ToolToggle";

export default ToolToggle;
