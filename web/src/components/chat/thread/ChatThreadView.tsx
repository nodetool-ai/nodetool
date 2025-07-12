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
import { Message, PlanningUpdate, TaskUpdate } from "../../../stores/ApiTypes";
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
  currentPlanningUpdate?: PlanningUpdate | null;
  currentTaskUpdate?: TaskUpdate | null;
}

const USER_SCROLL_IDLE_THRESHOLD_MS = 500;
const ASSISTANT_MESSAGE_SCROLL_DEBOUNCE_MS = 200;

// Define props for the memoized list content component
interface MemoizedMessageListContentProps
  extends Omit<ChatThreadViewProps, "theme"> {
  expandedThoughts: { [key: string]: boolean };
  onToggleThought: (key: string) => void;
  bottomRef: React.RefObject<HTMLDivElement>; // Pass the ref here
  // Add componentStyles if needed directly, or rely on ChatThreadView's styles
  componentStyles: ReturnType<typeof createStyles>;
}

const MemoizedMessageListContent = React.memo<MemoizedMessageListContentProps>(
  ({
    messages,
    status,
    progress,
    total,
    progressMessage,
    currentPlanningUpdate,
    currentTaskUpdate,
    expandedThoughts,
    onToggleThought,
    bottomRef,
    componentStyles
  }) => {
    return (
      <ul css={componentStyles.chatMessagesList} className="chat-messages-list">
        {messages.map((msg, index) => (
          <MessageView
            key={msg.id || `msg-${index}`}
            message={msg}
            expandedThoughts={expandedThoughts}
            onToggleThought={onToggleThought}
          />
        ))}
        {status === "loading" && progress === 0 && (
          <li key="loading-indicator" className="chat-message-list-item">
            <LoadingIndicator />
          </li>
        )}
        {progress > 0 && (
          <li key="progress-indicator" className="chat-message-list-item">
            <Progress progress={progress} total={total} />
          </li>
        )}
        {progressMessage && (
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
        {currentPlanningUpdate && (
          <li key="planning-update" className="chat-message-list-item">
            <PlanningUpdateDisplay planningUpdate={currentPlanningUpdate} />
          </li>
        )}
        {currentTaskUpdate && (
          <li key="task-update" className="chat-message-list-item">
            <TaskUpdateDisplay taskUpdate={currentTaskUpdate} />
          </li>
        )}
        <div ref={bottomRef} style={{ height: 1 }} />
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
  currentPlanningUpdate,
  currentTaskUpdate
}) => {
  const theme = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [expandedThoughts, setExpandedThoughts] = useState<{
    [key: string]: boolean;
  }>({});
  const userHasScrolledUpRef = useRef(false);
  const isNearBottomRef = useRef(true);
  const lastUserScrollTimeRef = useRef<number>(0);
  const autoScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showScrollToBottomButton, setShowScrollToBottomButton] =
    useState(false);

  const SCROLL_THRESHOLD = 50;

  const componentStyles = useMemo(() => createStyles(theme), [theme]);

  useEffect(() => {
    lastUserScrollTimeRef.current = Date.now();
  }, []);

  const handleScroll = useCallback(() => {
    lastUserScrollTimeRef.current = Date.now();
    const element = scrollRef.current;
    if (!element) return;

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
  }, [SCROLL_THRESHOLD, showScrollToBottomButton]);

  const scrollToBottom = useCallback(() => {
    const el = bottomRef.current;
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
      userHasScrolledUpRef.current = false;
    }
  }, []);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    const bottomElement = bottomRef.current;
    if (!scrollElement || !bottomElement) return;

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
  }, [showScrollToBottomButton]);

  useEffect(() => {
    if (autoScrollTimeoutRef.current) {
      clearTimeout(autoScrollTimeoutRef.current);
    }

    const lastMessage =
      messages.length > 0 ? messages[messages.length - 1] : null;

    if (lastMessage?.role === "user") {
      scrollToBottom();
      return;
    }

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
        ref={scrollRef}
        css={componentStyles.scrollableMessageWrapper}
        className="scrollable-message-wrapper"
        onScroll={handleScroll}
      >
        <MemoizedMessageListContent
          messages={messages}
          status={status}
          progress={progress}
          total={total}
          progressMessage={progressMessage}
          currentPlanningUpdate={currentPlanningUpdate}
          currentTaskUpdate={currentTaskUpdate}
          expandedThoughts={expandedThoughts}
          onToggleThought={handleToggleThought}
          bottomRef={bottomRef}
          componentStyles={componentStyles}
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
