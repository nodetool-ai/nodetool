/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Text, Chip } from "../../ui_primitives";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { memo, useCallback } from "react";

const styles = (theme: Theme) =>
  css({
    flex: 1,
    minHeight: 0,
    width: "100%",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "1.5rem 1rem 2rem",

    ".welcome-inner": {
      width: "100%",
      maxWidth: "900px",
      display: "flex",
      flexDirection: "column",
      alignItems: "stretch",
      gap: "2rem"
    },

    ".chat-suggestions-block": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      textAlign: "center",
      gap: "0.75rem"
    },

    ".welcome-icon": {
      fontSize: "var(--fontSizeBig)",
      color: theme.vars.palette.primary.main,
      opacity: 0.7
    },

    ".welcome-title": {
      color: theme.vars.palette.text.primary,
      fontWeight: 600,
      fontSize: "var(--fontSizeBig)"
    },

    ".welcome-subtitle": {
      color: theme.vars.palette.text.secondary,
      fontSize: "var(--fontSizeNormal)",
      lineHeight: 1.6
    },

    ".suggestions": {
      display: "flex",
      flexWrap: "wrap",
      justifyContent: "center",
      gap: "0.5rem",
      marginTop: "0.25rem"
    }
  });

const SUGGESTIONS = [
  "Summarize a document",
  "Analyze an image",
  "Generate creative text",
  "Build a workflow",
  "Help me with code"
];

interface WelcomePlaceholderProps {
  onSuggestionClick?: (suggestion: string) => void;
}

const WelcomePlaceholder: React.FC<WelcomePlaceholderProps> = ({
  onSuggestionClick
}) => {
  const theme = useTheme();

  const handleClick = useCallback(
    (suggestion: string) => {
      onSuggestionClick?.(suggestion);
    },
    [onSuggestionClick]
  );

  return (
    <div css={styles(theme)}>
      <div className="welcome-inner">
        <div className="chat-suggestions-block">
          <AutoAwesomeIcon className="welcome-icon" />
          <Text className="welcome-title">How can I help you today?</Text>
          <Text className="welcome-subtitle">
            Ask me anything, drop files to analyze, or try one of these:
          </Text>
          <div className="suggestions">
            {SUGGESTIONS.map((suggestion) => (
              <Chip
                key={suggestion}
                label={suggestion}
                variant="outlined"
                onClick={() => handleClick(suggestion)}
                sx={{
                  borderColor: theme.vars.palette.divider,
                  color: theme.vars.palette.text.secondary,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  "&:hover": {
                    borderColor: theme.vars.palette.primary.main,
                    color: theme.vars.palette.primary.main,
                    backgroundColor: `${theme.vars.palette.primary.main}10`
                  }
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default memo(WelcomePlaceholder);
