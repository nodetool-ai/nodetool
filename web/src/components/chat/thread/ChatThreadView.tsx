/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  LegendList,
  type LegendListRef,
  type LegendListRenderItemProps
} from "@legendapp/list/react";
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
  _runningToolMessage?: string | null;
  currentPlanningUpdate?: PlanningUpdate | null;
  currentTaskUpdate?: TaskUpdate | null;
  currentLogUpdate?: LogUpdate | null;
  onInsertCode?: (text: string, language?: string) => void;
}

type MessageRow = {
  id: string;
  kind: "message";
  message: Message;
  isLastUser: boolean;
};

type StatusRow =
  | { id: "status:loading"; kind: "status-loading" }
  | {
      id: "status:progress";
      kind: "status-progress";
      progress: number;
      total: number;
    }
  | { id: "status:progress-message"; kind: "status-progress-message"; text: string }
  | { id: "status:planning"; kind: "status-planning"; update: PlanningUpdate }
  | { id: "status:task"; kind: "status-task"; update: TaskUpdate }
  | { id: "status:log"; kind: "status-log"; update: LogUpdate };

type Row = MessageRow | StatusRow;

interface TimelineRowContextValue {
  expandedThoughts: { [key: string]: boolean };
  onToggleThought: (key: string) => void;
  onInsertCode?: (text: string, language?: string) => void;
  toolResultsByCallId: Record<string, { name?: string | null; content: unknown }>;
  componentStyles: ReturnType<typeof createStyles>;
  executionMessagesById: Map<string, Message[]>;
  theme: Theme;
}

const TimelineRowCtx = createContext<TimelineRowContextValue | null>(null);

const useTimelineRowCtx = (): TimelineRowContextValue => {
  const ctx = useContext(TimelineRowCtx);
  if (!ctx) {
    throw new Error("TimelineRowCtx missing");
  }
  return ctx;
};

const messageContentLength = (message: Message): number => {
  const content = message.content;
  if (typeof content === "string") {
    return content.length;
  }
  if (Array.isArray(content)) {
    let sum = 0;
    for (const block of content) {
      if (block && typeof block === "object") {
        const maybeText = (block as { text?: unknown }).text;
        sum += typeof maybeText === "string" ? maybeText.length : 1;
      }
    }
    return sum;
  }
  return content == null ? 0 : 1;
};

const rowSignature = (row: Row): string => {
  switch (row.kind) {
    case "message": {
      const m = row.message;
      const toolCalls = Array.isArray(m.tool_calls) ? m.tool_calls.length : 0;
      const streaming =
        row.message.role === "assistant" && !row.message.created_at ? 1 : 0;
      return [
        "m",
        row.id,
        m.role,
        m.created_at ?? "",
        messageContentLength(m),
        toolCalls,
        row.isLastUser ? 1 : 0,
        streaming
      ].join("|");
    }
    case "status-loading":
      return "s:loading";
    case "status-progress":
      return `s:progress:${row.progress}:${row.total}`;
    case "status-progress-message":
      return `s:progress-message:${row.text}`;
    case "status-planning":
      return `s:planning:${JSON.stringify(row.update)}`;
    case "status-task":
      return `s:task:${JSON.stringify(row.update)}`;
    case "status-log":
      return `s:log:${row.update.severity ?? ""}:${row.update.content ?? ""}`;
  }
};

const useStableRows = (rows: Row[]): Row[] => {
  const prevRef = useRef<Map<string, { row: Row; sig: string }>>(new Map());
  const next = new Map<string, { row: Row; sig: string }>();
  const out: Row[] = [];
  for (const row of rows) {
    const sig = rowSignature(row);
    const prev = prevRef.current.get(row.id);
    if (prev && prev.sig === sig) {
      out.push(prev.row);
      next.set(row.id, prev);
    } else {
      const entry = { row, sig };
      out.push(row);
      next.set(row.id, entry);
    }
  }
  prevRef.current = next;
  return out;
};

const rowWrapperStyle: React.CSSProperties = {
  maxWidth: 800,
  width: "100%",
  margin: "0 auto",
  padding: "0 .5em",
  boxSizing: "border-box"
};

const MessageRowView: React.FC<{ row: MessageRow }> = ({ row }) => {
  const ctx = useTimelineRowCtx();
  if (row.message.role === "agent_execution") {
    const key = row.message.agent_execution_id || "__ungrouped__";
    const group = ctx.executionMessagesById.get(key);
    if (group && group[0] !== row.message) {
      return null;
    }
  }
  return (
    <div style={rowWrapperStyle} className="chat-messages-list">
      <MessageView
        message={row.message}
        expandedThoughts={ctx.expandedThoughts}
        onToggleThought={ctx.onToggleThought}
        onInsertCode={ctx.onInsertCode}
        toolResultsByCallId={ctx.toolResultsByCallId}
        componentStyles={ctx.componentStyles}
        executionMessagesById={ctx.executionMessagesById}
      />
    </div>
  );
};

const StatusRowView: React.FC<{ row: StatusRow }> = ({ row }) => {
  const { theme } = useTimelineRowCtx();
  let content: React.ReactNode;
  switch (row.kind) {
    case "status-loading":
      content = (
        <li className="chat-message-list-item">
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
        </li>
      );
      break;
    case "status-progress":
      content = (
        <li className="chat-message-list-item">
          <Progress progress={row.progress} total={row.total} />
        </li>
      );
      break;
    case "status-progress-message":
      content = (
        <li className="node-status chat-message-list-item">
          <span
            css={css`
              display: inline;
              animation: ${textPulse} 1.8s ease-in-out infinite;
            `}
          >
            {row.text}
          </span>
        </li>
      );
      break;
    case "status-planning":
      content = (
        <li className="chat-message-list-item">
          <PlanningUpdateDisplay planningUpdate={row.update} />
        </li>
      );
      break;
    case "status-task":
      content = (
        <li className="chat-message-list-item">
          <TaskUpdateDisplay taskUpdate={row.update} />
        </li>
      );
      break;
    case "status-log": {
      const severity = row.update.severity || "info";
      content = (
        <li className="chat-message-list-item">
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
              className={`log-entry log-severity-${severity}`}
              style={{
                fontSize: "0.8rem",
                padding: "0.5rem 0.75rem",
                borderRadius: "var(--rounded-lg)",
                backgroundColor: "rgba(30, 35, 40, 0.4)",
                border: `1px solid ${theme.vars.palette.action.disabledBackground}`,
                color:
                  severity === "error"
                    ? theme.vars.palette.error.light
                    : severity === "warning"
                      ? theme.vars.palette.warning.light
                      : "grey.300"
              }}
            >
              {row.update.content}
            </div>
          </div>
        </li>
      );
      break;
    }
  }
  return (
    <div style={rowWrapperStyle} className="chat-messages-list">
      {content}
    </div>
  );
};

const TimelineRow: React.FC<{ row: Row }> = ({ row }) => {
  if (row.kind === "message") {
    return <MessageRowView row={row} />;
  }
  return <StatusRowView row={row} />;
};

const renderRow = ({ item }: LegendListRenderItemProps<Row>): React.ReactNode => (
  <TimelineRow row={item} />
);

const keyExtractor = (row: Row): string => row.id;

const ChatThreadView: React.FC<ChatThreadViewProps> = ({
  messages,
  status,
  progress,
  total,
  progressMessage,
  runningToolCallId,
  currentPlanningUpdate,
  currentTaskUpdate,
  currentLogUpdate,
  onInsertCode
}) => {
  const theme = useTheme();
  const listRef = useRef<LegendListRef>(null);
  const [containerElement, setContainerElement] = useState<HTMLElement | null>(
    null
  );
  const [isAtEnd, setIsAtEnd] = useState(true);
  const [expandedThoughts, setExpandedThoughts] = useState<{
    [key: string]: boolean;
  }>({});
  const previousMessageCountRef = useRef(messages.length);

  const componentStyles = useMemo(() => createStyles(theme), [theme]);

  const listStyles = useMemo(
    () =>
      css({
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        padding: ".5em 0",
        position: "relative",
        "&::-webkit-scrollbar": {
          width: "12px !important"
        },
        "&::-webkit-scrollbar-track": {
          background: "transparent !important"
        },
        "&::-webkit-scrollbar-thumb": {
          background: `${theme.vars.palette.action.disabled} !important`,
          borderRadius: "var(--rounded-sm)"
        },
        "&::-webkit-scrollbar-thumb:hover": {
          background: `${theme.vars.palette.warning.main} !important`
        }
      }),
    [theme]
  );

  const toolResultsByCallId = useMemo(() => {
    const map: Record<string, { name?: string | null; content: unknown }> = {};
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

  const hasAgentExecutionMessages = useMemo(
    () => messages.some((msg) => msg.role === "agent_execution"),
    [messages]
  );

  const { messageRows, lastUserRowIndex } = useMemo(() => {
    const filtered = messages.filter((m) => {
      if (m.role === "tool") {
        return false;
      }
      const hasToolCalls =
        Array.isArray(m.tool_calls) && m.tool_calls.length > 0;
      const hasExecutionEvent =
        !!m.execution_event_type || m.role === "agent_execution";

      let hasContent = false;
      if (typeof m.content === "string") {
        hasContent = m.content.trim().length > 0;
      } else if (Array.isArray(m.content)) {
        hasContent = m.content.some((block) => {
          if (!block || typeof block !== "object") {
            return false;
          }
          const b = block as { type?: string; text?: unknown };
          if (b.type === "text") {
            return typeof b.text === "string" && b.text.trim().length > 0;
          }
          if (b.type === "image_url" || b.type === "image") {
            return true;
          }
          return true;
        });
      } else if (m.content != null) {
        hasContent = true;
      }
      return hasContent || hasToolCalls || hasExecutionEvent;
    });
    const lastUserIdx = filtered.reduce(
      (lastIdx, msg, idx) => (msg.role === "user" ? idx : lastIdx),
      -1
    );
    const rows: MessageRow[] = filtered.map((msg, index) => ({
      id: msg.id || `msg-${index}`,
      kind: "message",
      message: msg,
      isLastUser: index === lastUserIdx
    }));
    return { messageRows: rows, lastUserRowIndex: lastUserIdx };
  }, [messages]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [...messageRows];
    if (status === "loading" && progress === 0 && !hasAgentExecutionMessages) {
      out.push({ id: "status:loading", kind: "status-loading" });
    }
    if (progress > 0 && !hasAgentExecutionMessages) {
      out.push({
        id: "status:progress",
        kind: "status-progress",
        progress,
        total
      });
    }
    if (progressMessage && !runningToolCallId && !hasAgentExecutionMessages) {
      out.push({
        id: "status:progress-message",
        kind: "status-progress-message",
        text: progressMessage
      });
    }
    if (!hasAgentExecutionMessages && currentPlanningUpdate) {
      out.push({
        id: "status:planning",
        kind: "status-planning",
        update: currentPlanningUpdate
      });
    }
    if (!hasAgentExecutionMessages && currentTaskUpdate) {
      out.push({
        id: "status:task",
        kind: "status-task",
        update: currentTaskUpdate
      });
    }
    if (!hasAgentExecutionMessages && currentLogUpdate) {
      out.push({
        id: "status:log",
        kind: "status-log",
        update: currentLogUpdate
      });
    }
    return out;
  }, [
    messageRows,
    status,
    progress,
    total,
    progressMessage,
    runningToolCallId,
    hasAgentExecutionMessages,
    currentPlanningUpdate,
    currentTaskUpdate,
    currentLogUpdate
  ]);

  const stableRows = useStableRows(rows);

  const handleToggleThought = useCallback((key: string) => {
    setExpandedThoughts((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const ctxValue = useMemo<TimelineRowContextValue>(
    () => ({
      expandedThoughts,
      onToggleThought: handleToggleThought,
      onInsertCode,
      toolResultsByCallId,
      componentStyles,
      executionMessagesById,
      theme
    }),
    [
      expandedThoughts,
      handleToggleThought,
      onInsertCode,
      toolResultsByCallId,
      componentStyles,
      executionMessagesById,
      theme
    ]
  );

  useEffect(() => {
    if (messages.length <= previousMessageCountRef.current) {
      previousMessageCountRef.current = messages.length;
      return;
    }
    previousMessageCountRef.current = messages.length;
    const last = messages[messages.length - 1] ?? null;
    if (last?.role === "user" && lastUserRowIndex >= 0) {
      const rafId = requestAnimationFrame(() => {
        listRef.current?.scrollToIndex({
          index: lastUserRowIndex,
          viewOffset: 0,
          animated: true
        });
      });
      return () => cancelAnimationFrame(rafId);
    }
  }, [messages, lastUserRowIndex]);

  const handleScroll = useCallback(() => {
    const state = listRef.current?.getState?.();
    setIsAtEnd(state?.isAtEnd ?? true);
  }, []);

  const handleScrollToBottom = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, []);

  const setRootRef = useCallback((node: HTMLDivElement | null) => {
    setContainerElement(node);
  }, []);

  return (
    <div
      ref={setRootRef}
      css={componentStyles.chatThreadViewRoot}
      className="chat-thread-view-root"
    >
      <TimelineRowCtx.Provider value={ctxValue}>
        <LegendList<Row>
          ref={listRef}
          data={stableRows}
          keyExtractor={keyExtractor}
          renderItem={renderRow}
          estimatedItemSize={90}
          initialScrollAtEnd
          maintainScrollAtEnd
          maintainScrollAtEndThreshold={0.1}
          maintainVisibleContentPosition
          onScroll={handleScroll}
          css={listStyles}
          className="scrollable-message-wrapper"
        />
      </TimelineRowCtx.Provider>
      <ScrollToBottomButton
        isVisible={!isAtEnd}
        onClick={handleScrollToBottom}
        containerElement={containerElement}
      />
    </div>
  );
};

export default memo(ChatThreadView);
