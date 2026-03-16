/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, {
  useRef,
  useEffect,
  useCallback,
  useState,
  useMemo,
  memo,
  RefObject
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
const SPACER_RECALC_DEBOUNCE_MS = 100;

// Dynamic scroll spacer component that adapts to content and viewport
// Purpose: Provide enough space at the bottom so the last user message can be scrolled to the top
// Memoized to prevent unnecessary re-renders during scrolling
interface DynamicScrollSpacerProps {
  lastUserMessageRef: RefObject<HTMLDivElement>;
  bottomRef: RefObject<HTMLDivElement>;
  scrollHost: HTMLElement | null;
}

const DynamicScrollSpacer = memo(function DynamicScrollSpacer({
  lastUserMessageRef,
  bottomRef,
  scrollHost
}: DynamicScrollSpacerProps) {
  const [spacerHeight, setSpacerHeight] = useState(0);
  const prevSpacerHeightRef = useRef(0);
  const spacerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let recalcTimeoutId: number | null = null;

    const calculateOptimalSpacerHeight = () => {
      if (!scrollHost || !lastUserMessageRef.current || !bottomRef.current) {
        if (prevSpacerHeightRef.current !== 0) {
          prevSpacerHeightRef.current = 0;
          setSpacerHeight(0);
        }
        return;
      }

      const viewportHeight = scrollHost.clientHeight;
      const lastUserMessage = lastUserMessageRef.current;
      const bottomElement = bottomRef.current;

      // Get positions relative to the scroll container's content
      const lastUserMessageRect = lastUserMessage.getBoundingClientRect();
      const bottomRect = bottomElement.getBoundingClientRect();

      // Calculate height of content from user message top to bottom marker
      // This is the content that needs to fit when the user message is at the top
      const contentBelowUserMessage = bottomRect.bottom - lastUserMessageRect.top;

      // Spacer should fill the remaining viewport space so the message can scroll to top
      // If content below user message is less than viewport, we need a spacer
      let neededHeight = Math.max(0, viewportHeight - contentBelowUserMessage);

      // Safety cap: never exceed viewport height (which is the max useful spacer)
      neededHeight = Math.min(neededHeight, viewportHeight);

      // Only update if there's a meaningful change to avoid layout thrashing
      if (Math.abs(neededHeight - prevSpacerHeightRef.current) > 5) {
        prevSpacerHeightRef.current = neededHeight;
        setSpacerHeight(neededHeight);
      }
    };

    const scheduleRecalculation = () => {
      if (recalcTimeoutId !== null) {
        clearTimeout(recalcTimeoutId);
      }
      recalcTimeoutId = window.setTimeout(() => {
        calculateOptimalSpacerHeight();
        recalcTimeoutId = null;
      }, SPACER_RECALC_DEBOUNCE_MS);
    };

    // Calculate initial height
    calculateOptimalSpacerHeight();

    // Use MutationObserver to watch for content changes (exclude spacer changes)
    const mutationObserver = new MutationObserver((mutations) => {
      // Ignore mutations that only affect the spacer itself
      const hasNonSpacerMutation = mutations.some(m => {
        if (m.target === spacerRef.current) { return false; }
        if (m.type === 'attributes' && m.target === spacerRef.current) { return false; }
        return true;
      });
      if (hasNonSpacerMutation) {
        scheduleRecalculation();
      }
    });

    if (lastUserMessageRef.current) {
      mutationObserver.observe(lastUserMessageRef.current.parentElement || lastUserMessageRef.current, {
        childList: true,
        subtree: true,
        attributes: false
      });
    }

    // Recalculate on resize
    const resizeObserver = new ResizeObserver(scheduleRecalculation);

    if (scrollHost) {
      resizeObserver.observe(scrollHost);
    }

    return () => {
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      if (recalcTimeoutId !== null) {
        clearTimeout(recalcTimeoutId);
      }
    };
  }, [scrollHost, lastUserMessageRef, bottomRef]);

  // Memoize the spacer style to avoid creating new objects
  const spacerStyle = useMemo(() => ({
    height: `${spacerHeight}px`,
    flexShrink: 0
  }), [spacerHeight]);

  return (
    <div
      ref={spacerRef}
      className="scroll-spacer"
      style={spacerStyle}
    />
  );
});

// Define props for the memoized list component (static message content)
interface MemoizedMessageListProps {
  messages: Message[];
  expandedThoughts: { [key: string]: boolean };
  onToggleThought: (key: string) => void;
  lastUserMessageRef: RefObject<HTMLDivElement>;
  componentStyles: ReturnType<typeof createStyles>;
  toolResultsByCallId: Record<string, { name?: string | null; content: any }>;
  onInsertCode?: (text: string, language?: string) => void;
}

const MemoizedMessageList = memo<MemoizedMessageListProps>(
  ({
    messages,
    expandedThoughts,
    onToggleThought,
    lastUserMessageRef,
    componentStyles,
    toolResultsByCallId,
    onInsertCode
  }) => {
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
      const filtered = messages.filter((m) => {
        // Always hide tool role messages
        if (m.role === "tool") {
          return false;
        }

        // Check if message has any visible content
        const hasToolCalls = Array.isArray(m.tool_calls) && m.tool_calls.length > 0;
        const hasExecutionEvent = !!m.execution_event_type || m.role === "agent_execution";

        let hasContent = false;
        if (typeof m.content === "string") {
          hasContent = m.content.trim().length > 0;
        } else if (Array.isArray(m.content)) {
          hasContent = m.content.some((block: any) => {
            if (!block || typeof block !== "object") {
              return false;
            }
            if (block.type === "text") {
              return typeof block.text === "string" && block.text.trim().length > 0;
            }
            if (block.type === "image_url" || block.type === "image") {
              return true;
            }
            return true; // Other content types are considered non-empty
          });
        } else if (m.content != null) {
          hasContent = true; // Non-null/non-string/non-array content (e.g. object)
        }

        // Keep the message if it has any visible element
        return hasContent || hasToolCalls || hasExecutionEvent;
      });
      const lastUserIdx = filtered.reduce(
        (lastIdx, msg, idx) => (msg.role === "user" ? idx : lastIdx),
        -1
      );
      return { filteredMessages: filtered, lastUserMessageIndex: lastUserIdx };
    }, [messages]);

    return (
      <>
        {filteredMessages.map((msg, index) => {
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
      </>
    );
  }
);
MemoizedMessageList.displayName = "MemoizedMessageList";

// Define props for the memoized status footer component (dynamic status/progress)
interface MemoizedStatusFooterProps {
  status: ChatThreadViewProps["status"];
  progress: number;
  total: number;
  progressMessage: string | null;
  runningToolCallId?: string | null;
  runningToolMessage?: string | null;
  currentPlanningUpdate?: PlanningUpdate | null;
  currentTaskUpdate?: TaskUpdate | null;
  currentLogUpdate?: LogUpdate | null;
  hasAgentExecutionMessages: boolean;
  theme: Theme;
}

const MemoizedStatusFooter = memo<MemoizedStatusFooterProps>(
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
      </>
    );
  }
);
MemoizedStatusFooter.displayName = "MemoizedStatusFooter";

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
  const scrollRafId = useRef<number | null>(null);
  const [expandedThoughts, setExpandedThoughts] = useState<{
    [key: string]: boolean;
  }>({});
  const userHasScrolledUpRef = useRef(false);
  const isNearBottomRef = useRef(true);
  const lastUserScrollTimeRef = useRef<number>(0);
  const autoScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Track when we've scrolled to a user message - prevents auto-scroll to bottom from overriding.
  // Lifecycle:
  // - Set to true: when scrollToLastUserMessage() is called (user submits a message)
  // - Set to false: when user manually scrolls, or when streaming ends
  // - Checked: in auto-scroll effect to skip scrollToBottom during streaming
  const scrolledToUserMessageRef = useRef(false);
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

  const hasAgentExecutionMessages = useMemo(() => messages.some(
    (msg) => msg.role === "agent_execution"
  ), [messages]);

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

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (scrollRafId.current) {
        cancelAnimationFrame(scrollRafId.current);
      }
    };
  }, []);

  const handleScroll = useCallback(() => {
    lastUserScrollTimeRef.current = Date.now();
    // User manually scrolling clears the "scrolled to user message" state
    scrolledToUserMessageRef.current = false;

    if (scrollRafId.current) {
      return;
    }

    scrollRafId.current = requestAnimationFrame(() => {
      scrollRafId.current = null;
      // Throttling scroll handling to the next animation frame prevents
      // excessive layout reflows (caused by reading scrollTop/scrollHeight)
      // during rapid scrolling events.
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
        setShowScrollToBottomButton(shouldBeVisible);
      }
    });
  }, [scrollHost]);

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
      // Calculate the exact position to scroll to for precise top alignment
      const elementRect = el.getBoundingClientRect();
      const scrollHostRect = scrollHost?.getBoundingClientRect();

      if (scrollHostRect) {
        const currentScrollTop = scrollHost?.scrollTop || 0;
        const targetScrollTop = currentScrollTop + elementRect.top - scrollHostRect.top;

        scrollHost?.scrollTo({
          top: targetScrollTop,
          behavior: 'smooth'
        });
      } else {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      userHasScrolledUpRef.current = false;
      // Set flag to prevent auto-scroll to bottom during streaming
      scrolledToUserMessageRef.current = true;
    }
  }, [scrollHost]);

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
      // Don't force scroll to bottom when streaming ends to preserve user position
      // The auto-scroll logic in the next effect will handle this appropriately
      scrolledToUserMessageRef.current = false;
    }
    previousStatusRef.current = status;
  }, [status]);

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

      // Clear the flag after a short delay to allow the scroll to complete
      // but still prevent immediate auto-scroll during streaming
      setTimeout(() => {
        scrolledToUserMessageRef.current = false;
      }, 1000);
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

        // Only auto-scroll if the user hasn't manually scrolled and we know they're at the bottom
        // This preserves the user's scroll position when they've scrolled to see a specific message
        if (
          !userHasScrolledUpRef.current &&
          userIsIdle &&
          isNearBottomRef.current &&
          // Additional check: only auto-scroll if we didn't just scroll to a user message
          !scrolledToUserMessageRef.current
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
        <div css={componentStyles.chatMessagesList} className="chat-messages-list">
          <MemoizedMessageList
            messages={messages}
            expandedThoughts={expandedThoughts}
            onToggleThought={handleToggleThought}
            lastUserMessageRef={lastUserMessageRef}
            componentStyles={componentStyles}
            toolResultsByCallId={toolResultsByCallId}
            onInsertCode={onInsertCode}
          />
          <MemoizedStatusFooter
            status={status}
            progress={progress}
            total={total}
            progressMessage={progressMessage}
            runningToolCallId={runningToolCallId}
            runningToolMessage={runningToolMessage}
            currentPlanningUpdate={currentPlanningUpdate}
            currentTaskUpdate={currentTaskUpdate}
            currentLogUpdate={currentLogUpdate}
            hasAgentExecutionMessages={hasAgentExecutionMessages}
            theme={theme}
          />
          <div ref={bottomRef} style={{ height: 1 }} />
          {/* Dynamic spacer that adapts based on viewport and content needs */}
          <DynamicScrollSpacer
            lastUserMessageRef={lastUserMessageRef}
            bottomRef={bottomRef}
            scrollHost={scrollHost}
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
