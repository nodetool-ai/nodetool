/** @jsxImportSource @emotion/react */
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
import { BORDER_RADIUS, FONT_SIZE_SANS, SPACING, getSpacingPx } from "../../ui_primitives";
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
const STREAM_FLOOR_PX_PER_SEC = 40;
const STREAM_CATCHUP_PER_SEC = 4;
const STREAM_MAX_PX_PER_SEC = 800;
const STREAM_RUNWAY_CSS = "8vh";
const STREAM_FADE_PX = 160;
// Fixed-viewport fade band positioned just above the runway, so new tokens
// emerging at the streaming frontier pass through the fade as they glide up.
const STREAM_FADE_MASK = `linear-gradient(to bottom, black 0, black calc(100% - ${STREAM_RUNWAY_CSS} - ${STREAM_FADE_PX}px), transparent calc(100% - ${STREAM_RUNWAY_CSS}), transparent 100%)`;

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
            <MediaOutputGroup message={pendingMediaMessage} mediaContents={[]} isPending />
          </div>
        )}
        {isBusy && !hasAgentExecutionMessages && !pendingMediaMessage && (
          <div className="chat-message-list-item">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: getSpacingPx(SPACING.md),
                padding: `${getSpacingPx(SPACING.xs)} 0`
              }}
            >
              {status === "loading" && progress === 0 ? (
                <LoadingIndicator />
              ) : null}
              <span
                style={{
                  fontSize: FONT_SIZE_SANS.body,
                  color: theme.vars.palette.text.secondary,
                  fontStyle: "italic"
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
                  fontSize: FONT_SIZE_SANS.label,
                  color: theme.vars.palette.text.disabled,
                  fontVariantNumeric: "tabular-nums",
                  marginLeft: "auto"
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
            <div style={{ position: "relative", paddingLeft: "1.5rem" }}>
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
                  position: "absolute",
                  left: "-21px",
                  top: "12px",
                  width: "10px",
                  height: "10px",
                  borderRadius: BORDER_RADIUS.circle,
                  backgroundColor: theme.vars.palette.primary.main,
                  border: `2px solid ${theme.vars.palette.background.default}`,
                  boxShadow: `0 0 10px ${theme.vars.palette.primary.main}aa`,
                  zIndex: 2
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
          approval.thread_id === null ||
          approval.thread_id === currentThreadId
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
      const gen = (msg as Message & { media_generation?: MediaGenerationRequest | null })
        .media_generation;
      return gen && gen.mode !== "chat" ? msg : null;
    }
    return null;
  }, [isBusy, messages]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollHost, setScrollHost] = useState<HTMLDivElement | null>(null);
  const expandedThoughtsRef = useRef<Record<string, boolean>>({});
  const [showScrollToBottomButton, setShowScrollToBottomButton] =
    useState(false);
  const userHasScrolledUpRef = useRef(false);
  const previousMessageCountRef = useRef(messages.length);
  const lastScrollTopRef = useRef(0);

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
    const map: Record<
      string,
      { name?: string | null; content: Message["content"]; createdAt?: string | null }
    > = {};
    for (const m of messages) {
      if (m.role === "tool" && m.tool_call_id) {
        map[String(m.tool_call_id)] = {
          name: m.name ?? undefined,
          content: m.content,
          createdAt: m.created_at ?? null
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

  // The RAF loop drives scroll during streaming. Suppress the virtualizer's
  // own per-resize scroll adjustment for the last (growing) item — otherwise
  // every measured token bump adds an instantaneous scrollTop delta on top
  // of our smooth catch-up, which reads as visible jitter.
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (
    item,
    _delta,
    instance
  ) => {
    if (item.index === filteredMessages.length - 1) return false;
    return item.start < (instance.scrollOffset ?? 0);
  };

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const prev = lastScrollTopRef.current;
    const curr = el.scrollTop;
    lastScrollTopRef.current = curr;

    // Only a decrease in scrollTop indicates the user scrolled up.
    // A growing distance-to-bottom from content expansion or programmatic
    // catch-up must not flip this flag.
    if (curr < prev - 1) userHasScrolledUpRef.current = true;

    const nearBottom =
      el.scrollHeight - curr - el.clientHeight < SCROLL_THRESHOLD;
    if (nearBottom) userHasScrolledUpRef.current = false;
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
    scrollElementToBottom(el);
    lastScrollTopRef.current = el.scrollTop;
    userHasScrolledUpRef.current = false;
    setShowScrollToBottomButton(false);
  }, []);

  // Reset follow state whenever the visible thread changes, so a previously
  // "scrolled up" thread doesn't carry that state onto the next one.
  useEffect(() => {
    userHasScrolledUpRef.current = false;
    setShowScrollToBottomButton(false);
  }, [currentThreadId]);

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
    userHasScrolledUpRef.current = false;

    const land = () => {
      virtualizer.scrollToIndex(filteredMessages.length - 1, { align: "end" });
      const el = scrollRef.current;
      if (el) {
        scrollElementToBottom(el);
        lastScrollTopRef.current = el.scrollTop;
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
      virtualizer.scrollToIndex(lastUserMessageIndex, { align: "start" });
      const el = scrollRef.current;
      if (el) lastScrollTopRef.current = el.scrollTop;
      userHasScrolledUpRef.current = false;
      setShowScrollToBottomButton(false);
      return;
    }

    // During streaming, the RAF loop below drives the scroll at a constant
    // speed — do NOT jump to bottom here or we'll race with it.
    if (status !== "streaming" && !userHasScrolledUpRef.current) {
      const el = scrollRef.current;
      if (el) {
        scrollElementToBottom(el);
        lastScrollTopRef.current = el.scrollTop;
      }
    }
  }, [messages, lastUserMessageIndex, virtualizer, status]);

  // Follow streaming output at a constant speed with proportional catch-up.
  // The runway spacer below keeps the frontier in the lower viewport so new
  // tokens appear to rise into view rather than pin to the bottom edge.
  useEffect(() => {
    if (status !== "streaming") return;
    const el = scrollRef.current;
    if (!el) return;

    let rafId: number | null = null;
    let lastTime: number | null = null;
    let cancelled = false;

    const tick = (time: number) => {
      if (cancelled) return;
      const dt = lastTime == null ? 16 : Math.min(50, time - lastTime);
      lastTime = time;

      if (!userHasScrolledUpRef.current) {
        const target = el.scrollHeight - el.clientHeight;
        const gap = target - el.scrollTop;
        if (gap > 0.5) {
          const velocity = Math.min(
            STREAM_MAX_PX_PER_SEC,
            Math.max(STREAM_FLOOR_PX_PER_SEC, gap * STREAM_CATCHUP_PER_SEC)
          );
          const delta = Math.min(gap, velocity * (dt / 1000));
          el.scrollTop = el.scrollTop + delta;
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [status]);

  const isThoughtExpanded = useCallback(
    (key: string) => expandedThoughtsRef.current[key] ?? false,
    []
  );
  const handleToggleThought = useCallback((key: string) => {
    expandedThoughtsRef.current = {
      ...expandedThoughtsRef.current,
      [key]: !expandedThoughtsRef.current[key]
    };
  }, []);

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  return (
    <div
      css={componentStyles.chatThreadViewRoot}
      className="chat-thread-view-root"
    >
      <div
        ref={handleScrollRef}
        css={componentStyles.messageWrapper}
        className="scrollable-message-wrapper"
        style={
          status === "streaming"
            ? {
                WebkitMaskImage: STREAM_FADE_MASK,
                maskImage: STREAM_FADE_MASK
              }
            : undefined
        }
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

          {status === "streaming" && (
            <div
              aria-hidden="true"
              className="streaming-runway"
              style={{
                height: STREAM_RUNWAY_CSS,
                pointerEvents: "none",
                flexShrink: 0
              }}
            />
          )}

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
