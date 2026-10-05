/**
 * Shows live agent work and replays the owned run's stored activity after reload.
 *
 * Bound to `op:<id>/exec#transcript`. A run that drives a model through a tool
 * loop takes minutes. Without this widget the app shows a progress bar for all
 * of that time and then the result.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  isOperationRunning,
  operationTranscript,
  parseBinding,
  type ActivityEntry
} from "@nodetool-ai/app-runtime";

import {
  Box,
  AlertBanner,
  Caption,
  Collapse,
  FlexColumn,
  FlexRow,
  Label,
  ScrollArea,
  ShimmerText,
  StatusPill,
  EditorButton,
  LoadingSpinner,
  Text,
  TruncatedText,
  BORDER_RADIUS,
  TYPOGRAPHY,
  MOTION,
  SPACING,
  reducedMotion
} from "../../ui_primitives";
import { getToolIcon } from "../../chat/message/toolCallIcon";
import {
  useAppRuntimeContext,
  useRuntimeSelector
} from "../runtime/AppRuntimeContext";
import { MarkdownBlock } from "./widgets";
import { useAppOperationRun } from "../../../hooks/useAppOperationRun";
import { useRunLogs, useRunLiveUpdates } from "../../../serverState/useRuns";
import { replayAppRunActivity } from "../../../serverState/appRunActivity";
import { useRunInspection } from "../../../hooks/useRunInspection";
import { AskRunAgentButton } from "../../runs/AskRunAgentButton";
import ReportBugButton from "../../support/ReportBugButton";

interface AgentActivityWidgetProps {
  id: string;
  binding?: string;
  label?: string;
  height?: number;
  placeholder?: string;
}

const NO_ENTRIES: ReadonlyArray<ActivityEntry> = [];

/** What the editor shows before any run, so the widget can be laid out. */
const SAMPLE: ReadonlyArray<ActivityEntry> = [
  { kind: "text", text: "Reading the approved storyboard." },
  {
    kind: "tool",
    id: "sample",
    name: "edit_timeline",
    label: "Editing the timeline",
    status: "done",
    result: "Applied 3 edits."
  }
];

const RAIL_WIDTH = 20;
const ROW_HEIGHT = 22;

/** The op names a batch call carries, from its arguments or its result text. */
const opNames = (entry: ToolEntry): string[] => {
  const args = entry.args;
  const fromArgs = Array.isArray(args?.ops)
    ? (args.ops as unknown[]).flatMap((op) =>
        typeof op === "object" && op !== null && typeof (op as { op?: unknown }).op === "string"
          ? [(op as { op: string }).op]
          : []
      )
    : [];
  // A result can be cut short, so read the names out of the text, not by parsing it.
  const names = fromArgs.length
    ? fromArgs
    : Array.from((entry.result ?? "").matchAll(/"op":"([a-z0-9_]+)"/g), (m) => m[1]);
  return names.map((name) => name.replace(/^ui_(timeline_)?/, ""));
};

/** "move_track ×3, add_clip" — the distinct ops of a batch, with repeat counts. */
const opSummary = (names: readonly string[]): string | null => {
  if (names.length === 0) return null;
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return Array.from(counts, ([name, n]) => (n > 1 ? `${name} ×${n}` : name)).join(", ");
};

const prettyResult = (text: string): string => {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
};

type ToolEntry = Extract<ActivityEntry, { kind: "tool" }>;

/**
 * One tool call, phrased and laid out like the chat's tool-call timeline: a
 * glyph and hairline rail, a one-line sentence, the ops it carried in mono,
 * and the raw result one click away.
 */
const ToolRow: React.FC<{ entry: ToolEntry; connected: boolean; runId?: string; spanId?: string }> = ({
  entry,
  connected,
  runId,
  spanId
}) => {
  const { openRunInspection } = useRunInspection();
  const [open, setOpen] = useState(false);
  const Icon = getToolIcon(entry.name);
  const running = entry.status === "running";
  const failed = entry.status === "error";
  const detail = opSummary(opNames(entry));
  const result = entry.result?.trim() ? prettyResult(entry.result) : null;
  const toggle = useCallback(() => setOpen((value) => !value), []);
  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen((value) => !value);
    }
  }, []);

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: `${RAIL_WIDTH}px 1fr`,
        columnGap: SPACING.md,
        minWidth: 0
      }}
    >
      <FlexColumn align="center" sx={{ minHeight: ROW_HEIGHT }} aria-hidden>
        <FlexRow
          align="center"
          justify="center"
          sx={{
            width: RAIL_WIDTH,
            height: ROW_HEIGHT,
            flexShrink: 0,
            color: failed
              ? "error.main"
              : running
                ? "primary.main"
                : "text.disabled",
            "& svg": { fontSize: "1em" }
          }}
        >
          <Icon />
        </FlexRow>
        {connected ? (
          <Box sx={{ flex: 1, width: "1px", bgcolor: "divider" }} />
        ) : null}
      </FlexColumn>
      <Box sx={{ minWidth: 0, pb: SPACING.xs }}>
        <FlexRow
          align="center"
          fullWidth
          gap={SPACING.xs}
          role={result ? "button" : undefined}
          tabIndex={result ? 0 : undefined}
          aria-expanded={result ? open : undefined}
          onClick={result ? toggle : undefined}
          onKeyDown={result ? onKeyDown : undefined}
          sx={{
            minHeight: ROW_HEIGHT,
            borderRadius: BORDER_RADIUS.sm,
            px: SPACING.sm,
            ml: -SPACING.sm,
            cursor: result ? "pointer" : "default",
            userSelect: "none",
            "&:hover": result ? { bgcolor: "action.hover" } : undefined,
            "&:hover .chevron, &:focus-visible .chevron": { opacity: 1 },
            "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main" }
          }}
        >
          <Text
            component="span"
            size="small"
            truncate
            sx={{ color: running ? "text.primary" : "text.secondary", minWidth: 0 }}
          >
            {running ? <ShimmerText>{entry.label}</ShimmerText> : entry.label}
          </Text>
          {detail ? (
            <TruncatedText
              component="span"
              color="secondary"
              sx={{
                ...TYPOGRAPHY.mono.caption,
                color: "text.secondary",
                minWidth: 0
              }}
            >
              {detail}
            </TruncatedText>
          ) : null}
          <Box sx={{ flex: 1 }} />
          {failed ? (
            <Caption component="span" sx={{ color: "error.main" }}>
              Failed
            </Caption>
          ) : null}
          {result ? (
            <ExpandMoreIcon
              className="chevron"
              aria-hidden
              sx={{
                fontSize: "1em",
                color: "text.disabled",
                flexShrink: 0,
                opacity: open ? 1 : 0,
                transform: open ? "rotate(180deg)" : "none",
                transition: `${MOTION.opacity}, ${MOTION.transform}`,
                ...reducedMotion({ transition: MOTION.none })
              }}
            />
          ) : null}
        </FlexRow>
        {result ? (
          <Collapse in={open} timeout="auto" unmountOnExit>
            <ScrollArea
              component="pre"
              maxHeight={240}
              sx={{
                m: 0,
                mt: SPACING.xs,
                mb: SPACING.sm,
                p: SPACING.sm,
                borderRadius: BORDER_RADIUS.md,
                bgcolor: "action.hover",
                color: "text.secondary",
                ...TYPOGRAPHY.mono.caption,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {result}
            </ScrollArea>
          </Collapse>
        ) : null}
        {runId && spanId ? <FlexRow gap={SPACING.xs}>
          <EditorButton onClick={() => openRunInspection({ runId, spanId })}>View trace</EditorButton>
          <AskRunAgentButton runId={runId} spanId={spanId} />
        </FlexRow> : null}
      </Box>
    </Box>
  );
};

export const AgentActivityWidget: React.FC<AgentActivityWidgetProps> = (
  props
) => {
  const { designMode, instanceId } = useAppRuntimeContext();
  const ref = parseBinding(props.binding);
  const operationId = ref?.kind === "execution" ? ref.operationId : null;
  const entries = useRuntimeSelector((state) =>
    operationId ? operationTranscript(state, operationId) : NO_ENTRIES
  );
  const running = useRuntimeSelector((state) =>
    operationId ? isOperationRunning(state, operationId) : false
  );
  const { runId, liveRunMatches, historyLoading, historyError, historyLimited, traceIncomplete } = useAppOperationRun(operationId);
  const logs = useRunLogs(runId, { source: "agent", include_content: true, limit: 500 });
  const pages = logs.data?.pages ?? [];
  useRunLiveUpdates(pages[0]?.run?.id ?? runId);
  const readError = historyError ?? logs.error;
  const expired = pages.some((page) => page.content_expired);
  const excluded = pages.some((page) => page.content_state === "public" || page.content_state === "suppressed");
  const stored = expired || excluded || readError ? [] : replayAppRunActivity(pages.flatMap((page) => page.logs));
  const useLive = !expired && !excluded && !readError && running && (liveRunMatches || !instanceId);
  const shown = designMode ? entries.length ? entries : SAMPLE : useLive ? entries : stored.map((item) => item.entry);
  const { openRunInspection } = useRunInspection();

  // Follow the newest entry while the agent works, the way a log does.
  const scroller = useRef<HTMLDivElement>(null);
  const last = shown[shown.length - 1];
  const lastSize = last?.kind === "text" ? last.text.length : last?.status;
  useEffect(() => {
    const element = scroller.current;
    if (running && element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [running, shown.length, lastSize]);

  if (!designMode && !running && shown.length === 0 && !runId && !historyLoading && !readError && !historyLimited) {
    return props.placeholder ? (
      <Caption color="secondary">{props.placeholder}</Caption>
    ) : null;
  }
  return (
    <FlexColumn gap={SPACING.sm} fullWidth>
      <FlexRow gap={SPACING.sm} align="center" fullWidth>
        {props.label ? <Label>{props.label}</Label> : null}
        {running ? <StatusPill tone="rendering">Working</StatusPill> : null}
        {runId ? <EditorButton onClick={() => openRunInspection({ runId })}>View trace</EditorButton> : null}
        {runId ? <AskRunAgentButton runId={runId} /> : null}
      </FlexRow>
      {historyLoading || logs.isLoading ? <LoadingSpinner text="Loading activity" /> : null}
      {historyLimited ? <Caption>Recorded activity is outside the recent runs loaded.</Caption> : null}
      {expired ? <Caption>Activity content expired.</Caption> : excluded ? <Caption>Activity content is unavailable for this run.</Caption> : null}
      {readError ? <AlertBanner severity="error" action={<ReportBugButton context={{ source: "operation-failure", summary: "Run activity could not load", errorText: readError.message }} />}>{readError.message}</AlertBanner> : null}
      {runId && !logs.isLoading && !useLive && !expired && !excluded && !readError && shown.length === 0
        ? <Caption>{props.placeholder ?? "No agent activity recorded."}</Caption> : null}
      <ScrollArea ref={scroller} thin maxHeight={props.height ?? 360}>
        <FlexColumn gap={SPACING.xs} fullWidth>
          {shown.map((entry, index) =>
            entry.kind === "tool" ? (
              <ToolRow
                key={entry.id}
                entry={entry}
                runId={!useLive && runId ? runId : undefined}
                spanId={!useLive ? stored[index]?.spanId : undefined}
                connected={shown[index + 1]?.kind === "tool"}
              />
            ) : (
              <Box key={`text-${index}`} sx={{ width: "100%" }}>
                <MarkdownBlock text={entry.text} />
              </Box>
            )
          )}
        </FlexColumn>
      </ScrollArea>
      {pages.some((page) => page.truncated || page.limited) ? <Caption>Activity recording was limited.</Caption> : null}
      {traceIncomplete ? <Caption>Some browser activity could not be recorded.</Caption> : null}
      {!traceIncomplete && pages.some((page) => page.incomplete) ? <Caption>Activity recording is incomplete.</Caption> : null}
      {logs.hasNextPage && !expired && !excluded ? <EditorButton disabled={logs.isFetchingNextPage} onClick={() => void logs.fetchNextPage()}>Load more activity</EditorButton> : null}
    </FlexColumn>
  );
};
