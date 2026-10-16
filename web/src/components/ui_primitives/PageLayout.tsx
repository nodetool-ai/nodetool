/** @jsxImportSource @emotion/react */
/**
 * PageLayout
 *
 * Full-screen page chrome for the global managers (Models, Collections,
 * Workspaces, Packages, Memory, Assets). A `PageHeader` hero on top, then the
 * rest of the viewport for its children. A centred card or a modal flow is not
 * a page: use `PageHeader` alone or no header at all.
 *
 * @example
 * <PageLayout icon={<FolderIcon />} title="Workspaces" subtitle="Folders agents work in.">
 *   <WorkspaceList />
 * </PageLayout>
 */

import React, { memo, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box } from "./Box";
import { PageHeader } from "./PageHeader";
import type { PageHeaderProps } from "./PageHeader";
import { SPACING } from "./spacing";

export interface PageLayoutProps
  extends Pick<
    PageHeaderProps,
    "icon" | "subtitle" | "actions" | "docsTopic" | "docsUrl" | "docsLabel"
  > {
  /** Header title. Without it no header renders. */
  title?: string;
  /**
   * Pad and scroll the content area. Disable for full-bleed pages (e.g. the
   * model list) that own their own layout, sidebars, and scrolling.
   * @default true
   */
  padded?: boolean;
  /** Let the content scroll without adding padding. */
  scrollable?: boolean;
  /**
   * Hide the header while keeping the content layout.
   * @default true
   */
  showHeader?: boolean;
  children: React.ReactNode;
}

const styles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      width: "100%",
      height: "100%",
      minHeight: 0,
      backgroundColor: theme.vars.palette.background.default
    },
    ".page-layout-content": {
      flex: 1,
      minHeight: 0,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden"
    },
    ".page-layout-content--padded": {
      overflowY: "auto",
      padding: theme.spacing(SPACING.lg, SPACING.xl)
    },
    ".page-layout-content--scrollable": {
      overflowY: "auto"
    }
  });

export const PageLayout = memo(function PageLayout({
  title,
  padded = true,
  scrollable = false,
  showHeader = true,
  children,
  ...headerProps
}: PageLayoutProps) {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);

  return (
    <Box css={cssStyles} className="page-layout">
      {showHeader && title && <PageHeader title={title} {...headerProps} />}
      <Box
        className={`page-layout-content${
          padded ? " page-layout-content--padded" : ""
        }${scrollable ? " page-layout-content--scrollable" : ""}`}
      >
        {children}
      </Box>
    </Box>
  );
});

PageLayout.displayName = "PageLayout";
