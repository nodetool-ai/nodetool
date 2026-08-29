/**
 * The project's conversation, rendered for a 460px column.
 *
 * A user turn is a bubble; an agent turn is its text plus a mono chip per tool
 * it called, and — while a call is in flight — the pill saying what is
 * running. Roles the compact column cannot render (an agent-execution trace,
 * a tool result) are left to the full chat surface rather than flattened into
 * something misleading.
 */

import { memo } from "react";

import {
  BORDER_RADIUS,
  Box,
  Caption,
  FlexColumn,
  FlexRow,
  SPACING,
  StatusPill,
  TYPOGRAPHY
} from "../ui_primitives";
import ChatMarkdown from "../chat/message/ChatMarkdown";
import type { Message, ToolCall } from "../../stores/ApiTypes";
import { isString } from "../../utils/typePredicates";

/** The turn's text, whatever shape the content arrived in. */
const messageText = (message: Message): string => {
  const content = message.content;
  if (isString(content)) return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) =>
      part && typeof part === "object" && "type" in part && part.type === "text"
        ? ((part as { text?: unknown }).text ?? "")
        : ""
    )
    .filter(isString)
    .join("\n")
    .trim();
};

const ToolChips = ({ calls }: { calls: readonly ToolCall[] }) => (
  <FlexRow gap={SPACING.sm} sx={{ flexWrap: "wrap" }}>
    {calls.map((call) => (
      <Box
        key={call.id}
        component="span"
        sx={{
          px: SPACING.sm,
          py: SPACING.micro,
          borderRadius: BORDER_RADIUS.xs,
          bgcolor: "background.paper",
          border: "1px solid",
          borderColor: "divider",
          color: "text.secondary",
          ...TYPOGRAPHY.mono.caption
        }}
      >
        {call.name}
      </Box>
    ))}
  </FlexRow>
);

const UserTurn = ({ text }: { text: string }) => (
  <Box
    sx={{
      alignSelf: "flex-end",
      maxWidth: "85%",
      px: SPACING.lg,
      py: SPACING.md,
      bgcolor: "background.paper",
      borderRadius: BORDER_RADIUS.lg,
      ...TYPOGRAPHY.sans.body
    }}
  >
    {text}
  </Box>
);

const AgentTurn = ({ message }: { message: Message }) => {
  const text = messageText(message);
  const calls = message.tool_calls ?? [];
  if (!text && calls.length === 0) return null;
  return (
    <FlexColumn gap={SPACING.md} sx={{ alignSelf: "flex-start", width: "100%" }}>
      {text && <ChatMarkdown content={text} />}
      {calls.length > 0 && <ToolChips calls={calls} />}
    </FlexColumn>
  );
};

interface ProjectAgentThreadProps {
  messages: readonly Message[];
  /** What the agent is doing right now, when it is doing something. */
  runningToolMessage?: string | null;
}

const ProjectAgentThread = ({
  messages,
  runningToolMessage
}: ProjectAgentThreadProps) => {
  if (messages.length === 0 && !runningToolMessage) {
    return (
      <Caption color="muted">
        Nothing here yet. Ask for a change and the agent builds it into this
        project.
      </Caption>
    );
  }
  return (
    <FlexColumn gap={SPACING.lg}>
      {messages.map((message, index) => {
        const key = message.id ?? `turn-${index}`;
        if (message.role === "user") {
          const text = messageText(message);
          return text ? <UserTurn key={key} text={text} /> : null;
        }
        if (message.role === "assistant") {
          return <AgentTurn key={key} message={message} />;
        }
        return null;
      })}
      {runningToolMessage && (
        <StatusPill tone="rendering" sx={{ alignSelf: "flex-start" }}>
          {runningToolMessage}
        </StatusPill>
      )}
    </FlexColumn>
  );
};

export default memo(ProjectAgentThread);
