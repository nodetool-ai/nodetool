/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import useGlobalChatStore from "../../../../stores/GlobalChatStore";
import { getThreadRuntime } from "../../../../core/chat/threadRuntime";
import ChatMarkdown from "../ChatMarkdown";
import {
  Collapse,
  FlexRow,
  ShimmerText,
  Text,
  SPACING,
  TYPOGRAPHY
} from "../../../ui_primitives";
import {
  markThoughtDone,
  markThoughtRunning,
  thoughtDuration
} from "./thoughtTiming";

interface ThoughtSectionProps {
  thoughtContent: string;
  /** The block's closing tag has arrived; without it the model may still be thinking. */
  hasClosingTag: boolean;
  /** The reader's own choice, or undefined to follow the stream. */
  isExpanded: boolean | undefined;
  onToggle: (nextOpen: boolean, event?: React.MouseEvent | React.KeyboardEvent) => void;
  textBefore?: string;
  textAfter?: string;
}

/** Whole seconds, at least one: "Thought for 0s" would read as a glitch. */
const thoughtSeconds = (durationMs: number): number =>
  Math.max(1, Math.round(durationMs / 1000));

/**
 * ThoughtSection — the model's reasoning as a row in the step timeline.
 *
 * While the model thinks the row reads "Thinking", shimmering, and stays open
 * so the reasoning streams in view. When the answer starts it folds away and
 * reads "Thought for 5s". A click overrides either state for good.
 */
export const ThoughtSection: React.FC<ThoughtSectionProps> = React.memo(({
  thoughtContent,
  hasClosingTag,
  isExpanded,
  onToggle,
  textBefore,
  textAfter
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  // An unclosed block in a thread that stopped streaming is a reply cut off
  // mid-thought, not one still thinking.
  const threadStreaming = useGlobalChatStore((state) => {
    const status = getThreadRuntime(state, state.currentThreadId).status;
    return status === "streaming" || status === "loading";
  });
  const isRunning = !hasClosingTag && threadStreaming;
  const [durationMs, setDurationMs] = useState<number | null>(() =>
    thoughtDuration(thoughtContent)
  );

  useEffect(() => {
    if (isRunning) {
      markThoughtRunning(thoughtContent);
    } else {
      setDurationMs(markThoughtDone(thoughtContent));
    }
  }, [isRunning, thoughtContent]);

  const isOpen = isExpanded ?? isRunning;
  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      onToggle(!isOpen, event);
    },
    [isOpen, onToggle]
  );
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onToggle(!isOpen, event);
      }
    },
    [isOpen, onToggle]
  );

  const contentStyles = useMemo(
    () =>
      css({
        padding: theme.spacing(SPACING.xs, 0, SPACING.md),
        color: theme.vars.palette.text.secondary,
        minWidth: 0,
        ".markdown, .markdown p, .markdown li": {
          ...TYPOGRAPHY.sans.caption,
          color: theme.vars.palette.text.secondary
        }
      }),
    [theme]
  );

  const label = isRunning
    ? t("i18n-next54.message.thinking")
    : durationMs !== null
      ? t("i18n-next54.message.thoughtFor", {
          seconds: thoughtSeconds(durationMs)
        })
      : t("i18n-next54.message.thought");

  return (
    <>
      {textBefore && <ChatMarkdown content={textBefore} />}
      <div className="thought-section-container tool-timeline">
        <div className={`tool-row reasoning${isRunning ? " running" : ""}`}>
          <div className="tool-row-rail" aria-hidden>
            <span className="tool-row-glyph">
              <LightbulbOutlinedIcon />
            </span>
          </div>
          <div className="tool-row-main">
            <FlexRow
              className="tool-row-header expandable"
              align="center"
              fullWidth
              gap={SPACING.xs}
              role="button"
              tabIndex={0}
              aria-expanded={isOpen}
              onClick={handleClick}
              onKeyDown={handleKeyDown}
            >
              <Text component="span" size="small" className="tool-row-label" truncate>
                {isRunning ? <ShimmerText>{label}</ShimmerText> : label}
              </Text>
              <span className="tool-row-gap" />
              <ExpandMoreIcon
                className={`tool-row-chevron${isOpen ? " expanded" : ""}`}
                aria-hidden
              />
            </FlexRow>
            <Collapse in={isOpen} timeout="auto" unmountOnExit>
              <div className="thought-section-content" css={contentStyles}>
                <ChatMarkdown content={thoughtContent} />
              </div>
            </Collapse>
          </div>
        </div>
      </div>
      {textAfter && <ChatMarkdown content={textAfter} />}
    </>
  );
});

ThoughtSection.displayName = "ThoughtSection";
