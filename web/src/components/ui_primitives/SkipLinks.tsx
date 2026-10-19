/** @jsxImportSource @emotion/react */
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { MOTION } from "./tokens";
import { SPACING, getSpacingPx } from "./spacing";

const skipLinkStyles = (theme: Theme) =>
  css({
    ".skip-link": {
      position: "absolute",
      top: "-100px",
      left: "16px",
      // Above every overlay, including MUI tooltips, so the link is always reachable.
      zIndex: theme.zIndex.tooltip + 1,
      padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.xl)}`,
      backgroundColor: theme.vars.palette.primary.main,
      color: theme.vars.palette.primary.contrastText,
      borderRadius: `0 0 ${theme.rounded.lg} ${theme.rounded.lg}`,
      fontSize: "var(--fontSizeNormal)",
      fontWeight: 500,
      textDecoration: "none",
      transition: `top ${MOTION.normal}`,
      "&:focus": {
        top: "0",
        outline: `2px solid ${theme.vars.palette.primary.light}`,
        outlineOffset: "2px"
      }
    }
  });

export const SkipLinks = memo(function SkipLinks() {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <nav css={skipLinkStyles(theme)} aria-label={t("i18n-next86.skipLinks.navigationLabel")}>
      <a className="skip-link" href="#main-content">
        {t("i18n-next86.skipLinks.mainContent")}
      </a>
    </nav>
  );
});
