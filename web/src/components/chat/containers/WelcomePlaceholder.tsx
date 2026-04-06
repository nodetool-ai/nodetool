/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Typography, Box, Chip } from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { memo, useCallback } from "react";

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    padding: "2rem",
    textAlign: "center",
    gap: "1.5rem",
    maxWidth: "600px",
    margin: "0 auto",

    ".welcome-icon": {
      fontSize: "2.5rem",
      color: theme.vars.palette.primary.main,
      opacity: 0.7
    },

    ".welcome-title": {
      color: theme.vars.palette.text.primary,
      fontWeight: 600,
      fontSize: "1.25rem"
    },

    ".welcome-subtitle": {
      color: theme.vars.palette.text.secondary,
      fontSize: "0.9rem",
      lineHeight: 1.6
    },

    ".suggestions": {
      display: "flex",
      flexWrap: "wrap",
      justifyContent: "center",
      gap: "0.5rem",
      marginTop: "0.5rem"
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
      <AutoAwesomeIcon className="welcome-icon" />
      <Typography className="welcome-title">
        How can I help you today?
      </Typography>
      <Typography className="welcome-subtitle">
        Ask me anything, drop files to analyze, or try one of these:
      </Typography>
      <Box className="suggestions">
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
      </Box>
    </div>
  );
};

export default memo(WelcomePlaceholder);
