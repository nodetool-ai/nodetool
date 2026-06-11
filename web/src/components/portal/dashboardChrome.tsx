/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { memo, type ReactNode } from "react";
import { MOTION } from "../ui_primitives";

/** Shared horizontal rhythm for the dashboard: a centered column that the hero
 *  background and section borders bleed past, while content stays aligned. */
export const wrapStyles = (theme: Theme) =>
  css({
    maxWidth: 1240,
    margin: "0 auto",
    padding: "0 40px",
    [theme.breakpoints.down("sm")]: {
      padding: "0 18px"
    }
  });

const headerStyles = (theme: Theme) =>
  css({
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 8,
    paddingBottom: 8,
    flexWrap: "wrap",
    ".sec-title": {
      display: "flex",
      alignItems: "baseline",
      gap: 8
    },
    ".sec-title h2": {
      fontSize: 19,
      fontWeight: 500,
      letterSpacing: "-0.012em",
      margin: 0,
      color: theme.vars.palette.text.primary
    },
    ".sec-count": {
      fontFamily: theme.fontFamily2,
      fontSize: 12,
      color: theme.vars.palette.text.disabled
    },
    ".sec-actions": {
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  });

interface SectionHeaderProps {
  title: string;
  count?: string;
  children?: ReactNode;
}

export const SectionHeader = memo(function SectionHeader({
  title,
  count,
  children
}: SectionHeaderProps) {
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
    gap: 8,
    height: 32,
    padding: "0 11px",
    background: theme.vars.palette.c_node_bg,
    border: `1px solid ${theme.vars.palette.divider}`,
    borderRadius: 7,
    color: theme.vars.palette.text.secondary,
    minWidth: 240,
    transition: `border-color ${MOTION.fast}`,
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
      fontSize: 13.5,
      "&::placeholder": { color: theme.vars.palette.text.disabled }
    },
    ".kbd": {
      fontFamily: theme.fontFamily2,
      fontSize: 10.5,
      color: theme.vars.palette.text.secondary,
      padding: "1px 6px",
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: 4,
      lineHeight: 1.4
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
}

export const DashboardSearchBox = memo(function DashboardSearchBox({
  value,
  onChange,
  placeholder,
  kbd,
  "aria-label": ariaLabel
}: DashboardSearchBoxProps) {
  const theme = useTheme();
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
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
      />
      {kbd && <span className="kbd">{kbd}</span>}
    </label>
  );
});

/** Small "Browse all →" style link used in section headers. */
const linkStyles = (theme: Theme) =>
  css({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    color: theme.vars.palette.primary.main,
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    "&:hover": { color: theme.vars.palette.primary.light }
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
