/** @jsxImportSource @emotion/react */
import { memo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

const skipLinkStyles = (theme: Theme) =>
  css({
    ".skip-link": {
      position: "absolute",
      top: "-100px",
      left: "16px",
      zIndex: 10000,
      padding: "8px 16px",
      backgroundColor: theme.vars.palette.primary.main,
      color: theme.vars.palette.primary.contrastText,
      borderRadius: `0 0 ${theme.rounded.lg} ${theme.rounded.lg}`,
      fontSize: "0.875rem",
      fontWeight: 500,
      textDecoration: "none",
      transition: "top 0.2s ease",
      "&:focus": {
        top: "0",
        outline: `2px solid ${theme.vars.palette.primary.light}`,
        outlineOffset: "2px"
      }
    }
  });

export const SkipLinks = memo(function SkipLinks() {
  const theme = useTheme();
  return (
    <nav css={skipLinkStyles(theme)} aria-label="Skip links">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
    </nav>
  );
});
