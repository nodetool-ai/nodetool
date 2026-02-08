import React, { useMemo, useState, useCallback } from "react";
import {
  Message,
  MessageContent,
  MessageTextContent,
  MessageImageContent,
  ToolCall,
  PlanningUpdate,
  TaskUpdate,
  StepResult
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
import { CopyButton } from "../../ui_primitives";
import ErrorIcon from "@mui/icons-material/Error";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  Box,
  Chip,
  Collapse,
  IconButton,
  Tooltip,
  Typography
} from "@mui/material";
import CircularProgress from "@mui/material/CircularProgress";
import PlanningUpdateDisplay from "../../node/PlanningUpdateDisplay";
import TaskUpdateDisplay from "../../node/TaskUpdateDisplay";
import StepResultDisplay from "../../node/StepResultDisplay";
import AgentExecutionView from "./AgentExecutionView";

interface MessageViewProps {
  message: Message;
  expandedThoughts: { [key: string]: boolean };
  onToggleThought: (key: string) => void;
  onInsertCode?: (text: string, language?: string) => void;
  toolResultsByCallId?: Record<string, { name?: string | null; content: any }>;
  executionMessagesById?: Map<string, Message[]>;
}

export const MessageView: React.FC<
  MessageViewProps & { componentStyles?: any }
> = React.memo(({
  message,
  expandedThoughts,
  onToggleThought,
  onInsertCode,
  toolResultsByCallId,
  executionMessagesById
}) => {
  const insertIntoEditor = useEditorInsertion();

  // Memoize JSON parsing to avoid repeated parsing on every render
  const { executionContent, executionEventType } = useMemo(() => {
    let executionContent = message.content as any;
    let executionEventType = message.execution_event_type;

    if (typeof executionContent === "string") {
      try {
        executionContent = JSON.parse(executionContent);
        if (typeof executionContent === "string") {
          try {
            executionContent = JSON.parse(executionContent);
          } catch {
            // Keep intermediate string if nested JSON parsing fails.
          }
        }
      } catch {
        // Keep original string if JSON parsing fails.
      }
    }

    if (
      !executionEventType &&
      executionContent &&
      typeof executionContent === "object" &&
      "type" in executionContent
    ) {
      executionEventType = (executionContent as any).type;
    }

    return { executionContent, executionEventType };
  }, [message.content, message.execution_event_type]);

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
    const agentExecutionId = message.agent_execution_id;

    // If no agent_execution_id, fall back to old behavior
    if (!agentExecutionId) {

        if (executionEventType === "planning_update") {
          return (
            <div className="chat-message-list-item execution-event">
              <PlanningUpdateDisplay planningUpdate={executionContent as PlanningUpdate} />
            </div>
          );
        } else if (executionEventType === "task_update") {
          return (
            <div className="chat-message-list-item execution-event">
              <TaskUpdateDisplay taskUpdate={executionContent as TaskUpdate} />
            </div>
          );
        } else if (executionEventType === "step_result") {
          const stepResult = executionContent as StepResult;
          return (
            <div className="chat-message-list-item execution-event">
              <StepResultDisplay stepResult={stepResult} />
            </div>
          );
        } else if (executionEventType === "log_update") {
          return (
            <div className="chat-message-list-item execution-event">
              <Box sx={{
                fontSize: "0.8rem",
                padding: "0.5rem 0.75rem",
                borderRadius: "8px",
                backgroundColor: "rgba(30, 35, 40, 0.4)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                color: executionContent.severity === "error" ? "error.light" : executionContent.severity === "warning" ? "warning.light" : "grey.300",
                mb: 1
              }}>
                {executionContent.content}
              </Box>
            </div>
          );
        }

        return null;
      }

    const executionMessages = executionMessagesById?.get(agentExecutionId) ?? [];
    if (executionMessages.length > 0) {
      return <AgentExecutionView messages={executionMessages} />;
    }

    if (executionEventType === "planning_update") {
        return (
          <div className="chat-message-list-item execution-event">
            <PlanningUpdateDisplay planningUpdate={executionContent as PlanningUpdate} />
          </div>
        );
      } else if (executionEventType === "task_update") {
        return (
          <div className="chat-message-list-item execution-event">
            <TaskUpdateDisplay taskUpdate={executionContent as TaskUpdate} />
          </div>
        );
      } else if (executionEventType === "step_result") {
        const stepResult = executionContent as StepResult;
        return (
          <div className="chat-message-list-item execution-event">
            <StepResultDisplay stepResult={stepResult} />
          </div>
        );
      } else if (executionEventType === "log_update") {
        return (
          <div className="chat-message-list-item execution-event">
            <Box sx={{
              fontSize: "0.8rem",
              padding: "0.5rem 0.75rem",
              borderRadius: "8px",
              backgroundColor: "rgba(30, 35, 40, 0.4)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              color: executionContent.severity === "error" ? "error.light" : executionContent.severity === "warning" ? "warning.light" : "grey.300",
              mb: 1
            }}>
              {executionContent.content}
            </Box>
          </div>
        );
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
      (Array.isArray(message.content) && message.content.length > 0);

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

    // Pretty JSON helper
    const PrettyJson: React.FC<{ value: any }> = React.memo(({ value }) => {
      const text = useMemo(() => {
        try {
          if (typeof value === "string") {
            const parsed = JSON.parse(value);
            return JSON.stringify(parsed, null, 2);
          }
          return JSON.stringify(value, null, 2);
        } catch {
          return typeof value === "string" ? value : String(value);
        }
      }, [value]);
      return <pre className="pretty-json">{text}</pre>;
    });
    PrettyJson.displayName = "PrettyJson";

    const ToolCallCard: React.FC<{
      tc: ToolCall;
      result?: { name?: string | null; content: any };
    }> = React.memo(({ tc, result: _result }) => {
      const [open, setOpen] = useState(false);
      const runningToolCallId = useGlobalChatStore(
        (s) => s.currentRunningToolCallId
      );
      const runningToolMessage = useGlobalChatStore((s) => s.currentToolMessage);
      const hasArgs =
        (tc as any)?.args && Object.keys((tc as any).args).length > 0;
      const hasDetails = !!hasArgs;
      const isRunning = runningToolCallId && tc.id && runningToolCallId === tc.id;

      const handleToggleOpen = useCallback(() => {
        setOpen((v) => !v);
      }, []);

      return (
        <Box
          className="tool-call-card"
          sx={isRunning ? { borderColor: (theme) => theme.vars.palette.info.main } : undefined}
        >
          <Box className="tool-call-header">
            <Chip
              color="default"
              size="small"
              variant="outlined"
              className="tool-chip"
              label={tc.name}
            />
            {(isRunning || tc.message) && (
              <Typography variant="body2" className="tool-message">
                {isRunning ? runningToolMessage || tc.message : tc.message}
              </Typography>
            )}
            {isRunning && <CircularProgress size={16} sx={{ ml: 1 }} />}
            <Box sx={{ flex: 1 }} />
            {hasDetails && (
              <Tooltip title={open ? "Hide details" : "Show details"}>
                <IconButton size="small" onClick={handleToggleOpen}>
                  <ExpandMoreIcon
                    className={`expand-icon${open ? " expanded" : ""}`}
                  />
                </IconButton>
              </Tooltip>
            )}
          </Box>
          <Collapse in={open} timeout="auto" unmountOnExit>
            {hasArgs && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="caption" className="tool-section-title">
                  Arguments
                </Typography>
                <PrettyJson value={(tc as any).args} />
              </Box>
            )}

          </Collapse>
        </Box>
      );
    });
    ToolCallCard.displayName = "ToolCallCard";

    // Format timestamp for display
    const formatTime = (dateStr?: string | null) => {
      if (!dateStr) {
        return null;
      }
      try {
        const date = new Date(dateStr);
        return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      } catch {
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
                content.map((c: MessageContent, i: number) => (
                  <MessageContentRenderer
                    key={i}
                    content={c}
                    renderTextContent={renderTextContent}
                    index={i}
                  />
                ))}
            </>
          )}
        </div>
        {(message as Message & { error_type?: string }).error_type && <ErrorIcon className="error-icon" />}
        {/* Message actions: timestamp + copy button */}
        {!Array.isArray(message.tool_calls) && (
          <div className="message-actions">
            {message.role === "user" && formattedTime && (
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
