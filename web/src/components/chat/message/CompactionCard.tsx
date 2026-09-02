/** @jsxImportSource @emotion/react */
import React, { memo, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import UnfoldLessRoundedIcon from "@mui/icons-material/UnfoldLessRounded";
import {
  BORDER_RADIUS,
  Caption,
  CollapsibleSection,
  FlexRow,
  SPACING,
  Text,
  getSpacingPx
} from "../../ui_primitives";
import { isObjectLike, isString } from "../../../utils/typePredicates";
import type { Message, MessageContent } from "../../../stores/ApiTypes";

/**
 * `execution_event_type` of a compaction record — the persisted summary that
 * replaces everything before it in the transcript a provider is handed.
 *
 * The row is written with `role: "user"` so it is ordinary history to the
 * model, which is why the client has to recognize it: without this branch the
 * summary renders as though the user typed it. The producer is
 * `COMPACTION_EVENT_TYPE` in `@nodetool-ai/models`; the web reads the column
 * off the message rather than importing a server package.
 */
export const COMPACTION_EVENT_TYPE = "compaction";

/** The header `compactionMessageContent` puts in front of the summary. */
const SUMMARY_HEADER = "[Conversation so far]";

/** Whether a message is the compaction record rather than a user turn. */
export const isCompactionMessage = (message: Message): boolean =>
  message.execution_event_type === COMPACTION_EVENT_TYPE;

const messageText = (content: Message["content"]): string => {
  if (isString(content)) {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (!isObjectLike(block)) return "";
        const contentBlock = block as MessageContent;
        return contentBlock.type === "text" && isString(contentBlock.text)
          ? contentBlock.text
          : "";
      })
      .join("");
  }
  return "";
};

/**
 * The summary without the header the model reads it by. Showing the raw row
 * would put `[Conversation so far]` in front of every card.
 */
export const compactionSummary = (content: Message["content"]): string => {
  const text = messageText(content).trim();
  return text.startsWith(SUMMARY_HEADER)
    ? text.slice(SUMMARY_HEADER.length).trim()
    : text;
};

const styles = (theme: Theme) =>
  css({
    border: `1px solid ${theme.vars.palette.divider}`,
    borderRadius: BORDER_RADIUS.lg,
    padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.md)}`,
    ".compaction-title": {
      color: theme.vars.palette.text.secondary
    },
    ".compaction-icon": {
      fontSize: "1.1em",
      color: theme.vars.palette.text.secondary
    },
    ".compaction-summary": {
      whiteSpace: "pre-wrap",
      color: theme.vars.palette.text.secondary,
      paddingBottom: getSpacingPx(SPACING.xs)
    }
  });

export interface CompactionCardProps {
  /** The compaction record's content: `"[Conversation so far]\n<summary>"`. */
  content: Message["content"];
}

/**
 * The compaction record as a collapsed card.
 *
 * A long thread stops fitting in the model's context, so the turn that would
 * have failed summarizes everything before its last few user turns and sends
 * the summary in their place. The row is a real message and reaches the client
 * like any other; this card is what tells the user their conversation was cut,
 * and lets them read what the model kept.
 */
const CompactionCard: React.FC<CompactionCardProps> = ({ content }) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
  const summary = compactionSummary(content);

  return (
    <div css={cssStyles} className="compaction-card">
      <CollapsibleSection
        compact
        defaultOpen={false}
        unmountOnExit
        title={
          <FlexRow align="center" gap={SPACING.xs}>
            <UnfoldLessRoundedIcon className="compaction-icon" />
            <Text size="small" className="compaction-title">
              Earlier conversation summarized
            </Text>
          </FlexRow>
        }
      >
        {summary ? (
          <Text size="small" className="compaction-summary">
            {summary}
          </Text>
        ) : (
          <Caption className="compaction-summary">
            The summary is empty.
          </Caption>
        )}
      </CollapsibleSection>
    </div>
  );
};

export default memo(CompactionCard);
