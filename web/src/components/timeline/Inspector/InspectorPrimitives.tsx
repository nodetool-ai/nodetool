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
  useState
} from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import Switch from "@mui/material/Switch";

import { Tooltip } from "../../ui_primitives";

// ── Header ─────────────────────────────────────────────────────────────────

const headerStyles = css({
  display: "flex",
  alignItems: "center",
  gap: 8,
  height: 36,
  padding: "0 4px 0 4px"
});

const eyebrowStyles = (theme: Theme) =>
  css({
    flex: "1 1 auto",
    color: theme.vars.palette.text.secondary,
    fontSize: 11,
    fontWeight: 600,
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
    borderRadius: 6,
    transition: "background-color 120ms, color 120ms, border-color 120ms",
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

const identityWrapStyles = css({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: "10px 4px 14px 14px"
});

const identityAccentStyles = (color: string) =>
  css({
    position: "absolute",
    left: 4,
    top: 12,
    bottom: 16,
    width: 3,
    borderRadius: 2,
    backgroundColor: color
  });

const identityNameStyles = (theme: Theme) =>
  css({
    fontFamily:
      "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 14,
    fontWeight: 500,
    color: theme.vars.palette.text.primary,
    lineHeight: 1.3,
    wordBreak: "break-all"
  });

const identityMetaStyles = (theme: Theme) =>
  css({
    color: theme.vars.palette.text.secondary,
    fontSize: 12,
    lineHeight: 1.3
  });

export interface ClipIdentityCardProps {
  name: string;
  metadata: ReadonlyArray<string>;
  /** Color of the left accent bar — usually the track-type accent. */
  accentColor?: string;
}

/** "kling_v3_out_…" + "video · 4.60s · 1920×1080" identity block. */
export const ClipIdentityCard: React.FC<ClipIdentityCardProps> = memo(
  ({ name, metadata, accentColor }) => {
    const theme = useTheme();
    const accent = accentColor ?? theme.vars.palette.secondary.main;
    return (
      <div css={identityWrapStyles}>
        <div css={identityAccentStyles(accent)} aria-hidden />
        <div css={identityNameStyles(theme)} title={name}>
          {name}
        </div>
        {metadata.length > 0 && (
          <div css={identityMetaStyles(theme)}>{metadata.join(" · ")}</div>
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
  padding: "0 4px"
});

const rowLabelStyles = (theme: Theme) =>
  css({
    flex: "1 1 auto",
    minWidth: 0,
    color: theme.vars.palette.text.secondary,
    fontSize: 13,
    fontWeight: 400,
    lineHeight: 1.3
  });

const rowControlStyles = css({
  flex: "0 0 auto",
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
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

// ── Pill input ─────────────────────────────────────────────────────────────

const pillWrapStyles = (theme: Theme, disabled: boolean, focused: boolean) =>
  css({
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    height: 28,
    padding: "0 10px",
    backgroundColor: theme.vars.palette.background.default,
    border: `1px solid ${
      focused ? theme.vars.palette.primary.main : "rgba(255, 255, 255, 0.05)"
    }`,
    borderRadius: 7,
    minWidth: 92,
    justifyContent: "flex-end",
    opacity: disabled ? 0.5 : 1,
    transition: "border-color 120ms",
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
    fontSize: 12,
    fontWeight: 500,
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
    fontSize: 11,
    fontWeight: 500,
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
    margin: "2px",
    transitionDuration: "180ms",
    "&.Mui-checked": {
      transform: "translateX(16px)",
      color: "#fff",
      "& + .MuiSwitch-track": {
        backgroundColor: "var(--palette-secondary-main)",
        opacity: 1,
        border: 0
      }
    }
  },
  "& .MuiSwitch-thumb": {
    boxSizing: "border-box",
    width: 16,
    height: 16,
    boxShadow: "0 1px 2px rgba(0,0,0,0.4)"
  },
  "& .MuiSwitch-track": {
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.18)",
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

// ── Section title (for CollapsibleSection title prop) ──────────────────────

const sectionTitleStyles = (theme: Theme) =>
  css({
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    color: theme.vars.palette.text.primary,
    fontSize: 15,
    fontWeight: 500,
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
        margin: "4px 0"
      }}
      role="separator"
    />
  );
});
InspectorDivider.displayName = "InspectorDivider";
