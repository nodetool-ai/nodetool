/** @jsxImportSource @emotion/react */
/**
 * PageHeader
 *
 * The title block of a full page: an optional icon, a `h1` title, a subtitle
 * and a row of actions on the right. Three looks share one structure:
 *
 * - `hero`: the manager strip with a tinted icon chip, a soft gradient and a
 *   rule below. `PageLayout` renders this one.
 * - `bar`: the same strip without the gradient, with the icon unframed.
 * - `plain`: no padding, rule or background. The caller places it and sets
 *   spacing through `sx`.
 *
 * @example
 * <PageHeader title="Costs" subtitle="Spend per node execution" actions={<Controls />} />
 */

import React, { memo, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import type { SxProps } from "@mui/material/styles";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { docsLink, type DocsTopic } from "../../config/docsLinks";
import { Box } from "./Box";
import { EditorButton } from "../editor_ui";
import { FlexColumn } from "./FlexColumn";
import { FlexRow } from "./FlexRow";
import { SPACING, getSpacingPx } from "./spacing";
import { BORDER_RADIUS } from "./tokens";

export type PageHeaderVariant = "hero" | "bar" | "plain";

export interface PageHeaderProps {
  /** Page title, rendered as the page's `h1`. */
  title: React.ReactNode;
  /** One line under the title. */
  subtitle?: React.ReactNode;
  /** Icon before the title. `hero` frames it in a tinted chip. */
  icon?: React.ReactNode;
  /** Controls on the right edge. */
  actions?: React.ReactNode;
  /** Documentation page for this surface, rendered as a button after `actions`. */
  docsTopic?: DocsTopic;
  /** Escape hatch for a docs link outside the registry. */
  docsUrl?: string;
  docsLabel?: string;
  /**
   * @default "hero"
   */
  variant?: PageHeaderVariant;
  /** Hide the subtitle below the `md` breakpoint to save room on phones. */
  hideSubtitleOnMobile?: boolean;
  /** Keep the title on one line and cut it with an ellipsis. */
  truncateTitle?: boolean;
  className?: string;
  sx?: SxProps<Theme>;
}

const variantStyles = (theme: Theme, variant: PageHeaderVariant) => {
  if (variant === "hero") {
    return {
      padding: theme.spacing(2.5, 4),
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      background: `linear-gradient(180deg, ${theme.vars.palette.background.paper} 0%, ${theme.vars.palette.background.default} 100%)`
    };
  }
  if (variant === "bar") {
    return {
      padding: `${getSpacingPx(SPACING.xl)} ${getSpacingPx(SPACING.xxl)}`,
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      [theme.breakpoints.down("md")]: { padding: getSpacingPx(SPACING.lg) }
    };
  }
  return {};
};

const iconStyles = (theme: Theme, variant: PageHeaderVariant) => {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0
  };
  if (variant !== "hero") {
    return base;
  }
  return {
    ...base,
    width: 44,
    height: 44,
    minWidth: 44,
    borderRadius: BORDER_RADIUS.lg,
    background: `rgba(${theme.vars.palette.primary.mainChannel} / 0.12)`,
    color: theme.vars.palette.primary.main
  };
};

const styles = (theme: Theme, variant: PageHeaderVariant) =>
  css({
    "&": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(variant === "hero" ? 2 : 1.5),
      flexShrink: 0,
      minWidth: 0,
      ...variantStyles(theme, variant)
    },
    ".page-header-icon": iconStyles(theme, variant),
    ".page-header-titles": {
      minWidth: 0
    },
    ".page-header-title": {
      margin: 0,
      fontSize: "var(--fontSizeBig)",
      fontWeight: 600,
      lineHeight: 1.2,
      letterSpacing: "-0.01em",
      color: theme.vars.palette.text.primary
    },
    ".page-header-title--truncate": {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".page-header-subtitle": {
      marginTop: getSpacingPx(SPACING.micro),
      fontSize: theme.fontSizeSmall,
      lineHeight: 1.4,
      color: theme.vars.palette.text.secondary
    },
    ".page-header-subtitle--hide-mobile": {
      [theme.breakpoints.down("md")]: { display: "none" }
    },
    ".page-header-actions": {
      marginLeft: "auto",
      alignItems: "center",
      gap: theme.spacing(1),
      flexShrink: variant === "plain" ? 1 : 0,
      minWidth: 0
    }
  });

export const PageHeader = memo(function PageHeader({
  title,
  subtitle,
  icon,
  actions,
  docsTopic,
  docsUrl,
  docsLabel = "Documentation",
  variant = "hero",
  hideSubtitleOnMobile = false,
  truncateTitle = false,
  className,
  sx
}: PageHeaderProps) {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme, variant), [theme, variant]);
  const resolvedDocsUrl = docsTopic ? docsLink(docsTopic) : docsUrl;

  return (
    <Box
      component="header"
      css={cssStyles}
      className={className ? `page-header ${className}` : "page-header"}
      sx={sx}
    >
      {icon && <span className="page-header-icon">{icon}</span>}
      <FlexColumn className="page-header-titles" gap={0}>
        <h1
          className={`page-header-title${
            truncateTitle ? " page-header-title--truncate" : ""
          }`}
        >
          {title}
        </h1>
        {subtitle && (
          <div
            className={`page-header-subtitle${
              hideSubtitleOnMobile ? " page-header-subtitle--hide-mobile" : ""
            }`}
          >
            {subtitle}
          </div>
        )}
      </FlexColumn>
      {(resolvedDocsUrl || actions) && (
        <FlexRow className="page-header-actions">
          {actions}
          {resolvedDocsUrl && (
            <EditorButton
              variant="outlined"
              density="normal"
              endIcon={<OpenInNewIcon />}
              onClick={() =>
                window.open(resolvedDocsUrl, "_blank", "noopener,noreferrer")
              }
            >
              {docsLabel}
            </EditorButton>
          )}
        </FlexRow>
      )}
    </Box>
  );
});

PageHeader.displayName = "PageHeader";
