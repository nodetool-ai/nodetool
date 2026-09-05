/** @jsxImportSource @emotion/react */
import React, { useRef, useCallback, useMemo, memo } from "react";
import { useTheme } from "@mui/material/styles";
import {
  Caption,
  FlexColumn,
  FlexRow,
  SPACING,
  ShimmerText,
  Text
} from "../../ui_primitives";
import {
  Message,
  MessageContent,
  PlanningUpdate,
  TaskUpdate,
  LogUpdate
} from "../../../stores/ApiTypes";
import { Progress } from "../feedback/Progress";
import { MediaPredictionStatus } from "../feedback/MediaPredictionStatus";
import { MessageView } from "../message/MessageView";
import MediaOutputGroup from "../message/MediaOutputGroup";
import ToolApprovalCard from "../message/ToolApprovalCard";
import PlanApprovalCard from "../message/PlanApprovalCard";
import SecretRequestCard from "../message/SecretRequestCard";
import { ScrollToBottomButton } from "../controls/ScrollToBottomButton";
import { createStyles } from "./ChatThreadView.styles";
import PlanningUpdateDisplay from "../../node/PlanningUpdateDisplay";
import TaskUpdateDisplay from "../../node/TaskUpdateDisplay";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import { useElapsedTime } from "../../../hooks/useElapsedTime";
import {
  DEFAULT_THREAD_RUNTIME,
  getThreadRuntime
} from "../../../core/chat/threadRuntime";
import type { ActiveMediaPrediction } from "../../../core/chat/mediaPrediction";
import { isObjectLike, isString } from "../../../utils/typePredicates";
import { collapseToolCallOnlyMessages } from "../message/groupToolCalls";
import type { ChatStatus } from "../types/chat.types";
import { useChatScrollAnchor } from "./useChatScrollAnchor";

interface ChatThreadViewProps {
  /** Conversation rendered by this ChatView instance. */
  threadId?: string | null;
  messages: Message[];
  status: ChatStatus;
  progress: number;
  total: number;
  progressMessage: string | null;
  runningToolCallId?: string | null;
  currentPlanningUpdate?: PlanningUpdate | null;
  currentTaskUpdate?: TaskUpdate | null;
  currentLogUpdate?: LogUpdate | null;
  onInsertCode?: (text: string, language?: string) => void;
  /** Render task updates inline. Full chat surfaces move them to a right rail. */
  showTaskUpdate?: boolean;
}

// StatusFooter re-renders once a second while a reply streams; a fresh `[]`
// would carry MediaOutputGroup along with it.
const EMPTY_MEDIA_CONTENTS: MessageContent[] = [];

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

interface StatusFooterProps {
  status: ChatStatus;
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
  activePredictions: ActiveMediaPrediction[];
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
    activePredictions
  }) => {
    const isBusy = status === "loading" || status === "streaming";
    const elapsed = useElapsedTime(isBusy);
    const hasPredictions = activePredictions.length > 0;
    return (
      <>
        {isBusy && !hasAgentExecutionMessages && pendingMediaMessage && (
          <div className="chat-message-list-item">
            <MediaOutputGroup
              message={pendingMediaMessage}
              mediaContents={EMPTY_MEDIA_CONTENTS}
              isPending
            />
          </div>
        )}
        {hasPredictions && (
          <MediaPredictionStatus predictions={activePredictions} />
        )}
        {isBusy &&
          !hasAgentExecutionMessages &&
          !pendingMediaMessage &&
          !hasPredictions && (
          <div className="chat-message-list-item">
            <FlexRow className="chat-status-row" align="center" gap={2} fullWidth>
              <Text
                component="span"
                size="small"
                color="secondary"
                role="status"
                aria-live="polite"
                className="chat-status-label"
              >
                <ShimmerText>
                  {progressMessage && !runningToolCallId
                    ? progressMessage
                    : status === "streaming"
                      ? "Responding…"
                      : "Thinking…"}
                </ShimmerText>
              </Text>
              <Caption className="chat-status-elapsed" color="muted">
                {formatElapsed(elapsed)}
              </Caption>
            </FlexRow>
          </div>
        )}
        {progress > 0 && !hasAgentExecutionMessages && (
          <div className="chat-message-list-item">
            <Progress progress={progress} total={total} />
          </div>
        )}
        {!hasAgentExecutionMessages &&
          currentPlanningUpdate &&
          !currentTaskUpdate && (
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
            <div className="log-update">
              <div className="log-update-rail" />
              <div className="log-update-dot" />
              <div
                className={`log-entry log-severity-${currentLogUpdate.severity || "info"}`}
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
  threadId,
  messages,
  status,
  progress,
  total,
  progressMessage,
  runningToolCallId,
  currentPlanningUpdate,
  currentTaskUpdate,
  currentLogUpdate,
  onInsertCode,
  showTaskUpdate = true
}) => {
  const theme = useTheme();

  // Pending tool-approval prompts for the active thread, rendered inline at the
  // bottom of the thread. Resolving one sends the decision and removes it.
  const pendingApprovals = useGlobalChatStore((s) => s.pendingApprovals);
  const currentThreadId = useGlobalChatStore((s) => s.currentThreadId);
  const visibleThreadId = threadId ?? currentThreadId;
  const activePredictions = useGlobalChatStore(
    (s) =>
      getThreadRuntime(s, visibleThreadId).activePredictions ??
      DEFAULT_THREAD_RUNTIME.activePredictions
  );
  const resolveApproval = useGlobalChatStore((s) => s.resolveApproval);
  const threadApprovals = useMemo(
    () =>
      Object.entries(pendingApprovals).filter(
        ([, approval]) => approval.thread_id === visibleThreadId
      ),
    [pendingApprovals, visibleThreadId]
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
          approval.thread_id === visibleThreadId ||
          (approval.thread_id === null && visibleThreadId === currentThreadId)
      ),
    [pendingPlanApprovals, currentThreadId, visibleThreadId]
  );

  // Pending credential requests. Thread-scoped like tool approvals: the run
  // that asked is the one waiting.
  const pendingSecretRequests = useGlobalChatStore(
    (s) => s.pendingSecretRequests
  );
  const resolveSecretRequest = useGlobalChatStore(
    (s) => s.resolveSecretRequest
  );
  const threadSecretRequests = useMemo(
    () =>
      Object.entries(pendingSecretRequests).filter(
        ([, request]) => request.thread_id === visibleThreadId
      ),
    [pendingSecretRequests, visibleThreadId]
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
        msg
      ).media_generation;
      return gen && gen.mode !== "chat" ? msg : null;
    }
    return null;
  }, [isBusy, messages]);

  const expandedThoughtsRef = useRef<Record<string, boolean>>({});
  const executionMessagesByIdRef = useRef(new Map<string, Message[]>());
  const toolResultsByCallIdRef = useRef<Record<string, ToolResultSummary>>({});

  const componentStyles = useMemo(() => createStyles(theme), [theme]);

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
      if (isString(m.content)) {
        hasContent = m.content.trim().length > 0;
      } else if (Array.isArray(m.content)) {
        hasContent = m.content.some((block) => {
          if (!block || !isObjectLike(block)) return false;
          if (block.type === "text") {
            return (
              isString(block.text) && block.text.trim().length > 0
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

    const collapsed = collapseToolCallOnlyMessages(filtered);

    let lastUserIdx = -1;
    for (let i = 0; i < collapsed.length; i++) {
      if (collapsed[i].role === "user") lastUserIdx = i;
    }
    return {
      filteredMessages: collapsed,
      lastUserMessageIndex: lastUserIdx
    };
  }, [messages, executionMessagesById]);

  const {
    virtualizer,
    handleScrollRef,
    realContentRef,
    scrollToBottom,
    showScrollToBottomButton,
    activeAnchor,
    anchorTailHeight,
    preserveViewportAfterToggle
  } = useChatScrollAnchor({
    visibleThreadId,
    messages,
    filteredMessages,
    lastUserMessageIndex,
    status,
    overscan: theme.virtualScroll.overscan.small
  });

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
      preserveViewportAfterToggle(anchorElement, anchorBottomBeforeToggle);
    },
    [preserveViewportAfterToggle]
  );

  const totalSize = virtualizer.getTotalSize();

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
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
          aria-label="Conversation"
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
                      // `top`, not `transform: translateY()`. WebGPU canvases
                      // in inline timeline previews stay black under a
                      // transform ancestor.
                      position: "absolute",
                      top: virtualRow.start,
                      left: 0,
                      width: "100%"
                    }}
                  >
                    <MessageView
                      key={messageKey}
                      message={msg}
                      threadId={visibleThreadId}
                      isThoughtExpanded={isThoughtExpanded}
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

            {threadApprovals.length > 0 && (
              <div className="chat-message-list-item">
                <FlexColumn gap={SPACING.md}>
                  {threadApprovals.map(([approvalId, approval]) => (
                    <ToolApprovalCard
                      key={approvalId}
                      approvalId={approvalId}
                      toolName={approval.tool_name}
                      category={approval.category}
                      message={approval.message}
                      description={approval.description}
                      args={approval.args}
                      onResolve={resolveApproval}
                    />
                  ))}
                </FlexColumn>
              </div>
            )}

            {threadPlanApprovals.length > 0 && (
              <div className="chat-message-list-item">
                <FlexColumn gap={SPACING.md}>
                  {threadPlanApprovals.map(([approvalId, approval]) => (
                    <PlanApprovalCard
                      key={approvalId}
                      approvalId={approvalId}
                      approval={approval}
                      onResolve={resolvePlanApproval}
                    />
                  ))}
                </FlexColumn>
              </div>
            )}

            {threadSecretRequests.length > 0 && (
              <div className="chat-message-list-item">
                <FlexColumn gap={SPACING.md}>
                  {threadSecretRequests.map(([approvalId, request]) => (
                    <SecretRequestCard
                      key={approvalId}
                      approvalId={approvalId}
                      request={request}
                      onResolve={resolveSecretRequest}
                    />
                  ))}
                </FlexColumn>
              </div>
            )}

            <StatusFooter
              status={status}
              progress={progress}
              total={total}
              progressMessage={progressMessage}
              runningToolCallId={runningToolCallId}
              currentPlanningUpdate={currentPlanningUpdate}
              currentTaskUpdate={showTaskUpdate ? currentTaskUpdate : null}
              currentLogUpdate={currentLogUpdate}
              hasAgentExecutionMessages={hasAgentExecutionMessages}
              pendingMediaMessage={pendingMediaMessage}
              activePredictions={activePredictions}
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
