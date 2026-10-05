import { useState } from "react";
import { useTheme } from "@mui/material/styles";
import type { GetRunTraceResult, RunLog, RunLogsOptions, RunReaderFlags, RunTraceOptions } from "@nodetool-ai/protocol";
import useTraceStore, { type RunInspectionView } from "../../stores/TraceStore";
import { useRun, useRunLiveUpdates, useRunLogs, useRuns, useRunTrace } from "../../serverState/useRuns";
import {
  AlertBanner, Box, Caption, Checkbox, CONTROL, EditorButton, EmptyState,
  FlexColumn, FlexRow, Label, LoadingSpinner, SelectField, SPACING, Text, TextInput,
  VirtualList
} from "../ui_primitives";
import ReportBugButton from "../support/ReportBugButton";
import { AskRunAgentButton } from "../runs/AskRunAgentButton";

interface TracePanelProps { view?: RunInspectionView }
type TraceNode = GetRunTraceResult["nodes"][number];
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

function SpanLane({ label, nodes, focusedSpanId, onFocus, start, duration }: SpanLaneProps): React.ReactElement {
  const theme = useTheme();
  return <FlexColumn sx={{ flex: 1, minHeight: 0 }}>
    <Label>{label}</Label>
    <VirtualList
      ariaLabel={label}
      items={nodes}
      estimateSize={CONTROL.height.lg}
      getItemKey={({ record }) => record.span_id}
      scrollToIndex={nodes.findIndex(({ record }) => record.span_id === focusedSpanId)}
      sx={{ flex: 1, minHeight: 0 }}
      renderItem={({ record, depth }) => {
        const offset = Math.max(0, (record.start_time_ms - start) / duration * 100);
        const width = Math.max(0.5, Math.min(100 - offset, record.duration_ms / duration * 100));
        const cost = record.attributes["gen_ai.usage.cost_usd"];
        return <FlexRow gap={SPACING.md} sx={{ height: "100%", alignItems: "center", pl: Math.min(depth, 16) * SPACING.md }}>
          <EditorButton
            size="small" variant="text"
            aria-pressed={record.span_id === focusedSpanId}
            aria-label={`Inspect span ${record.name} ${record.span_id}`}
            onClick={() => onFocus(record.span_id)}
          >{record.name}</EditorButton>
          <Caption>{record.status.code} · {record.duration_ms.toFixed(1)} ms{typeof cost === "number" ? ` · $${cost.toFixed(4)}` : ""}</Caption>
          <Box sx={{ flex: 1, minWidth: theme.spacing(SPACING.xxxl), position: "relative", height: theme.spacing(SPACING.md), bgcolor: "action.hover" }}>
            <Box role="img" aria-label={`${record.name} timeline: ${Math.max(0, record.start_time_ms - start).toFixed(1)} ms from start, ${record.duration_ms.toFixed(1)} ms duration`}
              sx={{ position: "absolute", left: `${offset}%`, width: `${width}%`, height: "100%", bgcolor: record.status.code === "ERROR" ? "error.main" : "primary.main" }} />
          </Box>
        </FlexRow>;
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
    <FlexRow gap={SPACING.md} sx={{ alignItems: "center" }}>
      <Checkbox label="Errors only" checked={errorsOnly} onChange={(_, checked) => setErrorsOnly(checked)} />
      <SelectField label="Trace depth" size="small" value={depth} onChange={setDepth} options={[{ value: "4", label: "4 levels" }, { value: "16", label: "16 levels" }, { value: "64", label: "All levels" }]} />
      <TextInput label="Span name" size="small" value={name} onChange={(event) => setName(event.target.value.slice(0, 200))} />
      <SelectField label="Focus span" size="small" value={focusedSpanId ?? ""} onChange={(value) => onFocus(value || null)} options={[{ value: "", label: "Whole run" }, ...focusOptions]} />
      {focusedSpanId && <EditorButton size="small" onClick={() => onFocus(null)}>Clear span focus</EditorButton>}
    </FlexRow>
    {trace.error && <QueryError error={trace.error} />}
    {trace.isLoading && <LoadingSpinner />}
    {trace.data && <ContentStatus flags={trace.data} limited={trace.data.limited} />}
    {browser.length > 0 && <SpanLane label="Browser spans" nodes={browser} focusedSpanId={focusedSpanId} onFocus={onFocus} start={start} duration={Math.max(1, end - start)} />}
    {server.length > 0 && <SpanLane label="Server spans" nodes={server} focusedSpanId={focusedSpanId} onFocus={onFocus} start={start} duration={Math.max(1, end - start)} />}
    {!trace.isLoading && !trace.error && nodes.length === 0 && <EmptyState title="No spans recorded" description="The trace may still be arriving. Stored spans appear here when available." size="small" />}
    {focusedSpanId && <FlexColumn gap={SPACING.xs} sx={{ maxHeight: (theme) => theme.spacing(SPACING.xxxl * 4), overflow: "auto" }}>
      <FlexRow gap={SPACING.md}><Label>Span {focusedSpanId}</Label><AskRunAgentButton runId={runId} spanId={focusedSpanId} /></FlexRow>
      {focus.error && <QueryError error={focus.error} />}
      {focus.isLoading && <LoadingSpinner />}
      {focus.data && <ContentStatus flags={focus.data} limited={focus.data.limited} />}
      {focused && !focus.error && !focus.data?.content_expired && <Text component="pre" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify({ name: focused.name, status: focused.status, attributes: focused.attributes, events: focused.events }, null, 2)}</Text>}
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
      <Text component="pre" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(selectedLog.attributes, null, 2)}</Text>
    </FlexColumn>}
  </FlexColumn>;
}

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
  return <FlexColumn gap={SPACING.md} sx={{ flex: 1, minHeight: 0, p: SPACING.md }}>
    <FlexRow gap={SPACING.md} sx={{ alignItems: "center" }}>
      <SelectField label="Run" size="small" value={runId ?? ""} options={options.length ? options : [{ value: "", label: "No recent runs" }]} onChange={selectRun} />
      {recent.hasNextPage && <EditorButton size="small" onClick={() => void recent.fetchNextPage()}>Older runs</EditorButton>}
      {canonicalId && <AskRunAgentButton runId={canonicalId} />}
      {summary.data?.summary.first_failed_span_id && <EditorButton size="small" onClick={() => focusSpan(summary.data?.summary.first_failed_span_id ?? null)}>First failed span</EditorButton>}
    </FlexRow>
    {recent.error && <QueryError error={recent.error} />}
    {summary.error && <QueryError error={summary.error} />}
    {summary.data && <Caption>{summary.data.run.status} · {summary.data.summary.span_count} spans · {summary.data.summary.event_count} events · ${Object.values(summary.data.summary.cost_by_provider).reduce((total, value) => total + value, 0).toFixed(4)}</Caption>}
    {!runId && !recent.isLoading && <EmptyState title="No recorded runs" description="Start an app operation, workflow, or chat turn to inspect its trace and logs." size="small" />}
    {canonicalId && (view === "logs" ? <LogsView key={canonicalId} runId={canonicalId} focusedSpanId={focusedSpanId} onFocus={focusSpan} /> : <TraceView key={canonicalId} runId={canonicalId} focusedSpanId={focusedSpanId} onFocus={focusSpan} />)}
  </FlexColumn>;
}
