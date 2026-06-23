/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { memo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { Box, EditorButton, FlexColumn, FlexRow, BORDER_RADIUS, SPACING, getSpacingPx } from "../ui_primitives";

interface ManagerPageLayoutProps {
  /** Icon shown in the tinted chip beside the title. */
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  /** Optional docs link rendered as a button in the hero's action row. */
  docsUrl?: string;
  docsLabel?: string;
  /** Extra controls rendered on the right of the hero header. */
  actions?: React.ReactNode;
  /**
   * Pad and scroll the content area. Disable for full-bleed managers (e.g. the
   * model list) that own their own layout, sidebars, and scrolling.
   */
  padded?: boolean;
  children: React.ReactNode;
}

const styles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      width: "100%",
      height: "100%",
      backgroundColor: theme.vars.palette.background.default
    },
    ".manager-page-hero": {
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(2),
      padding: theme.spacing(2.5, 4),
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      background: `linear-gradient(180deg, ${theme.vars.palette.background.paper} 0%, ${theme.vars.palette.background.default} 100%)`
    },
    ".manager-page-back": {
      flexShrink: 0
    },
    ".manager-page-icon": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 44,
      height: 44,
      minWidth: 44,
      flexShrink: 0,
      borderRadius: BORDER_RADIUS.lg,
      background: `rgba(${theme.vars.palette.primary.mainChannel} / 0.12)`,
      color: theme.vars.palette.primary.main
    },
    ".manager-page-titles": {
      minWidth: 0
    },
    ".manager-page-title": {
      margin: 0,
      fontSize: "var(--fontSizeBig)",
      fontWeight: 600,
      lineHeight: 1.2,
      letterSpacing: "-0.01em",
      color: theme.vars.palette.text.primary
    },
    ".manager-page-subtitle": {
      margin: 0,
      marginTop: getSpacingPx(SPACING.micro),
      fontSize: theme.fontSizeSmall,
      lineHeight: 1.4,
      color: theme.vars.palette.text.secondary
    },
    ".manager-page-actions": {
      marginLeft: "auto",
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1),
      flexShrink: 0
    },
    ".manager-page-content": {
      flex: 1,
      minHeight: 0,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden"
    },
    ".manager-page-content--padded": {
      overflowY: "auto",
      padding: theme.spacing(3, 4)
    }
  });

/**
 * Full-screen page chrome for the global managers (Models, Collections,
 * Workspaces). Renders a hero strip with a back button, icon, title/subtitle,
 * and optional actions, then hands the rest of the viewport to its children.
 */
const ManagerPageLayout: React.FC<ManagerPageLayoutProps> = ({
  icon,
  title,
  subtitle,
  docsUrl,
  docsLabel = "Documentation",
  actions,
  padded = true,
  children
}) => {
  const theme = useTheme();
  const navigate = useNavigate();

  const handleBack = useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/dashboard");
    }
  }, [navigate]);

  return (
    <Box css={styles(theme)} className="manager-page">
      <header className="manager-page-hero">
        <EditorButton
          className="manager-page-back"
          density="normal"
          onClick={handleBack}
          startIcon={<ArrowBackRoundedIcon sx={{ fontSize: 16 }} />}
          aria-label="Go back"
        >
          Back
        </EditorButton>
        {icon && <span className="manager-page-icon">{icon}</span>}
        <FlexColumn className="manager-page-titles" gap={0}>
          <h1 className="manager-page-title">{title}</h1>
          {subtitle && <p className="manager-page-subtitle">{subtitle}</p>}
        </FlexColumn>
        {(docsUrl || actions) && (
          <FlexRow className="manager-page-actions">
            {actions}
            {docsUrl && (
              <EditorButton
                variant="outlined"
                density="normal"
                endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
                onClick={() =>
                  window.open(docsUrl, "_blank", "noopener,noreferrer")
                }
              >
                {docsLabel}
              </EditorButton>
            )}
          </FlexRow>
        )}
      </header>
      <Box
        className={`manager-page-content${
          padded ? " manager-page-content--padded" : ""
        }`}
      >
        {children}
      </Box>
    </Box>
  );
};

ManagerPageLayout.displayName = "ManagerPageLayout";

export default memo(ManagerPageLayout);
