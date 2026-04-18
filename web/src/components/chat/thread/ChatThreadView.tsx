/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, {
  useRef,
  useEffect,
  useCallback,
  useState,
  useMemo,
  memo
} from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Message,
  PlanningUpdate,
  TaskUpdate,
  LogUpdate
} from "../../../stores/ApiTypes";
import { LoadingIndicator } from "../feedback/LoadingIndicator";
import { Progress } from "../feedback/Progress";
import { MessageView } from "../message/MessageView";
import { ScrollToBottomButton } from "../controls/ScrollToBottomButton";
import { createStyles } from "./ChatThreadView.styles";
import { textPulse } from "../styles/animations";
import PlanningUpdateDisplay from "../../node/PlanningUpdateDisplay";
import TaskUpdateDisplay from "../../node/TaskUpdateDisplay";

interface ChatThreadViewProps {
  messages: Message[];
  status:
  | "disconnected"
  | "connecting"
  | "connected"
  | "loading"
  | "error"
  | "streaming"
  | "reconnecting"
  | "disconnecting"
  | "failed";
  progress: number;
  total: number;
  progressMessage: string | null;
  runningToolCallId?: string | null;
  runningToolMessage?: string | null;
  currentPlanningUpdate?: PlanningUpdate | null;
  currentTaskUpdate?: TaskUpdate | null;
  currentLogUpdate?: LogUpdate | null;
  onInsertCode?: (text: string, language?: string) => void;
}

const SCROLL_THRESHOLD = 50;
const ESTIMATED_MESSAGE_HEIGHT = 200;

interface StatusFooterProps {
  status: ChatThreadViewProps["status"];
  progress: number;
  total: number;
  progressMessage: string | null;
  runningToolCallId?: string | null;
  currentPlanningUpdate?: PlanningUpdate | null;
  currentTaskUpdate?: TaskUpdate | null;
  currentLogUpdate?: LogUpdate | null;
  hasAgentExecutionMessages: boolean;
  theme: Theme;
}

const StatusFooter = memo<StatusFooterProps>(
  ({
    status,
    progress,
    total,
    progressMessage,
    runningToolCallId,
    currentPlanningUpdate,
    currentTaskUpdate,
    currentLogUpdate,
    hasAgentExecutionMessages,
    theme
  }) => {
    return (
      <>
        {status === "loading" &&
          progress === 0 &&
          !hasAgentExecutionMessages && (
            <div className="chat-message-list-item">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "4px 0"
                }}
              >
                <LoadingIndicator />
                <span
                  style={{
                    fontSize: "0.85rem",
                    color: theme.vars.palette.text.secondary,
                    fontStyle: "italic"
                  }}
                >
                  Thinking...
                </span>
              </div>
            </div>
          )}
        {progress > 0 && !hasAgentExecutionMessages && (
          <div className="chat-message-list-item">
            <Progress progress={progress} total={total} />
          </div>
        )}
        {progressMessage && !runningToolCallId && !hasAgentExecutionMessages && (
          <div className="node-status chat-message-list-item">
            <span
              css={css`
                display: inline;
                animation: ${textPulse} 1.8s ease-in-out infinite;
              `}
            >
              {progressMessage}
            </span>
          </div>
        )}
        {!hasAgentExecutionMessages && currentPlanningUpdate && (
          <div className="chat-message-list-item">
            <PlanningUpdateDisplay planningUpdate={currentPlanningUpdate} />
          </div>
        )}
        {!hasAgentExecutionMessages && currentTaskUpdate && (
          <div className="chat-message-list-item">
            <TaskUpdateDisplay taskUpdate={currentTaskUpdate} />
          </div>
        )}
        {!hasAgentExecutionMessages && currentLogUpdate && (
          <div className="chat-message-list-item">
            <div style={{ position: "relative", paddingLeft: "1.5rem" }}>
              <div
                style={{
                  position: "absolute",
                  left: "4px",
                  top: "10px",
                  bottom: "10px",
                  width: "2px",
                  background: `linear-gradient(to bottom, ${theme.vars.palette.primary.main}, ${theme.vars.palette.secondary.main}44)`,
                  borderRadius: "1px"
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: "-21px",
                  top: "12px",
                  width: "10px",
                  height: "10px",
                  borderRadius: "var(--rounded-circle)",
                  backgroundColor: theme.vars.palette.primary.main,
                  border: `2px solid ${theme.vars.palette.background.default}`,
                  boxShadow: `0 0 10px ${theme.vars.palette.primary.main}aa`,
                  zIndex: 2
                }}
              />
              <div
                className={`log-entry log-severity-${currentLogUpdate.severity || "info"}`}
                style={{
                  fontSize: "0.8rem",
                  padding: "0.5rem 0.75rem",
                  borderRadius: "var(--rounded-lg)",
                  backgroundColor: "rgba(30, 35, 40, 0.4)",
                  border: `1px solid ${theme.vars.palette.action.disabledBackground}`,
                  color:
                    currentLogUpdate.severity === "error"
                      ? theme.vars.palette.error.light
                      : currentLogUpdate.severity === "warning"
                        ? theme.vars.palette.warning.light
                        : "grey.300"
                }}
              >
                {currentLogUpdate.content}
              </div>
            </div>
          </div>
        )}
      </>
    );
  }
);
StatusFooter.displayName = "StatusFooter";

const ChatThreadView: React.FC<ChatThreadViewProps> = ({
  messages,
  status,
  progress,
  total,
  progressMessage,
  runningToolCallId,
  runningToolMessage: _runningToolMessage,
  currentPlanningUpdate,
  currentTaskUpdate,
  currentLogUpdate,
  onInsertCode
}) => {
  const theme = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollHost, setScrollHost] = useState<HTMLDivElement | null>(null);
  const [expandedThoughts, setExpandedThoughts] = useState<
    Record<string, boolean>
  >({});
  const [showScrollToBottomButton, setShowScrollToBottomButton] =
    useState(false);
  const userHasScrolledUpRef = useRef(false);
  const previousMessageCountRef = useRef(messages.length);

  const componentStyles = useMemo(() => createStyles(theme), [theme]);

  const handleScrollRef = useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node;
    setScrollHost(node);
  }, []);

  const executionMessagesById = useMemo(() => {
    const map = new Map<string, Message[]>();
    for (const msg of messages) {
      if (msg.role !== "agent_execution") continue;
      const key = msg.agent_execution_id || "__ungrouped__";
      const list = map.get(key) || [];
      list.push(msg);
      map.set(key, list);
    }
    return map;
  }, [messages]);

  const toolResultsByCallId = useMemo(() => {
    const map: Record<string, { name?: string | null; content: any }> = {};
    for (const m of messages) {
      if (m.role === "tool" && m.tool_call_id) {
        map[String(m.tool_call_id)] = {
          name: m.name ?? undefined,
          content: m.content
        };
      }
    }
    return map;
  }, [messages]);

  const hasAgentExecutionMessages = useMemo(
    () => messages.some((msg) => msg.role === "agent_execution"),
    [messages]
  );

  const { filteredMessages, lastUserMessageIndex } = useMemo(() => {
    const filtered: Message[] = [];
    for (const m of messages) {
      if (m.role === "tool") continue;

      const hasToolCalls =
        Array.isArray(m.tool_calls) && m.tool_calls.length > 0;
      const hasExecutionEvent =
        !!m.execution_event_type || m.role === "agent_execution";

      let hasContent = false;
      if (typeof m.content === "string") {
        hasContent = m.content.trim().length > 0;
      } else if (Array.isArray(m.content)) {
        hasContent = m.content.some((block: any) => {
          if (!block || typeof block !== "object") return false;
          if (block.type === "text") {
            return (
              typeof block.text === "string" && block.text.trim().length > 0
            );
          }
          if (block.type === "image_url" || block.type === "image") return true;
          return true;
        });
      } else if (m.content != null) {
        hasContent = true;
      }

      if (!hasContent && !hasToolCalls && !hasExecutionEvent) continue;

      // Only render the first message per agent_execution group
      if (m.role === "agent_execution") {
        const key = m.agent_execution_id || "__ungrouped__";
        const group = executionMessagesById.get(key);
        if (group && group[0] !== m) continue;
      }

      filtered.push(m);
    }

    let lastUserIdx = -1;
    for (let i = 0; i < filtered.length; i++) {
      if (filtered[i].role === "user") lastUserIdx = i;
    }
    return { filteredMessages: filtered, lastUserMessageIndex: lastUserIdx };
  }, [messages, executionMessagesById]);

  const virtualizer = useVirtualizer({
    count: filteredMessages.length,
    getScrollElement: () => scrollHost,
    estimateSize: () => ESTIMATED_MESSAGE_HEIGHT,
    overscan: 6,
    getItemKey: (index) => filteredMessages[index].id ?? `msg-${index}`,
    initialRect: { width: 0, height: 800 }
  });

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_THRESHOLD;
    userHasScrolledUpRef.current = !nearBottom;
    setShowScrollToBottomButton(!nearBottom);
  }, []);

  useEffect(() => {
    const el = scrollHost;
    if (!el) return;
    const onScroll = () => updateScrollState();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollHost, updateScrollState]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    userHasScrolledUpRef.current = false;
    setShowScrollToBottomButton(false);
  }, []);

  // On new user message → scroll that message to top.
  // On other new messages → follow to bottom if user hasn't scrolled up.
  useEffect(() => {
    const prevCount = previousMessageCountRef.current;
    previousMessageCountRef.current = messages.length;
    if (messages.length <= prevCount) return;

    const last = messages[messages.length - 1];
    if (last?.role === "user" && lastUserMessageIndex >= 0) {
      virtualizer.scrollToIndex(lastUserMessageIndex, { align: "start" });
      userHasScrolledUpRef.current = false;
      setShowScrollToBottomButton(false);
      return;
    }

    if (!userHasScrolledUpRef.current) {
      const el = scrollRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight });
    }
  }, [messages, lastUserMessageIndex, virtualizer]);

  // Follow streaming output when user is at bottom.
  const totalSizeForEffect = virtualizer.getTotalSize();
  useEffect(() => {
    if (status !== "streaming") return;
    if (userHasScrolledUpRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight });
  }, [status, totalSizeForEffect]);

  const handleToggleThought = useCallback((key: string) => {
    setExpandedThoughts((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = totalSizeForEffect;

  return (
    <div
      css={componentStyles.chatThreadViewRoot}
      className="chat-thread-view-root"
    >
      <div
        ref={handleScrollRef}
        css={componentStyles.messageWrapper}
        className="scrollable-message-wrapper"
      >
        <div
          css={componentStyles.chatMessagesList}
          className="chat-messages-list"
        >
          <div
            className="chat-messages-virtual"
            style={{
              position: "relative",
              width: "100%",
              height: `${totalSize}px`
            }}
          >
            {virtualItems.map((virtualRow) => {
              const msg = filteredMessages[virtualRow.index];
              const messageKey = msg.id || `msg-${virtualRow.index}`;
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`
                  }}
                >
                  <MessageView
                    key={messageKey}
                    message={msg}
                    expandedThoughts={expandedThoughts}
                    onToggleThought={handleToggleThought}
                    onInsertCode={onInsertCode}
                    toolResultsByCallId={toolResultsByCallId}
                    componentStyles={componentStyles}
                    executionMessagesById={executionMessagesById}
                  />
                </div>
              );
            })}
          </div>

          <StatusFooter
            status={status}
            progress={progress}
            total={total}
            progressMessage={progressMessage}
            runningToolCallId={runningToolCallId}
            currentPlanningUpdate={currentPlanningUpdate}
            currentTaskUpdate={currentTaskUpdate}
            currentLogUpdate={currentLogUpdate}
            hasAgentExecutionMessages={hasAgentExecutionMessages}
            theme={theme}
          />
        </div>
      </div>

      <ScrollToBottomButton
        isVisible={showScrollToBottomButton}
        onClick={scrollToBottom}
        containerElement={scrollHost}
      />
    </div>
  );
};

export default memo(ChatThreadView);
