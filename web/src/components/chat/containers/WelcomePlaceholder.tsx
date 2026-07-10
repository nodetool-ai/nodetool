/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Text,
  Chip,
  FlexRow,
  FlexColumn,
  Box,
  EditorButton,
  BORDER_RADIUS,
  MOTION
} from "../../ui_primitives";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import KeyRoundedIcon from "@mui/icons-material/KeyRounded";
import { memo, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguageModelProviders } from "../../../hooks/useProviders";

import openaiIcon from "../../../icons/providers/openai.svg";
import anthropicIcon from "../../../icons/providers/anthropic.svg";
import geminiColorIcon from "../../../icons/providers/gemini-color.svg";

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

// Cloud LLM providers we point first-time users at. Each maps to an API key
// they can add on the Settings → API Keys tab.
const SETUP_PROVIDERS = [
  { name: "OpenAI", icon: openaiIcon, mono: true },
  { name: "Anthropic", icon: anthropicIcon, mono: true },
  { name: "Gemini", icon: geminiColorIcon, mono: false }
] as const;

interface WelcomePlaceholderProps {
  onSuggestionClick?: (suggestion: string) => void;
}

/**
 * Shown when a chat thread has no messages yet. When no language-model
 * provider is configured we guide the user to add an API key first (otherwise
 * sending a message just fails); once a provider is available we show the
 * regular prompt suggestions.
 */
const WelcomePlaceholder: React.FC<WelcomePlaceholderProps> = ({
  onSuggestionClick
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
  const navigate = useNavigate();
  const { providers, isLoading, error } = useLanguageModelProviders();

  const handleClick = useCallback(
    (suggestion: string) => {
      onSuggestionClick?.(suggestion);
    },
    [onSuggestionClick]
  );

  const handleOpenSettings = useCallback(() => {
    navigate("/settings?tab=1");
  }, [navigate]);

  // Only treat the chat as "no provider" once the provider query has settled
  // successfully — while loading (or on a transient fetch error, which the
  // connection banner already surfaces) we keep the neutral suggestions view.
  const noProvider = !isLoading && !error && providers.length === 0;

  return (
    <div css={cssStyles}>
      <div className="welcome-inner">
        {noProvider ? (
          <FlexColumn align="center" gap={1.5} sx={{ textAlign: "center" }}>
            <KeyRoundedIcon className="welcome-icon" />
            <Text className="welcome-title">
              Connect an AI provider to get started
            </Text>
            <Text className="welcome-subtitle" sx={{ maxWidth: 520 }}>
              Add an API key for OpenAI, Anthropic, or Gemini to start chatting.
              Your keys are encrypted and stored securely.
            </Text>
            <FlexRow gap={1} justify="center" wrap sx={{ mt: 0.5 }}>
              {SETUP_PROVIDERS.map((provider) => (
                <FlexRow
                  key={provider.name}
                  align="center"
                  gap={0.75}
                  sx={{
                    px: 1.25,
                    py: 0.5,
                    borderRadius: BORDER_RADIUS.pill,
                    border: `1px solid ${theme.vars.palette.divider}`,
                    backgroundColor: theme.vars.palette.background.paper
                  }}
                >
                  <Box
                    component="img"
                    src={provider.icon}
                    alt=""
                    aria-hidden
                    sx={{
                      width: 16,
                      height: 16,
                      objectFit: "contain",
                      ...(provider.mono &&
                        theme.applyStyles("dark", { filter: "invert(1)" }))
                    }}
                  />
                  <Text size="small" weight={500}>
                    {provider.name}
                  </Text>
                </FlexRow>
              ))}
            </FlexRow>
            <EditorButton
              variant="contained"
              color="primary"
              size="small"
              startIcon={<KeyRoundedIcon sx={{ fontSize: 16 }} />}
              onClick={handleOpenSettings}
              sx={{ mt: 1 }}
            >
              Add API keys in Settings
            </EditorButton>
          </FlexColumn>
        ) : (
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
                    transition: `all ${MOTION.fast}`,
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
        )}
      </div>
    </div>
  );
};

export default memo(WelcomePlaceholder);
