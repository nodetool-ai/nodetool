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

// Scroll state machine constants
// Threshold in pixels for determining if user is "near bottom"
const NEAR_BOTTOM_THRESHOLD_PX = 100;
// Offset from top when scrolling user message into view (so it's not glued to edge)
const USER_MESSAGE_TOP_OFFSET_PX = 16;
// Minimum time after user scroll before auto-scroll can resume
const USER_SCROLL_COOLDOWN_MS = 300;

// Dynamic scroll spacer component that adapts to content and viewport
interface DynamicScrollSpacerProps {
  lastUserMessageRef: React.RefObject<HTMLDivElement>;
  scrollHost: HTMLElement | null;
}

const DynamicScrollSpacer: React.FC<DynamicScrollSpacerProps> = ({
  lastUserMessageRef,
  scrollHost
}) => {
  const [spacerHeight, setSpacerHeight] = useState(200);

  useEffect(() => {
    const calculateOptimalSpacerHeight = () => {
      if (!scrollHost || !lastUserMessageRef.current) {
        setSpacerHeight(200);
        return;
      }

      const lastUserMessage = lastUserMessageRef.current;
      const lastUserMessageRect = lastUserMessage.getBoundingClientRect();
      const scrollHostRect = scrollHost.getBoundingClientRect();

      // Calculate the exact space needed to bring the user message to the top
      const currentOffset = lastUserMessageRect.top - scrollHostRect.top;
      
      // If message is already at or near top, use minimal spacer
      if (currentOffset <= 0) {
        setSpacerHeight(150);
        return;
      }
      
      // Calculate precise height needed: current offset + small buffer for smooth scrolling
      const preciseSpacerHeight = currentOffset + 20; // 20px buffer for smooth scrolling
      
      // Constrain to reasonable bounds
      const optimalHeight = Math.max(150, Math.min(400, preciseSpacerHeight));
      
      setSpacerHeight(optimalHeight);
    };

    // Calculate initial height
    calculateOptimalSpacerHeight();

    // Use MutationObserver to watch for content changes that might affect layout
    const mutationObserver = new MutationObserver(() => {
      // Small delay to ensure DOM has updated
      setTimeout(calculateOptimalSpacerHeight, 0);
    });

    // Watch for changes in the message list
    if (lastUserMessageRef.current) {
      mutationObserver.observe(lastUserMessageRef.current.parentElement || lastUserMessageRef.current, {
        childList: true,
        subtree: true
      });
    }

    // Recalculate on resize
    const resizeObserver = new ResizeObserver(() => {
      setTimeout(calculateOptimalSpacerHeight, 0);
    });

    if (scrollHost) {
      resizeObserver.observe(scrollHost);
    }

    return () => {
      mutationObserver.disconnect();
      resizeObserver.disconnect();
    };
  }, [scrollHost, lastUserMessageRef]);

  return (
    <div
      className="scroll-spacer"
      style={{
        height: `${spacerHeight}px`,
        flexShrink: 0
      }}
    />
  );
};

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
  scrollHost: HTMLElement | null;
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
    theme,
    scrollHost
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
        {/* Dynamic spacer that adapts based on viewport and content needs */}
        <DynamicScrollSpacer 
          lastUserMessageRef={lastUserMessageRef}
          scrollHost={scrollHost}
        />
      </ul>
    );
  }
);
MemoizedMessageListContent.displayName = "MemoizedMessageListContent";

/**
 * Scroll State Machine
 * 
 * This component implements a state machine approach to scrolling with two distinct behaviors:
 * 
 * 1. USER MESSAGE ANCHORING: When a user sends a message, scroll it to the top of the viewport
 *    with an offset so it's not glued to the edge.
 * 
 * 2. ASSISTANT AUTO-SCROLL: Only auto-scroll new assistant content when the user is "near bottom".
 *    If the user has scrolled away, show "Jump to bottom" button instead.
 * 
 * Scroll Ownership:
 * - SYSTEM: When auto-scrolling for streaming content or after user message
 * - USER: When user has manually scrolled away from bottom
 * 
 * The key insight is that scrolling should never fight the user's intent.
 */
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
  
  // === SCROLL STATE MACHINE REFS ===
  // Track if user has manually scrolled away from bottom (user owns scroll)
  const userOwnsScrollRef = useRef(false);
  // Track if user is near bottom for auto-scroll eligibility
  const isNearBottomRef = useRef(true);
  // Timestamp of last user scroll event for cooldown detection (using performance.now for monotonic time)
  const lastUserScrollTimeRef = useRef<number>(performance.now());
  // Flag to prevent auto-scroll to bottom right after anchoring to user message
  const anchoredToUserMessageRef = useRef(false);
  // requestAnimationFrame ID for streaming scroll batching
  const rafIdRef = useRef<number | null>(null);
  // Track if RAF scroll is already scheduled (prevents jitter)
  const rafScheduledRef = useRef(false);
  
  const [showScrollToBottomButton, setShowScrollToBottomButton] = useState(false);
  const [scrollHost, setScrollHost] = useState<HTMLDivElement | null>(null);
  const previousStatusRef = useRef(status);
  const previousMessageCountRef = useRef(messages.length);

  const componentStyles = useMemo(() => createStyles(theme), [theme]);

  const toolResultsByCallId = useMemo(() => {
    const map: Record<string, { name?: string | null; content: any }> = {};
    for (const m of messages) {
      // Tool result messages carry tool_call_id to link back to the originating tool call
      const anyMsg = m as { tool_call_id?: string; name?: string | null };
      if (m.role === "tool" && anyMsg.tool_call_id) {
        map[String(anyMsg.tool_call_id)] = {
          name: anyMsg.name ?? undefined,
          content: m.content
        };
      }
    }
    return map;
  }, [messages]);

  // Set up scroll host
  useEffect(() => {
    if (scrollContainer) {
      setScrollHost(scrollContainer);
    } else if (internalScrollRef.current) {
      setScrollHost(internalScrollRef.current);
    }
  }, [scrollContainer]);

  /**
   * Compute whether user is near bottom of scroll container.
   * Used to determine if auto-scroll should occur.
   */
  const computeIsNearBottom = useCallback((element: HTMLElement): boolean => {
    return (
      element.scrollHeight - element.scrollTop - element.clientHeight <
      NEAR_BOTTOM_THRESHOLD_PX
    );
  }, []);

  /**
   * Handle scroll events - track user intent and update scroll ownership.
   */
  const handleScroll = useCallback(() => {
    const element = scrollHost;
    if (!element) { return; }

    const now = performance.now();
    lastUserScrollTimeRef.current = now;
    
    // User scrolling clears the anchored-to-user-message state
    anchoredToUserMessageRef.current = false;
    
    const nearBottom = computeIsNearBottom(element);
    isNearBottomRef.current = nearBottom;
    
    // Update scroll ownership based on position
    if (!nearBottom) {
      // User scrolled away from bottom - they own the scroll now
      userOwnsScrollRef.current = true;
    } else {
      // User scrolled back to bottom - system can take over
      userOwnsScrollRef.current = false;
    }
    
    // Update "Jump to bottom" button visibility
    const shouldShowButton = !nearBottom && userOwnsScrollRef.current;
    setShowScrollToBottomButton(shouldShowButton);
  }, [scrollHost, computeIsNearBottom]);

  // Attach scroll listener
  useEffect(() => {
    if (!scrollHost) { return; }
    scrollHost.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      scrollHost.removeEventListener("scroll", handleScroll);
    };
  }, [scrollHost, handleScroll]);

  /**
   * Scroll to bottom using requestAnimationFrame batching.
   * This prevents jitter during streaming by coalescing multiple scroll requests.
   */
  const scheduleScrollToBottom = useCallback(() => {
    if (rafScheduledRef.current) { return; }
    rafScheduledRef.current = true;
    
    rafIdRef.current = requestAnimationFrame(() => {
      const el = bottomRef.current;
      if (el && scrollHost) {
        scrollHost.scrollTop = scrollHost.scrollHeight;
      }
      rafScheduledRef.current = false;
    });
  }, [scrollHost]);

  /**
   * Smooth scroll to bottom (for user-initiated "Jump to bottom" action).
   */
  const scrollToBottom = useCallback(() => {
    const el = bottomRef.current;
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
      // System takes ownership after user clicks "Jump to bottom"
      userOwnsScrollRef.current = false;
      setShowScrollToBottomButton(false);
    }
  }, []);

  /**
   * Scroll to align the last user message at the top of the viewport with offset.
   * This anchors the conversation around the user's last input.
   */
  const scrollToLastUserMessage = useCallback(() => {
    const el = lastUserMessageRef.current;
    if (!el || !scrollHost) { return; }
    
    // Calculate target scroll position with offset so message isn't glued to top
    const elementRect = el.getBoundingClientRect();
    const scrollHostRect = scrollHost.getBoundingClientRect();
    const currentScrollTop = scrollHost.scrollTop;
    
    // Target: message top should be USER_MESSAGE_TOP_OFFSET_PX from viewport top
    const targetScrollTop = 
      currentScrollTop + 
      elementRect.top - 
      scrollHostRect.top - 
      USER_MESSAGE_TOP_OFFSET_PX;
    
    scrollHost.scrollTo({
      top: Math.max(0, targetScrollTop),
      behavior: 'smooth'
    });
    
    // Mark that we're anchored to user message to prevent immediate auto-scroll
    anchoredToUserMessageRef.current = true;
    // System owns scroll during this anchoring phase
    userOwnsScrollRef.current = false;
    setShowScrollToBottomButton(false);
  }, [scrollHost]);

  // Clean up RAF on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  /**
   * Effect: Handle streaming status changes.
   * When streaming ends, clear the anchored flag.
   */
  useEffect(() => {
    if (previousStatusRef.current === "streaming" && status !== "streaming") {
      anchoredToUserMessageRef.current = false;
    }
    previousStatusRef.current = status;
  }, [status]);

  /**
   * Effect: Handle new messages - anchor to user message or auto-scroll assistant content.
   */
  useEffect(() => {
    const prevCount = previousMessageCountRef.current;
    const currentCount = messages.length;
    
    if (currentCount <= prevCount) {
      previousMessageCountRef.current = currentCount;
      return;
    }
    
    previousMessageCountRef.current = currentCount;
    const lastMessage = messages[messages.length - 1];
    
    if (lastMessage?.role === "user") {
      // Anchor to user message at top of viewport
      // Use setTimeout to ensure DOM has updated with the new message
      setTimeout(() => {
        scrollToLastUserMessage();
      }, 0);
    }
  }, [messages, scrollToLastUserMessage]);

  /**
   * Effect: Auto-scroll during streaming if conditions are met.
   * Uses requestAnimationFrame batching to prevent jitter.
   * 
   * This effect triggers when:
   * - messages array changes (new message added)
   * - status changes to/from streaming
   * 
   * Auto-scroll only occurs when:
   * - Currently streaming
   * - User hasn't manually scrolled away (userOwnsScrollRef is false)
   * - Not anchored to a user message
   * - User hasn't scrolled recently (cooldown period)
   * - User is near bottom of the container
   */
  useEffect(() => {
    if (status !== "streaming") { return; }
    
    const lastMessage = messages[messages.length - 1];
    // Don't auto-scroll for user messages (they get anchored at top instead)
    if (!lastMessage || lastMessage.role === "user") { return; }
    
    // Don't auto-scroll if:
    // - User owns scroll (has scrolled away)
    // - We just anchored to a user message
    // - User scrolled recently (within cooldown)
    const userIsIdle = performance.now() - lastUserScrollTimeRef.current > USER_SCROLL_COOLDOWN_MS;
    
    if (
      !userOwnsScrollRef.current &&
      !anchoredToUserMessageRef.current &&
      userIsIdle &&
      isNearBottomRef.current
    ) {
      scheduleScrollToBottom();
    }
  }, [messages, status, scheduleScrollToBottom]);

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
          scrollHost={scrollHost}
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
