/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouteError } from "react-router-dom";
import { CopyButton, Text, EditorButton, Box, MOTION, BORDER_RADIUS, Z_INDEX, getSpacingPx, SPACING } from "./components/ui_primitives";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { openBugReport } from "./stores/BugReportStore";
import { reportClientError } from "./utils/errorTraceReporting";

const errorBoundaryStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    padding: `${getSpacingPx(SPACING.xxxl)} ${getSpacingPx(SPACING.xxl)}`,
    background: "var(--palette-background-default)",
    boxSizing: "border-box",

    ".hero": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: getSpacingPx(SPACING.lg),
      marginBottom: getSpacingPx(SPACING.xxxl)
    },

    ".logo": {
      width: 72,
      height: 72,
      opacity: 0.85
    },

    ".heading": {
      fontSize: "var(--fontSizeBig)",
      fontWeight: 600,
      color: theme.vars.palette.grey[100],
      letterSpacing: "-0.01em"
    },

    ".subtext": {
      maxWidth: 460,
      textAlign: "center",
      color: theme.vars.palette.grey[300],
      fontSize: "var(--fontSizeNormal)",
      lineHeight: 1.7
    },

    ".actions": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: getSpacingPx(SPACING.xl),
      marginBottom: getSpacingPx(SPACING.xxxl)
    },

    ".button-row": {
      display: "flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.lg),
      flexWrap: "wrap",
      justifyContent: "center"
    },

    ".reload-button": {
      backgroundColor: theme.vars.palette.primary.main,
      color: theme.vars.palette.grey[1000],
      padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.xxxl)}`,
      fontSize: "var(--fontSizeNormal)",
      fontWeight: 500,
      borderRadius: BORDER_RADIUS.md,
      textTransform: "none",
      "&:hover": {
        backgroundColor: theme.vars.palette.primary.dark
      }
    },

    ".copy-error-button": {
      padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.xxl)}`,
      fontSize: "var(--fontSizeNormal)",
      fontWeight: 500,
      borderRadius: BORDER_RADIUS.md,
      textTransform: "none",
      border: `1px solid ${theme.vars.palette.divider}`,
      color: theme.vars.palette.grey[100],
      "&:hover": {
        borderColor: theme.vars.palette.grey[500],
        background: theme.vars.palette.c_overlay_subtle
      }
    },

    ".contact-row": {
      display: "flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.lg),
      flexWrap: "wrap",
      justifyContent: "center"
    },

    ".contact-link": {
      display: "inline-flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.sm),
      color: theme.vars.palette.grey[100],
      textDecoration: "none",
      fontSize: "var(--fontSizeNormal)",
      fontWeight: 500,
      padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.xl)}`,
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: BORDER_RADIUS.md,
      transition: MOTION.all,
      "&:hover": {
        borderColor: theme.vars.palette.c_link,
        color: theme.vars.palette.c_link,
        background: theme.vars.palette.c_overlay_subtle
      }
    },

    ".details-section": {
      width: "100%",
      maxWidth: 720,
      display: "flex",
      flexDirection: "column",
      alignItems: "center"
    },

    ".details-toggle": {
      fontSize: "var(--fontSizeSmall)",
      color: theme.vars.palette.grey[500],
      textTransform: "none",
      marginBottom: getSpacingPx(SPACING.md),
      "&:hover": {
        background: "transparent",
        color: theme.vars.palette.grey[300]
      }
    },

    ".error-summary": {
      width: "100%",
      color: theme.vars.palette.grey[200],
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeNormal)",
      padding: `${getSpacingPx(SPACING.lg)} ${getSpacingPx(SPACING.xl)}`,
      lineHeight: 1.6,
      textAlign: "center",
      wordBreak: "break-word"
    },

    ".stack-wrapper": {
      position: "relative",
      width: "100%"
    },

    ".error-stack-trace": {
      width: "100%",
      boxSizing: "border-box",
      color: theme.vars.palette.grey[50],
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: BORDER_RADIUS.md,
      fontFamily: "var(--fontFamily2)",
      fontSize: "var(--fontSizeSmall)",
      padding: getSpacingPx(SPACING.xl),
      whiteSpace: "pre-wrap",
      wordBreak: "break-all",
      maxHeight: 260,
      overflowY: "auto",
      userSelect: "all",
      lineHeight: 1.55
    }
  });

const ErrorBoundary: React.FC = () => {
  const { t } = useTranslation();
  const error = useRouteError();
  const theme = useTheme();
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  const errorMessage =
    error instanceof Error
      ? error.message
      : t("screen_remaining.errorBoundary.unknownError") + JSON.stringify(error);
  const stackTrace =
    error instanceof Error ? error.stack : t("screen_remaining.errorBoundary.noStack");

  const fullErrorText = `${errorMessage}\n\n${stackTrace}`;

  useEffect(() => {
    reportClientError(error, "route");
  }, [error]);

  const handleReport = () => {
    openBugReport({
      source: "app-crash",
      summary: errorMessage,
      errorText: errorMessage,
      stackTrace: stackTrace ?? undefined
    });
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(fullErrorText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Box css={errorBoundaryStyles(theme)}>
      <Box className="hero">
        <img src="/logo192.png" alt={t("screen_remaining.errorBoundary.logoAlt")} className="logo" />
        <Text className="heading">{t("screen_remaining.errorBoundary.heading")}</Text>
        <Text className="subtext">
          {t("screen_remaining.errorBoundary.description")}
        </Text>
      </Box>

      <Box className="actions">
        <Box className="button-row">
          <EditorButton
            variant="contained"
            size="large"
            onClick={() => window.location.reload()}
            className="reload-button"
          >
            {t("screen_remaining.errorBoundary.reload")}
          </EditorButton>
          <EditorButton
            variant="outlined"
            size="large"
            onClick={handleReport}
            className="copy-error-button"
          >
            {t("screen_remaining.errorBoundary.reportBug")}
          </EditorButton>
          <EditorButton
            variant="outlined"
            size="large"
            onClick={handleCopy}
            className="copy-error-button"
          >
            {copied ? t("screen_remaining.errorBoundary.copied") : t("screen_remaining.errorBoundary.copyError")}
          </EditorButton>
        </Box>
        <Box className="contact-row">
          <a
            href="https://discord.gg/GQqBKAWD"
            className="contact-link"
            target="_blank"
            rel="noreferrer"
          >
            {t("screen_remaining.errorBoundary.discord")}
          </a>
          <a href="mailto:hello@nodetool.ai" className="contact-link">
            {t("screen_remaining.errorBoundary.email")}
          </a>
        </Box>
      </Box>

      <Box className="details-section">
        <EditorButton
          className="details-toggle"
          disableRipple
          onClick={() => setShowDetails((prev) => !prev)}
        >
          {showDetails ? t("screen_remaining.errorBoundary.hideDetails") : t("screen_remaining.errorBoundary.showDetails")}
        </EditorButton>

        {showDetails && (
          <>
            <Text className="error-summary">
              {errorMessage}
            </Text>
            <Box className="stack-wrapper">
              <CopyButton
                value={stackTrace}
                tooltipPlacement="top"
                buttonSize="medium"
                sx={{ position: "absolute", top: 6, right: 6, zIndex: Z_INDEX.raised }}
              />
              <Text component="pre" className="error-stack-trace">
                {stackTrace}
              </Text>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
};

export default ErrorBoundary;
