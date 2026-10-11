/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { memo, type ReactNode, type Ref } from "react";
import type { SerializedStyles } from "@emotion/react";
import {
  MOTION,
  BORDER_RADIUS,
  CONTROL,
  SPACING,
  TYPOGRAPHY,
  focusRing,
  getSpacingPx,
  reducedMotion
} from "../ui_primitives";

/** Shared horizontal rhythm for the Examples page: a centered column that
 *  section borders bleed past, while content stays aligned. */
const wrapStyles = (theme: Theme) =>
  css({
    maxWidth: 1240,
    margin: "0 auto",
    padding: `0 ${getSpacingPx(10)}`, // 40px — off-scale layout gutter, preserved exactly
    [theme.breakpoints.down("sm")]: {
      padding: `0 ${getSpacingPx(SPACING.xl)}` // was 18px
    }
  });

/** The wrap a section should apply so it works as a full-bleed band. */
export const useSectionWrap = (): SerializedStyles => {
  const theme = useTheme();
  return wrapStyles(theme);
};

const headerStyles = (theme: Theme) =>
  css({
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: `${theme.spacing(1)}`,
    paddingBottom: `${theme.spacing(1)}`,
    flexWrap: "wrap",
    ".sec-title": {
      display: "flex",
      alignItems: "baseline",
      gap: `${theme.spacing(1)}`
    },
    ".sec-title h2": {
      ...TYPOGRAPHY.sans.title,
      margin: 0,
      color: theme.vars.palette.text.primary
    },
    ".sec-count": {
      ...TYPOGRAPHY.mono.caption,
      color: theme.vars.palette.text.disabled
    },
    ".sec-actions": {
      display: "flex",
      alignItems: "center",
      gap: `${theme.spacing(1)}`
    }
  });

interface DashboardSectionHeaderProps {
  title: string;
  count?: string;
  children?: ReactNode;
}

export const DashboardSectionHeader = memo(function DashboardSectionHeader({
  title,
  count,
  children
}: DashboardSectionHeaderProps) {
  const theme = useTheme();
  return (
    <div css={headerStyles(theme)}>
      <div className="sec-title">
        <h2>{title}</h2>
        {count && <span className="sec-count">{count}</span>}
      </div>
      {children && <div className="sec-actions">{children}</div>}
    </div>
  );
});

const searchStyles = (theme: Theme) =>
  css({
    display: "flex",
    alignItems: "center",
    gap: `${theme.spacing(1)}`,
    height: CONTROL.height.md,
    padding: `0 ${theme.spacing(SPACING.sm)}`,
    background: theme.vars.palette.c_node_bg,
    border: `1px solid ${theme.vars.palette.divider}`,
    borderRadius: BORDER_RADIUS.sm,
    color: theme.vars.palette.text.secondary,
    minWidth: 240,
    transition: MOTION.border,
    ...reducedMotion({ transition: MOTION.none }),
    "&:focus-within": {
      borderColor: theme.vars.palette.primary.main
    },
    "& svg": { flexShrink: 0 },
    input: {
      flex: 1,
      background: "transparent",
      border: "none",
      outline: "none",
      color: theme.vars.palette.text.primary,
      font: "inherit",
      ...TYPOGRAPHY.sans.body,
      "&::placeholder": { color: theme.vars.palette.text.disabled }
    },
    ".kbd": {
      ...TYPOGRAPHY.mono.caption,
      color: theme.vars.palette.text.secondary,
      padding: `${theme.spacing(SPACING.none)} ${theme.spacing(SPACING.xs)}`,
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: BORDER_RADIUS.xs
    },
    ".search-clear": {
      display: "grid",
      placeItems: "center",
      width: 18,
      height: 18,
      flexShrink: 0,
      padding: 0,
      border: "none",
      borderRadius: BORDER_RADIUS.xs,
      background: "transparent",
      color: theme.vars.palette.text.disabled,
      cursor: "pointer",
      transition: `color ${MOTION.fast}, ${MOTION.background}`,
      ...reducedMotion({ transition: MOTION.none }),
      "&:hover": {
        color: theme.vars.palette.text.primary,
        background: theme.vars.palette.action.hover
      },
      "&:focus-visible": focusRing(theme, 0)
    },
    [theme.breakpoints.down("sm")]: {
      minWidth: 0,
      flex: 1
    }
  });

interface DashboardSearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  kbd?: string;
  "aria-label": string;
  ref?: Ref<HTMLInputElement>;
}

export const DashboardSearchBox = memo(function DashboardSearchBox({
  value,
  onChange,
  placeholder,
  kbd,
  "aria-label": ariaLabel,
  ref
}: DashboardSearchBoxProps) {
  const theme = useTheme();
  const hasValue = value.length > 0;
  return (
    <label css={searchStyles(theme)}>
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <circle cx="7" cy="7" r="4.5" />
        <path d="m10.5 10.5 3 3" />
      </svg>
      <input
        ref={ref}
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && hasValue) {
            e.stopPropagation();
            onChange("");
          }
        }}
      />
      {hasValue ? (
        <button
          type="button"
          className="search-clear"
          aria-label="Clear search"
          // Keep focus in the input so typing can continue immediately.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange("")}
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            <path d="m4 4 8 8M12 4l-8 8" />
          </svg>
        </button>
      ) : (
        kbd && <span className="kbd">{kbd}</span>
      )}
    </label>
  );
});

/** Small "Browse all →" style link used in section headers. */
const linkStyles = (theme: Theme) =>
  css({
    display: "inline-flex",
    alignItems: "center",
    gap: `${theme.spacing(SPACING.xs)}`,
    ...TYPOGRAPHY.sans.label,
    color: theme.vars.palette.primary.main,
    background: "none",
    border: "none",
    borderRadius: BORDER_RADIUS.xs,
    padding: 0,
    cursor: "pointer",
    transition: `color ${MOTION.fast}`,
    ...reducedMotion({ transition: MOTION.none }),
    "&:hover": { color: theme.vars.palette.primary.light },
    "&:focus-visible": focusRing(theme, 2)
  });

interface SectionLinkProps {
  children: ReactNode;
  onClick: () => void;
}

export const SectionLink = memo(function SectionLink({
  children,
  onClick
}: SectionLinkProps) {
  const theme = useTheme();
  return (
    <button type="button" css={linkStyles(theme)} onClick={onClick}>
      {children}
      <svg
        width="13"
        height="13"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="m6 4 4 4-4 4" />
      </svg>
    </button>
  );
});
