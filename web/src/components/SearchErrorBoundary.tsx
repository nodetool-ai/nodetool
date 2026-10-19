/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { type TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { EditorButton, Text, Box, BORDER_RADIUS, getSpacingPx, SPACING } from "./ui_primitives";
import ReportBugButton from "./support/ReportBugButton";
import { ThemeContext } from "@emotion/react";
import type { Theme } from "@mui/material/styles";


const searchErrorBoundaryStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "200px",
    textAlign: "center",
    background: theme.vars.palette.c_gray0,
    border: `1px solid ${theme.vars.palette.c_gray1}`,
    borderRadius: BORDER_RADIUS.lg,
    margin: getSpacingPx(SPACING.xl),
    padding: getSpacingPx(SPACING.xxxl),

    ".error-title": {
      color: theme.vars.palette.error.main,
      marginBottom: theme.spacing?.(1) || "8px",
      fontSize: theme.fontSizeNormal
    },

    ".error-message": {
      maxWidth: 400,
      marginBottom: theme.spacing?.(2) || "16px",
      color: theme.vars.palette.c_gray4,
      fontSize: theme.fontSizeSmaller
    },

    ".retry-button": {
      backgroundColor: theme.vars.palette.c_hl1,
      color: theme.vars.palette.grey[1000],
      textTransform: "none",
      fontSize: theme.fontSizeSmaller,
      "&:hover": {
        backgroundColor: theme.vars.palette.c_hl2
      }
    }
  });

interface SearchErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface SearchErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  onRetry?: () => void;
}

class SearchErrorBoundary extends Component<
  SearchErrorBoundaryProps & { t: TFunction },
  SearchErrorBoundaryState
> {
  static contextType = ThemeContext;

  declare context: Theme;

  constructor(props: SearchErrorBoundaryProps & { t: TFunction }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): SearchErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Search component error:", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
    this.props.onRetry?.();
  };

  render() {
    const theme = this.context;
    const boundaryStyles = searchErrorBoundaryStyles(theme);

    if (this.state.hasError) {
      return (
        <Box css={boundaryStyles}>
          <Text size="normal" weight={600} className="error-title">
            {this.props.fallbackTitle || this.props.t("i18n-next89.searchErrorBoundary.errorTitle")}
          </Text>
          <Text size="small" className="error-message">
            {this.props.t("i18n-next89.searchErrorBoundary.errorDescription")}
          </Text>
          <EditorButton
            variant="contained"
            onClick={this.handleRetry}
            className="retry-button"
            density="normal"
          >
            {this.props.t("i18n-next89.searchErrorBoundary.retry")}
          </EditorButton>
          <ReportBugButton
            label={this.props.t("i18n-next89.searchErrorBoundary.reportBug")}
            context={{
              source: "panel-crash",
              summary:
                this.props.fallbackTitle ||
                this.props.t("i18n-next89.searchErrorBoundary.errorTitle"),
              errorText: this.state.error?.message,
              stackTrace: this.state.error?.stack
            }}
          />
        </Box>
      );
    }

    return this.props.children;
  }
}

function SearchErrorBoundaryWithTranslation(props: SearchErrorBoundaryProps) {
  const { t } = useTranslation();
  return <SearchErrorBoundary {...props} t={t} />;
}

export default SearchErrorBoundaryWithTranslation;
