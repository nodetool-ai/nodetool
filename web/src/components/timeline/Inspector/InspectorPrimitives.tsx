/** @jsxImportSource @emotion/react */
/**
 * Inspector primitives
 *
 * Timeline-specific inspector composition and undo adapters. Shared fields
 * live in `ui_primitives` so other document editors use the same controls.
 */

import React, {
  memo,
  useCallback,
  useMemo,
} from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import {
  NodeSlider,
  Tooltip,
  CONTROL,
  MOTION,
  BORDER_RADIUS,
  FONT_SIZE_SANS,
  TYPOGRAPHY,
  SPACING,
  getSpacingPx,
  reducedMotion,
  InspectorFieldRow,
  InspectorToggleRow as SharedInspectorToggleRow,
  type InspectorToggleRowProps,
  InspectorValueInput,
  type InspectorValueInputProps,
} from "../../ui_primitives";
import { useBatchedGesture } from "../../../hooks/timeline/useBatchedGesture";

/**
 * Square box for the inline delete buttons that sit at the right edge of a
 * repeated row (an animation, a curve, a keyframe, an effect). `DeleteButton`
 * has no size token of its own, so every call site shares this one rather than
 * spelling out a width and a height. `CONTROL.height.xs` is the 24px
 * toolbar-density control box.
 */
export const INSPECTOR_ROW_BUTTON_SX = {
  width: CONTROL.height.xs,
  height: CONTROL.height.xs
} as const;

/**
 * Body of a collapsible inspector section: rows indented past the section
 * icon, with one gap between them. `sectionContentStyles` is the Emotion form
 * for files that use the `css` prop; `INSPECTOR_SECTION_CONTENT_SX` is the same
 * box as an `sx` object. Keep the two in step.
 */
export const sectionContentStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    gap: getSpacingPx(SPACING.micro),
    padding: theme.spacing(SPACING.micro, SPACING.none, SPACING.md, SPACING.xxxl)
  });

export const INSPECTOR_SECTION_CONTENT_SX = {
  gap: SPACING.micro,
  pt: SPACING.micro,
  pr: SPACING.none,
  pb: SPACING.md,
  pl: SPACING.xxxl
} as const;

// ── Header ─────────────────────────────────────────────────────────────────

const headerStyles = css({
  display: "flex",
  alignItems: "center",
  gap: getSpacingPx(SPACING.md),
  height: CONTROL.height.md,
  padding: `0 ${getSpacingPx(SPACING.xs)} 0 ${getSpacingPx(SPACING.xs)}`
});

const eyebrowStyles = (theme: Theme) =>
  css({
    flex: "1 1 auto",
    color: theme.vars.palette.text.secondary,
    ...TYPOGRAPHY.sans.label,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    userSelect: "none"
  });

const headerActionsStyles = css({
  display: "inline-flex",
  alignItems: "center",
  gap: getSpacingPx(SPACING.micro)
});

const headerIconButtonStyles = (theme: Theme) =>
  css({
    width: CONTROL.height.xs,
    height: CONTROL.height.xs,
    background: "transparent",
    border: "1px solid transparent",
    color: theme.vars.palette.text.secondary,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BORDER_RADIUS.md,
    transition: `background-color ${MOTION.fast}, color ${MOTION.fast}, border-color ${MOTION.fast}`,
    "&:hover": {
      backgroundColor: theme.vars.palette.action.hover,
      color: theme.vars.palette.text.primary,
      borderColor: theme.vars.palette.divider
    },
    "&:focus-visible": {
      outline: "none",
      borderColor: theme.vars.palette.primary.main
    },
    "& svg": {
      fontSize: FONT_SIZE_SANS.label
    }
  });

interface InspectorHeaderAction {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "default" | "danger";
}

interface InspectorHeaderProps {
  eyebrow: string;
  actions?: InspectorHeaderAction[];
}

/** Eyebrow label + trailing action icon row (e.g. `+`, `✂`, `🗑`). */
export const InspectorHeader: React.FC<InspectorHeaderProps> = memo(
  ({ eyebrow, actions }) => {
    const theme = useTheme();
    return (
      <div css={headerStyles}>
        <div css={eyebrowStyles(theme)}>{eyebrow}</div>
        {actions && actions.length > 0 && (
          <div css={headerActionsStyles}>
            {actions.map((action) => (
              <Tooltip key={action.label} title={action.label}>
                <button
                  type="button"
                  css={headerIconButtonStyles(theme)}
                  onClick={action.onClick}
                  disabled={action.disabled}
                  aria-label={action.label}
                  style={
                    action.variant === "danger"
                      ? { color: theme.vars.palette.error.main }
                      : undefined
                  }
                >
                  {action.icon}
                </button>
              </Tooltip>
            ))}
          </div>
        )}
      </div>
    );
  }
);
InspectorHeader.displayName = "InspectorHeader";

// ── Identity card ──────────────────────────────────────────────────────────

const identityWrapStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(1),
    padding: theme.spacing(2, 1, 2.5)
  });

const identityNameStyles = (theme: Theme) =>
  css({
    ...TYPOGRAPHY.mono.label,
    color: theme.vars.palette.text.primary,
    lineHeight: 1.3,
    wordBreak: "break-all"
  });

const identityMetaRowStyles = css({
  display: "flex",
  alignItems: "center",
  gap: getSpacingPx(SPACING.sm)
});

const identitySwatchStyles = (color: string) =>
  css({
    width: 8,
    height: 8,
    borderRadius: BORDER_RADIUS.xs,
    flexShrink: 0,
    backgroundColor: color
  });

const identityMetaStyles = (theme: Theme) =>
  css({
    color: theme.vars.palette.text.secondary,
    ...TYPOGRAPHY.mono.caption
  });

interface ClipIdentityCardProps {
  name: string;
  metadata: ReadonlyArray<string>;
  /** Track-type accent shown as a small swatch beside the metadata. */
  accentColor?: string;
}

/** "kling_v3_out_…" + "video · 4.60s · 1920×1080" identity block. */
export const ClipIdentityCard: React.FC<ClipIdentityCardProps> = memo(
  ({ name, metadata, accentColor }) => {
    const theme = useTheme();
    const accent = accentColor ?? theme.vars.palette.secondary.main;
    return (
      <div css={identityWrapStyles(theme)}>
        <div css={identityNameStyles(theme)} title={name}>
          {name}
        </div>
        {metadata.length > 0 && (
          <div css={identityMetaRowStyles}>
            <span css={identitySwatchStyles(accent)} aria-hidden />
            <span css={identityMetaStyles(theme)}>{metadata.join(" · ")}</span>
          </div>
        )}
      </div>
    );
  }
);
ClipIdentityCard.displayName = "ClipIdentityCard";

// ── Rows ────────────────────────────────────────────────────────────────────

interface InspectorRowProps {
  label: React.ReactNode;
  children: React.ReactNode;
  htmlFor?: string;
}

export const InspectorRow: React.FC<InspectorRowProps> = memo(
  ({ label, children, htmlFor }) => <InspectorFieldRow layout="inline" label={label} htmlFor={htmlFor}>{children}</InspectorFieldRow>
);
InspectorRow.displayName = "InspectorRow";

// ── Static value ───────────────────────────────────────────────────────────

const staticValueStyles = (theme: Theme) =>
  css({
    ...TYPOGRAPHY.mono.code,
    color: theme.vars.palette.text.secondary,
    maxWidth: 160,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  });

/** Read-only mono value for rows that display but don't edit (type, IDs). */
export const InspectorStaticValue: React.FC<{ value: string }> = memo(
  ({ value }) => {
    const theme = useTheme();
    return (
      <span css={staticValueStyles(theme)} title={value}>
        {value}
      </span>
    );
  }
);
InspectorStaticValue.displayName = "InspectorStaticValue";

// ── Shared inspector controls ─────────────────────────────────────────────

export { InspectorSelect } from "../../ui_primitives";

/** Timeline rows keep the shared switch styling in the inline field layout. */
export const InspectorToggleRow = memo(function InspectorToggleRow(props: InspectorToggleRowProps) {
  return <SharedInspectorToggleRow {...props} layout="inline" />;
});

/** Timeline adapter supplies undo batching to the shared value input. */
export const InspectorPillInput = memo(function InspectorPillInput(
  props: Omit<InspectorValueInputProps, "scrubGesture">
) {
  const gesture = useBatchedGesture(props.onCommit);
  return <InspectorValueInput {...props} scrubGesture={gesture} />;
});

// ── Slider row ─────────────────────────────────────────────────────────────

const sliderRowStyles = (theme: Theme) =>
  css({
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(2),
    minHeight: 24,
    padding: `0 ${getSpacingPx(SPACING.xs)}`
  });

const sliderLabelStyles = (theme: Theme) =>
  css({
    flex: "0 1 auto",
    minWidth: 60,
    color: theme.vars.palette.text.secondary,
    ...TYPOGRAPHY.sans.label,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  });

const sliderTrackStyles = css({
  flex: "1 1 60px",
  minWidth: 60,
  display: "flex",
  alignItems: "center"
});

const sliderValueStyles = (theme: Theme) =>
  css({
    flex: "0 0 44px",
    ...TYPOGRAPHY.mono.label,
    color: theme.vars.palette.text.secondary,
    textAlign: "right",
    fontVariantNumeric: "tabular-nums"
  });

/**
 * Precision slider styling, Lightroom/Premiere register: a thin rail, a small
 * round handle, and a filled segment that originates from the neutral value
 * (driven by the `--fill-*` CSS vars set on the wrapper) rather than always
 * from the left edge. `track={false}` suppresses MUI's own left-anchored fill;
 * the rail's gradient draws the bipolar fill instead, and a faint tick marks
 * the neutral point.
 */
const precisionSliderSx = (theme: Theme) => {
  const rail = "rgba(255, 255, 255, 0.14)";
  const accent = theme.vars.palette.primary.main;
  const ring = theme.vars.palette.primary.mainChannel;
  const shadow = `0 1px 2px rgba(${theme.vars.palette.common.blackChannel} / 0.45)`;
  return {
    marginTop: 0,
    padding: `${getSpacingPx(SPACING.sm)} 0`,
    height: 12,
    "&.Mui-disabled": { opacity: 0.45 },
    "& .MuiSlider-rail": {
      height: 2,
      borderRadius: BORDER_RADIUS.pill,
      opacity: 1,
      background: `linear-gradient(to right, ${rail} 0, ${rail} var(--fill-lo, 0%), ${accent} var(--fill-lo, 0%), ${accent} var(--fill-hi, 0%), ${rail} var(--fill-hi, 0%), ${rail} 100%)`,
      // Neutral-point tick (shown only for bipolar sliders via --fill-show-tick).
      "&::before": {
        content: '""',
        position: "absolute",
        left: "var(--fill-origin, 0%)",
        top: "50%",
        width: 2,
        height: 6,
        transform: "translate(-50%, -50%)",
        borderRadius: BORDER_RADIUS.pill,
        backgroundColor: theme.vars.palette.text.disabled,
        opacity: "var(--fill-show-tick, 0)",
        pointerEvents: "none"
      }
    },
    "& .MuiSlider-thumb": {
      width: 10,
      height: 10,
      borderRadius: BORDER_RADIUS.circle,
      backgroundColor: theme.vars.palette.text.primary,
      border: `1px solid rgba(${theme.vars.palette.common.blackChannel} / 0.28)`,
      boxShadow: shadow,
      transition: MOTION.shadow,
      "&:hover": {
        boxShadow: `${shadow}, 0 0 0 4px rgba(${ring} / 0.18)`
      },
      "&.Mui-focusVisible, &.Mui-active": {
        boxShadow: `${shadow}, 0 0 0 5px rgba(${ring} / 0.3)`
      },
      // Suppress MUI's value-label ripple pseudo-elements.
      "&::before, &::after": { display: "none" }
    },
    ...reducedMotion({ "& .MuiSlider-thumb": { transition: MOTION.none } })
  };
};

interface InspectorSliderRowProps {
  label: string;
  value: number;
  /** Formatted readout shown right of the slider, e.g. "0.50", "45°", "80%". */
  display: string;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  /**
   * Neutral/default value. When set, the filled portion of the rail originates
   * here instead of the left edge (bipolar, Lightroom-style), a tick marks the
   * neutral point, and double-clicking the rail resets the value to it.
   */
  origin?: number;
  /**
   * Double-click reset target when the default sits at an end of the range
   * (opacity 1, strength 1) and a fill from that end would read backwards.
   * Defaults to `origin`.
   */
  resetValue?: number;
}

/** Label + full-width precision slider + mono value readout. */
export const InspectorSliderRow: React.FC<InspectorSliderRowProps> = memo(
  ({ label, value, display, min, max, step, disabled, onChange, origin, resetValue }) => {
    const theme = useTheme();
    const sliderSx = useMemo(() => precisionSliderSx(theme), [theme]);
    const gesture = useBatchedGesture(onChange);

    const handleChange = useCallback(
      (_e: Event, next: number | number[]) => {
        gesture.schedule(Array.isArray(next) ? next[0] : next);
      },
      [gesture]
    );

    const handleChangeCommitted = useCallback(
      (_e: React.SyntheticEvent | Event, next: number | number[]) => {
        gesture.commit(Array.isArray(next) ? next[0] : next);
      },
      [gesture]
    );

    const span = max - min || 1;
    const toPct = (v: number) =>
      ((Math.min(max, Math.max(min, v)) - min) / span) * 100;
    const valuePct = toPct(value);
    const originPct = toPct(origin ?? min);
    const showTick = origin !== undefined && origin > min && origin < max;

    const fillVars = {
      "--fill-lo": `${Math.min(originPct, valuePct)}%`,
      "--fill-hi": `${Math.max(originPct, valuePct)}%`,
      "--fill-origin": `${originPct}%`,
      "--fill-show-tick": showTick ? 1 : 0
    } as React.CSSProperties;

    // Double-click reset is a single, discrete write — left un-batched.
    const resetTarget = resetValue ?? origin;
    const handleReset = useCallback(() => {
      if (resetTarget !== undefined && !disabled) onChange(resetTarget);
    }, [resetTarget, disabled, onChange]);

    // Dragging the slider re-renders this row once per animation frame.
    const rowCss = useMemo(() => sliderRowStyles(theme), [theme]);
    const labelCss = useMemo(() => sliderLabelStyles(theme), [theme]);
    const valueCss = useMemo(() => sliderValueStyles(theme), [theme]);

    return (
      <div css={rowCss}>
        <span css={labelCss} title={label}>
          {label}
        </span>
        <div
          css={sliderTrackStyles}
          style={fillVars}
          onDoubleClick={resetTarget !== undefined ? handleReset : undefined}
        >
          <NodeSlider
            min={min}
            max={max}
            step={step}
            value={value}
            disabled={disabled}
            track={false}
            aria-label={label}
            sx={sliderSx}
            onChange={handleChange}
            onChangeCommitted={handleChangeCommitted}
          />
        </div>
        <span css={valueCss}>{display}</span>
      </div>
    );
  }
);
InspectorSliderRow.displayName = "InspectorSliderRow";

// ── Section title (for CollapsibleSection title prop) ──────────────────────

const sectionTitleStyles = (theme: Theme, dimmed: boolean) =>
  css({
    display: "flex",
    alignItems: "center",
    width: "100%",
    minWidth: 0,
    gap: getSpacingPx(SPACING.sm),
    color: dimmed
      ? theme.vars.palette.text.secondary
      : theme.vars.palette.text.primary,
    ...TYPOGRAPHY.sans.label,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    transition: `color ${MOTION.fast}`,
    // The reset action stays visible at half strength so it can be found
    // without hovering, and goes to full strength on header hover or keyboard
    // focus. Touch screens have no hover, so they always show it in full.
    "& .inspector-section-action": {
      opacity: 0.5,
      transition: `opacity ${MOTION.fast}`
    },
    "&:hover .inspector-section-action, & .inspector-section-action:focus-visible":
      {
        opacity: 1
      },
    "@media (hover: none)": {
      "& .inspector-section-action": { opacity: 1 }
    }
  });

const sectionTitleIconStyles = (theme: Theme) =>
  css({
    color: theme.vars.palette.text.secondary,
    display: "inline-flex",
    "& svg": { fontSize: FONT_SIZE_SANS.caption }
  });

/**
 * The activation checkbox keeps its small visual box (drawn by `::before`)
 * inside a 24px button, so the hit target meets the minimum without the
 * header growing. Negative margins stop the larger box from shifting the
 * title.
 */
const CHECKBOX_BOX = 13;
const CHECKBOX_INSET = (CONTROL.height.xs - CHECKBOX_BOX) / 2;

const sectionCheckboxStyles = (theme: Theme, checked: boolean) =>
  css({
    position: "relative",
    width: CONTROL.height.xs,
    height: CONTROL.height.xs,
    margin: -CHECKBOX_INSET,
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    cursor: "pointer",
    border: "none",
    background: "transparent",
    color: theme.vars.palette.primary.contrastText,
    "&::before": {
      content: '""',
      position: "absolute",
      inset: CHECKBOX_INSET,
      boxSizing: "border-box",
      borderRadius: BORDER_RADIUS.xs,
      border: `1px solid ${
        checked
          ? theme.vars.palette.primary.main
          : theme.vars.palette.c_overlay_strong
      }`,
      backgroundColor: checked ? theme.vars.palette.primary.main : "transparent",
      transition: `background-color ${MOTION.fast}, border-color ${MOTION.fast}`
    },
    "&:hover::before": {
      borderColor: theme.vars.palette.primary.main
    },
    "&:focus-visible": {
      outline: "none"
    },
    "&:focus-visible::before": {
      boxShadow: `0 0 0 2px rgba(${theme.vars.palette.primary.mainChannel} / 0.35)`
    },
    "& svg": { position: "relative", fontSize: FONT_SIZE_SANS.caption }
  });

const sectionActionStyles = (theme: Theme) =>
  css({
    width: CONTROL.height.xs,
    height: CONTROL.height.xs,
    flexShrink: 0,
    background: "transparent",
    border: "1px solid transparent",
    color: theme.vars.palette.text.secondary,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BORDER_RADIUS.sm,
    transition: `background-color ${MOTION.fast}, color ${MOTION.fast}`,
    "&:hover": {
      backgroundColor: theme.vars.palette.action.hover,
      color: theme.vars.palette.text.primary
    },
    "&:focus-visible": {
      outline: "none",
      borderColor: theme.vars.palette.primary.main
    },
    "&:disabled": {
      opacity: 0.4,
      cursor: "default"
    },
    "& svg": { fontSize: FONT_SIZE_SANS.label }
  });

interface InspectorSectionAction {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

interface InspectorSectionTitleProps {
  title: string;
  icon?: React.ReactNode;
  /**
   * FCP-style activation checkbox before the title: checking it toggles the
   * whole section's effect on/off without expanding the fold. The title dims
   * while unchecked.
   */
  checked?: boolean;
  onCheckedChange?: (next: boolean) => void;
  /** Hover-revealed trailing action, e.g. reset-to-defaults. */
  action?: InspectorSectionAction;
}

export const InspectorSectionTitle: React.FC<InspectorSectionTitleProps> = memo(
  ({ title, icon, checked, onCheckedChange, action }) => {
    const theme = useTheme();
    const hasCheckbox = onCheckedChange !== undefined;
    const dimmed = hasCheckbox && !checked;

    // The whole CollapsibleSection header toggles the fold on click and on
    // Enter/Space, so inner controls must stop those events from bubbling.
    const stopKeyToggle = (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.stopPropagation();
      }
    };

    return (
      <span css={sectionTitleStyles(theme, dimmed)}>
        {hasCheckbox && (
          <button
            type="button"
            role="checkbox"
            aria-checked={!!checked}
            aria-label={`${title} enabled`}
            css={sectionCheckboxStyles(theme, !!checked)}
            onClick={(e) => {
              e.stopPropagation();
              onCheckedChange(!checked);
            }}
            onKeyDown={stopKeyToggle}
          >
            {checked && <CheckRoundedIcon />}
          </button>
        )}
        {icon && <span css={sectionTitleIconStyles(theme)}>{icon}</span>}
        <span
          style={{
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}
        >
          {title}
        </span>
        <span style={{ flex: "1 1 auto" }} />
        {action && (
          <Tooltip title={action.label}>
            {/* span keeps the tooltip working while the button is disabled */}
            <span style={{ display: "inline-flex" }}>
              <button
                type="button"
                className="inspector-section-action"
                css={sectionActionStyles(theme)}
                aria-label={action.label}
                disabled={action.disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  action.onClick();
                }}
                onKeyDown={stopKeyToggle}
              >
                {action.icon}
              </button>
            </span>
          </Tooltip>
        )}
      </span>
    );
  }
);
InspectorSectionTitle.displayName = "InspectorSectionTitle";

// ── Section divider ────────────────────────────────────────────────────────

export const InspectorDivider: React.FC = memo(() => {
  const theme = useTheme();
  return (
    <div
      style={{
        height: 1,
        backgroundColor: theme.vars.palette.divider,
        margin: `${getSpacingPx(SPACING.xs)} 0`
      }}
      role="separator"
    />
  );
});
InspectorDivider.displayName = "InspectorDivider";
