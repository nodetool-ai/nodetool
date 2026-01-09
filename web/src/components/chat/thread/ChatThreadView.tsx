/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, {
  useRef,
  useEffect,
  useCallback,
  useState,
  useMemo
} from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Message, PlanningUpdate, TaskUpdate, LogUpdate } from "../../../stores/ApiTypes";
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
  _runningToolMessage?: string | null;
  currentPlanningUpdate?: PlanningUpdate | null;
  currentTaskUpdate?: TaskUpdate | null;
  currentLogUpdate?: LogUpdate | null;
  onInsertCode?: (text: string, language?: string) => void;
  scrollContainer?: HTMLDivElement | null;
}

const USER_SCROLL_IDLE_THRESHOLD_MS = 500;
const ASSISTANT_MESSAGE_SCROLL_DEBOUNCE_MS = 200;

// Define props for the memoized list content component
interface MemoizedMessageListContentProps
  extends Omit<ChatThreadViewProps, "scrollContainer"> {
  expandedThoughts: { [key: string]: boolean };
  onToggleThought: (key: string) => void;
  bottomRef: React.RefObject<HTMLDivElement>;
  lastUserMessageRef: React.RefObject<HTMLDivElement>;
  componentStyles: ReturnType<typeof createStyles>;
  toolResultsByCallId: Record<string, { name?: string | null; content: any }>;
  theme: Theme;
  runningToolMessage?: string | null;
}

const MemoizedMessageListContent = React.memo<MemoizedMessageListContentProps>(
  ({
    messages,
    status,
    progress,
    total,
    progressMessage,
    runningToolCallId,
    currentPlanningUpdate,
    currentTaskUpdate,
    currentLogUpdate,
    expandedThoughts,
    onToggleThought,
    bottomRef,
    lastUserMessageRef,
    componentStyles,
    onInsertCode,
    toolResultsByCallId,
    theme
  }) => {
    const hasAgentExecutionMessages = messages.some(
      (msg) => msg.role === "agent_execution"
    );
    const executionMessagesById = useMemo(() => {
      const map = new Map<string, Message[]>();
      for (const msg of messages) {
        if (msg.role !== "agent_execution" || !msg.agent_execution_id) { continue; }
        const list = map.get(msg.agent_execution_id) || [];
        list.push(msg);
        map.set(msg.agent_execution_id, list);
      }
      return map;
    }, [messages]);

    // Memoize filtered messages and last user message index to avoid recalculations on each render
    const { filteredMessages, lastUserMessageIndex } = useMemo(() => {
      const filtered = messages.filter((m) => m.role !== "tool");
      const lastUserIdx = filtered.reduce(
        (lastIdx, msg, idx) => (msg.role === "user" ? idx : lastIdx),
        -1
      );
      return { filteredMessages: filtered, lastUserMessageIndex: lastUserIdx };
    }, [messages]);

    return (
      <ul css={componentStyles.chatMessagesList} className="chat-messages-list">
        {filteredMessages
          .map((msg, index) => {
            if (msg.role === "agent_execution" && msg.agent_execution_id) {
              const executionMessages =
                executionMessagesById.get(msg.agent_execution_id);
              if (executionMessages && executionMessages[0] !== msg) {
                return null;
              }
            }
            const isLastUserMessage = index === lastUserMessageIndex;
            // Use message id as key, with fallback to index-based key for rare cases where id is missing
            const messageKey = msg.id || `msg-${index}`;
            const messageElement = (
              <MessageView
                key={messageKey}
                message={msg}
                expandedThoughts={expandedThoughts}
                onToggleThought={onToggleThought}
                onInsertCode={onInsertCode}
                toolResultsByCallId={toolResultsByCallId}
                componentStyles={componentStyles}
                executionMessagesById={executionMessagesById}
              />
            );
            // Wrap the last user message in a div with ref for scroll-to-top behavior
            if (isLastUserMessage) {
              return (
                <div key={`wrapper-${messageKey}`} ref={lastUserMessageRef}>
                  {messageElement}
                </div>
              );
            }
            return messageElement;
          })}
        {status === "loading" && progress === 0 && !hasAgentExecutionMessages && (
          <li key="loading-indicator" className="chat-message-list-item">
            <LoadingIndicator />
          </li>
        )}
        {progress > 0 && !hasAgentExecutionMessages && (
          <li key="progress-indicator" className="chat-message-list-item">
            <Progress progress={progress} total={total} />
          </li>
        )}
        {/* Hide global progress message if a tool call is running */}
        {progressMessage && !runningToolCallId && !hasAgentExecutionMessages && (
          <li
            key="progress-message"
            className="node-status chat-message-list-item"
          >
            <span
              css={css`
                display: inline;
                animation: ${textPulse} 1.8s ease-in-out infinite;
              `}
            >
              {progressMessage}
            </span>
          </li>
        )}
        {/* Reserve area for future non-animated hints when a tool is running, if needed */}
        {!hasAgentExecutionMessages && currentPlanningUpdate && (
          <li key="planning-update" className="chat-message-list-item">
            <PlanningUpdateDisplay planningUpdate={currentPlanningUpdate} />
          </li>
        )}
        {!hasAgentExecutionMessages && currentTaskUpdate && (
          <li key="task-update" className="chat-message-list-item">
            <TaskUpdateDisplay taskUpdate={currentTaskUpdate} />
          </li>
        )}
        {!hasAgentExecutionMessages && currentLogUpdate && (
          <li key="log-update" className="chat-message-list-item">
            <div style={{ position: "relative", paddingLeft: "1.5rem" }}>
              <div style={{
                position: "absolute",
                left: "4px",
                top: "10px",
                bottom: "10px",
                width: "2px",
                background: `linear-gradient(to bottom, ${theme.vars.palette.primary.main}, ${theme.vars.palette.secondary.main}44)`,
                borderRadius: "1px"
              }} />
              <div style={{
                position: "absolute",
                left: "-21px",
                top: "12px",
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                backgroundColor: theme.vars.palette.primary.main,
                border: `2px solid ${theme.vars.palette.background.default}`,
                boxShadow: `0 0 10px ${theme.vars.palette.primary.main}aa`,
                zIndex: 2
              }} />
              <div className={`log-entry log-severity-${currentLogUpdate.severity || "info"}`} style={{
                fontSize: "0.8rem",
                padding: "0.5rem 0.75rem",
                borderRadius: "8px",
                backgroundColor: "rgba(30, 35, 40, 0.4)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                color: currentLogUpdate.severity === "error" ? theme.vars.palette.error.light : currentLogUpdate.severity === "warning" ? theme.vars.palette.warning.light : "grey.300",
              }}>
                {currentLogUpdate.content}
              </div>
            </div>
          </li>
        )}
        <div ref={bottomRef} style={{ height: 1 }} />
        {/* Spacer to allow scrolling the last user message to the top of the viewport */}
        <div
          className="scroll-spacer"
          style={{
            height: 'calc(100vh - 200px)',
            minHeight: '400px',
            flexShrink: 0
          }}
        />
      </ul>
    );
  }
);
MemoizedMessageListContent.displayName = "MemoizedMessageListContent";

const ChatThreadView: React.FC<ChatThreadViewProps> = ({
  messages,
  status,
  progress,
  total,
  progressMessage,
  runningToolCallId,
  runningToolMessage,
  currentPlanningUpdate,
  currentTaskUpdate,
  currentLogUpdate,
  onInsertCode,
  scrollContainer
}) => {
  const theme = useTheme();
  const internalScrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastUserMessageRef = useRef<HTMLDivElement>(null);
  const [expandedThoughts, setExpandedThoughts] = useState<{
    [key: string]: boolean;
  }>({});
  const userHasScrolledUpRef = useRef(false);
  const isNearBottomRef = useRef(true);
  const lastUserScrollTimeRef = useRef<number>(0);
  const autoScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showScrollToBottomButton, setShowScrollToBottomButton] =
    useState(false);
  const [scrollHost, setScrollHost] = useState<HTMLDivElement | null>(null);
  const previousStatusRef = useRef(status);
  const previousMessageCountRef = useRef(messages.length);

  const SCROLL_THRESHOLD = 50;

  const componentStyles = useMemo(() => createStyles(theme), [theme]);

  const toolResultsByCallId = useMemo(() => {
    const map: Record<string, { name?: string | null; content: any }> = {};
    for (const m of messages) {
      // Tool result messages carry tool_call_id to link back to the originating tool call
      const anyMsg: any = m as any;
      if (m.role === "tool" && anyMsg.tool_call_id) {
        map[String(anyMsg.tool_call_id)] = {
          name: anyMsg.name ?? undefined,
          content: m.content as any
        };
      }
    }
    return map;
  }, [messages]);

  useEffect(() => {
    lastUserScrollTimeRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (scrollContainer) {
      setScrollHost(scrollContainer);
    } else if (internalScrollRef.current) {
      setScrollHost(internalScrollRef.current);
    }
  }, [scrollContainer]);

  const handleScroll = useCallback(() => {
    lastUserScrollTimeRef.current = Date.now();
    const element = scrollHost;
    if (!element) { return; }

    const calculatedIsNearBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight <
      SCROLL_THRESHOLD;

    const previousUserHasScrolledUp = userHasScrolledUpRef.current;
    if (!calculatedIsNearBottom && !userHasScrolledUpRef.current) {
      userHasScrolledUpRef.current = true;
    } else if (calculatedIsNearBottom && userHasScrolledUpRef.current) {
      userHasScrolledUpRef.current = false;
    }

    if (userHasScrolledUpRef.current !== previousUserHasScrolledUp) {
      const shouldBeVisible =
        !isNearBottomRef.current && userHasScrolledUpRef.current;
      if (shouldBeVisible !== showScrollToBottomButton) {
        setShowScrollToBottomButton(shouldBeVisible);
      }
    }
  }, [showScrollToBottomButton, scrollHost]);

  useEffect(() => {
    if (!scrollHost) {
      return;
    }
    const handleScrollEvent = () => handleScroll();
    scrollHost.addEventListener("scroll", handleScrollEvent);
    return () => {
      scrollHost.removeEventListener("scroll", handleScrollEvent);
    };
  }, [scrollHost, handleScroll]);

  const scrollToBottom = useCallback(() => {
    const el = bottomRef.current;
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
      userHasScrolledUpRef.current = false;
    }
  }, []);

  // Scroll to align the last user message at the top of the viewport
  const scrollToLastUserMessage = useCallback(() => {
    const el = lastUserMessageRef.current;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      userHasScrolledUpRef.current = false;
    }
  }, []);

  useEffect(() => {
    const scrollElement = scrollHost;
    const bottomElement = bottomRef.current;
    if (!scrollElement || !bottomElement) { return; }

    const observer = new IntersectionObserver(
      ([entry]) => {
        const wasNearBottom = isNearBottomRef.current;
        isNearBottomRef.current = entry.isIntersecting;

        if (isNearBottomRef.current !== wasNearBottom) {
          const shouldBeVisible =
            !isNearBottomRef.current && userHasScrolledUpRef.current;
          if (shouldBeVisible !== showScrollToBottomButton) {
            setShowScrollToBottomButton(shouldBeVisible);
          }
        }
      },
      { root: scrollElement, threshold: 0.1 }
    );

    observer.observe(bottomElement);
    return () => {
      observer.disconnect();
    };
  }, [scrollHost, showScrollToBottomButton]);

  useEffect(() => {
    if (previousStatusRef.current === "streaming" && status !== "streaming") {
      scrollToBottom();
    }
    previousStatusRef.current = status;
  }, [status, scrollToBottom]);

  useEffect(() => {
    if (messages.length <= previousMessageCountRef.current) {
      previousMessageCountRef.current = messages.length;
      return;
    }
    previousMessageCountRef.current = messages.length;
    const lastMessage =
      messages.length > 0 ? messages[messages.length - 1] : null;
    if (lastMessage?.role === "user") {
      scrollToLastUserMessage();
    }
  }, [messages, scrollToLastUserMessage]);

  useEffect(() => {
    if (autoScrollTimeoutRef.current) {
      clearTimeout(autoScrollTimeoutRef.current);
    }

    const lastMessage =
      messages.length > 0 ? messages[messages.length - 1] : null;
    if (
      status === "streaming" ||
      (lastMessage && lastMessage.role !== "user")
    ) {
      autoScrollTimeoutRef.current = setTimeout(() => {
        const userIsIdle =
          Date.now() - lastUserScrollTimeRef.current >
          USER_SCROLL_IDLE_THRESHOLD_MS;

        if (
          !userHasScrolledUpRef.current &&
          userIsIdle &&
          isNearBottomRef.current
        ) {
          scrollToBottom();
        }
      }, ASSISTANT_MESSAGE_SCROLL_DEBOUNCE_MS);
    }

    return () => {
      if (autoScrollTimeoutRef.current) {
        clearTimeout(autoScrollTimeoutRef.current);
      }
    };
  }, [messages, status, scrollToBottom]);

  const handleToggleThought = useCallback((key: string) => {
    setExpandedThoughts((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  return (
    <div
      css={componentStyles.chatThreadViewRoot}
      className="chat-thread-view-root"
    >
      <div
        ref={internalScrollRef}
        css={componentStyles.messageWrapper}
        className="scrollable-message-wrapper"
      >
        <MemoizedMessageListContent
          messages={messages}
          status={status}
          progress={progress}
          total={total}
          progressMessage={progressMessage}
          runningToolCallId={runningToolCallId}
          runningToolMessage={runningToolMessage}
          currentPlanningUpdate={currentPlanningUpdate}
          currentTaskUpdate={currentTaskUpdate}
          currentLogUpdate={currentLogUpdate}
          expandedThoughts={expandedThoughts}
          onToggleThought={handleToggleThought}
          bottomRef={bottomRef}
          lastUserMessageRef={lastUserMessageRef}
          componentStyles={componentStyles}
          onInsertCode={onInsertCode}
          toolResultsByCallId={toolResultsByCallId}
          theme={theme}
        />
      </div>
      <ScrollToBottomButton
        isVisible={showScrollToBottomButton}
        onClick={scrollToBottom}
      />
    </div>
  );
};

export default ChatThreadView;
