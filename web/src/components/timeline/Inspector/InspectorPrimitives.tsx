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
  Slider,
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

// A card sets the identity block (a clip, a shot) apart from the section list
// below it.
const inspectorCardStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    gap: getSpacingPx(SPACING.xs),
    padding: getSpacingPx(SPACING.md),
    marginBottom: getSpacingPx(SPACING.md),
    backgroundColor: theme.vars.palette.background.paper,
    border: `1px solid ${theme.vars.palette.divider}`,
    borderRadius: BORDER_RADIUS.lg
  });

/** The card at the top of an inspector panel that names what it edits. */
export const InspectorCard: React.FC<{ children: React.ReactNode }> = memo(
  ({ children }) => {
    const theme = useTheme();
    return <div css={inspectorCardStyles(theme)}>{children}</div>;
  }
);
InspectorCard.displayName = "InspectorCard";

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
      <InspectorCard>
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
      </InspectorCard>
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

/**
 * Label + full-width slider + mono value readout: the shared `Slider` in
 * `layout="row"`, compact. This wrapper only adds the undo-batched gesture.
 */
export const InspectorSliderRow: React.FC<InspectorSliderRowProps> = memo(
  ({ label, value, display, min, max, step, disabled, onChange, origin, resetValue }) => {
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

    return (
      <Slider
        layout="row"
        density="compact"
        label={label}
        display={display}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        origin={origin}
        aria-label={label}
        onChange={handleChange}
        onChangeCommitted={handleChangeCommitted}
        resetValue={resetValue}
        // Double-click reset is a single, discrete write — un-batched.
        onReset={onChange}
      />
    );
  }
);
InspectorSliderRow.displayName = "InspectorSliderRow";

// ── Section title (for CollapsibleSection title prop) ──────────────────────

export { InspectorSectionTitle } from "../../ui_primitives";

// ── Section divider ────────────────────────────────────────────────────────

export const InspectorDivider: React.FC = memo(() => <Divider spacing="normal" />);
InspectorDivider.displayName = "InspectorDivider";
