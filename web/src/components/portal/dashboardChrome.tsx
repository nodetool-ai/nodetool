/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { memo, type ReactNode, type Ref } from "react";
import type { SerializedStyles } from "@emotion/react";
import {
  MOTION,
  BORDER_RADIUS,
  FlexRow,
  SearchInput,
  SectionHeader,
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

interface DashboardSectionHeaderProps {
  title: string;
  count?: string;
  children?: ReactNode;
}

/** A dashboard section's title row: the shared large `SectionHeader`. */
export const DashboardSectionHeader = memo(function DashboardSectionHeader({
  title,
  count,
  children
}: DashboardSectionHeaderProps) {
  return (
    <SectionHeader
      title={title}
      titleComponent="h2"
      size="large"
      count={count}
      action={
        children ? (
          <FlexRow align="center" gap={SPACING.xs}>
            {children}
          </FlexRow>
        ) : undefined
      }
      sx={{ alignItems: "flex-end", flexWrap: "wrap", gap: SPACING.xs, pt: SPACING.none, pb: SPACING.xs }}
    />
  );
});

const searchStyles = (theme: Theme) =>
  css({
    minWidth: 240,
    ".kbd": {
      ...TYPOGRAPHY.mono.caption,
      color: theme.vars.palette.text.secondary,
      padding: `${theme.spacing(SPACING.none)} ${theme.spacing(SPACING.xs)}`,
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: BORDER_RADIUS.xs
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
  return (
    <div css={searchStyles(theme)}>
      <SearchInput
        ref={ref}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
        fullWidth
        endHint={kbd ? <span className="kbd">{kbd}</span> : undefined}
      />
    </div>
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
