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
  MOTION,
  SPACING,
  SPACING_PX,
  getSpacingPx
} from "../../ui_primitives";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import KeyRoundedIcon from "@mui/icons-material/KeyRounded";
import { memo, useCallback, useMemo } from "react";
import { useLanguageModelProviders } from "../../../hooks/useProviders";
import { openProviderOnboarding } from "../../../stores/ProviderOnboardingStore";
import { isElectron, isLocalhost } from "../../../lib/env";

import openaiIcon from "../../../icons/providers/openai.svg";
import anthropicIcon from "../../../icons/providers/anthropic.svg";
import geminiColorIcon from "../../../icons/providers/gemini-color.svg";

const styles = (theme: Theme) =>
  css({
    flex: 1,
    minHeight: 0,
    width: "100%",
    overflowY: "auto",
    // `overflowY` alone leaves the other axis at `auto`, which lets a phone
    // pan the welcome screen sideways.
    overflowX: "hidden",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: `${getSpacingPx(SPACING.xxl)} ${getSpacingPx(SPACING.xl)} ${getSpacingPx(SPACING.xxxl)}`,

    ".welcome-inner": {
      width: "100%",
      maxWidth: "900px",
      display: "flex",
      flexDirection: "column",
      alignItems: "stretch",
      gap: getSpacingPx(SPACING.xxxl)
    },

    ".chat-suggestions-block": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      textAlign: "center",
      gap: getSpacingPx(SPACING.lg)
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
      gap: getSpacingPx(SPACING.md),
      marginTop: getSpacingPx(SPACING.xs),
      // A chip's label does not wrap, so on a phone the longest opener is
      // wider than the column and pushes the whole screen sideways.
      maxWidth: "100%"
    },

    // Rather than ellipsing the opener away on a narrow screen, let it run
    // onto a second line.
    ".suggestions .MuiChip-root": {
      height: "auto",
      minHeight: `${SPACING_PX.xxxl}px`,
      maxWidth: "100%"
    },

    ".suggestions .MuiChip-label": {
      whiteSpace: "normal",
      overflow: "visible",
      textOverflow: "clip",
      paddingTop: getSpacingPx(SPACING.xs),
      paddingBottom: getSpacingPx(SPACING.xs)
    }
  });

/**
 * Openers, not commands: clicking one drops it into the composer for the user
 * to finish. Each leads with the outcome and names only what the user is about
 * to supply — never an attachment the thread does not have.
 */
// Each chip is the start of a brief the user finishes in the composer, one
// per job the studio is built for: a product spot, a creator-style cut, a
// narrated explainer, a whole campaign, and the pipeline that repeats it.
const SUGGESTIONS = [
  "Storyboard a 30-second ad for …",
  "Direct a UGC-style testimonial for …",
  "Narrate a 60-second explainer about …",
  "Turn this brief into a launch campaign: …",
  "Build a workflow that renders an ad for every …"
];

// Cloud LLM providers we point first-time users at. Each maps to an API key
// they can add on the Settings → Models & Providers tab.
const SETUP_PROVIDERS = [
  { name: "OpenAI", icon: openaiIcon, mono: true },
  { name: "Anthropic", icon: anthropicIcon, mono: true },
  { name: "Gemini", icon: geminiColorIcon, mono: false }
] as const;

/**
 * A desktop install can finish a Claude or OpenAI login on this machine, so it
 * gets offered the sign-in first. A hosted deployment cannot, and is pointed
 * at an API key instead.
 */
const SETUP_SUBTITLE =
  isElectron || isLocalhost
    ? "Sign in with Claude or OpenAI to use a subscription you already pay for, or add an API key. Your credentials are encrypted and stored securely."
    : "Add an API key for OpenAI, Anthropic, or Gemini to start chatting. Your keys are encrypted and stored securely.";

interface WelcomePlaceholderProps {
  onSuggestionClick?: (suggestion: string) => void;
}

/**
 * Shown when a chat thread has no messages yet. When no language-model
 * provider is configured we guide the user to connect one first (otherwise
 * sending a message just fails); once a provider is available we show the
 * regular prompt suggestions.
 */
const WelcomePlaceholder: React.FC<WelcomePlaceholderProps> = ({
  onSuggestionClick
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
  const { providers, isLoading, error } = useLanguageModelProviders();

  const handleClick = useCallback(
    (suggestion: string) => {
      onSuggestionClick?.(suggestion);
    },
    [onSuggestionClick]
  );

  const handleConnectProvider = useCallback(() => {
    openProviderOnboarding({
      capability: "generate_message",
      reason:
        isElectron || isLocalhost
          ? "Chat needs a language model. Sign in with Claude or OpenAI, or connect any provider with an API key."
          : "Chat needs a language model. Connect a provider to start."
    });
  }, []);

  // Only treat the chat as "no provider" once the provider query has settled
  // successfully — while loading (or on a transient fetch error, which the
  // connection banner already surfaces) we keep the neutral suggestions view.
  const noProvider = !isLoading && !error && providers.length === 0;

  return (
    <div css={cssStyles} className="chat-welcome">
      <div className="welcome-inner">
        {noProvider ? (
          <FlexColumn align="center" gap={SPACING.sm} sx={{ textAlign: "center" }}>
            <KeyRoundedIcon className="welcome-icon" />
            <Text className="welcome-title">
              Connect an AI provider to get started
            </Text>
            <Text className="welcome-subtitle" sx={{ maxWidth: 520 }}>
              {SETUP_SUBTITLE}
            </Text>
            <FlexRow gap={SPACING.xs} justify="center" wrap sx={{ mt: SPACING.micro }}>
              {SETUP_PROVIDERS.map((provider) => (
                <FlexRow
                  key={provider.name}
                  align="center"
                  gap={SPACING.xs}
                  sx={{
                    px: SPACING.sm,
                    py: SPACING.micro,
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
              startIcon={<KeyRoundedIcon sx={{ fontSize: "1.2em" }} />}
              onClick={handleConnectProvider}
              sx={{ mt: SPACING.xs }}
            >
              Connect a provider
            </EditorButton>
          </FlexColumn>
        ) : (
          <div className="chat-suggestions-block">
            <AutoAwesomeIcon className="welcome-icon" />
            <Text className="welcome-title">How can I help you today?</Text>
            <Text className="welcome-subtitle">
              Ask anything, drop in files, or start with one of these:
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
                    transition: MOTION.all,
                    "&:hover": {
                      borderColor: theme.vars.palette.primary.main,
                      color: theme.vars.palette.primary.main,
                      backgroundColor: `rgb(${theme.vars.palette.primary.mainChannel} / 0.06)`
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
