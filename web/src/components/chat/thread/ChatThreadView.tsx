/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useRef, useEffect, useCallback, useState } from "react";
import { useTheme } from "@mui/material/styles";
import { Message } from "../../../stores/ApiTypes";
import { LoadingIndicator } from "../feedback/LoadingIndicator";
import { Progress } from "../feedback/Progress";
import { MessageView } from "../message/MessageView";
import { ScrollToBottomButton } from "../controls/ScrollToBottomButton";
import { createStyles } from "./ChatThreadView.styles";
import { textPulse } from "../styles/animations";

interface ChatThreadViewProps {
  messages: Message[];
  status:
    | "disconnected"
    | "connecting"
    | "connected"
    | "loading"
    | "error"
    | "streaming"
    | "reconnecting";
  progress: number;
  total: number;
  progressMessage: string | null;
}

const ChatThreadView: React.FC<ChatThreadViewProps> = ({
  messages,
  status,
  progress,
  total,
  progressMessage
}) => {
  const theme = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [expandedThoughts, setExpandedThoughts] = useState<{
    [key: string]: boolean;
  }>({});
  const [userHasScrolledUp, setUserHasScrolledUp] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const isSmoothScrollingToBottom = useRef(false);
  const autoScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const SCROLL_THRESHOLD = 50;

  const componentStyles = createStyles(theme);

  const handleScroll = useCallback(() => {
    const element = scrollRef.current;
    if (element) {
      const nearBottom =
        element.scrollHeight - element.scrollTop - element.clientHeight <
        SCROLL_THRESHOLD;
      if (!nearBottom && !userHasScrolledUp) {
        setUserHasScrolledUp(true);
      } else if (nearBottom && userHasScrolledUp) {
        setUserHasScrolledUp(false);
      }
      isSmoothScrollingToBottom.current = false;
    }
  }, [userHasScrolledUp]);

  const scrollToBottom = useCallback(
    (force = false) => {
      const el = bottomRef.current;
      if (el) {
        if (force || isNearBottom) {
          if (force) {
            el.scrollIntoView({ behavior: "smooth" });
            isSmoothScrollingToBottom.current = true;
          } else {
            if (!isSmoothScrollingToBottom.current) {
              el.scrollIntoView({ behavior: "auto" });
            }
          }
          setUserHasScrolledUp(false);
          setIsNearBottom(true);
        }
      }
    },
    [isNearBottom]
  );

  useEffect(() => {
    const scrollEl = scrollRef.current;
    const bottomEl = bottomRef.current;
    if (!scrollEl || !bottomEl) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsNearBottom(entry.isIntersecting);
        if (entry.isIntersecting) {
          isSmoothScrollingToBottom.current = false;
        }
      },
      { root: scrollEl, threshold: 0.1 }
    );
    observer.observe(bottomEl);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) {
      element.addEventListener("scroll", handleScroll);
      return () => {
        element.removeEventListener("scroll", handleScroll);
      };
    }
  }, [handleScroll]);

  useEffect(() => {
    // Clear any pending auto-scroll timeout when dependencies change or component unmounts.
    if (autoScrollTimeoutRef.current) {
      clearTimeout(autoScrollTimeoutRef.current);
    }

    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === "user") {
        // User's own message, scroll immediately and smoothly.
        scrollToBottom(true);
        return; // Don't proceed to debounced auto-scroll for user messages.
      }
    }

    // This is for assistant messages or initial load/connection status changes.
    if (status === "loading" || status === "connected" || messages.length > 0) {
      // Set a timeout to debounce the auto-scroll.
      autoScrollTimeoutRef.current = setTimeout(() => {
        if (
          isNearBottom &&
          !userHasScrolledUp &&
          !isSmoothScrollingToBottom.current
        ) {
          scrollToBottom(); // Defaults to force=false (behavior: "auto")
        }
      }, 2000); // 2-second debounce
    }

    // Cleanup function to clear the timeout if the component unmounts
    // or if the effect re-runs before the timeout fires.
    return () => {
      if (autoScrollTimeoutRef.current) {
        clearTimeout(autoScrollTimeoutRef.current);
      }
    };
  }, [messages, status, scrollToBottom, isNearBottom, userHasScrolledUp]); // isSmoothScrollingToBottom is a ref, not in deps

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
      >
        <ul
          css={componentStyles.chatMessagesList}
          className="chat-messages-list"
        >
          {messages.map((msg, index) => (
            <MessageView
              key={msg.id || `msg-${index}`}
              message={msg}
              expandedThoughts={expandedThoughts}
              onToggleThought={handleToggleThought}
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
          <div ref={bottomRef} style={{ height: 1 }} />
        </ul>
      </div>
      <ScrollToBottomButton
        isVisible={!isNearBottom}
        onClick={() => scrollToBottom(true)}
      />
    </div>
  );
};

export default ChatThreadView;
