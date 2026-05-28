import React, { useMemo, useState, useCallback } from "react";
import {
  Message,
  MessageContent,
  MessageTextContent,
  MessageImageContent,
  ToolCall
} from "../../../stores/ApiTypes";


import ChatMarkdown from "./ChatMarkdown";
import { useEditorInsertion } from "../../../contexts/EditorInsertionContext";
import { ThoughtSection } from "./thought/ThoughtSection";
import { MessageContentRenderer } from "./MessageContentRenderer";
import {
  parseThoughtContent,
  getMessageClass,
  stripContextContent
} from "../utils/messageUtils";
import { parseHarmonyContent, hasHarmonyTokens, getDisplayContent } from "../utils/harmonyUtils";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import {
  CopyButton,
  Caption,
  Text,
  FlexRow,
  FlexColumn,
  ToolbarIconButton,
  LoadingSpinner
} from "../../ui_primitives";
import ErrorIcon from "@mui/icons-material/Error";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import { Collapse } from "@mui/material";


import AgentExecutionView from "./AgentExecutionView";
import MediaOutputGroup, { isMediaOnlyContent } from "./MediaOutputGroup";
import { formatToolName } from "../../../utils/formatUtils";
import type { MediaGenerationRequest } from "../../../stores/MediaGenerationStore";
import { visibleToolArgs as visibleArgs } from "../../../core/chat/toolCallFields";

/**
 * PrettyJson - Memoized component for displaying formatted JSON.
 * Extracted outside MessageView to prevent recreation on every render.
 */
const PrettyJson: React.FC<{ value: unknown }> = React.memo(({ value }) => {
  const text = useMemo(() => {
    try {
      if (typeof value === "string") {
        const parsed = JSON.parse(value);
        return JSON.stringify(parsed, null, 2);
      }
      return JSON.stringify(value, null, 2);
    } catch {
      // JSON.stringify failed, return value as-is or convert to string
      return typeof value === "string" ? value : String(value);
    }
  }, [value]);
  return <pre className="pretty-json">{text}</pre>;
});
PrettyJson.displayName = "PrettyJson";

/**
 * `run_subtask` is the recursive-decomposition primitive. We render its
 * tool-call card differently from generic tools: the LLM-provided `title`
 * becomes the headline, `instructions` go into the expanded section, and a
 * tree icon signals that this card represents a deeper sub-execution.
 */
const RUN_SUBTASK_TOOL_NAME = "run_subtask";

/**
 * ToolCallCard - Memoized component for displaying tool calls.
 * Extracted outside MessageView to prevent recreation on every render.
 */
const ToolCallCard: React.FC<{
  tc: ToolCall;
  result?: { name?: string | null; content: unknown };
}> = React.memo(({ tc, result: _result }) => {
  const [open, setOpen] = useState(false);
  const runningToolCallId = useGlobalChatStore((s) => s.currentRunningToolCallId);
  const runningToolMessage = useGlobalChatStore((s) => s.currentToolMessage);
  const isSubtask = tc.name === RUN_SUBTASK_TOOL_NAME;

  // For run_subtask we lift `description` / `prompt` (Claude-Code Task naming)
  // out of args into headline + expanded body. Tolerate the older
  // `title`/`instructions` keys for messages already in the DB.
  const rawArgs = (tc.args as Record<string, unknown> | null | undefined) ?? null;
  const pickString = (key: string) =>
    typeof rawArgs?.[key] === "string"
      ? (rawArgs[key] as string).trim() || null
      : null;
  const subtaskTitle = isSubtask
    ? pickString("description") ?? pickString("title")
    : null;
  const subtaskInstructions = isSubtask
    ? pickString("prompt") ?? pickString("instructions")
    : null;
  const displayArgs = useMemo(() => {
    const base = visibleArgs(rawArgs);
    if (!isSubtask || !base) return base;
    const stripped: Record<string, unknown> = { ...base };
    for (const k of ["description", "prompt", "title", "instructions"]) {
      delete stripped[k];
    }
    return Object.keys(stripped).length > 0 ? stripped : null;
  }, [rawArgs, isSubtask]);

  const hasArgs = !!displayArgs && Object.keys(displayArgs).length > 0;
  const hasDetails = !!hasArgs || (isSubtask && !!subtaskInstructions);
  const isRunning = runningToolCallId && tc.id && runningToolCallId === tc.id;

  const handleToggleOpen = useCallback(() => {
    setOpen((v) => !v);
  }, []);

  // For subtasks we keep the title + "Subtask" badge as the headline. For
  // regular tool calls we drop the tool name entirely and let the LLM-authored
  // `tc.message` carry the row — falling back to the formatted tool name only
  // when no message was provided.
  const liveMessage = isRunning ? runningToolMessage || tc.message : tc.message;
  const fallbackName = formatToolName(tc.name);
  const headline = isSubtask
    ? subtaskTitle || fallbackName
    : liveMessage || fallbackName;
  const showSeparateMessage = isSubtask && !!liveMessage;
  const headlineLabel = isSubtask ? "Subtask" : null;

  return (
    <div
      className={`tool-call-card${isRunning ? " running" : ""}${
        isSubtask ? " run-subtask" : ""
      }`}
    >
      <FlexRow className="tool-call-header" align="center" justify="space-between" fullWidth gap={0.5}>
        <FlexRow align="center" gap={0.5} sx={{ minWidth: 0 }}>
          {isSubtask && (
            <AccountTreeOutlinedIcon
              fontSize="small"
              className="subtask-icon"
              aria-hidden
            />
          )}
          {headlineLabel && (
            <Text
              component="span"
              size="small"
              weight={600}
              className="tool-call-badge"
            >
              {headlineLabel}
            </Text>
          )}
          <Text
            component="span"
            size="small"
            weight={isSubtask ? 500 : 400}
            className="tool-call-name"
            truncate
          >
            {headline}
          </Text>
          {showSeparateMessage && (
            <Text component="span" size="small" className="tool-message" truncate>
              {liveMessage}
            </Text>
          )}
          {isRunning && <LoadingSpinner size="small" />}
        </FlexRow>
        {hasDetails && (
          <ToolbarIconButton
            tooltip={open ? "Hide details" : "Show details"}
            onClick={handleToggleOpen}
            icon={<ExpandMoreIcon className={`expand-icon${open ? " expanded" : ""}`} />}
            className="tool-expand-button"
          />
        )}
      </FlexRow>
      <Collapse in={open} timeout="auto" unmountOnExit>
        <FlexColumn gap={0.5} sx={{ marginTop: "4px" }}>
          {isSubtask && subtaskInstructions && (
            <FlexColumn gap={0.25}>
              <Caption className="tool-section-title">Instructions</Caption>
              <Text size="small" className="subtask-instructions">
                {subtaskInstructions}
              </Text>
            </FlexColumn>
          )}
          {hasArgs && (
            <FlexColumn gap={0.25}>
              <Caption className="tool-section-title">
                {isSubtask ? "Other arguments" : "Arguments"}
              </Caption>
              <PrettyJson value={displayArgs} />
            </FlexColumn>
          )}
        </FlexColumn>
      </Collapse>
    </div>
  );
});
ToolCallCard.displayName = "ToolCallCard";

interface MessageViewProps {
  message: Message;
  expandedThoughts: { [key: string]: boolean };
  onToggleThought: (key: string) => void;
  onInsertCode?: (text: string, language?: string) => void;
  toolResultsByCallId?: Record<string, { name?: string | null; content: unknown }>;
  executionMessagesById?: Map<string, Message[]>;
}

export const MessageView: React.FC<
  MessageViewProps & { componentStyles?: Record<string, unknown> }
> = React.memo(({
  message,
  expandedThoughts,
  onToggleThought,
  onInsertCode,
  toolResultsByCallId,
  executionMessagesById
}) => {
  const insertIntoEditor = useEditorInsertion();

  // Memoize handlers to prevent recreation on every render
  const handleCopy = useCallback(() => {
    let textToCopy = "";
    if (typeof message.content === "string") {
      textToCopy = message.content;
    } else if (Array.isArray(message.content)) {
      textToCopy = message.content
        .filter((c) => c.type === "text")
        .map((c) => (c as MessageTextContent).text)
        .join("\n");
    }
    return textToCopy;
  }, [message.content]);

  const createToggleHandler = useCallback((key: string) => {
    return () => onToggleThought(key);
  }, [onToggleThought]);

  // Handle agent execution messages with consolidation
  if (message.role === "agent_execution") {
    const key = message.agent_execution_id || "__ungrouped__";
    const executionMessages = executionMessagesById?.get(key) ?? [];
    if (executionMessages.length > 0) {
      return <AgentExecutionView messages={executionMessages} />;
    }
    return null;
  }

    // Add error class if message has error flag
    const baseClass = getMessageClass(message.role);
    const hasToolCalls =
      message.role === "assistant" &&
      Array.isArray(message.tool_calls) &&
      message.tool_calls.length > 0;
    const hasNonEmptyContent =
      (typeof message.content === "string" && message.content.trim().length > 0) ||
      (Array.isArray(message.content) &&
        message.content.some((block) => {
          if (!block || typeof block !== "object") {
            return false;
          }
          const contentBlock = block as MessageContent;
          if (contentBlock.type === "text") {
            return typeof (contentBlock as MessageTextContent).text === "string" &&
              (contentBlock as MessageTextContent).text.trim().length > 0;
          }
          return true;
        }));

    const messageClass = [
      baseClass,
      (message as Message & { error_type?: string }).error_type ? "error-message" : null,
      hasToolCalls ? "has-tool-calls" : null,
      hasToolCalls && !hasNonEmptyContent ? "tool-calls-only" : null
    ]
      .filter(Boolean)
      .join(" ");

    const renderTextContent = (content: string, index: string | number) => {
      // Check if content contains Harmony format tokens
      if (hasHarmonyTokens(content)) {
        const { messages, rawText } = parseHarmonyContent(content);

        // If we have parsed Harmony messages, render them
        if (messages.length > 0) {
          return (
            <>
              {messages.map((message, i) => {
                const displayContent = getDisplayContent(message);
                const parsedContent = stripContextContent(displayContent);
                const parsedThought = parseThoughtContent(parsedContent);

                if (parsedThought) {
                  const key = `thought-${index}-${i}`;
                  const isExpanded = expandedThoughts[key];

                  return (
                    <ThoughtSection
                      key={key}
                      thoughtContent={parsedThought.thoughtContent}
                      isExpanded={isExpanded}
                      onToggle={createToggleHandler(key)}
                      textBefore={parsedThought.textBeforeThought}
                      textAfter={parsedThought.textAfterThought}
                    />
                  );
                }

                const handler =
                  onInsertCode ||
                  (insertIntoEditor ? (t: string) => insertIntoEditor(t) : undefined);
                return (
                  <ChatMarkdown
                    key={`markdown-${index}-${i}`}
                    content={parsedContent}
                    onInsertCode={handler}
                  />
                );
              })}
              {rawText && (
                <ChatMarkdown
                  content={stripContextContent(rawText)}
                  onInsertCode={onInsertCode || (insertIntoEditor ? (t: string) => insertIntoEditor(t) : undefined)}
                />
              )}
            </>
          );
        }
      }

      // If no Harmony tokens or parsing failed, render as regular text
      const parsedContent = stripContextContent(content);
      const parsedThought = parseThoughtContent(parsedContent);

      if (parsedThought) {
        const key = `thought-${index}`;
        const isExpanded = expandedThoughts[key];

        return (
          <ThoughtSection
            thoughtContent={parsedThought.thoughtContent}
            isExpanded={isExpanded}
            onToggle={createToggleHandler(key)}
            textBefore={parsedThought.textBeforeThought}
            textAfter={parsedThought.textAfterThought}
          />
        );
      }

      const handler =
        onInsertCode ||
        (insertIntoEditor ? (t: string) => insertIntoEditor(t) : undefined);
      return <ChatMarkdown content={parsedContent} onInsertCode={handler} />;
    };

    const content = message.content as
      | Array<MessageTextContent | MessageImageContent>
      | string;

    // Format timestamp for display
    const formatTime = (dateStr?: string | null) => {
      if (!dateStr) {
        return null;
      }
      try {
        const date = new Date(dateStr);
        return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      } catch {
        // Date parsing failed, return null
        return null;
      }
    };

    const formattedTime = formatTime(message.created_at);

    return (
      <div className={messageClass}>
        <div className="message-content">
          {message.role === "assistant" &&
            Array.isArray(message.tool_calls) &&
            !message.agent_execution_id && // Don't render tool cards for agent tasks here (they are in AgentExecutionView)
            (message.tool_calls as ToolCall[]).map((tc, i) => (
              <ToolCallCard
                key={tc.id || i}
                tc={tc}
                result={
                  tc.id && toolResultsByCallId
                    ? toolResultsByCallId[String(tc.id)]
                    : undefined
                }
              />
            ))}
          {(message.role === "assistant" || message.role === "user") && (
            <>
              {typeof message.content === "string" &&
                renderTextContent(
                  message.content,
                  message.id || 0
                )}
              {Array.isArray(content) &&
                (isMediaOnlyContent(content) &&
                (((message as Message & {
                  media_generation?: MediaGenerationRequest | null;
                }).media_generation?.mode ?? "chat") !== "chat" ||
                  content.length > 1) ? (
                  <MediaOutputGroup
                    message={
                      message as Message & {
                        media_generation?: MediaGenerationRequest | null;
                      }
                    }
                    mediaContents={content as MessageContent[]}
                  />
                ) : (
                  content.map((c: MessageContent, i: number) => (
                    <MessageContentRenderer
                      key={`${message.id}-content-${c.type}-${i}`}
                      content={c}
                      renderTextContent={renderTextContent}
                      index={i}
                    />
                  ))
                ))}
            </>
          )}
        </div>
        {(message as Message & { error_type?: string }).error_type && <ErrorIcon className="error-icon" />}
        {/* Message actions: timestamp + copy button */}
        {!Array.isArray(message.tool_calls) && (
          <div className="message-actions">
            {formattedTime && (
              <span className="message-timestamp">{formattedTime}</span>
            )}
            <CopyButton
              value={handleCopy()}
              buttonSize="small"
              tooltip="Copy to clipboard"
            />
          </div>
        )}
      </div>
    );
});

MessageView.displayName = "MessageView";
