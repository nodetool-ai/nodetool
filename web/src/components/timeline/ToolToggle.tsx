/** @jsxImportSource @emotion/react */
/**
 * ToolToggle — Select / Cut tool buttons plus the Ripple toggle for the
 * timeline editor.
 *
 * Labeled ghost buttons (icon + text). The active button picks up the
 * primary accent + subtle filled background; the tooltip carries the
 * shortcut of the active keyboard layout and a one-line description. The
 * three drop modes are one exclusive choice, announced as a radio group.
 */
import React, { memo, useCallback } from "react";
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
import StraightenOutlinedIcon from "@mui/icons-material/StraightenOutlined";
import type { TempoGridDivision } from "@nodetool-ai/timeline";
import { useTimelineStore } from "../../stores/timeline/TimelineStore";

import {
  FlexRow,
  SelectField,
  Tooltip,
  MOTION,
  BORDER_RADIUS,
  CONTROL,
  FONT_WEIGHT,
  SPACING,
  TYPOGRAPHY,
  getSpacingPx
} from "../ui_primitives";
import { useTimelineUIStore } from "../../stores/timeline/TimelineUIStore";
import { useSettingsStore } from "../../stores/SettingsStore";
import { GRID_DIVISION_OPTIONS } from "./Tracks/tempoGrid";
import { formatActionShortcut } from "./timelineKeymap";

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
    gap: getSpacingPx(SPACING.sm),
    height: compact ? CONTROL.height.sm : CONTROL.height.xs,
    minWidth: compact ? CONTROL.height.sm : undefined,
    padding: compact ? 0 : theme.spacing(0, SPACING.lg, 0, SPACING.md),
    background: active ? theme.vars.palette.action.selected : "transparent",
    border: `1px solid ${active ? theme.vars.palette.divider : "transparent"}`,
    color: active
      ? theme.vars.palette.text.primary
      : theme.vars.palette.text.secondary,
    cursor: "pointer",
    fontSize: theme.fontSizeSmall,
    fontWeight: FONT_WEIGHT.medium,
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
      outline: `2px solid ${theme.vars.palette.primary.main}`,
      outlineOffset: 2
    },
    // Icon glyphs scale with the label (em is allowed for icons only).
    "& svg": {
      fontSize: compact ? "1.25em" : "1.1em"
    }
  });

/** The division select sits in the toolbar row, so it gets the pill height
 *  the tool buttons have rather than the field default. */
const gridSelectStyles = css({
  // Wide enough for the longest division label.
  minWidth: `calc(2 * ${getSpacingPx(SPACING.xxxl)} + ${getSpacingPx(SPACING.md)})`,
  "& .MuiInputBase-root": {
    height: CONTROL.height.xs
  }
});

const tooltipDescriptionStyles = css({
  ...TYPOGRAPHY.sans.caption,
  display: "block"
});

/**
 * The phone toolbar is one 44px row on a 390px viewport, and this strip now
 * carries eight toggles plus the grid select — more than fits. Scroll it
 * rather than clip it, the way the track header's control row does: a control
 * pushed past the edge of a `overflow: hidden` toolbar cannot be reached at all.
 */
const compactRowStyles = css({
  overflowX: "auto",
  scrollbarWidth: "none",
  minWidth: 0,
  "&::-webkit-scrollbar": { display: "none" },
  "& > *": { flexShrink: 0 }
});

/** The drop-mode radio group sits inside the scrolling phone strip. */
const compactGroupStyles = css({
  flexShrink: 0,
  "& > *": { flexShrink: 0 }
});

const dividerStyles = css({
  width: 1,
  height: getSpacingPx(SPACING.xl),
  margin: `0 ${getSpacingPx(SPACING.xs)}`,
  background: "currentColor",
  opacity: 0.2
});

const DROP_MODES = ["overwrite", "insert", "overlap"] as const;

interface ToolButtonProps {
  label: string;
  /** Key of the active layout, shown in parentheses after the label. */
  shortcut?: string | null;
  /** What the control does, on its own line under the label. */
  description?: string;
  active: boolean;
  compact: boolean;
  /** "radio" inside an exclusive group; a pressed toggle otherwise. */
  role?: "radio";
  onClick: () => void;
  children: React.ReactNode;
}

const ToolButton: React.FC<ToolButtonProps> = ({
  label,
  shortcut,
  description,
  active,
  compact,
  role,
  onClick,
  children
}) => {
  const theme = useTheme();
  const heading = shortcut ? `${label} (${shortcut})` : label;
  return (
    <Tooltip
      title={
        description ? (
          <>
            <span css={css({ display: "block" })}>{heading}</span>
            <span css={tooltipDescriptionStyles}>{description}</span>
          </>
        ) : (
          heading
        )
      }
    >
      <button
        type="button"
        css={buttonStyles(theme, active, compact)}
        onClick={onClick}
        aria-label={label}
        {...(role === "radio"
          ? { role: "radio", "aria-checked": active, tabIndex: active ? 0 : -1 }
          : { "aria-pressed": active })}
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
  const rulerMode = useTimelineUIStore((s) => s.rulerMode);
  const toggleRulerMode = useTimelineUIStore((s) => s.toggleRulerMode);
  const gridDivision = useTimelineUIStore((s) => s.gridDivision);
  const setGridDivision = useTimelineUIStore((s) => s.setGridDivision);
  const linkedSelection = useTimelineStore((s) => s.linkedSelection);
  const setLinkedSelection = useTimelineStore((s) => s.setLinkedSelection);
  const preset = useSettingsStore((s) => s.settings.timelineKeyboardPreset);
  // Arrow keys move the checked radio, as the ARIA radio-group pattern expects.
  const handleDropModeKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      const step =
        e.key === "ArrowRight" || e.key === "ArrowDown"
          ? 1
          : e.key === "ArrowLeft" || e.key === "ArrowUp"
            ? -1
            : 0;
      if (step === 0) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const index = DROP_MODES.indexOf(dropMode);
      const next =
        DROP_MODES[(index + step + DROP_MODES.length) % DROP_MODES.length];
      setDropMode(next);
      const radios =
        e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]');
      radios[DROP_MODES.indexOf(next)]?.focus();
    },
    [dropMode, setDropMode]
  );
  const handleGridChange = useCallback(
    (value: string) => setGridDivision(value as TempoGridDivision),
    [setGridDivision]
  );
  return (
    <FlexRow
      gap={0.5}
      align="center"
      css={compact ? compactRowStyles : undefined}
    >
      <ToolButton
        label="Select"
        shortcut={formatActionShortcut(preset, "selectTool")}
        active={activeTool === "select"}
        compact={compact}
        onClick={() => setActiveTool("select")}
      >
        <PointerIcon />
      </ToolButton>
      <ToolButton
        label="Cut"
        shortcut={formatActionShortcut(preset, "cutTool")}
        active={activeTool === "cut"}
        compact={compact}
        onClick={() => setActiveTool("cut")}
      >
        <ContentCutOutlinedIcon />
      </ToolButton>
      <ToolButton
        label="Ripple"
        description="Trims and deletes close the gap"
        active={rippleMode}
        compact={compact}
        onClick={toggleRippleMode}
      >
        <SwapHorizOutlinedIcon />
      </ToolButton>
      <span css={dividerStyles} aria-hidden />
      <FlexRow
        gap={0.5}
        align="center"
        role="radiogroup"
        aria-label="Drop mode"
        onKeyDown={handleDropModeKeyDown}
        css={compact ? compactGroupStyles : undefined}
      >
      <ToolButton
        label="Overwrite"
        role="radio"
        description="A drop replaces what it covers"
        active={dropMode === "overwrite"}
        compact={compact}
        onClick={() => setDropMode("overwrite")}
      >
        <FlipToFrontOutlinedIcon />
      </ToolButton>
      <ToolButton
        label="Insert"
        role="radio"
        description="A drop pushes later clips right (or Ctrl+drag in any mode)"
        active={dropMode === "insert"}
        compact={compact}
        onClick={() => setDropMode("insert")}
      >
        <KeyboardTabOutlinedIcon />
      </ToolButton>
      <ToolButton
        label="Overlap"
        role="radio"
        description="A drop stacks and cross-fades"
        active={dropMode === "overlap"}
        compact={compact}
        onClick={() => setDropMode("overlap")}
      >
        <LayersOutlinedIcon />
      </ToolButton>
      </FlexRow>
      <span css={dividerStyles} aria-hidden />
      <ToolButton
        label="Snap"
        shortcut={formatActionShortcut(preset, "toggleSnap")}
        description="Hold Alt while dragging to bypass"
        active={snapEnabled}
        compact={compact}
        onClick={toggleSnap}
      >
        <GridGoldenratioOutlinedIcon />
      </ToolButton>
      <ToolButton
        label="Bars"
        description="The ruler counts bars and beats, not seconds"
        active={rulerMode === "bars"}
        compact={compact}
        onClick={toggleRulerMode}
      >
        <StraightenOutlinedIcon />
      </ToolButton>
      <SelectField
        label="Grid division"
        hideLabel
        size="small"
        value={gridDivision}
        options={GRID_DIVISION_OPTIONS}
        onChange={handleGridChange}
        css={gridSelectStyles}
      />
      <span css={dividerStyles} aria-hidden />
      <ToolButton
        label="Linked"
        description="Video and its audio move together"
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
