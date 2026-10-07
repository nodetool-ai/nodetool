import { useState } from "react";
import { useTheme, type Theme } from "@mui/material/styles";
import type { GetRunResult, GetRunTraceResult, RunLog, RunLogsOptions, RunReaderFlags, RunTraceOptions } from "@nodetool-ai/protocol";
import useTraceStore, { type RunInspectionView } from "../../stores/TraceStore";
import { useRun, useRunLiveUpdates, useRunLogs, useRuns, useRunTrace } from "../../serverState/useRuns";
import {
  AlertBanner, BORDER_RADIUS, Box, Caption, Checkbox, CONTROL, EditorButton, EmptyState,
  FlexColumn, FlexRow, Label, LoadingSpinner, SelectField, SPACING, StatusPill, Text, TextInput, TYPOGRAPHY,
  Tooltip, TruncatedText, VirtualList, type StatusPillTone
} from "../ui_primitives";
import ReportBugButton from "../support/ReportBugButton";
import { AskRunAgentButton } from "../runs/AskRunAgentButton";

interface TracePanelProps { view?: RunInspectionView }
type TraceNode = GetRunTraceResult["nodes"][number];
type SpanStatusCode = TraceNode["record"]["status"]["code"];
interface SpanStatusProps { code: SpanStatusCode }
interface ContentStatusProps { flags: RunReaderFlags; limited?: boolean }
interface QueryErrorProps { error: Error }
interface RunViewProps { runId: string; focusedSpanId: string | null; onFocus: (spanId: string | null) => void }
interface SpanLaneProps {
  label: string; nodes: TraceNode[]; focusedSpanId: string | null;
  onFocus: (spanId: string) => void; start: number; duration: number;
}

function ContentStatus({ flags, limited }: ContentStatusProps): React.ReactElement {
  const notices = [
    flags.content_expired ? "Run content expired." : null,
    flags.content_state === "public" ? "Visitor run. Content was not recorded." : null,
    flags.truncated ? "Recording was truncated at the run limit." : null,
    flags.incomplete ? "The trace is incomplete." : null,
    limited ? "Showing a bounded portion. Focus a span or narrow the filters to inspect more." : null
  ].filter(Boolean);
  return <Caption role="status">{notices.join(" ")}</Caption>;
}

function QueryError({ error }: QueryErrorProps): React.ReactElement {
  return <FlexRow gap={SPACING.md}>
    <AlertBanner severity="error">{error.message}</AlertBanner>
    <ReportBugButton context={{ source: "panel-crash", summary: "Run inspection failed", errorText: error.message }} />
  </FlexRow>;
}

// Name, status, duration, timeline. Fixed meta widths keep the bars aligned across rows.
const spanGrid = (theme: Theme): string => `minmax(0, 2fr) ${theme.spacing(SPACING.xxxl * 2)} ${theme.spacing(SPACING.xxxl * 4)} minmax(0, 3fr)`;

function formatDuration(ms: number): string {
  if (ms < 1) { return `${ms.toFixed(2)} ms`; }
  if (ms < 1000) { return `${Math.round(ms)} ms`; }
  if (ms < 60_000) { return `${(ms / 1000).toFixed(2)} s`; }
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

const STATUS_DISPLAY: Record<SpanStatusCode, { tone: StatusPillTone; label: string; hint: string }> = {
  OK: { tone: "done", label: "ok", hint: "The span ended with status OK." },
  ERROR: { tone: "failed", label: "error", hint: "The span ended with status ERROR." },
  UNSET: { tone: "neutral", label: "unset", hint: "The span ended without an explicit status. OpenTelemetry treats this as success." }
};

function SpanStatus({ code }: SpanStatusProps): React.ReactElement {
  const status = STATUS_DISPLAY[code];
  return <Tooltip title={status.hint}><span><StatusPill tone={status.tone}>{status.label}</StatusPill></span></Tooltip>;
}

function SpanLane({ label, nodes, focusedSpanId, onFocus, start, duration }: SpanLaneProps): React.ReactElement {
  const theme = useTheme();
  return <FlexColumn gap={SPACING.xs} sx={{ flex: 1, minHeight: 0 }}>
    <Box sx={{ display: "grid", gridTemplateColumns: spanGrid(theme), columnGap: SPACING.lg, alignItems: "center", px: SPACING.sm }}>
      <Label>{label} · {nodes.length}</Label>
      <Caption color="muted">Status</Caption>
      <Caption color="muted" sx={{ textAlign: "right" }}>Duration</Caption>
      <FlexRow sx={{ justifyContent: "space-between" }}>
        <Caption color="muted">0</Caption>
        <Caption color="muted">{formatDuration(duration)}</Caption>
      </FlexRow>
    </Box>
    <VirtualList
      ariaLabel={label}
      items={nodes}
      estimateSize={CONTROL.height.md}
      getItemKey={({ record }) => record.span_id}
      scrollToIndex={nodes.findIndex(({ record }) => record.span_id === focusedSpanId)}
      sx={{ flex: 1, minHeight: 0 }}
      renderItem={({ record, depth }) => {
        const offset = Math.max(0, (record.start_time_ms - start) / duration * 100);
        const width = Math.max(0.5, Math.min(100 - offset, record.duration_ms / duration * 100));
        const cost = record.attributes["gen_ai.usage.cost_usd"];
        const focused = record.span_id === focusedSpanId;
        const barColor = record.status.code === "ERROR" ? "error.main" : record.status.code === "OK" ? "primary.main" : "text.disabled";
        return <Box sx={{
          display: "grid", gridTemplateColumns: spanGrid(theme), columnGap: SPACING.lg, alignItems: "center", height: "100%", px: SPACING.sm,
          borderRadius: BORDER_RADIUS.sm, bgcolor: focused ? "action.selected" : "transparent", "&:hover": { bgcolor: focused ? "action.selected" : "action.hover" }
        }}>
          <FlexRow sx={{ minWidth: 0, alignItems: "center", pl: Math.min(depth, 16) * SPACING.lg }}>
            <EditorButton
              size="small" variant="text"
              aria-pressed={focused}
              aria-label={`Inspect span ${record.name} ${record.span_id}`}
              title={record.name}
              onClick={() => onFocus(record.span_id)}
              sx={{ minWidth: 0, maxWidth: "100%", justifyContent: "flex-start", textTransform: "none", px: SPACING.xs,
                color: record.status.code === "ERROR" ? "error.main" : "text.primary", fontWeight: focused ? 600 : 400 }}
            ><TruncatedText component="span" variant="inherit">{record.name}</TruncatedText></EditorButton>
          </FlexRow>
          <SpanStatus code={record.status.code} />
          <Caption sx={{ textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
            {formatDuration(record.duration_ms)}{typeof cost === "number" ? ` · $${cost.toFixed(4)}` : ""}
          </Caption>
          <Box sx={{ minWidth: theme.spacing(SPACING.xxxl), position: "relative", height: theme.spacing(SPACING.sm), borderRadius: BORDER_RADIUS.xs, bgcolor: "action.hover" }}>
            <Box role="img" aria-label={`${record.name} timeline: ${Math.max(0, record.start_time_ms - start).toFixed(1)} ms from start, ${record.duration_ms.toFixed(1)} ms duration`}
              sx={{ position: "absolute", left: `${offset}%`, width: `${width}%`, minWidth: theme.spacing(SPACING.micro), height: "100%", borderRadius: BORDER_RADIUS.xs, bgcolor: barColor }} />
          </Box>
        </Box>;
      }}
    />
  </FlexColumn>;
}

function TraceView({ runId, focusedSpanId, onFocus }: RunViewProps): React.ReactElement {
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [depth, setDepth] = useState("64");
  const [name, setName] = useState("");
  const traceOptions: RunTraceOptions = { errors_only: errorsOnly, depth: Number(depth) };
  if (name) { traceOptions.name = name; }
  const trace = useRunTrace(runId, traceOptions);
  const focus = useRunTrace(focusedSpanId ? runId : null, focusedSpanId ? { focus_span_id: focusedSpanId, include_content: true } : {});
  const nodes = focusedSpanId ? focus.data?.nodes ?? [] : trace.data?.nodes ?? [];
  const browser = nodes.filter(({ record }) => record.resource["nodetool.trace.source"] === "browser");
  const server = nodes.filter(({ record }) => record.resource["nodetool.trace.source"] !== "browser");
  const start = nodes.length ? Math.min(...nodes.map(({ record }) => record.start_time_ms)) : 0;
  const end = nodes.length ? Math.max(...nodes.map(({ record }) => record.end_time_ms)) : 0;
  const focused = focus.data?.nodes.find(({ record }) => record.span_id === focusedSpanId)?.record;
  const focusOptions = trace.data?.nodes.map(({ record }) => ({ value: record.span_id, label: `${record.name} ${record.span_id}` })) ?? [];
  if (focusedSpanId && !focusOptions.some((option) => option.value === focusedSpanId)) { focusOptions.push({ value: focusedSpanId, label: focusedSpanId }); }
  return <FlexColumn gap={SPACING.md} sx={{ flex: 1, minHeight: 0 }}>
    <FlexRow gap={SPACING.lg} sx={{ alignItems: "flex-end", flexWrap: "wrap" }}>
      <Box sx={{ width: (theme) => theme.spacing(SPACING.xxxl * 4) }}>
        <SelectField label="Trace depth" size="small" value={depth} onChange={setDepth} options={[{ value: "4", label: "4 levels" }, { value: "16", label: "16 levels" }, { value: "64", label: "All levels" }]} />
      </Box>
      <Box sx={{ flex: "1 1 auto", minWidth: (theme) => theme.spacing(SPACING.xxxl * 6), maxWidth: (theme) => theme.spacing(SPACING.xxxl * 12) }}>
        <TextInput label="Span name" size="small" fullWidth value={name} onChange={(event) => setName(event.target.value.slice(0, 200))} />
      </Box>
      <Box sx={{ width: (theme) => theme.spacing(SPACING.xxxl * 8), maxWidth: "100%" }}>
        <SelectField label="Focus span" size="small" value={focusedSpanId ?? ""} onChange={(value) => onFocus(value || null)} options={[{ value: "", label: "Whole run" }, ...focusOptions]} />
      </Box>
      <Box sx={{ flexShrink: 0, whiteSpace: "nowrap", height: CONTROL.height.sm, display: "flex", alignItems: "center" }}>
        <Checkbox label="Errors only" size="small" checked={errorsOnly} onChange={(_, checked) => setErrorsOnly(checked)} />
      </Box>
      {focusedSpanId && <EditorButton size="small" onClick={() => onFocus(null)}>Clear span focus</EditorButton>}
    </FlexRow>
    {trace.error && <QueryError error={trace.error} />}
    {trace.isLoading && <LoadingSpinner />}
    {trace.data && <ContentStatus flags={trace.data} limited={trace.data.limited} />}
    {browser.length > 0 && <SpanLane label="Browser spans" nodes={browser} focusedSpanId={focusedSpanId} onFocus={onFocus} start={start} duration={Math.max(1, end - start)} />}
    {server.length > 0 && <SpanLane label="Server spans" nodes={server} focusedSpanId={focusedSpanId} onFocus={onFocus} start={start} duration={Math.max(1, end - start)} />}
    {!trace.isLoading && !trace.error && nodes.length === 0 && <EmptyState title="No spans recorded" description="The trace may still be arriving. Stored spans appear here when available." size="small" />}
    {focusedSpanId && <FlexColumn gap={SPACING.xs} sx={{ maxHeight: (theme) => theme.spacing(SPACING.xxxl * 6), overflow: "auto", borderTop: 1, borderColor: "divider", pt: SPACING.md }}>
      <FlexRow gap={SPACING.md} sx={{ alignItems: "center" }}><Label>Span {focusedSpanId}</Label><AskRunAgentButton runId={runId} spanId={focusedSpanId} /></FlexRow>
      {focus.error && <QueryError error={focus.error} />}
      {focus.isLoading && <LoadingSpinner />}
      {focus.data && <ContentStatus flags={focus.data} limited={focus.data.limited} />}
      {focused && !focus.error && !focus.data?.content_expired && <Text component="pre" sx={{ ...TYPOGRAPHY.mono.code, m: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify({ name: focused.name, status: focused.status, attributes: focused.attributes, events: focused.events }, null, 2)}</Text>}
    </FlexColumn>}
  </FlexColumn>;
}

function logText(log: RunLog): string {
  const value = log.attributes["log.message"] ?? log.attributes["console.output"] ?? log.attributes["text"];
  return typeof value === "string" ? value : JSON.stringify(log.attributes);
}

function LogsView({ runId, focusedSpanId, onFocus }: RunViewProps): React.ReactElement {
  const [level, setLevel] = useState("");
  const [source, setSource] = useState("");
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const logOptions: RunLogsOptions = {};
  if (level) { logOptions.level = level; }
  if (source) { logOptions.source = source; }
  if (focusedSpanId) { logOptions.span_id = focusedSpanId; }
  const logs = useRunLogs(runId, logOptions);
  const entries = logs.error ? [] : [...new Map(logs.data?.pages.flatMap((page) => page.logs).map((log) => [log.id, log]) ?? []).values()];
  entries.sort((a, b) => a.time_ms - b.time_ms || a.id.localeCompare(b.id));
  const selectedLog = logs.data?.pages.some((page) => page.content_expired) ? undefined : entries.find((log) => log.id === selectedLogId);
  const trace = useRunTrace(runId);
  const spanOptions = trace.data?.nodes.map(({ record }) => ({ value: record.span_id, label: `${record.name} ${record.span_id}` })) ?? [];
  if (focusedSpanId && !spanOptions.some((option) => option.value === focusedSpanId)) { spanOptions.push({ value: focusedSpanId, label: focusedSpanId }); }
  return <FlexColumn gap={SPACING.md} sx={{ flex: 1, minHeight: 0 }}>
    <FlexRow gap={SPACING.md}>
      <SelectField label="Log level" size="small" value={level} onChange={setLevel} options={[{ value: "", label: "All levels" }, ...["debug", "info", "warn", "error"].map((value) => ({ value, label: value }))]} />
      <SelectField label="Log source" size="small" value={source} onChange={setSource} options={[{ value: "", label: "All sources" }, ...[...new Set([...entries.map((log) => log.source).filter((value): value is string => Boolean(value)), ...(source ? [source] : [])])].map((value) => ({ value, label: value }))]} />
      <SelectField label="Log span" size="small" value={focusedSpanId ?? ""} onChange={(value) => onFocus(value || null)} options={[{ value: "", label: "All spans" }, ...spanOptions]} />
    </FlexRow>
    {logs.error && <QueryError error={logs.error} />}
    {logs.isLoading && <LoadingSpinner />}
    {logs.data && <ContentStatus flags={logs.data.pages[0]} limited={logs.data.pages.some((page) => page.limited)} />}
    {!logs.isLoading && entries.length === 0 && <EmptyState title="No matching log events" size="small" />}
    <VirtualList ariaLabel="Run logs" items={entries} estimateSize={CONTROL.height.lg} getItemKey={(log) => log.id} sx={{ flex: 1, minHeight: 0 }}
      renderItem={(log) => <FlexRow gap={SPACING.md} sx={{ alignItems: "center", height: "100%" }}>
        <Caption>{new Date(log.time_ms).toLocaleTimeString()} · {log.level ?? "event"} · {log.source ?? log.name}</Caption>
        <EditorButton size="small" variant="text" aria-label={`Inspect log span ${log.span_id}`} onClick={() => onFocus(log.span_id)}>{log.span_name}</EditorButton>
        <EditorButton size="small" variant="text" aria-label={`Read ${log.name} event ${log.id}`} onClick={() => setSelectedLogId(log.id)}>{logText(log).slice(0, 200)}</EditorButton>
      </FlexRow>} />
    {logs.hasNextPage && <EditorButton size="small" disabled={logs.isFetchingNextPage} onClick={() => void logs.fetchNextPage()}>Load more log events</EditorButton>}
    {selectedLog && <FlexColumn gap={SPACING.xs} sx={{ maxHeight: (theme) => theme.spacing(SPACING.xxxl * 4), overflow: "auto" }}>
      <FlexRow gap={SPACING.md}><Caption>{selectedLog.name} · {selectedLog.id}</Caption><AskRunAgentButton runId={runId} spanId={selectedLog.span_id} /><EditorButton size="small" onClick={() => setSelectedLogId(null)}>Close log event</EditorButton></FlexRow>
      <Text component="pre" sx={{ ...TYPOGRAPHY.mono.code, m: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(selectedLog.attributes, null, 2)}</Text>
    </FlexColumn>}
  </FlexColumn>;
}

const RUN_STATUS_TONE: Record<GetRunResult["run"]["status"], StatusPillTone> = { completed: "done", failed: "failed", cancelled: "warning", running: "rendering" };

export default function TracePanel({ view = "trace" }: TracePanelProps): React.ReactElement {
  const selectedRunId = useTraceStore((state) => state.selectedRunId);
  const focusedSpanId = useTraceStore((state) => state.focusedSpanId);
  const selectRun = useTraceStore((state) => state.selectRun);
  const focusSpan = useTraceStore((state) => state.focusSpan);
  const recent = useRuns();
  const runs = [...new Map(recent.data?.pages.flatMap((page) => page.runs).map((run) => [run.id, run]) ?? []).values()];
  const runId = selectedRunId ?? runs[0]?.id ?? null;
  const summary = useRun(runId);
  const canonicalId = summary.data?.run.id ?? runId;
  useRunLiveUpdates(canonicalId);
  const options = runs.map((run) => ({ value: run.id, label: `${run.kind} · ${run.app?.operation_id ?? run.source_id.slice(0, 12)} · ${run.status} · ${new Date(run.started_at).toLocaleString()}` }));
  if (runId && !options.some((option) => option.value === runId)) { options.unshift({ value: runId, label: runId }); }
  return <FlexColumn gap={SPACING.md} sx={{ flex: 1, minHeight: 0, px: SPACING.xl, py: SPACING.md }}>
    <FlexRow gap={SPACING.md} sx={{ alignItems: "flex-end", flexWrap: "wrap" }}>
      <Box sx={{ flex: "1 1 auto", minWidth: 0, maxWidth: (theme) => theme.spacing(SPACING.xxxl * 16) }}>
        <SelectField label="Run" size="small" value={runId ?? ""} options={options.length ? options : [{ value: "", label: "No recent runs" }]} onChange={selectRun} />
      </Box>
      {recent.hasNextPage && <EditorButton size="small" onClick={() => void recent.fetchNextPage()}>Older runs</EditorButton>}
      {canonicalId && <AskRunAgentButton runId={canonicalId} />}
      {summary.data?.summary.first_failed_span_id && <EditorButton size="small" onClick={() => focusSpan(summary.data?.summary.first_failed_span_id ?? null)}>First failed span</EditorButton>}
    </FlexRow>
    {recent.error && <QueryError error={recent.error} />}
    {summary.error && <QueryError error={summary.error} />}
    {summary.data && <FlexRow gap={SPACING.md} sx={{ alignItems: "center" }}>
      <StatusPill tone={RUN_STATUS_TONE[summary.data.run.status]}>{summary.data.run.status}</StatusPill>
      <Caption sx={{ fontVariantNumeric: "tabular-nums" }}>{summary.data.summary.span_count} spans · {summary.data.summary.event_count} events · ${Object.values(summary.data.summary.cost_by_provider).reduce((total, value) => total + value, 0).toFixed(4)}</Caption>
    </FlexRow>}
    {!runId && !recent.isLoading && <EmptyState title="No recorded runs" description="Start an app operation, workflow, or chat turn to inspect its trace and logs." size="small" />}
    {canonicalId && (view === "logs" ? <LogsView key={canonicalId} runId={canonicalId} focusedSpanId={focusedSpanId} onFocus={focusSpan} /> : <TraceView key={canonicalId} runId={canonicalId} focusedSpanId={focusedSpanId} onFocus={focusSpan} />)}
  </FlexColumn>;
}
