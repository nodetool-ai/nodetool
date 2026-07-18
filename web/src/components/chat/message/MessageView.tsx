import React, { useMemo, useState, useCallback, useRef } from "react";
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
  LoadingSpinner,
  Collapse
} from "../../ui_primitives";
import ErrorIcon from "@mui/icons-material/Error";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import PersonOutlineRoundedIcon from "@mui/icons-material/PersonOutlineRounded";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import { getToolVisual } from "./toolCallIcon";


import AgentExecutionView from "./AgentExecutionView";
import MediaOutputGroup from "./MediaOutputGroup";
import { isMediaOnlyContent } from "./MediaOutputGroup.helpers";
import { ToolResult } from "./toolResults";
import { formatDuration, formatToolName } from "../../../utils/formatUtils";
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
        const parsed: unknown = JSON.parse(value);
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

function formatTime(dateStr?: string | null): string | null {
  if (!dateStr) {
    return null;
  }
  try {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  } catch {
    return null;
  }
}

/**
 * ToolCallCard - Memoized component for displaying tool calls.
 * Extracted outside MessageView to prevent recreation on every render.
 */
const ToolCallCard: React.FC<{
  tc: ToolCall;
  result?: { name?: string | null; content: unknown };
  durationMs?: number | null;
}> = React.memo(({ tc, result, durationMs }) => {
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
  const resultContent = result?.content;
  // Expandable details only show when the result actually has content.
  const hasResult =
    resultContent != null &&
    !(typeof resultContent === "string" && resultContent.trim().length === 0);
  const hasDetails = !!hasArgs || (isSubtask && !!subtaskInstructions) || hasResult;
  const isRunning = runningToolCallId && tc.id && runningToolCallId === tc.id;
  const durationLabel =
    !isRunning && typeof durationMs === "number" ? formatDuration(durationMs) : null;

  const handleToggleOpen = useCallback(() => {
    setOpen((v) => !v);
  }, []);
  const handleHeaderKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen((v) => !v);
    }
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
  const { Icon: ToolIcon, accent } = getToolVisual(tc.name);

  return (
    <div
      className={`tool-call-card${isRunning ? " running" : ""}${
        isSubtask ? " run-subtask" : ""
      }`}
    >
      <FlexRow
        className={`tool-call-header${hasDetails ? " expandable" : ""}`}
        align="center"
        fullWidth
        gap={1}
        role={hasDetails ? "button" : undefined}
        tabIndex={hasDetails ? 0 : undefined}
        aria-expanded={hasDetails ? open : undefined}
        onClick={hasDetails ? handleToggleOpen : undefined}
        onKeyDown={hasDetails ? handleHeaderKeyDown : undefined}
      >
        <span className={`tool-icon-tile accent-${accent}`} aria-hidden>
          <ToolIcon />
        </span>
        <FlexRow align="center" gap={1} sx={{ minWidth: 0, flex: 1 }}>
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
            weight={500}
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
          {/* Show the raw tool identifier only when the headline is an
              LLM-authored message — otherwise it would duplicate the
              formatted tool name sitting right next to it. */}
          {!isSubtask && !!liveMessage && (
            <span className="tool-call-id">{tc.name}</span>
          )}
        </FlexRow>
        <FlexRow align="center" gap={1} sx={{ flexShrink: 0 }}>
          {durationLabel && (
            <span className="tool-call-duration">{durationLabel}</span>
          )}
          {isRunning && <LoadingSpinner size="small" />}
          {hasDetails && (
            <ExpandMoreIcon
              className={`expand-icon${open ? " expanded" : ""}`}
              aria-hidden
            />
          )}
        </FlexRow>
      </FlexRow>
      <Collapse in={open} timeout="auto" unmountOnExit>
        <FlexColumn className="tool-call-details" gap={0.5}>
          {isSubtask && subtaskInstructions && (
            <FlexColumn gap={0.5}>
              <Caption className="tool-section-title">Instructions</Caption>
              <Text size="small" className="subtask-instructions">
                {subtaskInstructions}
              </Text>
            </FlexColumn>
          )}
          {hasArgs && (
            <FlexColumn gap={0.5}>
              <Caption className="tool-section-title">
                {isSubtask ? "Other arguments" : "Arguments"}
              </Caption>
              <PrettyJson value={displayArgs} />
            </FlexColumn>
          )}
          {hasResult && (
            <FlexColumn gap={0.5}>
              <Caption className="tool-section-title">Result</Caption>
              <ToolResult toolName={tc.name} content={resultContent} />
            </FlexColumn>
          )}
        </FlexColumn>
      </Collapse>
    </div>
  );
});
ToolCallCard.displayName = "ToolCallCard";

type ToolResultLookup = Record<
  string,
  { name?: string | null; content: unknown; createdAt?: string | null }
>;

/**
 * ToolCallGroup - Renders a message's tool calls as a "tool execution chain":
 * a tiny uppercase section label with a hairline rule, one bordered card per
 * call, and a completion summary bar. The section header collapses the chain
 * for dense threads. A lone tool call renders as a single card with no chrome.
 */
const ToolCallGroup: React.FC<{
  toolCalls: ToolCall[];
  toolResultsByCallId?: ToolResultLookup;
  messageCreatedAt?: string | null;
}> = React.memo(({ toolCalls, toolResultsByCallId, messageCreatedAt }) => {
  const [open, setOpen] = useState(true);
  const runningToolCallId = useGlobalChatStore((s) => s.currentRunningToolCallId);
  const handleToggleOpen = useCallback(() => setOpen((v) => !v), []);
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen((v) => !v);
    }
  }, []);

  const durationFor = useCallback(
    (tc: ToolCall) => {
      const toolResult =
        tc.id && toolResultsByCallId
          ? toolResultsByCallId[String(tc.id)]
          : undefined;
      const durationMs =
        toolResult?.createdAt && messageCreatedAt
          ? new Date(toolResult.createdAt).getTime() -
            new Date(messageCreatedAt).getTime()
          : null;
      return { toolResult, durationMs };
    },
    [toolResultsByCallId, messageCreatedAt]
  );

  const renderCard = useCallback(
    (tc: ToolCall, i: number) => {
      const { toolResult, durationMs } = durationFor(tc);
      return (
        <ToolCallCard
          key={tc.id || i}
          tc={tc}
          result={toolResult}
          durationMs={durationMs}
        />
      );
    },
    [durationFor]
  );

  const isRunning = toolCalls.some(
    (tc) => tc.id && runningToolCallId === tc.id
  );

  const { completedCount, totalDurationMs } = useMemo(() => {
    let completed = 0;
    let maxMs: number | null = null;
    for (const tc of toolCalls) {
      const { toolResult, durationMs } = durationFor(tc);
      if (toolResult !== undefined) {
        completed++;
      }
      if (typeof durationMs === "number" && Number.isFinite(durationMs)) {
        maxMs = maxMs === null ? durationMs : Math.max(maxMs, durationMs);
      }
    }
    return { completedCount: completed, totalDurationMs: maxMs };
  }, [toolCalls, durationFor]);

  // A single tool call keeps the original inline card — no group wrapper.
  if (toolCalls.length <= 1) {
    return <>{toolCalls.map(renderCard)}</>;
  }

  const totalDurationLabel =
    totalDurationMs !== null ? formatDuration(totalDurationMs) : null;

  return (
    <div className="tool-call-group">
      <FlexRow
        className="tool-call-group-header"
        align="center"
        gap={1}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={handleToggleOpen}
        onKeyDown={handleKeyDown}
      >
        <Text
          component="span"
          size="smaller"
          weight={500}
          className="tool-call-group-label"
        >
          Tool execution chain
        </Text>
        <span className="tool-call-group-rule" aria-hidden />
        {isRunning && <LoadingSpinner size="small" />}
        <ExpandMoreIcon
          className={`expand-icon${open ? " expanded" : ""}`}
          aria-hidden
        />
      </FlexRow>
      <Collapse in={open} timeout="auto" unmountOnExit>
        <FlexColumn className="tool-call-chain" gap={1}>
          {toolCalls.map(renderCard)}
          <FlexRow className="tool-call-summary" align="center" gap={1.5}>
            <span className="tool-call-summary-count">
              {completedCount}/{toolCalls.length} completed
            </span>
            {totalDurationLabel && (
              <>
                <span className="tool-call-summary-divider" aria-hidden>
                  |
                </span>
                <span className="tool-call-summary-duration">
                  {totalDurationLabel}
                </span>
              </>
            )}
          </FlexRow>
        </FlexColumn>
      </Collapse>
    </div>
  );
});
ToolCallGroup.displayName = "ToolCallGroup";

interface MessageViewProps {
  message: Message;
  isThoughtExpanded: (key: string) => boolean;
  onToggleThought: (key: string) => void;
  onInsertCode?: (text: string, language?: string) => void;
  toolResultsByCallId?: Record<
    string,
    { name?: string | null; content: unknown; createdAt?: string | null }
  >;
  executionMessagesById?: Map<string, Message[]>;
  /**
   * Render the per-message meta layout: an avatar + a persistent header line
   * (role · time · model), left-aligned for both roles. Enabled only in the
   * full-page chat; embedded chats keep the compact bubble layout.
   */
  showMeta?: boolean;
}

export const MessageView: React.FC<
  MessageViewProps & { componentStyles?: Record<string, unknown> }
> = React.memo(({
  message,
  isThoughtExpanded,
  onToggleThought,
  onInsertCode,
  toolResultsByCallId,
  executionMessagesById,
  showMeta = false
}) => {
  const insertIntoEditor = useEditorInsertion();

  const copyText = useMemo(() => {
    if (typeof message.content === "string") {
      return message.content;
    }
    if (Array.isArray(message.content)) {
      return message.content
        .filter(
          (c): c is MessageTextContent =>
            !!c && typeof c === "object" && c.type === "text"
        )
        .map((c) => c.text)
        .join("\n");
    }
    return "";
  }, [message.content]);

  const toggleCallbackRef = useRef(onToggleThought);
  toggleCallbackRef.current = onToggleThought;
  const toggleHandlerCache = useRef(new Map<string, () => void>());
  const createToggleHandler = useCallback((key: string) => {
    let handler = toggleHandlerCache.current.get(key);
    if (!handler) {
      handler = () => toggleCallbackRef.current(key);
      toggleHandlerCache.current.set(key, handler);
    }
    return handler;
  }, []);

  // Memoized so its reference is stable across renders. It is passed to every
  // React.memo'd MessageContentRenderer; a fresh closure each render would
  // defeat that memo and force all media children (e.g. <video>) to re-render.
  // Deps are exactly the non-stable values it closes over — createToggleHandler
  // is already stable via useCallback.
  const renderTextContent = useCallback(
    (content: string, index: string | number) => {
      if (hasHarmonyTokens(content)) {
        const { messages, rawText } = parseHarmonyContent(content);

        if (messages.length > 0) {
          return (
            <>
              {messages.map((message, i) => {
                const displayContent = getDisplayContent(message);
                const parsedContent = stripContextContent(displayContent);
                const parsedThought = parseThoughtContent(parsedContent);

                if (parsedThought) {
                  const key = `thought-${index}-${i}`;
                  const isExpanded = isThoughtExpanded(key);

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

      const parsedContent = stripContextContent(content);
      const parsedThought = parseThoughtContent(parsedContent);

      if (parsedThought) {
        const key = `thought-${index}`;
        const isExpanded = isThoughtExpanded(key);

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
    },
    [isThoughtExpanded, createToggleHandler, onInsertCode, insertIntoEditor]
  );

  if (message.role === "agent_execution") {
    const key = message.agent_execution_id || "__ungrouped__";
    const executionMessages = executionMessagesById?.get(key) ?? [];
    if (executionMessages.length > 0) {
      return <AgentExecutionView messages={executionMessages} />;
    }
    return null;
  }

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

    const showRoleMeta =
      showMeta && (message.role === "assistant" || message.role === "user");
    const messageClass = [
      baseClass,
      (message as Message & { error_type?: string }).error_type ? "error-message" : null,
      hasToolCalls ? "has-tool-calls" : null,
      hasToolCalls && !hasNonEmptyContent ? "tool-calls-only" : null,
      showRoleMeta ? "chat-message--meta" : null
    ]
      .filter(Boolean)
      .join(" ");

    const content = message.content as
      | Array<MessageTextContent | MessageImageContent>
      | string;

    const formattedTime = formatTime(message.created_at);
    return (
      <div className={messageClass}>
        <div className="message-body">
        {showRoleMeta && (
          <div className="message-header">
            {message.role === "user" ? (
              <PersonOutlineRoundedIcon className="message-role-icon" />
            ) : (
              <HubOutlinedIcon className="message-role-icon" />
            )}
            {formattedTime && (
              <span className="message-time">{formattedTime}</span>
            )}
            {message.role === "assistant" && message.model && (
              <span className="message-model">{message.model}</span>
            )}
          </div>
        )}
        <div className="message-content">
          {message.role === "assistant" &&
            Array.isArray(message.tool_calls) &&
            !message.agent_execution_id && ( // Don't render tool cards for agent tasks here (they are in AgentExecutionView)
              <ToolCallGroup
                toolCalls={message.tool_calls as ToolCall[]}
                toolResultsByCallId={toolResultsByCallId}
                messageCreatedAt={message.created_at}
              />
            )}
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
                  content.map((c: MessageContent, i: number) => {
                    // Guard against null / non-object blocks so the renderer's
                    // switch on `c.type` can't crash on a malformed block.
                    if (!c || typeof c !== "object") {
                      return null;
                    }
                    return (
                      <MessageContentRenderer
                        key={`${message.id}-content-${c.type}-${i}`}
                        content={c}
                        renderTextContent={renderTextContent}
                        index={i}
                      />
                    );
                  })
                ))}
            </>
          )}
        </div>
        {(message as Message & { error_type?: string }).error_type && <ErrorIcon className="error-icon" />}
        {!Array.isArray(message.tool_calls) && (
          <div className="message-actions">
            {!showRoleMeta && formattedTime && (
              <span className="message-timestamp">{formattedTime}</span>
            )}
            {!showRoleMeta && message.role === "assistant" && message.model && (
              <span className="message-model">{message.model}</span>
            )}
            <CopyButton
              value={copyText}
              buttonSize="small"
              tooltip="Copy to clipboard"
            />
          </div>
        )}
        </div>
      </div>
    );
});

MessageView.displayName = "MessageView";
