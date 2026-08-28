import React, { useMemo, useState, useCallback, useRef } from "react";
import {
  Message,
  MessageContent,
  MessageTextContent,
  MessageImageContent,
  ToolCall
} from "../../../stores/ApiTypes";

import ChatMarkdown from "./ChatMarkdown";
import { useEditorInsertion } from "../../../contexts/EditorInsertionContext";
import { ThoughtSection } from "./thought/ThoughtSection";
import { MessageContentRenderer } from "./MessageContentRenderer";
import {
  parseThoughtContent,
  getMessageClass,
  stripContextContent
} from "../utils/messageUtils";
import {
  parseHarmonyContent,
  hasHarmonyTokens,
  getDisplayContent
} from "../utils/harmonyUtils";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import {
  DEFAULT_THREAD_RUNTIME,
  getThreadRuntime
} from "../../../core/chat/threadRuntime";
import { MediaPredictionInline } from "../feedback/MediaPredictionStatus";
import {
  CopyButton,
  Caption,
  Text,
  FlexRow,
  FlexColumn,
  ShimmerText,
  Collapse,
  SPACING
} from "../../ui_primitives";
import type { SvgIconComponent } from "@mui/icons-material";
import ErrorIcon from "@mui/icons-material/Error";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import PersonOutlineRoundedIcon from "@mui/icons-material/PersonOutlineRounded";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import { getToolIcon } from "./toolCallIcon";

import AgentExecutionView from "./AgentExecutionView";
import MediaOutputGroup from "./MediaOutputGroup";
import { isMediaOnlyContent } from "./MediaOutputGroup.helpers";
import { ToolResult } from "./toolResults";
import { formatDuration, formatToolName } from "../../../utils/formatUtils";
import { formatJavaScriptForDisplay } from "../../../utils/formatJavaScript";
import type { MediaGenerationRequest } from "../../../stores/MediaGenerationStore";
import { visibleToolArgs as visibleArgs } from "../../../core/chat/toolCallFields";
import { CodeBlock } from "./markdown_elements/CodeBlock";
import { isObjectLike, isString } from "../../../utils/typePredicates";
import {
  groupConsecutiveToolCalls,
  toolCallGroupHeadline,
  toolCallGroupPreview,
  type ToolCallRun
} from "./groupToolCalls";
import { toolCallPhrase, toolCallRunDisplay } from "./toolCallPhrase";

/**
 * PrettyJson - Memoized component for displaying formatted JSON.
 * Extracted outside MessageView to prevent recreation on every render.
 */
const PrettyJson: React.FC<{ value: unknown }> = React.memo(({ value }) => {
  const text = useMemo(() => {
    try {
      if (isString(value)) {
        const parsed: unknown = JSON.parse(value);
        return JSON.stringify(parsed, null, 2);
      }
      return JSON.stringify(value, null, 2);
    } catch {
      // JSON.stringify failed, return value as-is or convert to string
      return isString(value) ? value : String(value);
    }
  }, [value]);
  return <pre className="pretty-json">{text}</pre>;
});
PrettyJson.displayName = "PrettyJson";

function formatTime(dateStr?: string | null): string | null {
  if (!dateStr) {
    return null;
  }
  try {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  } catch {
    return null;
  }
}

/**
 * `run_subtask` is the recursive-decomposition primitive: its LLM-provided
 * `description` becomes the row label and `prompt` goes into the expanded
 * section, so the row reads as the work rather than as a tool name.
 */
const RUN_SUBTASK_TOOL_NAME = "run_subtask";

/**
 * `execute_code` is the CodeAct action primitive (docs/codeact-design.md):
 * its one argument is a JavaScript program, so the row renders it as a
 * highlighted code block instead of a JSON-escaped string.
 */
const EXECUTE_CODE_TOOL_NAME = "execute_code";

/**
 * ToolRowRail — the glyph column and the hairline that ties one row to the
 * next. The rail is what makes a sequence of calls read as a timeline rather
 * than a stack of cards.
 */
const ToolRowRail: React.FC<{
  Icon: SvgIconComponent;
  connected: boolean;
}> = React.memo(({ Icon, connected }) => (
  <div className="tool-row-rail" aria-hidden>
    <span className="tool-row-glyph">
      <Icon />
    </span>
    {connected && <span className="tool-row-connector" />}
  </div>
));
ToolRowRail.displayName = "ToolRowRail";

/**
 * ToolCallRow - one call in the timeline: a glyph, what it did, and the thing
 * it did it to. Arguments and the result live behind the row.
 */
const ToolCallRow: React.FC<{
  tc: ToolCall;
  result?: { name?: string | null; content: unknown };
  durationMs?: number | null;
  connected?: boolean;
  tight?: boolean;
}> = React.memo(({ tc, result, durationMs, connected = false, tight = false }) => {
  const isSubtask = tc.name === RUN_SUBTASK_TOOL_NAME;
  const isCodeAction = tc.name === EXECUTE_CODE_TOOL_NAME;
  const [open, setOpen] = useState(false);
  const runningToolCallId = useGlobalChatStore(
    (s) => s.currentRunningToolCallId
  );
  const runningToolMessage = useGlobalChatStore((s) => s.currentToolMessage);
  const activePredictions = useGlobalChatStore(
    (s) =>
      getThreadRuntime(s, s.currentThreadId).activePredictions ??
      DEFAULT_THREAD_RUNTIME.activePredictions
  );

  // For run_subtask we lift `description` / `prompt` (Claude-Code Task naming)
  // out of args into label + expanded body. Tolerate the older
  // `title`/`instructions` keys for messages already in the DB.
  const rawArgs =
    (tc.args as Record<string, unknown> | null | undefined) ?? null;
  const pickString = (key: string) =>
    isString(rawArgs?.[key])
      ? rawArgs[key].trim() || null
      : null;
  const subtaskTitle = isSubtask
    ? (pickString("description") ?? pickString("title"))
    : null;
  const subtaskInstructions = isSubtask
    ? (pickString("prompt") ?? pickString("instructions"))
    : null;
  const actionCode = isCodeAction ? pickString("code") : null;
  const formattedActionCode = useMemo(
    () => (actionCode ? formatJavaScriptForDisplay(actionCode) : null),
    [actionCode]
  );
  const actionTitle = isCodeAction ? pickString("title") : null;
  const displayArgs = useMemo(() => {
    const base = visibleArgs(rawArgs);
    if (!base) return base;
    if (isCodeAction) {
      const stripped = { ...base } satisfies Record<string, unknown>;
      delete stripped["code"];
      delete stripped["title"];
      return Object.keys(stripped).length > 0 ? stripped : null;
    }
    if (!isSubtask) return base;
    const stripped = { ...base } satisfies Record<string, unknown>;
    for (const k of ["description", "prompt", "title", "instructions"]) {
      delete stripped[k];
    }
    return Object.keys(stripped).length > 0 ? stripped : null;
  }, [rawArgs, isSubtask, isCodeAction]);

  const hasArgs = !!displayArgs && Object.keys(displayArgs).length > 0;
  const resultContent = result?.content;
  // Expandable details only show when the result actually has content.
  const hasResult =
    resultContent != null &&
    !(isString(resultContent) && resultContent.trim().length === 0);
  const hasDetails =
    !!hasArgs || (isSubtask && !!subtaskInstructions) || !!actionCode || hasResult;
  const isRunning = runningToolCallId && tc.id && runningToolCallId === tc.id;
  const durationLabel =
    !isRunning && durationMs != null
      ? formatDuration(durationMs)
      : null;

  const handleToggleOpen = useCallback(() => {
    setOpen((v) => !v);
  }, []);
  const handleHeaderKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen((v) => !v);
    }
  }, []);

  // The LLM-authored `message` is the best label when there is one; otherwise
  // the tool's category supplies a verb phrase. Either way the distinctive
  // argument rides alongside in mono, unless the label already names it.
  const liveMessage = isRunning ? runningToolMessage || tc.message : tc.message;
  const phrase = toolCallPhrase(tc);
  const label = isSubtask
    ? subtaskTitle || formatToolName(tc.name)
    : isCodeAction
      ? actionTitle || liveMessage || formatToolName(tc.name)
      : liveMessage || phrase.label;
  const detail =
    !isSubtask &&
    !isCodeAction &&
    phrase.detail &&
    !label.includes(phrase.detail)
      ? phrase.detail
      : null;
  const ToolIcon = getToolIcon(tc.name);

  return (
    <div
      className={`tool-row${isRunning ? " running" : ""}${
        isSubtask ? " subtask" : ""
      }${tight ? " tight" : ""}`}
    >
      <ToolRowRail Icon={ToolIcon} connected={connected} />
      <div className="tool-row-main">
        <FlexRow
          className={`tool-row-header${hasDetails ? " expandable" : ""}`}
          align="center"
          fullWidth
          gap={SPACING.xs}
          role={hasDetails ? "button" : undefined}
          tabIndex={hasDetails ? 0 : undefined}
          aria-expanded={hasDetails ? open : undefined}
          onClick={hasDetails ? handleToggleOpen : undefined}
          onKeyDown={hasDetails ? handleHeaderKeyDown : undefined}
        >
          <Text
            component="span"
            size="small"
            className="tool-row-label"
            truncate={!isSubtask}
          >
            {isRunning ? <ShimmerText>{label}</ShimmerText> : label}
          </Text>
          {detail && <span className="tool-row-detail">{detail}</span>}
          <span className="tool-row-gap" />
          {durationLabel && (
            <span className="tool-row-duration">{durationLabel}</span>
          )}
          {hasDetails && (
            <ExpandMoreIcon
              className={`tool-row-chevron${open ? " expanded" : ""}`}
              aria-hidden
            />
          )}
        </FlexRow>
        {isRunning &&
          isCodeAction &&
          activePredictions.map((prediction) => (
            <MediaPredictionInline key={prediction.id} prediction={prediction} />
          ))}
        <Collapse in={open} timeout="auto" unmountOnExit>
          <FlexColumn className="tool-row-details" gap={SPACING.xs}>
            {isSubtask && subtaskInstructions && (
              <FlexColumn gap={SPACING.xs}>
                <Caption className="tool-section-title">Instructions</Caption>
                <Text size="small" className="subtask-instructions">
                  {subtaskInstructions}
                </Text>
              </FlexColumn>
            )}
            {formattedActionCode && (
              <FlexColumn gap={SPACING.xs}>
                <Caption className="tool-section-title">Code</Caption>
                <CodeBlock inline={false} className="language-javascript">
                  {formattedActionCode}
                </CodeBlock>
              </FlexColumn>
            )}
            {hasArgs && (
              <FlexColumn gap={SPACING.xs}>
                <Caption className="tool-section-title">
                  {isSubtask ? "Other arguments" : "Arguments"}
                </Caption>
                <PrettyJson value={displayArgs} />
              </FlexColumn>
            )}
            {hasResult && (
              <FlexColumn gap={SPACING.xs}>
                <FlexRow
                  className="tool-section-header"
                  align="center"
                  justify="space-between"
                  fullWidth
                >
                  <Caption className="tool-section-title">Result</Caption>
                  <CopyButton
                    value={resultContent}
                    tooltip="Copy result"
                    buttonSize="small"
                  />
                </FlexRow>
                <ToolResult toolName={tc.name} content={resultContent} />
              </FlexColumn>
            )}
          </FlexColumn>
        </Collapse>
      </div>
    </div>
  );
});
ToolCallRow.displayName = "ToolCallRow";

type ToolResultLookup = Record<
  string,
  { name?: string | null; content: unknown; createdAt?: string | null }
>;

type CallTiming = {
  toolResult?: { name?: string | null; content: unknown; createdAt?: string | null };
  durationMs: number | null;
};

/**
 * ToolCallCountRow - a run of same-tool calls the timeline shows as one
 * counted row ("Ran 3 searches"). Expands to a row per call.
 */
const ToolCallCountRow: React.FC<{
  name: string;
  calls: ToolCall[];
  durationFor: (tc: ToolCall) => CallTiming;
  messageCreatedAt?: string | null;
  connected?: boolean;
}> = React.memo(({ name, calls, durationFor, messageCreatedAt, connected = false }) => {
  const [open, setOpen] = useState(false);
  const runningToolCallId = useGlobalChatStore(
    (s) => s.currentRunningToolCallId
  );
  const isRunning = calls.some(
    (tc) => tc.id && runningToolCallId === tc.id
  );
  const ToolIcon = getToolIcon(name);
  const label = toolCallGroupHeadline(name, calls);
  const preview = toolCallGroupPreview(name, calls);

  const handleToggleOpen = useCallback(() => {
    setOpen((v) => !v);
  }, []);
  const handleHeaderKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen((v) => !v);
    }
  }, []);

  const { completedCount, durationMs } = useMemo(() => {
    let completed = 0;
    const ends: number[] = [];
    for (const tc of calls) {
      const { toolResult } = durationFor(tc);
      if (toolResult !== undefined) {
        completed += 1;
      }
      if (toolResult?.createdAt) {
        const t = new Date(toolResult.createdAt).getTime();
        if (Number.isFinite(t)) {
          ends.push(t);
        }
      }
    }
    const start = messageCreatedAt
      ? new Date(messageCreatedAt).getTime()
      : NaN;
    const duration =
      ends.length > 0 && Number.isFinite(start)
        ? Math.max(...ends) - start
        : null;
    return { completedCount: completed, durationMs: duration };
  }, [calls, durationFor, messageCreatedAt]);

  const durationLabel =
    !isRunning && durationMs != null ? formatDuration(durationMs) : null;
  const progressLabel =
    isRunning || completedCount < calls.length
      ? `${completedCount}/${calls.length}`
      : null;

  return (
    <div className={`tool-row tool-row-count${isRunning ? " running" : ""}`}>
      <ToolRowRail Icon={ToolIcon} connected={connected} />
      <div className="tool-row-main">
        <FlexRow
          className="tool-row-header expandable"
          align="center"
          fullWidth
          gap={SPACING.xs}
          role="button"
          tabIndex={0}
          aria-expanded={open}
          aria-label={`${label}, ${calls.length} ${name}`}
          onClick={handleToggleOpen}
          onKeyDown={handleHeaderKeyDown}
        >
          <Text
            component="span"
            size="small"
            className="tool-row-label"
            truncate
          >
            {isRunning ? <ShimmerText>{label}</ShimmerText> : label}
          </Text>
          {preview && !open && (
            <span className="tool-row-detail">{preview}</span>
          )}
          <span className="tool-row-gap" />
          {progressLabel && (
            <span className="tool-row-duration">{progressLabel}</span>
          )}
          {durationLabel && (
            <span className="tool-row-duration">{durationLabel}</span>
          )}
          <ExpandMoreIcon
            className={`tool-row-chevron${open ? " expanded" : ""}`}
            aria-hidden
          />
        </FlexRow>
        <Collapse in={open} timeout="auto" unmountOnExit>
          <FlexColumn className="tool-row-children" gap={SPACING.none}>
            {calls.map((tc, i) => {
              const { toolResult, durationMs: callDuration } = durationFor(tc);
              return (
                <ToolCallRow
                  key={tc.id || i}
                  tc={tc}
                  result={toolResult}
                  durationMs={callDuration}
                  tight={i > 0}
                />
              );
            })}
          </FlexColumn>
        </Collapse>
      </div>
    </div>
  );
});
ToolCallCountRow.displayName = "ToolCallCountRow";

/**
 * One entry in the rendered timeline. A run of same-tool calls becomes either
 * a row per call (`tight` on all but the first) or one counted row —
 * `toolCallRunDisplay` decides, on whether each call names a place worth
 * reading.
 */
type TimelineRow =
  | { key: string; kind: "call"; call: ToolCall; tight: boolean }
  | { key: string; kind: "count"; name: string; calls: ToolCall[] };

function timelineRows(runs: readonly ToolCallRun[]): TimelineRow[] {
  const rows: TimelineRow[] = [];
  runs.forEach((run, i) => {
    if (run.kind === "single") {
      rows.push({
        key: run.call.id || `call-${i}`,
        kind: "call",
        call: run.call,
        tight: false
      });
      return;
    }
    if (toolCallRunDisplay(run.name, run.calls) === "list") {
      run.calls.forEach((call, j) => {
        rows.push({
          key: call.id || `call-${i}-${j}`,
          kind: "call",
          call,
          tight: j > 0
        });
      });
      return;
    }
    rows.push({
      key: run.calls[0]?.id || `run-${run.name}-${i}`,
      kind: "count",
      name: run.name,
      calls: run.calls
    });
  });
  return rows;
}

/**
 * ToolCallTimeline - a message's tool calls as a connected sequence of rows.
 * Two or more rows carry a footer that reports how long the whole sequence
 * took and folds the rows away.
 */
const ToolCallTimeline: React.FC<{
  toolCalls: ToolCall[];
  toolResultsByCallId?: ToolResultLookup;
  messageCreatedAt?: string | null;
}> = React.memo(({ toolCalls, toolResultsByCallId, messageCreatedAt }) => {
  const [open, setOpen] = useState(true);
  const runningToolCallId = useGlobalChatStore(
    (s) => s.currentRunningToolCallId
  );
  const handleToggleOpen = useCallback(() => setOpen((v) => !v), []);
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen((v) => !v);
    }
  }, []);

  const durationFor = useCallback(
    (tc: ToolCall) => {
      const toolResult =
        tc.id && toolResultsByCallId
          ? toolResultsByCallId[String(tc.id)]
          : undefined;
      const durationMs =
        toolResult?.createdAt && messageCreatedAt
          ? new Date(toolResult.createdAt).getTime() -
            new Date(messageCreatedAt).getTime()
          : null;
      return { toolResult, durationMs };
    },
    [toolResultsByCallId, messageCreatedAt]
  );

  const rows = useMemo(
    () => timelineRows(groupConsecutiveToolCalls(toolCalls)),
    [toolCalls]
  );

  const renderRow = useCallback(
    (row: TimelineRow, i: number) => {
      // The hairline runs to the next row unless that row sits tight against
      // this one — a cluster of same-tool calls reads as one step.
      const next = rows[i + 1];
      const connected = next !== undefined && !(next.kind === "call" && next.tight);
      if (row.kind === "call") {
        const { toolResult, durationMs } = durationFor(row.call);
        return (
          <ToolCallRow
            key={row.key}
            tc={row.call}
            result={toolResult}
            durationMs={durationMs}
            connected={connected}
            tight={row.tight}
          />
        );
      }
      return (
        <ToolCallCountRow
          key={row.key}
          name={row.name}
          calls={row.calls}
          durationFor={durationFor}
          messageCreatedAt={messageCreatedAt}
          connected={connected}
        />
      );
    },
    [rows, durationFor, messageCreatedAt]
  );

  const isRunning = toolCalls.some(
    (tc) => tc.id && runningToolCallId === tc.id
  );

  const { completedCount, totalDurationMs } = useMemo(() => {
    let completed = 0;
    let maxMs: number | null = null;
    for (const tc of toolCalls) {
      const { toolResult, durationMs } = durationFor(tc);
      if (toolResult !== undefined) {
        completed++;
      }
      if (durationMs != null && Number.isFinite(durationMs)) {
        maxMs = maxMs === null ? durationMs : Math.max(maxMs, durationMs);
      }
    }
    return { completedCount: completed, totalDurationMs: maxMs };
  }, [toolCalls, durationFor]);

  // A lone row is its own summary — no footer, nothing to fold.
  if (rows.length <= 1) {
    return <div className="tool-timeline">{rows.map(renderRow)}</div>;
  }

  const totalDurationLabel =
    totalDurationMs !== null ? formatDuration(totalDurationMs) : null;
  const stepsLabel = `${toolCalls.length} steps`;
  const footerLabel = isRunning
    ? `Working · ${completedCount}/${toolCalls.length}`
    : totalDurationLabel
      ? `Worked for ${totalDurationLabel}`
      : stepsLabel;

  return (
    <div className="tool-timeline">
      <Collapse in={open} timeout="auto" unmountOnExit>
        <div className="tool-timeline-rows">{rows.map(renderRow)}</div>
      </Collapse>
      <FlexRow
        className="tool-timeline-footer"
        align="center"
        // Matches the row grid's column gap so the footer text lines up with
        // the labels above it.
        gap={SPACING.md}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={handleToggleOpen}
        onKeyDown={handleKeyDown}
      >
        <span className="tool-row-glyph" aria-hidden>
          <DragIndicatorIcon />
        </span>
        <Text component="span" size="small" className="tool-timeline-summary">
          {isRunning ? <ShimmerText>{footerLabel}</ShimmerText> : footerLabel}
        </Text>
        {!open && <span className="tool-row-detail">{stepsLabel}</span>}
      </FlexRow>
    </div>
  );
});
ToolCallTimeline.displayName = "ToolCallTimeline";

interface MessageViewProps {
  message: Message;
  isThoughtExpanded: (key: string) => boolean;
  onToggleThought: (key: string, anchorElement?: HTMLElement) => void;
  onInsertCode?: (text: string, language?: string) => void;
  toolResultsByCallId?: Record<
    string,
    { name?: string | null; content: unknown; createdAt?: string | null }
  >;
  executionMessagesById?: Map<string, Message[]>;
  /**
   * Render the per-message meta layout: an avatar + a persistent header line
   * (role · time · model), left-aligned for both roles. Enabled only in the
   * full-page chat; embedded chats keep the compact bubble layout.
   */
  showMeta?: boolean;
}

export const MessageView: React.FC<
  MessageViewProps & { componentStyles?: Record<string, unknown> }
> = React.memo(
  ({
    message,
    isThoughtExpanded,
    onToggleThought,
    onInsertCode,
    toolResultsByCallId,
    executionMessagesById,
    showMeta = false
  }) => {
    const insertIntoEditor = useEditorInsertion();

    const copyText = useMemo(() => {
      if (isString(message.content)) {
        return message.content;
      }
      if (Array.isArray(message.content)) {
        return message.content
          .filter(
            (c): c is MessageTextContent =>
              !!c && typeof c === "object" && c.type === "text"
          )
          .map((c) => c.text)
          .join("\n");
      }
      return "";
    }, [message.content]);

    const toggleCallbackRef = useRef(onToggleThought);
    toggleCallbackRef.current = onToggleThought;
    const [, setThoughtRenderVersion] = useState(0);
    const toggleHandlerCache = useRef(
      new Map<string, (event?: React.MouseEvent) => void>()
    );
    const createToggleHandler = useCallback((key: string) => {
      let handler = toggleHandlerCache.current.get(key);
      if (!handler) {
        handler = (event?: React.MouseEvent) => {
          const anchorElement =
            event?.currentTarget.closest<HTMLElement>("[data-index]");
          toggleCallbackRef.current(key, anchorElement ?? undefined);
          setThoughtRenderVersion((version) => version + 1);
        };
        toggleHandlerCache.current.set(key, handler);
      }
      return handler;
    }, []);

    // Memoized so its reference is stable across renders. It is passed to every
    // React.memo'd MessageContentRenderer; a fresh closure each render would
    // defeat that memo and force all media children (e.g. <video>) to re-render.
    // Deps are exactly the non-stable values it closes over — createToggleHandler
    // is already stable via useCallback.
    const renderTextContent = useCallback(
      (content: string, index: string | number) => {
        if (hasHarmonyTokens(content)) {
          const { messages, rawText } = parseHarmonyContent(content);

          if (messages.length > 0) {
            return (
              <>
                {messages.map((message, i) => {
                  const displayContent = getDisplayContent(message);
                  const parsedContent = stripContextContent(displayContent);
                  const parsedThought = parseThoughtContent(parsedContent);

                  if (parsedThought) {
                    const key = `thought-${index}-${i}`;
                    const isExpanded = isThoughtExpanded(key);

                    return (
                      <ThoughtSection
                        key={key}
                        thoughtContent={parsedThought.thoughtContent}
                        isExpanded={isExpanded}
                        onToggle={createToggleHandler(key)}
                        textBefore={parsedThought.textBeforeThought}
                        textAfter={parsedThought.textAfterThought}
                      />
                    );
                  }

                  const handler =
                    onInsertCode ||
                    (insertIntoEditor
                      ? (t: string) => insertIntoEditor(t)
                      : undefined);
                  return (
                    <ChatMarkdown
                      key={`markdown-${index}-${i}`}
                      content={parsedContent}
                      onInsertCode={handler}
                    />
                  );
                })}
                {rawText && (
                  <ChatMarkdown
                    content={stripContextContent(rawText)}
                    onInsertCode={
                      onInsertCode ||
                      (insertIntoEditor
                        ? (t: string) => insertIntoEditor(t)
                        : undefined)
                    }
                  />
                )}
              </>
            );
          }
        }

        const parsedContent = stripContextContent(content);
        const parsedThought = parseThoughtContent(parsedContent);

        if (parsedThought) {
          const key = `thought-${index}`;
          const isExpanded = isThoughtExpanded(key);

          return (
            <ThoughtSection
              thoughtContent={parsedThought.thoughtContent}
              isExpanded={isExpanded}
              onToggle={createToggleHandler(key)}
              textBefore={parsedThought.textBeforeThought}
              textAfter={parsedThought.textAfterThought}
            />
          );
        }

        const handler =
          onInsertCode ||
          (insertIntoEditor ? (t: string) => insertIntoEditor(t) : undefined);
        return <ChatMarkdown content={parsedContent} onInsertCode={handler} />;
      },
      [isThoughtExpanded, createToggleHandler, onInsertCode, insertIntoEditor]
    );

    if (message.role === "agent_execution") {
      const key = message.agent_execution_id || "__ungrouped__";
      const executionMessages = executionMessagesById?.get(key) ?? [];
      if (executionMessages.length > 0) {
        return <AgentExecutionView messages={executionMessages} />;
      }
      return null;
    }

    const baseClass = getMessageClass(message.role);
    const hasToolCalls =
      message.role === "assistant" &&
      Array.isArray(message.tool_calls) &&
      message.tool_calls.length > 0;
    const hasNonEmptyContent =
      (isString(message.content) &&
        message.content.trim().length > 0) ||
      (Array.isArray(message.content) &&
        message.content.some((block) => {
          if (!block || !isObjectLike(block)) {
            return false;
          }
          const contentBlock = block as MessageContent;
          if (contentBlock.type === "text") {
            return (
              isString(contentBlock.text) &&
              contentBlock.text.trim().length > 0
            );
          }
          return true;
        }));

    const showRoleMeta =
      showMeta && (message.role === "assistant" || message.role === "user");
    const messageClass = [
      baseClass,
      (message as Message & { error_type?: string }).error_type
        ? "error-message"
        : null,
      hasToolCalls ? "has-tool-calls" : null,
      hasToolCalls && !hasNonEmptyContent ? "tool-calls-only" : null,
      showRoleMeta ? "chat-message--meta" : null
    ]
      .filter(Boolean)
      .join(" ");

    const content = message.content as
      | Array<MessageTextContent | MessageImageContent>
      | string;

    const formattedTime = formatTime(message.created_at);
    return (
      <div className={messageClass}>
        <div className="message-body">
          {showRoleMeta && (
            <div className="message-header">
              {message.role === "user" ? (
                <PersonOutlineRoundedIcon className="message-role-icon" />
              ) : (
                <HubOutlinedIcon className="message-role-icon" />
              )}
              {formattedTime && (
                <span className="message-time">{formattedTime}</span>
              )}
              {message.role === "assistant" && message.model && (
                <span className="message-model">{message.model}</span>
              )}
            </div>
          )}
          <div className="message-content">
            {message.role === "assistant" &&
              Array.isArray(message.tool_calls) &&
              !message.agent_execution_id && ( // Don't render tool cards for agent tasks here (they are in AgentExecutionView)
                <ToolCallTimeline
                  toolCalls={message.tool_calls}
                  toolResultsByCallId={toolResultsByCallId}
                  messageCreatedAt={message.created_at}
                />
              )}
            {(message.role === "assistant" || message.role === "user") && (
              <>
                {isString(message.content) &&
                  renderTextContent(message.content, message.id || 0)}
                {Array.isArray(content) &&
                  (isMediaOnlyContent(content) &&
                  (((
                    message as Message & {
                      media_generation?: MediaGenerationRequest | null;
                    }
                  ).media_generation?.mode ?? "chat") !== "chat" ||
                    content.length > 1) ? (
                    <MediaOutputGroup message={message} mediaContents={content} />
                  ) : (
                    content.map((c: MessageContent, i: number) => {
                      // Guard against null / non-object blocks so the renderer's
                      // switch on `c.type` can't crash on a malformed block.
                      if (!c || !isObjectLike(c)) {
                        return null;
                      }
                      return (
                        <MessageContentRenderer
                          key={`${message.id}-content-${c.type}-${i}`}
                          content={c}
                          renderTextContent={renderTextContent}
                          index={i}
                        />
                      );
                    })
                  ))}
              </>
            )}
          </div>
          {(message as Message & { error_type?: string }).error_type && (
            <ErrorIcon className="error-icon" />
          )}
          {!Array.isArray(message.tool_calls) && (
            <div className="message-actions">
              {!showRoleMeta && formattedTime && (
                <span className="message-timestamp">{formattedTime}</span>
              )}
              {!showRoleMeta &&
                message.role === "assistant" &&
                message.model && (
                  <span className="message-model">{message.model}</span>
                )}
              <CopyButton
                value={copyText}
                buttonSize="small"
                tooltip="Copy to clipboard"
              />
            </div>
          )}
        </div>
      </div>
    );
  }
);

MessageView.displayName = "MessageView";
