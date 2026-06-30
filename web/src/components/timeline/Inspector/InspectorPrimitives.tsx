/** @jsxImportSource @emotion/react */
/**
 * Inspector primitives
 *
 * Small visual building blocks used by `TimelineInspector` and its child
 * panels to keep the inspector's distinctive look (eyebrow header, identity
 * card, label-on-left + value-pill rows, iOS-style switches) consistent
 * without leaking these styles into the project-wide `ui_primitives`.
 */

import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState
} from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { NodeSlider, Tooltip, MOTION, BORDER_RADIUS, FONT_SIZE_SANS, FONT_SIZE_MONO, FONT_WEIGHT, SPACING, getSpacingPx, reducedMotion, Switch } from "../../ui_primitives";

// ── Header ─────────────────────────────────────────────────────────────────

const headerStyles = css({
  display: "flex",
  alignItems: "center",
  gap: 8,
  height: 36,
  padding: `0 ${getSpacingPx(SPACING.xs)} 0 ${getSpacingPx(SPACING.xs)}`
});

const eyebrowStyles = (theme: Theme) =>
  css({
    flex: "1 1 auto",
    color: theme.vars.palette.text.secondary,
    fontSize: FONT_SIZE_SANS.caption,
    fontWeight: FONT_WEIGHT.semibold,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    userSelect: "none"
  });

const headerActionsStyles = css({
  display: "inline-flex",
  alignItems: "center",
  gap: 2
});

const headerIconButtonStyles = (theme: Theme) =>
  css({
    width: 28,
    height: 26,
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
      fontSize: 16
    }
  });

export interface InspectorHeaderAction {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "default" | "danger";
}

export interface InspectorHeaderProps {
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
    gap: theme.spacing(1.5),
    padding: theme.spacing(3, 1, 4)
  });

const identityNameStyles = (theme: Theme) =>
  css({
    fontFamily:
      "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: FONT_SIZE_MONO.strong,
    fontWeight: FONT_WEIGHT.medium,
    color: theme.vars.palette.text.primary,
    lineHeight: 1.3,
    wordBreak: "break-all"
  });

const identityMetaRowStyles = css({
  display: "flex",
  alignItems: "center",
  gap: 6
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
    fontSize: FONT_SIZE_MONO.code,
    lineHeight: 1.3
  });

export interface ClipIdentityCardProps {
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

const rowStyles = css({
  display: "flex",
  alignItems: "center",
  gap: 8,
  minHeight: 32,
  padding: `0 ${getSpacingPx(SPACING.xs)}`
});

const rowLabelStyles = (theme: Theme) =>
  css({
    flex: "1 1 auto",
    minWidth: 0,
    color: theme.vars.palette.text.secondary,
    fontSize: FONT_SIZE_SANS.label,
    fontWeight: FONT_WEIGHT.normal,
    lineHeight: 1.3
  });

const rowControlStyles = css({
  flex: "0 0 auto",
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 6,
  minWidth: 120
});

export interface InspectorRowProps {
  label: React.ReactNode;
  children: React.ReactNode;
  htmlFor?: string;
}

export const InspectorRow: React.FC<InspectorRowProps> = memo(
  ({ label, children, htmlFor }) => {
    const theme = useTheme();
    return (
      <div css={rowStyles}>
        {htmlFor ? (
          <label css={rowLabelStyles(theme)} htmlFor={htmlFor}>
            {label}
          </label>
        ) : (
          <span css={rowLabelStyles(theme)}>{label}</span>
        )}
        <div css={rowControlStyles}>{children}</div>
      </div>
    );
  }
);
InspectorRow.displayName = "InspectorRow";

// ── Static value ───────────────────────────────────────────────────────────

const staticValueStyles = (theme: Theme) =>
  css({
    fontFamily:
      "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: FONT_SIZE_MONO.code,
    fontWeight: FONT_WEIGHT.medium,
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

// ── Pill input ─────────────────────────────────────────────────────────────

const pillWrapStyles = (theme: Theme, disabled: boolean, focused: boolean) =>
  css({
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    height: 28,
    padding: theme.spacing(0, 3),
    backgroundColor: theme.vars.palette.background.default,
    border: `1px solid ${
      focused ? theme.vars.palette.primary.main : theme.vars.palette.c_overlay
    }`,
    borderRadius: BORDER_RADIUS.md,
    minWidth: 92,
    justifyContent: "flex-end",
    opacity: disabled ? 0.5 : 1,
    transition: `border-color ${MOTION.fast}`,
    "&:hover": {
      borderColor: focused
        ? theme.vars.palette.primary.main
        : theme.vars.palette.divider
    }
  });

const pillInputStyles = (theme: Theme) =>
  css({
    flex: "1 1 auto",
    minWidth: 0,
    background: "transparent",
    border: "none",
    outline: "none",
    color: theme.vars.palette.text.primary,
    fontFamily:
      "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: FONT_SIZE_MONO.code,
    fontWeight: FONT_WEIGHT.medium,
    letterSpacing: "0",
    textAlign: "right",
    padding: 0,
    width: "100%"
  });

const pillUnitStyles = (theme: Theme) =>
  css({
    color: theme.vars.palette.text.secondary,
    fontFamily:
      "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: FONT_SIZE_MONO.caption,
    fontWeight: FONT_WEIGHT.medium,
    flexShrink: 0
  });

export interface InspectorPillInputProps {
  value: string;
  onCommit: (raw: string) => void;
  /** Small trailing unit token, e.g. "s", "×", "px". */
  unit?: string;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  id?: string;
  /** Optional minWidth override for the pill (for long timecodes etc.). */
  minWidth?: number;
}

export const InspectorPillInput = memo(
  forwardRef<HTMLInputElement, InspectorPillInputProps>(
    function InspectorPillInput(
      {
        value,
        onCommit,
        unit,
        placeholder,
        disabled = false,
        ariaLabel,
        id,
        minWidth
      },
      ref
    ) {
      const theme = useTheme();
      const [draft, setDraft] = useState(value);
      const [focused, setFocused] = useState(false);

      useEffect(() => {
        if (!focused) {
          setDraft(value);
        }
      }, [value, focused]);

      const commit = useCallback(() => {
        if (draft !== value) {
          onCommit(draft);
        }
      }, [draft, value, onCommit]);

      const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
          if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "Escape") {
            setDraft(value);
            (e.target as HTMLInputElement).blur();
          }
        },
        [value]
      );

      return (
        <div
          css={pillWrapStyles(theme, disabled, focused)}
          style={minWidth ? { minWidth } : undefined}
        >
          <input
            id={id}
            ref={ref}
            type="text"
            css={pillInputStyles(theme)}
            value={draft}
            placeholder={placeholder}
            disabled={disabled}
            aria-label={ariaLabel}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              commit();
            }}
            onKeyDown={handleKeyDown}
          />
          {unit && <span css={pillUnitStyles(theme)}>{unit}</span>}
        </div>
      );
    }
  )
);

// ── Toggle row ─────────────────────────────────────────────────────────────

const toggleSwitchSx = {
  width: 36,
  height: 20,
  padding: 0,
  "& .MuiSwitch-switchBase": {
    padding: 0,
    margin: getSpacingPx(SPACING.micro),
    transitionDuration: "180ms",
    "&.Mui-checked": {
      transform: "translateX(16px)",
      color: "var(--palette-primary-contrastText)",
      "& + .MuiSwitch-track": {
        backgroundColor: "var(--palette-primary-main)",
        opacity: 1,
        border: 0
      }
    }
  },
  "& .MuiSwitch-thumb": {
    boxSizing: "border-box",
    width: 16,
    height: 16,
    boxShadow: "0 1px 2px var(--palette-c_scrim)"
  },
  "& .MuiSwitch-track": {
    borderRadius: BORDER_RADIUS.pill,
    backgroundColor: "var(--palette-c_overlay_strong)",
    opacity: 1
  }
} as const;

export interface InspectorToggleRowProps {
  label: React.ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}

export const InspectorToggleRow: React.FC<InspectorToggleRowProps> = memo(
  ({ label, checked, onChange, disabled }) => {
    const id = useId();
    return (
      <InspectorRow label={label} htmlFor={id}>
        <Switch
          id={id}
          size="small"
          checked={checked}
          disabled={disabled}
          onChange={(_e, next) => onChange(next)}
          sx={toggleSwitchSx}
        />
      </InspectorRow>
    );
  }
);
InspectorToggleRow.displayName = "InspectorToggleRow";

// ── Slider row ─────────────────────────────────────────────────────────────

const sliderRowStyles = (theme: Theme) =>
  css({
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(3),
    minHeight: 32,
    padding: `0 ${getSpacingPx(SPACING.xs)}`
  });

const sliderLabelStyles = (theme: Theme) =>
  css({
    flex: "0 1 auto",
    minWidth: 56,
    color: theme.vars.palette.text.secondary,
    fontSize: FONT_SIZE_SANS.label,
    fontWeight: FONT_WEIGHT.normal,
    lineHeight: 1.3,
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
    flex: "0 0 48px",
    fontFamily:
      "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: FONT_SIZE_MONO.caption,
    fontWeight: FONT_WEIGHT.medium,
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
  return {
    marginTop: 0,
    padding: `${getSpacingPx(SPACING.md)} 0`,
    height: 16,
    "&.Mui-disabled": { opacity: 0.45 },
    "& .MuiSlider-rail": {
      height: 3,
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
        height: 8,
        transform: "translate(-50%, -50%)",
        borderRadius: BORDER_RADIUS.pill,
        backgroundColor: theme.vars.palette.text.disabled,
        opacity: "var(--fill-show-tick, 0)",
        pointerEvents: "none"
      }
    },
    "& .MuiSlider-thumb": {
      width: 12,
      height: 12,
      borderRadius: BORDER_RADIUS.circle,
      backgroundColor: theme.vars.palette.text.primary,
      border: `1px solid rgba(${theme.vars.palette.common.blackChannel} / 0.28)`,
      boxShadow: "0 1px 2px rgba(0, 0, 0, 0.45)",
      transition: MOTION.shadow,
      "&:hover": {
        boxShadow: `0 1px 2px rgba(0, 0, 0, 0.45), 0 0 0 4px rgba(${ring} / 0.18)`
      },
      "&.Mui-focusVisible, &.Mui-active": {
        boxShadow: `0 1px 2px rgba(0, 0, 0, 0.45), 0 0 0 5px rgba(${ring} / 0.3)`
      },
      // Suppress MUI's value-label ripple pseudo-elements.
      "&::before, &::after": { display: "none" }
    },
    ...reducedMotion({ "& .MuiSlider-thumb": { transition: MOTION.none } })
  };
};

export interface InspectorSliderRowProps {
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
}

/** Label + full-width precision slider + mono value readout. */
export const InspectorSliderRow: React.FC<InspectorSliderRowProps> = memo(
  ({ label, value, display, min, max, step, disabled, onChange, origin }) => {
    const theme = useTheme();
    const sliderSx = useMemo(() => precisionSliderSx(theme), [theme]);

    const span = max - min || 1;
    const toPct = (v: number) =>
      ((Math.min(max, Math.max(min, v)) - min) / span) * 100;
    const valuePct = toPct(value);
    const originPct = toPct(origin ?? min);
    const showTick =
      origin !== undefined && origin > min && origin < max;

    const fillVars = {
      "--fill-lo": `${Math.min(originPct, valuePct)}%`,
      "--fill-hi": `${Math.max(originPct, valuePct)}%`,
      "--fill-origin": `${originPct}%`,
      "--fill-show-tick": showTick ? 1 : 0
    } as React.CSSProperties;

    const handleReset = useCallback(() => {
      if (origin !== undefined) onChange(origin);
    }, [origin, onChange]);

    return (
      <div css={sliderRowStyles(theme)}>
        <span css={sliderLabelStyles(theme)} title={label}>
          {label}
        </span>
        <div
          css={sliderTrackStyles}
          style={fillVars}
          onDoubleClick={origin !== undefined ? handleReset : undefined}
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
            onChange={(_e, next) =>
              onChange(Array.isArray(next) ? next[0] : next)
            }
          />
        </div>
        <span css={sliderValueStyles(theme)}>{display}</span>
      </div>
    );
  }
);
InspectorSliderRow.displayName = "InspectorSliderRow";

// ── Section title (for CollapsibleSection title prop) ──────────────────────

const sectionTitleStyles = (theme: Theme) =>
  css({
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    color: theme.vars.palette.text.primary,
    fontSize: FONT_SIZE_SANS.body,
    fontWeight: FONT_WEIGHT.medium,
    letterSpacing: "-0.005em"
  });

const sectionTitleIconStyles = (theme: Theme) =>
  css({
    color: theme.vars.palette.text.secondary,
    display: "inline-flex",
    "& svg": { fontSize: 14 }
  });

export interface InspectorSectionTitleProps {
  title: string;
  icon?: React.ReactNode;
}

export const InspectorSectionTitle: React.FC<InspectorSectionTitleProps> = memo(
  ({ title, icon }) => {
    const theme = useTheme();
    return (
      <span css={sectionTitleStyles(theme)}>
        {icon && <span css={sectionTitleIconStyles(theme)}>{icon}</span>}
        {title}
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
