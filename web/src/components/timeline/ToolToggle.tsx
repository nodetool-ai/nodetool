/** @jsxImportSource @emotion/react */
/**
 * ToolToggle — the pointer tools (Premiere's Tools panel: Select, Track
 * select forward and backward, Ripple edit, Rolling edit, Rate stretch, Cut,
 * Slip, Slide, Hand, Zoom) plus the
 * Ripple toggle for the timeline editor.
 *
 * Labeled ghost buttons (icon + text). The active button picks up the
 * primary accent + subtle filled background; the tooltip carries the
 * shortcut of the active keyboard layout and a one-line description. The
 * three drop modes are one exclusive choice, announced as a radio group.
 */
import React, { memo, useCallback, useMemo } from "react";
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
import MyLocationOutlinedIcon from "@mui/icons-material/MyLocationOutlined";
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
import type { TimelineTool } from "../../stores/timeline/TimelineUIStore";
import { useSettingsStore } from "../../stores/SettingsStore";
import { GRID_DIVISION_OPTIONS } from "./Tracks/tempoGrid";
import { formatActionShortcut } from "./timelineKeymap";
import type { TimelineAction } from "./timelineKeymap";

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

/** A monoline tool glyph drawn on the 24px grid PointerIcon uses. */
const ToolGlyph: React.FC<{ d: string }> = ({ d }) => (
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
    <path d={d} />
  </svg>
);

/** Glyphs after Premiere's: a bar with the direction each edit moves. */
const TRACK_SELECT_GLYPH = "M5 5 V19 M9 12 H20 M16 8 L20 12 L16 16 M9 7 H14 M9 17 H14";
const RIPPLE_GLYPH = "M8 5 V19 M8 5 H5 M8 19 H5 M11 12 H20 M16 8 L20 12 L16 16";
const ROLL_GLYPH = "M12 4 V20 M3 12 H21 M6 9 L3 12 L6 15 M18 9 L21 12 L18 15";
const RATE_STRETCH_GLYPH =
  "M3 6 V18 M21 6 V18 M6 12 H18 M9 9 L6 12 L9 15 M15 9 L18 12 L15 15";
const SLIP_GLYPH =
  "M3 7 H21 V17 H3 Z M8 12 H16 M10 10 L8 12 L10 14 M14 10 L16 12 L14 14";
const TRACK_SELECT_BACKWARD_GLYPH =
  "M19 5 V19 M15 12 H4 M8 8 L4 12 L8 16 M15 7 H10 M15 17 H10";
const SLIDE_GLYPH =
  "M3 7 V17 M21 7 V17 M8 8 H16 V16 H8 Z M5 12 H8 M16 12 H19";
const HAND_GLYPH =
  "M8 13 V6.5 a1.5 1.5 0 0 1 3 0 V12 M11 11 V5 a1.5 1.5 0 0 1 3 0 V12 M14 11.5 V6.5 a1.5 1.5 0 0 1 3 0 V14 a6 6 0 0 1 -6 6 h-1 a6 6 0 0 1 -5 -2.7 L3.5 14 a1.5 1.5 0 0 1 2.4 -1.8 L8 14";
const ZOOM_GLYPH = "M10.5 4 a6.5 6.5 0 1 0 0.01 0 Z M15.2 15.2 L20 20 M8 10.5 H13 M10.5 8 V13";

/** The edit tools beside Select and Cut, in Premiere's Tools panel order. */
const EDIT_TOOLS: ReadonlyArray<{
  tool: TimelineTool;
  action: TimelineAction;
  label: string;
  description: string;
  glyph: string;
}> = [
  {
    tool: "trackSelect",
    action: "trackSelectTool",
    label: "Track select",
    description: "Click to select every clip from there on. Shift: that track only",
    glyph: TRACK_SELECT_GLYPH
  },
  {
    tool: "trackSelectBackward",
    action: "trackSelectBackwardTool",
    label: "Track select backward",
    description: "Click to select every clip up to there. Shift: that track only",
    glyph: TRACK_SELECT_BACKWARD_GLYPH
  },
  {
    tool: "ripple",
    action: "rippleTool",
    label: "Ripple edit",
    description: "Drag an edge. Later clips follow so no gap opens",
    glyph: RIPPLE_GLYPH
  },
  {
    tool: "roll",
    action: "rollTool",
    label: "Rolling edit",
    description: "Drag a cut. The clip across it gives up what this one gains",
    glyph: ROLL_GLYPH
  },
  {
    tool: "rateStretch",
    action: "rateStretchTool",
    label: "Rate stretch",
    description: "Drag an edge. The clip's speed changes to fill the new length",
    glyph: RATE_STRETCH_GLYPH
  }
];

/** The tools after Cut: Slip, Slide, Hand and Zoom, as in Premiere. */
const AFTER_CUT_TOOLS: ReadonlyArray<{
  tool: TimelineTool;
  action: TimelineAction;
  label: string;
  description: string;
  glyph: string;
}> = [
  {
    tool: "slip",
    action: "slipTool",
    label: "Slip",
    description: "Drag a clip to change which part of its source plays",
    glyph: SLIP_GLYPH
  },
  {
    tool: "slide",
    action: "slideTool",
    label: "Slide",
    description: "Drag a clip along its track. The clips on either side trim to follow",
    glyph: SLIDE_GLYPH
  },
  {
    tool: "hand",
    action: "handTool",
    label: "Hand",
    description: "Drag to scroll the timeline",
    glyph: HAND_GLYPH
  },
  {
    tool: "zoom",
    action: "zoomTool",
    label: "Zoom",
    description: "Click to zoom in at that point. Alt-click zooms out",
    glyph: ZOOM_GLYPH
  }
];

const buttonStyles = (
  theme: Theme,
  active: boolean,
  compact: boolean,
  iconOnly = false
) =>
  css({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: getSpacingPx(SPACING.sm),
    height: compact ? CONTROL.height.sm : CONTROL.height.xs,
    minWidth: compact
      ? CONTROL.height.sm
      : iconOnly
        ? CONTROL.height.xs
        : undefined,
    padding:
      compact || iconOnly ? 0 : theme.spacing(0, SPACING.lg, 0, SPACING.md),
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
 * carries nine toggles plus the grid select — more than fits. Scroll it
 * rather than clip it, the way the track header's control row does: a control
 * pushed past the edge of a `overflow: hidden` toolbar cannot be reached at all.
 */
const compactRowStyles = (theme: Theme) =>
  css({
    overflowX: "auto",
    scrollbarWidth: "none",
    minWidth: 0,
    "&::-webkit-scrollbar": { display: "none" },
    "& > *": { flexShrink: 0 },
    // Fade the trailing edge so a strip that runs on reads as scrollable
    // rather than cut off.
    maskImage: `linear-gradient(to right, ${theme.vars.palette.background.default} calc(100% - ${getSpacingPx(SPACING.xl)}), transparent)`
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
  /** Icon without its label even in the wide toolbar. */
  iconOnly?: boolean;
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
  iconOnly = false,
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
        css={buttonStyles(theme, active, compact, iconOnly)}
        onClick={onClick}
        aria-label={label}
        {...(role === "radio"
          ? { role: "radio", "aria-checked": active, tabIndex: active ? 0 : -1 }
          : { "aria-pressed": active })}
      >
        {children}
        {!compact && !iconOnly && <span>{label}</span>}
      </button>
    </Tooltip>
  );
};

interface ToolToggleProps {
  /** Phone toolbar: icon-only buttons on a 28px touch target. */
  compact?: boolean;
}

export const ToolToggle: React.FC<ToolToggleProps> = memo(({ compact = false }) => {
  const theme = useTheme();
  const compactRowCss = useMemo(() => compactRowStyles(theme), [theme]);
  const activeTool = useTimelineUIStore((s) => s.activeTool);
  const setActiveTool = useTimelineUIStore((s) => s.setActiveTool);
  const rippleMode = useTimelineUIStore((s) => s.rippleMode);
  const toggleRippleMode = useTimelineUIStore((s) => s.toggleRippleMode);
  const dropMode = useTimelineUIStore((s) => s.dropMode);
  const setDropMode = useTimelineUIStore((s) => s.setDropMode);
  const snapEnabled = useTimelineUIStore((s) => s.snapEnabled);
  const toggleSnap = useTimelineUIStore((s) => s.toggleSnap);
  const followPlayhead = useTimelineUIStore((s) => s.followPlayhead);
  const toggleFollowPlayhead = useTimelineUIStore(
    (s) => s.toggleFollowPlayhead
  );
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
      css={compact ? compactRowCss : undefined}
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
      {EDIT_TOOLS.map((t) => (
        <ToolButton
          key={t.tool}
          label={t.label}
          shortcut={formatActionShortcut(preset, t.action)}
          description={t.description}
          active={activeTool === t.tool}
          compact={compact}
          iconOnly
          onClick={() => setActiveTool(t.tool)}
        >
          <ToolGlyph d={t.glyph} />
        </ToolButton>
      ))}
      <ToolButton
        label="Cut"
        shortcut={formatActionShortcut(preset, "cutTool")}
        active={activeTool === "cut"}
        compact={compact}
        onClick={() => setActiveTool("cut")}
      >
        <ContentCutOutlinedIcon />
      </ToolButton>
      {AFTER_CUT_TOOLS.map((t) => (
        <ToolButton
          key={t.tool}
          label={t.label}
          shortcut={formatActionShortcut(preset, t.action)}
          description={t.description}
          active={activeTool === t.tool}
          compact={compact}
          iconOnly
          onClick={() => setActiveTool(t.tool)}
        >
          <ToolGlyph d={t.glyph} />
        </ToolButton>
      ))}
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
      <ToolButton
        label="Follow"
        description="The tracks scroll to keep the playhead in view during playback"
        active={followPlayhead}
        compact={compact}
        onClick={toggleFollowPlayhead}
      >
        <MyLocationOutlinedIcon />
      </ToolButton>
    </FlexRow>
  );
});
ToolToggle.displayName = "ToolToggle";

export default ToolToggle;
