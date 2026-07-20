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
  useRef,
  useState
} from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import { NodeSlider, Tooltip, MOTION, BORDER_RADIUS, FONT_SIZE_SANS, FONT_SIZE_MONO, FONT_WEIGHT, SPACING, getSpacingPx, reducedMotion, SelectField, Switch, type SelectOption } from "../../ui_primitives";
import { useTimelineHistoryBatch } from "../../../stores/timeline/useTimelineHistoryBatch";

// ── Header ─────────────────────────────────────────────────────────────────

const headerStyles = css({
  display: "flex",
  alignItems: "center",
  gap: 8,
  height: 32,
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
    width: 24,
    height: 20,
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
      fontSize: 14
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
    gap: theme.spacing(1),
    padding: theme.spacing(2, 1, 2.5)
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
    fontSize: FONT_SIZE_MONO.caption,
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
  gap: 6,
  minHeight: 24,
  padding: `0 ${getSpacingPx(SPACING.xs)}`
});

const rowLabelStyles = (theme: Theme) =>
  css({
    flex: "1 1 auto",
    minWidth: 0,
    color: theme.vars.palette.text.secondary,
    fontSize: FONT_SIZE_SANS.caption,
    fontWeight: FONT_WEIGHT.normal,
    lineHeight: 1.3
  });

const rowControlStyles = css({
  flex: "0 0 auto",
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 4,
  minWidth: 110
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
    fontSize: FONT_SIZE_MONO.caption,
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

const pillWrapStyles = (
  theme: Theme,
  disabled: boolean,
  focused: boolean,
  scrubbable: boolean
) =>
  css({
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    height: 20,
    padding: theme.spacing(0, 2),
    backgroundColor: theme.vars.palette.background.default,
    border: `1px solid ${
      focused ? theme.vars.palette.primary.main : theme.vars.palette.c_overlay
    }`,
    borderRadius: BORDER_RADIUS.sm,
    minWidth: 64,
    justifyContent: "flex-end",
    opacity: disabled ? 0.5 : 1,
    transition: `border-color ${MOTION.fast}`,
    // Value scrubbing (drag left/right) — the horizontal-resize cursor is the
    // affordance, matching FCP/AE numeric fields.
    cursor: scrubbable && !focused && !disabled ? "ew-resize" : undefined,
    touchAction: scrubbable ? "none" : undefined,
    "&:hover": {
      borderColor: focused
        ? theme.vars.palette.primary.main
        : theme.vars.palette.divider
    }
  });

const pillInputStyles = (theme: Theme, scrubbable: boolean, focused: boolean) =>
  css({
    flex: "1 1 auto",
    minWidth: 0,
    background: "transparent",
    border: "none",
    outline: "none",
    color: theme.vars.palette.text.primary,
    fontFamily:
      "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: FONT_SIZE_MONO.caption,
    fontWeight: FONT_WEIGHT.medium,
    letterSpacing: "0",
    textAlign: "right",
    padding: 0,
    width: "100%",
    cursor: scrubbable && !focused ? "ew-resize" : undefined
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

export interface InspectorPillScrub {
  /** Value change per horizontal pixel dragged. Shift ×10, Alt ×0.1. */
  step: number;
  min?: number;
  max?: number;
}

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
  /**
   * FCP-style value scrubbing: drag horizontally on the field to change the
   * value; a plain click still focuses it for typing. Only for fields whose
   * `value` parses as a plain number (not timecodes).
   */
  scrub?: InspectorPillScrub;
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
        minWidth,
        scrub
      },
      ref
    ) {
      const theme = useTheme();
      const [draft, setDraft] = useState(value);
      const [focused, setFocused] = useState(false);

      const inputRef = useRef<HTMLInputElement | null>(null);
      const setRefs = useCallback(
        (node: HTMLInputElement | null) => {
          inputRef.current = node;
          if (typeof ref === "function") {
            ref(node);
          } else if (ref) {
            ref.current = node;
          }
        },
        [ref]
      );

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

      // ── Scrub gesture ────────────────────────────────────────────────────
      // Drag scrubs; a click without movement focuses the input for typing.
      // pointerdown preventDefault stops the native focus so the drag doesn't
      // enter edit mode; store writes are rAF-coalesced and wrapped in one
      // undo batch, same as InspectorSliderRow.

      const history = useTimelineHistoryBatch();
      const onCommitRef = useRef(onCommit);
      onCommitRef.current = onCommit;
      const gestureRef = useRef<{
        pointerId: number;
        startX: number;
        startValue: number;
        moved: boolean;
      } | null>(null);
      const pendingRef = useRef<string | null>(null);
      const rafIdRef = useRef<number | null>(null);

      const scrubDecimals = useMemo(() => {
        if (!scrub) return 0;
        return (String(scrub.step).split(".")[1] ?? "").length;
      }, [scrub]);

      const flushScrub = useCallback(() => {
        rafIdRef.current = null;
        if (pendingRef.current === null) return;
        const next = pendingRef.current;
        pendingRef.current = null;
        onCommitRef.current(next);
        history.mark();
      }, [history]);

      const handlePointerDown = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
          if (!scrub || disabled || focused || e.button !== 0) return;
          const start = parseFloat(value);
          if (!Number.isFinite(start)) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          gestureRef.current = {
            pointerId: e.pointerId,
            startX: e.clientX,
            startValue: start,
            moved: false
          };
        },
        [scrub, disabled, focused, value]
      );

      const handlePointerMove = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
          const gesture = gestureRef.current;
          if (!gesture || !scrub) return;
          const dx = e.clientX - gesture.startX;
          if (!gesture.moved) {
            if (Math.abs(dx) < 3) return;
            gesture.moved = true;
            history.begin();
          }
          const multiplier = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
          let next = gesture.startValue + dx * scrub.step * multiplier;
          if (scrub.min != null) next = Math.max(scrub.min, next);
          if (scrub.max != null) next = Math.min(scrub.max, next);
          const formatted = next.toFixed(scrubDecimals);
          setDraft(formatted);
          pendingRef.current = formatted;
          if (rafIdRef.current === null) {
            rafIdRef.current = requestAnimationFrame(flushScrub);
          }
        },
        [scrub, scrubDecimals, history, flushScrub]
      );

      const handlePointerUp = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
          const gesture = gestureRef.current;
          if (!gesture || gesture.pointerId !== e.pointerId) return;
          gestureRef.current = null;
          if (gesture.moved) {
            if (rafIdRef.current !== null) {
              cancelAnimationFrame(rafIdRef.current);
              rafIdRef.current = null;
            }
            if (pendingRef.current !== null) {
              const next = pendingRef.current;
              pendingRef.current = null;
              onCommitRef.current(next);
              history.mark();
            }
            history.end();
          } else {
            inputRef.current?.focus();
            inputRef.current?.select();
          }
        },
        [history]
      );

      useEffect(() => {
        return () => {
          if (rafIdRef.current !== null) {
            cancelAnimationFrame(rafIdRef.current);
          }
        };
      }, []);

      return (
        <div
          css={pillWrapStyles(theme, disabled, focused, !!scrub)}
          style={minWidth ? { minWidth } : undefined}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <input
            id={id}
            ref={setRefs}
            type="text"
            // size=1 kills the input's ~20-char intrinsic width so the pill
            // sizes from minWidth instead of overflowing narrow panels.
            size={1}
            css={pillInputStyles(theme, !!scrub, focused)}
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

// ── Select ─────────────────────────────────────────────────────────────────

const inspectorSelectStyles = (theme: Theme) =>
  css({
    minWidth: 92,
    "& .MuiInputBase-root": {
      minHeight: 20
    },
    "& .MuiSelect-select": {
      minHeight: 20,
      height: 20,
      padding: `0 ${getSpacingPx(SPACING.lg)} 0 ${getSpacingPx(SPACING.sm)}`,
      fontFamily:
        "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: FONT_SIZE_MONO.caption,
      fontWeight: FONT_WEIGHT.medium,
      backgroundColor: theme.vars.palette.background.default
    },
    "& .MuiOutlinedInput-notchedOutline": {
      borderColor: theme.vars.palette.c_overlay,
      borderRadius: BORDER_RADIUS.sm
    },
    "&:hover .MuiOutlinedInput-notchedOutline": {
      borderColor: theme.vars.palette.divider
    },
    "& .MuiSelect-icon": {
      fontSize: 14,
      right: 2
    }
  });

export interface InspectorSelectProps {
  /** Accessible name — the visible label lives on the enclosing row. */
  label: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Fill the available width instead of sizing to the pill minimum. */
  grow?: boolean;
}

/**
 * Pill-register select for inspector rows, matching `InspectorPillInput`'s
 * 20px height and mono caption. Wraps the shared `SelectField` primitive —
 * `NodeSelect` is for the node canvas only.
 */
export const InspectorSelect: React.FC<InspectorSelectProps> = memo(
  ({ label, value, options, onChange, disabled, grow }) => {
    const theme = useTheme();
    return (
      <SelectField
        label={label}
        hideLabel
        size="small"
        value={value}
        options={options}
        onChange={onChange}
        disabled={disabled}
        css={[
          inspectorSelectStyles(theme),
          grow && css({ flex: "1 1 auto", minWidth: 0 })
        ]}
      />
    );
  }
);
InspectorSelect.displayName = "InspectorSelect";

// ── Toggle row ─────────────────────────────────────────────────────────────

const toggleSwitchSx = {
  width: 28,
  height: 16,
  padding: 0,
  "& .MuiSwitch-switchBase": {
    padding: 0,
    margin: getSpacingPx(SPACING.micro),
    transitionDuration: "var(--motion-normal)",
    "&.Mui-checked": {
      transform: "translateX(12px)",
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
    width: 12,
    height: 12,
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
    gap: theme.spacing(2),
    minHeight: 24,
    padding: `0 ${getSpacingPx(SPACING.xs)}`
  });

const sliderLabelStyles = (theme: Theme) =>
  css({
    flex: "0 1 auto",
    minWidth: 60,
    color: theme.vars.palette.text.secondary,
    fontSize: FONT_SIZE_SANS.caption,
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
    flex: "0 0 44px",
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
    const history = useTimelineHistoryBatch();

    // Gesture state: pointermove/key-repeat onChange ticks are coalesced to
    // one store write per animation frame; onChangeCommitted flushes the
    // final value and closes the undo batch. See useTimelineHistoryBatch for
    // why a single arrow-key press (onChange immediately followed by
    // onChangeCommitted, both synchronous) still yields exactly one entry:
    // the pending rAF write never fires because onChangeCommitted cancels it
    // and applies the value itself before the frame runs.
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const gestureActiveRef = useRef(false);
    const pendingValueRef = useRef<number | null>(null);
    const rafIdRef = useRef<number | null>(null);

    const flush = useCallback(() => {
      rafIdRef.current = null;
      if (pendingValueRef.current === null) return;
      const next = pendingValueRef.current;
      pendingValueRef.current = null;
      onChangeRef.current(next);
      history.mark();
    }, [history]);

    const handleChange = useCallback(
      (_e: Event, next: number | number[]) => {
        const value = Array.isArray(next) ? next[0] : next;
        if (!gestureActiveRef.current) {
          gestureActiveRef.current = true;
          history.begin();
        }
        pendingValueRef.current = value;
        if (rafIdRef.current === null) {
          rafIdRef.current = requestAnimationFrame(flush);
        }
      },
      [history, flush]
    );

    const handleChangeCommitted = useCallback(
      (_e: React.SyntheticEvent | Event, next: number | number[]) => {
        const value = Array.isArray(next) ? next[0] : next;
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        pendingValueRef.current = null;
        onChangeRef.current(value);
        history.mark();
        history.end();
        gestureActiveRef.current = false;
      },
      [history]
    );

    useEffect(() => {
      return () => {
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
        }
      };
    }, []);

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

    // Double-click reset is a single, discrete write — left un-batched.
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
            onChange={handleChange}
            onChangeCommitted={handleChangeCommitted}
          />
        </div>
        <span css={sliderValueStyles(theme)}>{display}</span>
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
    gap: 6,
    color: dimmed
      ? theme.vars.palette.text.disabled
      : theme.vars.palette.text.primary,
    fontSize: FONT_SIZE_SANS.caption,
    fontWeight: FONT_WEIGHT.semibold,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    transition: `color ${MOTION.fast}`,
    // Reset action stays hidden until the header is hovered or the button
    // itself is keyboard-focused (FCP reveals per-section controls on hover).
    "& .inspector-section-action": {
      opacity: 0,
      transition: `opacity ${MOTION.fast}`
    },
    "&:hover .inspector-section-action, & .inspector-section-action:focus-visible":
      {
        opacity: 1
      }
  });

const sectionTitleIconStyles = (theme: Theme) =>
  css({
    color: theme.vars.palette.text.secondary,
    display: "inline-flex",
    "& svg": { fontSize: 12 }
  });

const sectionCheckboxStyles = (theme: Theme, checked: boolean) =>
  css({
    width: 13,
    height: 13,
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    cursor: "pointer",
    borderRadius: BORDER_RADIUS.xs,
    border: `1px solid ${
      checked
        ? theme.vars.palette.primary.main
        : theme.vars.palette.c_overlay_strong
    }`,
    backgroundColor: checked ? theme.vars.palette.primary.main : "transparent",
    color: theme.vars.palette.primary.contrastText,
    transition: `background-color ${MOTION.fast}, border-color ${MOTION.fast}`,
    "&:hover": {
      borderColor: theme.vars.palette.primary.main
    },
    "&:focus-visible": {
      outline: "none",
      boxShadow: `0 0 0 2px rgba(${theme.vars.palette.primary.mainChannel} / 0.35)`
    },
    "& svg": { fontSize: 11 }
  });

const sectionActionStyles = (theme: Theme) =>
  css({
    width: 22,
    height: 18,
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
    "& svg": { fontSize: 13 }
  });

export interface InspectorSectionAction {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export interface InspectorSectionTitleProps {
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
