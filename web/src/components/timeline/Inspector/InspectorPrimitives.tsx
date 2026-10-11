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
import {
  Box,
  Divider,
  EYEBROW,
  FlexRow,
  NodeSlider,
  ToolbarIconButton,
  CONTROL,
  MOTION,
  BORDER_RADIUS,
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

/**
 * Body of a generation section (AI edit, Extend, Image to video): a form of
 * labeled full-width fields, so it spans the section instead of indenting past
 * the icon like the property rows above.
 */
export const INSPECTOR_FORM_SX = {
  gap: SPACING.md,
  pt: SPACING.xs,
  px: SPACING.xs,
  pb: SPACING.lg
} as const;

// ── Header ─────────────────────────────────────────────────────────────────

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
  ({ eyebrow, actions }) => (
    <FlexRow align="center" gap={SPACING.md} sx={{ height: CONTROL.height.md, px: SPACING.xs }}>
      <Box component="span" sx={{ ...EYEBROW, flex: "1 1 auto", color: "text.secondary", userSelect: "none" }}>
        {eyebrow}
      </Box>
      {actions && actions.length > 0 && (
        <FlexRow align="center" gap={SPACING.micro}>
          {actions.map((action) => (
            <ToolbarIconButton
              key={action.label}
              icon={action.icon}
              tooltip={action.label}
              size="small"
              variant={action.variant === "danger" ? "error" : "default"}
              onClick={action.onClick}
              disabled={action.disabled}
            />
          ))}
        </FlexRow>
      )}
    </FlexRow>
  )
);
InspectorHeader.displayName = "InspectorHeader";

// ── Identity card ──────────────────────────────────────────────────────────

const identityWrapStyles = css({
  display: "flex",
  flexDirection: "column",
  gap: getSpacingPx(SPACING.xs),
  padding: `${getSpacingPx(SPACING.sm)} ${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.lg)}`
});

const identityNameStyles = (theme: Theme) =>
  css({
    ...TYPOGRAPHY.sans.label,
    color: theme.vars.palette.text.primary,
    overflowWrap: "anywhere"
  });

const identityMetaRowStyles = css({
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: getSpacingPx(SPACING.sm)
});

const identitySwatchStyles = (color: string) =>
  css({
    width: getSpacingPx(SPACING.md),
    height: getSpacingPx(SPACING.md),
    borderRadius: BORDER_RADIUS.circle,
    flexShrink: 0,
    backgroundColor: color
  });

const identityMetaStyles = (theme: Theme) =>
  css({
    color: theme.vars.palette.text.secondary,
    ...TYPOGRAPHY.sans.label,
    fontWeight: TYPOGRAPHY.sans.body.fontWeight,
    fontVariantNumeric: "tabular-nums"
  });

interface ClipIdentityCardProps {
  name: string;
  metadata: ReadonlyArray<string>;
  /** Track-type accent shown as a small swatch beside the metadata. */
  accentColor?: string;
  /** Trailing content under the metadata, such as the storyboard link. */
  children?: React.ReactNode;
}

/** "Dawn – open ending" + "video · 14.1s" identity block. */
export const ClipIdentityCard: React.FC<ClipIdentityCardProps> = memo(
  ({ name, metadata, accentColor, children }) => {
    const theme = useTheme();
    const accent = accentColor ?? theme.vars.palette.secondary.main;
    return (
      <div css={identityWrapStyles}>
        <div css={identityNameStyles(theme)} title={name}>
          {name}
        </div>
        {metadata.length > 0 && (
          <div css={identityMetaRowStyles}>
            <span css={identitySwatchStyles(accent)} aria-hidden />
            <span css={identityMetaStyles(theme)}>{metadata.join(" · ")}</span>
          </div>
        )}
        {children}
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
  const rail = theme.vars.palette.c_overlay_strong;
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

export { InspectorSectionTitle } from "../../ui_primitives";

// ── Section divider ────────────────────────────────────────────────────────

export const InspectorDivider: React.FC = memo(() => <Divider spacing="normal" />);
InspectorDivider.displayName = "InspectorDivider";
