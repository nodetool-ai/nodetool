/** @jsxImportSource @emotion/react */
import React, {
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  useState,
  useMemo,
  memo
} from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  BORDER_RADIUS,
  FONT_SIZE_SANS,
  SPACING,
  SPACING_PX,
  getSpacingPx,
  Z_INDEX
} from "../../ui_primitives";
import {
  Message,
  PlanningUpdate,
  TaskUpdate,
  LogUpdate
} from "../../../stores/ApiTypes";
import { LoadingIndicator } from "../feedback/LoadingIndicator";
import { Progress } from "../feedback/Progress";
import { MessageView } from "../message/MessageView";
import MediaOutputGroup from "../message/MediaOutputGroup";
import type { MediaGenerationRequest } from "../../../stores/MediaGenerationStore";
import ToolApprovalCard from "../message/ToolApprovalCard";
import PlanApprovalCard from "../message/PlanApprovalCard";
import { ScrollToBottomButton } from "../controls/ScrollToBottomButton";
import { createStyles } from "./ChatThreadView.styles";
import PlanningUpdateDisplay from "../../node/PlanningUpdateDisplay";
import TaskUpdateDisplay from "../../node/TaskUpdateDisplay";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import { useElapsedTime } from "../../../hooks/useElapsedTime";

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
  /** Render per-message avatar + header meta (full-page chat only). */
  showMessageMeta?: boolean;
}

const SCROLL_THRESHOLD = 50;
const ESTIMATED_MESSAGE_HEIGHT = 200;
const CHAT_ANCHOR_OFFSET = SPACING_PX.xl;
const SCROLL_POSITION_EPSILON = 1;

type ChatScrollMode = "following-end" | "anchoring-new-turn" | "free-scrolling";

interface ActiveChatAnchor {
  messageId: string;
  messageIndex: number;
}

interface ToolResultSummary {
  name?: string | null;
  content: Message["content"];
  createdAt?: string | null;
}

function formatElapsed(seconds: number): string {
  if (seconds < 1) return "0s";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

/** Jump an element to its bottom. Guards `scrollTo` (absent in jsdom). */
function scrollElementToBottom(el: HTMLElement | null): void {
  if (!el) return;
  if (typeof el.scrollTo === "function") {
    el.scrollTo({ top: el.scrollHeight });
  } else {
    el.scrollTop = el.scrollHeight;
  }
}

function getElementBottomInScrollContent(
  scrollHost: HTMLElement,
  element: HTMLElement
): number {
  const hostRect = scrollHost.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  return scrollHost.scrollTop + elementRect.bottom - hostRect.top;
}

function executionGroupsAreEqual(
  previous: ReadonlyMap<string, Message[]>,
  next: ReadonlyMap<string, Message[]>
): boolean {
  if (previous.size !== next.size) return false;
  for (const [key, nextMessages] of next) {
    const previousMessages = previous.get(key);
    if (!previousMessages || previousMessages.length !== nextMessages.length) {
      return false;
    }
    if (
      nextMessages.some((message, index) => message !== previousMessages[index])
    ) {
      return false;
    }
  }
  return true;
}

function toolResultsAreEqual(
  previous: Readonly<Record<string, ToolResultSummary>>,
  next: Readonly<Record<string, ToolResultSummary>>
): boolean {
  const previousKeys = Object.keys(previous);
  const nextKeys = Object.keys(next);
  if (previousKeys.length !== nextKeys.length) return false;
  return nextKeys.every((key) => {
    const previousResult = previous[key];
    const nextResult = next[key];
    return (
      previousResult?.name === nextResult?.name &&
      previousResult?.content === nextResult?.content &&
      previousResult?.createdAt === nextResult?.createdAt
    );
  });
}

const STATUS_ROW_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: getSpacingPx(SPACING.md),
  padding: `${getSpacingPx(SPACING.xs)} 0`
};

const STATUS_TEXT_STYLE: React.CSSProperties = {
  fontSize: FONT_SIZE_SANS.body,
  fontStyle: "italic"
};

const ELAPSED_STYLE: React.CSSProperties = {
  fontSize: FONT_SIZE_SANS.label,
  fontVariantNumeric: "tabular-nums",
  marginLeft: "auto"
};

const LOG_WRAPPER_STYLE: React.CSSProperties = {
  position: "relative",
  paddingLeft: "1.5rem"
};

const LOG_DOT_BASE_STYLE: React.CSSProperties = {
  position: "absolute",
  left: "-21px",
  top: "12px",
  width: "10px",
  height: "10px"
};

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
  /** The still-sending user message for an in-flight media generation turn,
   *  when one is active. Swaps the plain busy row for a shimmering preview of
   *  the eventual output grid instead. */
  pendingMediaMessage: Message | null;
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
    pendingMediaMessage,
    theme
  }) => {
    const isBusy = status === "loading" || status === "streaming";
    const elapsed = useElapsedTime(isBusy);
    return (
      <>
        {isBusy && !hasAgentExecutionMessages && pendingMediaMessage && (
          <div className="chat-message-list-item">
            <MediaOutputGroup
              message={pendingMediaMessage}
              mediaContents={[]}
              isPending
            />
          </div>
        )}
        {isBusy && !hasAgentExecutionMessages && !pendingMediaMessage && (
          <div className="chat-message-list-item">
            <div style={STATUS_ROW_STYLE}>
              {status === "loading" && progress === 0 ? (
                <LoadingIndicator />
              ) : null}
              <span
                style={{
                  ...STATUS_TEXT_STYLE,
                  color: theme.vars.palette.text.secondary
                }}
              >
                {progressMessage && !runningToolCallId
                  ? progressMessage
                  : status === "streaming"
                    ? "Responding…"
                    : "Thinking…"}
              </span>
              <span
                style={{
                  ...ELAPSED_STYLE,
                  color: theme.vars.palette.text.disabled
                }}
              >
                {formatElapsed(elapsed)}
              </span>
            </div>
          </div>
        )}
        {progress > 0 && !hasAgentExecutionMessages && (
          <div className="chat-message-list-item">
            <Progress progress={progress} total={total} />
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
            <div style={LOG_WRAPPER_STYLE}>
              <div
                style={{
                  position: "absolute",
                  left: "4px",
                  top: "10px",
                  bottom: "10px",
                  width: "2px",
                  background: `linear-gradient(to bottom, ${theme.vars.palette.primary.main}, ${theme.vars.palette.secondary.main}44)`,
                  borderRadius: BORDER_RADIUS.xs
                }}
              />
              <div
                style={{
                  ...LOG_DOT_BASE_STYLE,
                  borderRadius: BORDER_RADIUS.circle,
                  backgroundColor: theme.vars.palette.primary.main,
                  border: `2px solid ${theme.vars.palette.background.default}`,
                  boxShadow: `0 0 10px ${theme.vars.palette.primary.main}aa`,
                  zIndex: Z_INDEX.raised + 1
                }}
              />
              <div
                className={`log-entry log-severity-${currentLogUpdate.severity || "info"}`}
                style={{
                  fontSize: FONT_SIZE_SANS.label,
                  padding: "0.5rem 0.75rem",
                  borderRadius: BORDER_RADIUS.md,
                  backgroundColor: theme.vars.palette.c_scrim,
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
  onInsertCode,
  showMessageMeta = false
}) => {
  const theme = useTheme();

  // Pending tool-approval prompts for the active thread, rendered inline at the
  // bottom of the thread. Resolving one sends the decision and removes it.
  const pendingApprovals = useGlobalChatStore((s) => s.pendingApprovals);
  const currentThreadId = useGlobalChatStore((s) => s.currentThreadId);
  const resolveApproval = useGlobalChatStore((s) => s.resolveApproval);
  const threadApprovals = useMemo(
    () =>
      Object.entries(pendingApprovals).filter(
        ([, approval]) => approval.thread_id === currentThreadId
      ),
    [pendingApprovals, currentThreadId]
  );

  // Pending plan-approval prompts. Plans from runs not bound to a thread
  // (thread_id null, e.g. editor workflow runs) show on the active thread.
  const pendingPlanApprovals = useGlobalChatStore(
    (s) => s.pendingPlanApprovals
  );
  const resolvePlanApproval = useGlobalChatStore((s) => s.resolvePlanApproval);
  const threadPlanApprovals = useMemo(
    () =>
      Object.entries(pendingPlanApprovals).filter(
        ([, approval]) =>
          approval.thread_id === null || approval.thread_id === currentThreadId
      ),
    [pendingPlanApprovals, currentThreadId]
  );

  // The generating turn's own outgoing message carries `media_generation` —
  // keying off it (rather than the transient global status text) means the
  // placeholder box shows for every media turn, not just the thread's first.
  const isBusy = status === "loading" || status === "streaming";
  const pendingMediaMessage = useMemo(() => {
    if (!isBusy) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role !== "user") continue;
      const gen = (
        msg as Message & { media_generation?: MediaGenerationRequest | null }
      ).media_generation;
      return gen && gen.mode !== "chat" ? msg : null;
    }
    return null;
  }, [isBusy, messages]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const realContentRef = useRef<HTMLDivElement>(null);
  const [scrollHost, setScrollHost] = useState<HTMLDivElement | null>(null);
  const expandedThoughtsRef = useRef<Record<string, boolean>>({});
  const [showScrollToBottomButton, setShowScrollToBottomButton] =
    useState(false);
  const [activeAnchor, setActiveAnchor] = useState<ActiveChatAnchor | null>(
    null
  );
  const [anchorTailHeight, setAnchorTailHeight] = useState(0);
  const scrollModeRef = useRef<ChatScrollMode>("following-end");
  const positionedAnchorIdRef = useRef<string | null>(null);
  const anchorSawBusyRef = useRef(false);
  const previousMessageCountRef = useRef(messages.length);
  const scrollRafRef = useRef<number | null>(null);
  const layoutRafRef = useRef<number | null>(null);
  const executionMessagesByIdRef = useRef(new Map<string, Message[]>());
  const toolResultsByCallIdRef = useRef<Record<string, ToolResultSummary>>({});
  const viewportAnchorRef = useRef<{
    element: HTMLElement;
    top: number;
  } | null>(null);

  const componentStyles = useMemo(() => createStyles(theme), [theme]);

  const handleScrollRef = useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node;
    if (node) {
      node.dataset.scrollMode = scrollModeRef.current;
    }
    setScrollHost(node);
  }, []);

  const setScrollMode = useCallback((mode: ChatScrollMode) => {
    scrollModeRef.current = mode;
    if (scrollRef.current) {
      scrollRef.current.dataset.scrollMode = mode;
    }
  }, []);

  const executionMessagesById = useMemo(() => {
    const next = new Map<string, Message[]>();
    for (const msg of messages) {
      if (msg.role !== "agent_execution") continue;
      const key = msg.agent_execution_id || "__ungrouped__";
      const list = next.get(key) || [];
      list.push(msg);
      next.set(key, list);
    }
    if (executionGroupsAreEqual(executionMessagesByIdRef.current, next)) {
      return executionMessagesByIdRef.current;
    }
    executionMessagesByIdRef.current = next;
    return next;
  }, [messages]);

  const toolResultsByCallId = useMemo(() => {
    const next: Record<string, ToolResultSummary> = {};
    for (const m of messages) {
      if (m.role === "tool" && m.tool_call_id) {
        next[String(m.tool_call_id)] = {
          name: m.name ?? undefined,
          content: m.content,
          createdAt: m.created_at ?? null
        };
      }
    }
    if (toolResultsAreEqual(toolResultsByCallIdRef.current, next)) {
      return toolResultsByCallIdRef.current;
    }
    toolResultsByCallIdRef.current = next;
    return next;
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
        hasContent = m.content.some((block) => {
          if (!block || typeof block !== "object") return false;
          if (block.type === "text") {
            return (
              typeof block.text === "string" && block.text.trim().length > 0
            );
          }
          if (block.type === "image_url") return true;
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
    overscan: theme.virtualScroll.overscan.small,
    getItemKey: (index) => filteredMessages[index].id ?? `msg-${index}`,
    initialRect: { width: 0, height: 800 }
  });

  // Keep the virtualizer from shifting the viewport when the trailing message
  // grows. The layout effect below owns bottom-pinning while streaming.
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (
    item,
    _delta,
    instance
  ) => {
    if (item.index === filteredMessages.length - 1) return false;
    return item.start < (instance.scrollOffset ?? 0);
  };

  const totalSize = virtualizer.getTotalSize();

  const getRealContentBottom = useCallback((): number | null => {
    const el = scrollRef.current;
    const realContent = realContentRef.current;
    if (!el || !realContent) return null;
    return getElementBottomInScrollContent(el, realContent);
  }, []);

  const captureViewportAnchor = useCallback(() => {
    const el = scrollRef.current;
    const realContent = realContentRef.current;
    if (!el || !realContent) {
      viewportAnchorRef.current = null;
      return;
    }

    const hostTop = el.getBoundingClientRect().top;
    const rows = realContent.querySelectorAll<HTMLElement>("[data-index]");
    const anchor = Array.from(rows).find(
      (row) => row.getBoundingClientRect().bottom > hostTop + CHAT_ANCHOR_OFFSET
    );
    viewportAnchorRef.current = anchor
      ? { element: anchor, top: anchor.getBoundingClientRect().top }
      : null;
  }, []);

  const applyScrollPolicy = useCallback(() => {
    const el = scrollRef.current;
    const realContentBottom = getRealContentBottom();
    if (!el || realContentBottom == null) return;

    if (scrollModeRef.current === "free-scrolling") {
      const viewportAnchor = viewportAnchorRef.current;
      if (viewportAnchor?.element.isConnected) {
        const nextTop = viewportAnchor.element.getBoundingClientRect().top;
        const delta = nextTop - viewportAnchor.top;
        if (Math.abs(delta) > SCROLL_POSITION_EPSILON) {
          el.scrollTop += delta;
        }
      }
      captureViewportAnchor();
      return;
    }

    if (scrollModeRef.current === "anchoring-new-turn") {
      const visibleBottom = el.scrollTop + el.clientHeight - CHAT_ANCHOR_OFFSET;
      const overflow = realContentBottom - visibleBottom;
      if (overflow > SCROLL_POSITION_EPSILON) {
        el.scrollTop += overflow;
      }
      return;
    }

    const target = Math.max(0, realContentBottom - el.clientHeight);
    if (Math.abs(target - el.scrollTop) > SCROLL_POSITION_EPSILON) {
      el.scrollTop = target;
    }
  }, [captureViewportAnchor, getRealContentBottom]);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const realContentBottom = getRealContentBottom();
    if (realContentBottom == null) return;
    const nearBottom =
      realContentBottom - el.scrollTop - el.clientHeight < SCROLL_THRESHOLD;

    if (scrollModeRef.current === "free-scrolling" && nearBottom) {
      setScrollMode("following-end");
    }
    setShowScrollToBottomButton(
      scrollModeRef.current === "free-scrolling" && !nearBottom
    );
    captureViewportAnchor();
  }, [captureViewportAnchor, getRealContentBottom, setScrollMode]);

  useEffect(() => {
    const el = scrollHost;
    if (!el) return;
    // Coalesce scroll events to at most one measurement per frame — each call
    // reads scrollTop/scrollHeight/clientHeight (a forced reflow) and setStates.
    const onScroll = () => {
      if (scrollRafRef.current != null) return;
      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = null;
        updateScrollState();
      });
    };
    const onManualNavigation = () => {
      if (scrollModeRef.current === "free-scrolling") return;
      setScrollMode("free-scrolling");
      positionedAnchorIdRef.current = null;
      anchorSawBusyRef.current = false;
      setActiveAnchor(null);
      setAnchorTailHeight(0);
      captureViewportAnchor();
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("wheel", onManualNavigation, { passive: true });
    el.addEventListener("touchmove", onManualNavigation, { passive: true });
    el.addEventListener("pointerdown", onManualNavigation, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", onManualNavigation);
      el.removeEventListener("touchmove", onManualNavigation);
      el.removeEventListener("pointerdown", onManualNavigation);
      if (scrollRafRef.current != null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [captureViewportAnchor, scrollHost, setScrollMode, updateScrollState]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollMode("following-end");
    positionedAnchorIdRef.current = null;
    anchorSawBusyRef.current = false;
    setActiveAnchor(null);
    setAnchorTailHeight(0);
    const realContentBottom = getRealContentBottom();
    if (realContentBottom != null) {
      el.scrollTop = Math.max(0, realContentBottom - el.clientHeight);
    }
    setShowScrollToBottomButton(false);
  }, [getRealContentBottom, setScrollMode]);

  // Reset follow state whenever the visible thread changes, so a previously
  // "scrolled up" thread doesn't carry that state onto the next one.
  useEffect(() => {
    setScrollMode("following-end");
    positionedAnchorIdRef.current = null;
    anchorSawBusyRef.current = false;
    setActiveAnchor(null);
    setAnchorTailHeight(0);
    viewportAnchorRef.current = null;
    setShowScrollToBottomButton(false);
  }, [currentThreadId, setScrollMode]);

  // Land on the latest message when a thread first becomes visible — on mount,
  // thread switch, or once its messages finish loading. Without this the
  // virtualizer starts at the top, forcing a manual scroll to the end of an
  // existing conversation. Runs before the incremental new-message effect (and
  // syncs the count it reads) so the two don't fight over the scroll position.
  const landedThreadRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!scrollHost || filteredMessages.length === 0) return;
    if (landedThreadRef.current === currentThreadId) return;
    landedThreadRef.current = currentThreadId;
    previousMessageCountRef.current = messages.length;
    setScrollMode("following-end");

    const land = () => {
      virtualizer.scrollToIndex(filteredMessages.length - 1, { align: "end" });
      const el = scrollRef.current;
      if (el) {
        scrollElementToBottom(el);
      }
      setShowScrollToBottomButton(false);
    };
    // Two frames: the first lands on the estimated bottom, the second settles
    // on the true bottom after the virtualizer measures real item heights.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      land();
      raf2 = requestAnimationFrame(land);
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [
    scrollHost,
    currentThreadId,
    filteredMessages.length,
    messages.length,
    setScrollMode,
    virtualizer
  ]);

  // On new user message → scroll that message to top.
  // On other new messages → follow to bottom if user hasn't scrolled up.
  useEffect(() => {
    const prevCount = previousMessageCountRef.current;
    previousMessageCountRef.current = messages.length;
    if (messages.length <= prevCount) return;

    const last = messages[messages.length - 1];
    if (last?.role === "user" && lastUserMessageIndex >= 0) {
      const el = scrollRef.current;
      const messageId = last.id ?? `msg-${lastUserMessageIndex}`;
      setScrollMode("anchoring-new-turn");
      positionedAnchorIdRef.current = null;
      anchorSawBusyRef.current = false;
      setActiveAnchor({ messageId, messageIndex: lastUserMessageIndex });
      setAnchorTailHeight(el?.clientHeight ?? 0);
      setShowScrollToBottomButton(false);
      return;
    }

    if (
      scrollModeRef.current === "anchoring-new-turn" &&
      status !== "loading" &&
      status !== "streaming"
    ) {
      anchorSawBusyRef.current = true;
    } else if (scrollModeRef.current === "following-end") {
      applyScrollPolicy();
    }
  }, [
    applyScrollPolicy,
    lastUserMessageIndex,
    messages,
    setScrollMode,
    status
  ]);

  // Position a newly sent prompt once the reserved tail makes it scrollable.
  // The active turn then grows into that tail without moving the prompt until
  // the real response content reaches the usable viewport bottom.
  useEffect(() => {
    if (!activeAnchor || !scrollHost) return;
    if (positionedAnchorIdRef.current === activeAnchor.messageId) return;
    positionedAnchorIdRef.current = activeAnchor.messageId;

    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      virtualizer.scrollToIndex(activeAnchor.messageIndex, { align: "start" });
      secondFrame = requestAnimationFrame(() => {
        const el = scrollRef.current;
        const row = realContentRef.current?.querySelector<HTMLElement>(
          `[data-index="${activeAnchor.messageIndex}"]`
        );
        if (!el || !row) return;
        const hostTop = el.getBoundingClientRect().top;
        const rowTop = row.getBoundingClientRect().top;
        el.scrollTop = Math.max(
          0,
          el.scrollTop + rowTop - hostTop - CHAT_ANCHOR_OFFSET
        );
      });
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [activeAnchor, scrollHost, virtualizer]);

  // Apply the active policy before paint when the virtualizer reports a real
  // size change. Token updates that do not change layout perform no scroll.
  useLayoutEffect(() => {
    applyScrollPolicy();
  }, [applyScrollPolicy, status, totalSize]);

  // Images, approvals, status rows, and responsive reflow can change height
  // without changing the virtualizer's total. Coalesce those measurements to
  // one policy application per animation frame.
  useEffect(() => {
    const el = scrollHost;
    const realContent = realContentRef.current;
    if (!el || !realContent || typeof ResizeObserver === "undefined") return;

    const schedulePolicy = () => {
      if (layoutRafRef.current != null) return;
      layoutRafRef.current = requestAnimationFrame(() => {
        layoutRafRef.current = null;
        applyScrollPolicy();
      });
    };
    const observer = new ResizeObserver(schedulePolicy);
    observer.observe(el);
    observer.observe(realContent);
    return () => {
      observer.disconnect();
      if (layoutRafRef.current != null) {
        cancelAnimationFrame(layoutRafRef.current);
        layoutRafRef.current = null;
      }
    };
  }, [applyScrollPolicy, scrollHost]);

  // Once the turn settles, remove its reserved tail and return to normal end
  // following. Free-scrolling mode is never overridden by a status change.
  useEffect(() => {
    if (status === "loading" || status === "streaming") {
      if (scrollModeRef.current === "anchoring-new-turn") {
        anchorSawBusyRef.current = true;
      }
      return;
    }
    if (scrollModeRef.current !== "anchoring-new-turn") return;
    if (!anchorSawBusyRef.current) return;
    setScrollMode("following-end");
    positionedAnchorIdRef.current = null;
    anchorSawBusyRef.current = false;
    setActiveAnchor(null);
    setAnchorTailHeight(0);
    const frame = requestAnimationFrame(applyScrollPolicy);
    return () => cancelAnimationFrame(frame);
  }, [applyScrollPolicy, setScrollMode, status]);

  const isThoughtExpanded = useCallback(
    (key: string) => expandedThoughtsRef.current[key] ?? false,
    []
  );
  const handleToggleThought = useCallback(
    (key: string, anchorElement?: HTMLElement) => {
      const anchorBottomBeforeToggle =
        anchorElement?.getBoundingClientRect().bottom ?? null;
      expandedThoughtsRef.current = {
        ...expandedThoughtsRef.current,
        [key]: !expandedThoughtsRef.current[key]
      };

      if (anchorBottomBeforeToggle == null || !anchorElement) return;
      requestAnimationFrame(() => {
        if (
          scrollModeRef.current !== "free-scrolling" ||
          !anchorElement.isConnected
        ) {
          return;
        }
        const el = scrollRef.current;
        if (!el) return;
        const delta =
          anchorElement.getBoundingClientRect().bottom -
          anchorBottomBeforeToggle;
        if (Math.abs(delta) > SCROLL_POSITION_EPSILON) {
          el.scrollTop += delta;
          captureViewportAnchor();
        }
      });
    },
    [captureViewportAnchor]
  );

  const virtualItems = virtualizer.getVirtualItems();

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
          <div ref={realContentRef} className="chat-messages-real-content">
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
                      isThoughtExpanded={isThoughtExpanded}
                      onToggleThought={handleToggleThought}
                      onInsertCode={onInsertCode}
                      toolResultsByCallId={toolResultsByCallId}
                      componentStyles={componentStyles}
                      executionMessagesById={executionMessagesById}
                      showMeta={showMessageMeta}
                    />
                  </div>
                );
              })}
            </div>

            {threadApprovals.length > 0 && (
              <div className="chat-message-list-item">
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: getSpacingPx(SPACING.md)
                  }}
                >
                  {threadApprovals.map(([approvalId, approval]) => (
                    <ToolApprovalCard
                      key={approvalId}
                      approvalId={approvalId}
                      toolName={approval.tool_name}
                      category={approval.category}
                      message={approval.message}
                      args={approval.args}
                      onResolve={resolveApproval}
                    />
                  ))}
                </div>
              </div>
            )}

            {threadPlanApprovals.length > 0 && (
              <div className="chat-message-list-item">
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: getSpacingPx(SPACING.md)
                  }}
                >
                  {threadPlanApprovals.map(([approvalId, approval]) => (
                    <PlanApprovalCard
                      key={approvalId}
                      approvalId={approvalId}
                      approval={approval}
                      onResolve={resolvePlanApproval}
                    />
                  ))}
                </div>
              </div>
            )}

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
              pendingMediaMessage={pendingMediaMessage}
              theme={theme}
            />
          </div>

          {activeAnchor && anchorTailHeight > 0 && (
            <div
              aria-hidden="true"
              className="chat-anchor-tail"
              style={{ height: anchorTailHeight, pointerEvents: "none" }}
            />
          )}
        </div>
      </div>

      <ScrollToBottomButton
        isVisible={showScrollToBottomButton}
        onClick={scrollToBottom}
      />
    </div>
  );
};

export default memo(ChatThreadView);
