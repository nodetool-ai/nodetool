import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme, type Theme } from "@mui/material/styles";
import { useQueryClient } from "@tanstack/react-query";
import type { GetRunResult, GetRunTraceResult, RunLog, RunLogsOptions, RunReaderFlags, RunTraceOptions, TraceRecord } from "@nodetool-ai/protocol";
import useTraceStore, { type RunInspectionView } from "../../stores/TraceStore";
import { useRun, useRunLiveUpdates, useRunLogs, useRuns, useRunTrace } from "../../serverState/useRuns";
import { workflowQueryKey } from "../../serverState/useWorkflow";
import {
  AlertBanner, Autocomplete, BORDER_RADIUS, Box, Caption, Checkbox, CONTROL, CopyButton, EditorButton, EmptyState,
  FlexColumn, FlexRow, Label, LoadingSpinner, ScrollArea, SelectField, SPACING, StatusPill, Text, TextInput, TYPOGRAPHY,
  Tooltip, TruncatedText, VirtualList, type StatusPillTone
} from "../ui_primitives";
import ReportBugButton from "../support/ReportBugButton";
import { AskRunAgentButton } from "../runs/AskRunAgentButton";
import type { Workflow } from "../../stores/ApiTypes";

interface TracePanelProps {
  view?: RunInspectionView;
  /** Lists only this workflow's runs. Null lists every run. */
  workflowId?: string | null;
}
type TraceNode = GetRunTraceResult["nodes"][number];
type SpanStatusCode = TraceNode["record"]["status"]["code"];
interface SpanStatusProps { code: SpanStatusCode; message?: string | null }
interface AttributeListProps { attributes: Record<string, unknown> }
interface SpanDetailsProps { record: TraceRecord; runStart: number }
type RunRecord = GetRunResult["run"];
interface RunPickerProps { runs: RunRecord[]; value: string | null; onChange: (runId: string) => void }
interface SpanPickerProps { label: string; emptyLabel: string; nodes: TraceNode[]; value: string | null; onChange: (spanId: string | null) => void }
interface FailureBannerProps { result: GetRunResult; onShowSpan: (spanId: string) => void }
interface ContentStatusProps { flags: RunReaderFlags; limited?: boolean }
interface QueryErrorProps { error: Error }
interface RunViewProps { runId: string; focusedSpanId: string | null; onFocus: (spanId: string | null) => void }
interface SpanLaneProps {
  label: string; nodes: TraceNode[]; focusedSpanId: string | null;
  onFocus: (spanId: string) => void; start: number; duration: number;
}

function ContentStatus({ flags, limited }: ContentStatusProps): React.ReactElement | null {
  const { t } = useTranslation();
  const notices = [
    flags.content_expired ? t("i18n-cont-panels-12.trace.contentExpired") : null,
    flags.content_state === "public" ? t("i18n-cont-panels-12.trace.visitorContentNotRecorded") : null,
    flags.truncated ? t("i18n-cont-panels-12.trace.recordingTruncated") : null,
    flags.incomplete ? t("i18n-cont-panels-12.trace.traceIncomplete") : null,
    limited ? t("i18n-cont-panels-12.trace.boundedPortion") : null
  ].filter(Boolean);
  return notices.length ? <Caption role="status">{notices.join(" ")}</Caption> : null;
}

function QueryError({ error }: QueryErrorProps): React.ReactElement {
  const { t } = useTranslation();
  return <FlexRow gap={SPACING.md}>
    <AlertBanner severity="error">{error.message}</AlertBanner>
    <ReportBugButton context={{ source: "panel-crash", summary: t("i18n-cont-panels-12.trace.runInspectionFailed"), errorText: error.message }} />
  </FlexRow>;
}

// Name, status, duration, timeline. Fixed meta widths keep the bars aligned across rows.
const spanGrid = (theme: Theme): string => `minmax(0, 2fr) ${theme.spacing(SPACING.xxxl * 2)} ${theme.spacing(SPACING.xxxl * 4)} minmax(0, 3fr)`;

// Pickers share the 28px control height and field background of SelectField and TextInput, so a filter row lines up.
const PICKER_SX = {
  "& .MuiInputBase-root": { height: CONTROL.height.sm, py: 0, bgcolor: "Paper.overlay" },
  "& .MuiAutocomplete-input": { py: 0 }
} as const;
const SPAN_ROW_HEIGHT = CONTROL.height.md;
const LANE_HEADER_HEIGHT = CONTROL.height.sm;

// Buttons and checkboxes beside labelled fields sit in a box of the field's height, so they center on the field rather than on the label.
function ControlSlot({ children }: { children: React.ReactNode }): React.ReactElement {
  return <FlexRow sx={{ flexShrink: 0, height: CONTROL.height.sm, alignItems: "center", whiteSpace: "nowrap" }}>{children}</FlexRow>;
}

function formatDuration(ms: number, locale = "en"): string {
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  if (ms < 1) { return `${number.format(ms)} ms`; }
  if (ms < 1000) { return `${number.format(Math.round(ms))} ms`; }
  if (ms < 60_000) { return `${number.format(ms / 1000)} s`; }
  return `${number.format(Math.floor(ms / 60_000))}m ${number.format(Math.round((ms % 60_000) / 1000))}s`;
}

function formatRelativeTime(value: Date | string, locale: string): string {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const absolute = Math.abs(seconds);
  if (absolute < 60) { return formatter.format(seconds, "second"); }
  if (absolute < 3600) { return formatter.format(Math.round(seconds / 60), "minute"); }
  if (absolute < 86400) { return formatter.format(Math.round(seconds / 3600), "hour"); }
  if (absolute < 2_592_000) { return formatter.format(Math.round(seconds / 86400), "day"); }
  if (absolute < 31_536_000) { return formatter.format(Math.round(seconds / 2_592_000), "month"); }
  return formatter.format(Math.round(seconds / 31_536_000), "year");
}

function formatUsd(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(value);
}

function SpanStatus({ code, message }: SpanStatusProps): React.ReactElement {
  const { t } = useTranslation();
  const statusByCode = {
    OK: { tone: "done", label: t("i18n-cont-panels-12.trace.status.ok"), hint: t("i18n-cont-panels-12.trace.status.okHint") },
    ERROR: { tone: "failed", label: t("i18n-cont-panels-12.trace.status.error"), hint: t("i18n-cont-panels-12.trace.status.errorHint") },
    UNSET: { tone: "neutral", label: t("i18n-cont-panels-12.trace.status.unset"), hint: t("i18n-cont-panels-12.trace.status.unsetHint") }
  } satisfies Record<SpanStatusCode, { tone: StatusPillTone; label: string; hint: string }>;
  const status = statusByCode[code];
  return <Tooltip title={message || status.hint}><span><StatusPill tone={status.tone}>{status.label}</StatusPill></span></Tooltip>;
}

// Spans record failures as a status message, an OpenTelemetry exception event, or an error attribute.
function spanError(record: TraceRecord): string | null {
  const exception = record.events.find((event) => event.name === "exception")?.attributes?.["exception.message"];
  const message = record.status.message || exception || record.attributes["exception.message"] || record.attributes["error.message"];
  return typeof message === "string" && message ? message : null;
}

function formatValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function AttributeList({ attributes }: AttributeListProps): React.ReactElement {
  const { t } = useTranslation();
  const entries = Object.entries(attributes).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) { return <Caption color="muted">{t("i18n-cont-panels-12.trace.noneRecorded")}</Caption>; }
  return <Box component="dl" sx={{ display: "grid", gridTemplateColumns: "fit-content(40%) minmax(0, 1fr)", columnGap: SPACING.xl, rowGap: SPACING.xs, alignItems: "baseline", m: 0 }}>
    {entries.map(([key, value]) => <Box key={key} sx={{ display: "contents" }}>
      <Text component="dt" sx={{ ...TYPOGRAPHY.mono.code, color: "text.secondary", overflowWrap: "anywhere" }}>{key}</Text>
      <Text component="dd" sx={{ ...TYPOGRAPHY.mono.code, m: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{formatValue(value)}</Text>
    </Box>)}
  </Box>;
}

function SpanDetails({ record, runStart }: SpanDetailsProps): React.ReactElement {
  const { t, i18n } = useTranslation();
  const error = spanError(record);
  const cost = record.attributes["gen_ai.usage.cost_usd"];
  return <FlexColumn gap={SPACING.md}>
    <FlexRow gap={SPACING.md} sx={{ alignItems: "center", flexWrap: "wrap" }}>
      <SpanStatus code={record.status.code} message={error} />
      <Caption sx={{ fontVariantNumeric: "tabular-nums" }}>
        {formatDuration(record.duration_ms, i18n.language)} · {t("i18n-cont-panels-12.trace.startsAt", { duration: formatDuration(Math.max(0, record.start_time_ms - runStart), i18n.language) })}{typeof cost === "number" ? ` · ${formatUsd(cost, i18n.language)}` : ""}
      </Caption>
      <Caption color="muted" sx={TYPOGRAPHY.mono.code}>{record.span_id}</Caption>
      <CopyButton value={JSON.stringify(record, null, 2)} tooltip={t("i18n-cont-panels-12.trace.copySpanJson")} />
    </FlexRow>
    {error && <AlertBanner severity="error" compact>{error}</AlertBanner>}
    <Label>{t("i18n-cont-panels-12.trace.attributes")}</Label>
    <AttributeList attributes={record.attributes} />
    {record.events.length > 0 && <>
      <Label>{t("i18n-cont-panels-12.trace.events", { count: record.events.length })}</Label>
      {record.events.map((event, index) => <FlexColumn key={event.id ?? index} gap={SPACING.xs}>
        <Caption sx={{ fontVariantNumeric: "tabular-nums" }}>+{formatDuration(Math.max(0, event.time_ms - record.start_time_ms), i18n.language)} · {event.name}</Caption>
        {event.attributes && <AttributeList attributes={event.attributes} />}
      </FlexColumn>)}
    </>}
  </FlexColumn>;
}

function SpanLane({ label, nodes, focusedSpanId, onFocus, start, duration }: SpanLaneProps): React.ReactElement {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  // A lane is as tall as its rows, up to the space available, so a one-span browser lane does not take half the panel.
  // Lanes shrink to three rows before they scroll, so a second lane or the details pane never overlaps them.
  return <FlexColumn gap={SPACING.xs} sx={{
    flex: "1 1 auto",
    minHeight: `calc(${LANE_HEADER_HEIGHT + Math.min(nodes.length, 3) * SPAN_ROW_HEIGHT}px + ${theme.spacing(SPACING.xs)})`,
    maxHeight: `calc(${LANE_HEADER_HEIGHT + nodes.length * SPAN_ROW_HEIGHT}px + ${theme.spacing(SPACING.xs)})`
  }}>
    <Box sx={{ display: "grid", gridTemplateColumns: spanGrid(theme), columnGap: SPACING.lg, alignItems: "center", height: LANE_HEADER_HEIGHT, flexShrink: 0, px: SPACING.sm }}>
      <Label sx={{ pl: SPACING.xs }}>{label} · {nodes.length}</Label>
      <Caption color="muted">{t("i18n-cont-panels-12.trace.status.heading")}</Caption>
      <Caption color="muted" sx={{ textAlign: "right" }}>{t("i18n-cont-panels-12.trace.duration")}</Caption>
      <FlexRow sx={{ justifyContent: "space-between" }}>
        <Caption color="muted">0</Caption>
        <Caption color="muted">{formatDuration(duration, i18n.language)}</Caption>
      </FlexRow>
    </Box>
    <VirtualList
      ariaLabel={label}
      items={nodes}
      estimateSize={SPAN_ROW_HEIGHT}
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
              aria-label={t("i18n-cont-panels-12.trace.inspectSpan", { name: record.name, id: record.span_id })}
              tooltip={record.name}
              onClick={() => onFocus(record.span_id)}
              sx={{ minWidth: 0, maxWidth: "100%", justifyContent: "flex-start", textTransform: "none", px: SPACING.xs,
                color: record.status.code === "ERROR" ? "error.main" : "text.primary", fontWeight: focused ? 600 : 400 }}
            ><TruncatedText component="span" variant="inherit">{record.name}</TruncatedText></EditorButton>
          </FlexRow>
          <SpanStatus code={record.status.code} message={spanError(record)} />
          <Caption sx={{ textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
            {formatDuration(record.duration_ms, i18n.language)}{typeof cost === "number" ? ` · ${formatUsd(cost, i18n.language)}` : ""}
          </Caption>
          <Box sx={{ minWidth: theme.spacing(SPACING.xxxl), position: "relative", height: theme.spacing(SPACING.sm), borderRadius: BORDER_RADIUS.xs, bgcolor: "action.hover" }}>
            <Box role="img" aria-label={t("i18n-cont-panels-12.trace.timelineDescription", { name: record.name, offset: Math.max(0, record.start_time_ms - start).toFixed(1), duration: record.duration_ms.toFixed(1) })}
              sx={{ position: "absolute", left: `${offset}%`, width: `${width}%`, minWidth: theme.spacing(SPACING.micro), height: "100%", borderRadius: BORDER_RADIUS.xs, bgcolor: barColor }} />
          </Box>
        </Box>;
      }}
    />
  </FlexColumn>;
}

interface SplitViewProps { detailsOpen: boolean; details: React.ReactNode; children: React.ReactNode }

// The list keeps the left side and details open beside it on wide panels, or below it on narrow ones, so opening details never hides the list.
function SplitView({ detailsOpen, details, children }: SplitViewProps): React.ReactElement {
  return <Box sx={{
    flex: 1, minHeight: 0, display: "grid", gap: SPACING.lg,
    gridTemplateColumns: detailsOpen ? { xs: "minmax(0, 1fr)", lg: "minmax(0, 3fr) minmax(0, 2fr)" } : "minmax(0, 1fr)",
    gridTemplateRows: detailsOpen ? { xs: "minmax(0, 1fr) minmax(0, 1fr)", lg: "minmax(0, 1fr)" } : "minmax(0, 1fr)"
  }}>
    <FlexColumn gap={SPACING.md} sx={{ minHeight: 0 }}>{children}</FlexColumn>
    {detailsOpen && <ScrollArea fullHeight sx={{
      minHeight: 0, borderColor: "divider", borderStyle: "solid", borderWidth: 0,
      borderTopWidth: { xs: 1, lg: 0 }, borderLeftWidth: { xs: 0, lg: 1 }, pt: { xs: SPACING.md, lg: 0 }, pl: { xs: 0, lg: SPACING.lg }
    }}><FlexColumn gap={SPACING.sm}>{details}</FlexColumn></ScrollArea>}
  </Box>;
}

function TraceView({ runId, focusedSpanId, onFocus }: RunViewProps): React.ReactElement {
  const { t } = useTranslation();
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [depth, setDepth] = useState("64");
  const [name, setName] = useState("");
  const traceOptions: RunTraceOptions = { errors_only: errorsOnly, depth: Number(depth) };
  if (name) { traceOptions.name = name; }
  const trace = useRunTrace(runId, traceOptions);
  const focus = useRunTrace(focusedSpanId ? runId : null, focusedSpanId ? { focus_span_id: focusedSpanId, include_content: true } : {});
  // Keep the whole run visible around a focused span unless the list is a bounded portion that may not reach its subtree.
  const keepContext = Boolean(trace.data && !trace.data.limited && trace.data.nodes.some(({ record }) => record.span_id === focusedSpanId));
  const nodes = focusedSpanId && !keepContext ? focus.data?.nodes ?? [] : trace.data?.nodes ?? [];
  const filtered = errorsOnly || Boolean(name) || depth !== "64";
  const clearFilters = (): void => { setErrorsOnly(false); setName(""); setDepth("64"); };
  const browser = nodes.filter(({ record }) => record.resource["nodetool.trace.source"] === "browser");
  const server = nodes.filter(({ record }) => record.resource["nodetool.trace.source"] !== "browser");
  const start = nodes.length ? Math.min(...nodes.map(({ record }) => record.start_time_ms)) : 0;
  const runStart = trace.data?.nodes.length ? Math.min(...trace.data.nodes.map(({ record }) => record.start_time_ms)) : start;
  const end = nodes.length ? Math.max(...nodes.map(({ record }) => record.end_time_ms)) : 0;
  const focused = focus.data?.nodes.find(({ record }) => record.span_id === focusedSpanId)?.record;
  return <FlexColumn gap={SPACING.md} sx={{ flex: 1, minHeight: 0 }}>
    <FlexRow gap={SPACING.lg} sx={{ alignItems: "flex-end", flexWrap: "wrap" }}>
      <Box sx={{ width: (theme) => theme.spacing(SPACING.xxxl * 4) }}>
        <SelectField label={t("i18n-cont-panels-12.trace.traceDepth")} size="small" value={depth} onChange={setDepth} options={[{ value: "4", label: t("i18n-cont-panels-12.trace.levels", { count: 4 }) }, { value: "16", label: t("i18n-cont-panels-12.trace.levels", { count: 16 }) }, { value: "64", label: t("i18n-cont-panels-12.trace.allLevels") }]} />
      </Box>
      <Box sx={{ flex: "1 1 auto", minWidth: (theme) => theme.spacing(SPACING.xxxl * 6), maxWidth: (theme) => theme.spacing(SPACING.xxxl * 12) }}>
        <TextInput label={t("i18n-cont-panels-12.trace.spanName")} size="small" fullWidth value={name} onChange={(event) => setName(event.target.value.slice(0, 200))} />
      </Box>
      <Box sx={{ width: (theme) => theme.spacing(SPACING.xxxl * 8), maxWidth: "100%" }}>
        <SpanPicker label={t("i18n-cont-panels-12.trace.focusSpan")} emptyLabel={t("i18n-cont-panels-12.trace.wholeRun")} nodes={trace.data?.nodes ?? []} value={focusedSpanId} onChange={onFocus} />
      </Box>
      <ControlSlot>
        <Checkbox label={t("i18n-cont-panels-12.trace.errorsOnly")} size="small" checked={errorsOnly} onChange={(_, checked) => setErrorsOnly(checked)} />
      </ControlSlot>
      {focusedSpanId && <ControlSlot><EditorButton size="small" onClick={() => onFocus(null)}>{t("i18n-cont-panels-12.trace.clearSpanFocus")}</EditorButton></ControlSlot>}
    </FlexRow>
    {trace.error && <QueryError error={trace.error} />}
    {trace.isLoading && <LoadingSpinner />}
    {trace.data && <ContentStatus flags={trace.data} limited={trace.data.limited} />}
    <SplitView detailsOpen={Boolean(focusedSpanId)} details={<>
      <FlexRow gap={SPACING.md} sx={{ alignItems: "center", minHeight: LANE_HEADER_HEIGHT }}>
        <Label sx={{ minWidth: 0, overflowWrap: "anywhere" }}>{focused?.name ?? nodes.find(({ record }) => record.span_id === focusedSpanId)?.record.name ?? t("i18n-cont-panels-12.trace.span")}</Label>
        <AskRunAgentButton runId={runId} spanId={focusedSpanId ?? undefined} />
      </FlexRow>
      {focus.error && <QueryError error={focus.error} />}
      {focus.isLoading && <LoadingSpinner />}
      {focus.data && <ContentStatus flags={focus.data} limited={focus.data.limited} />}
      {focused && !focus.error && !focus.data?.content_expired && <SpanDetails record={focused} runStart={runStart} />}
    </>}>
      {browser.length > 0 && <SpanLane label={t("i18n-cont-panels-12.trace.browserSpans")} nodes={browser} focusedSpanId={focusedSpanId} onFocus={onFocus} start={start} duration={Math.max(1, end - start)} />}
      {server.length > 0 && <SpanLane label={t("i18n-cont-panels-12.trace.serverSpans")} nodes={server} focusedSpanId={focusedSpanId} onFocus={onFocus} start={start} duration={Math.max(1, end - start)} />}
      {!trace.isLoading && !trace.error && nodes.length === 0 && (filtered
        ? <EmptyState variant="no-results" title={t("i18n-cont-panels-12.trace.noSpansMatch")} description={t("i18n-cont-panels-12.trace.clearFiltersDescription")} actionText={t("i18n-cont-panels-12.trace.clearFilters")} onAction={clearFilters} size="small" />
        : <EmptyState title={t("i18n-cont-panels-12.trace.noSpansRecorded")} description={t("i18n-cont-panels-12.trace.noSpansDescription")} size="small" />)}
    </SplitView>
  </FlexColumn>;
}

function logText(log: RunLog): string {
  const value = log.attributes["log.message"] ?? log.attributes["console.output"] ?? log.attributes["text"];
  return typeof value === "string" ? value : JSON.stringify(log.attributes);
}

function logLevelLabel(level: string | null | undefined, t: ReturnType<typeof useTranslation>["t"]): string {
  if (!level) { return t("i18n-cont-panels-12.trace.event"); }
  const labels: Record<string, string> = {
    debug: t("i18n-cont-panels-12.trace.level.debug"),
    info: t("i18n-cont-panels-12.trace.level.info"),
    warn: t("i18n-cont-panels-12.trace.level.warning"),
    error: t("i18n-cont-panels-12.trace.level.error")
  };
  return labels[level] ?? level;
}

// Time, level, source, span, message. Fixed meta widths keep the columns aligned across rows.
const logGrid = (theme: Theme): string => `${theme.spacing(SPACING.xxxl * 3)} ${theme.spacing(SPACING.xxxl * 2)} minmax(0, 0.6fr) minmax(0, 1fr) minmax(0, 3fr)`;
const LOG_LEVEL_COLOR: Record<string, string> = { error: "error.main", warn: "warning.main" };
function LogsView({ runId, focusedSpanId, onFocus }: RunViewProps): React.ReactElement {
  const { t, i18n } = useTranslation();
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
  const theme = useTheme();
  return <FlexColumn gap={SPACING.md} sx={{ flex: 1, minHeight: 0 }}>
    <FlexRow gap={SPACING.lg} sx={{ alignItems: "flex-end", flexWrap: "wrap" }}>
      <Box sx={{ width: (theme) => theme.spacing(SPACING.xxxl * 4) }}>
        <SelectField label={t("i18n-cont-panels-12.trace.logLevel")} size="small" value={level} onChange={setLevel} options={[{ value: "", label: t("i18n-cont-panels-12.trace.allLevels") }, ...[
          { value: "debug", label: t("i18n-cont-panels-12.trace.level.debug") }, { value: "info", label: t("i18n-cont-panels-12.trace.level.info") },
          { value: "warn", label: t("i18n-cont-panels-12.trace.level.warning") }, { value: "error", label: t("i18n-cont-panels-12.trace.level.error") }
        ]]} />
      </Box>
      <Box sx={{ width: (theme) => theme.spacing(SPACING.xxxl * 5) }}>
        <SelectField label={t("i18n-cont-panels-12.trace.logSource")} size="small" value={source} onChange={setSource} options={[{ value: "", label: t("i18n-cont-panels-12.trace.allSources") }, ...[...new Set([...entries.map((log) => log.source).filter((value): value is string => Boolean(value)), ...(source ? [source] : [])])].map((value) => ({ value, label: value }))]} />
      </Box>
      <Box sx={{ width: (theme) => theme.spacing(SPACING.xxxl * 8), maxWidth: "100%" }}>
        <SpanPicker label={t("i18n-cont-panels-12.trace.logSpan")} emptyLabel={t("i18n-cont-panels-12.trace.allSpans")} nodes={trace.data?.nodes ?? []} value={focusedSpanId} onChange={onFocus} />
      </Box>
    </FlexRow>
    {logs.error && <QueryError error={logs.error} />}
    {logs.isLoading && <LoadingSpinner />}
    {logs.data && <ContentStatus flags={logs.data.pages[0]} limited={logs.data.pages.some((page) => page.limited)} />}
    <SplitView detailsOpen={Boolean(selectedLog)} details={selectedLog && <>
      <FlexRow gap={SPACING.md} sx={{ alignItems: "center", flexWrap: "wrap", minHeight: LANE_HEADER_HEIGHT }}>
        <Label>{selectedLog.span_name}</Label>
        <Caption color="muted" sx={{ fontVariantNumeric: "tabular-nums" }}>{new Date(selectedLog.time_ms).toLocaleTimeString(i18n.language)} · {selectedLog.level ? logLevelLabel(selectedLog.level, t) : selectedLog.name}</Caption>
        <AskRunAgentButton runId={runId} spanId={selectedLog.span_id} />
        <EditorButton size="small" onClick={() => setSelectedLogId(null)}>{t("i18n-cont-panels-12.trace.closeLogEvent")}</EditorButton>
      </FlexRow>
      <AttributeList attributes={selectedLog.attributes} />
    </>}>
      {!logs.isLoading && entries.length === 0 && <EmptyState title={t("i18n-cont-panels-12.trace.noMatchingLogEvents")} size="small" />}
      {entries.length > 0 && <FlexColumn gap={SPACING.xs} sx={{ flex: 1, minHeight: 0 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: logGrid(theme), columnGap: SPACING.lg, alignItems: "center", height: LANE_HEADER_HEIGHT, flexShrink: 0, px: SPACING.sm }}>
          {["time", "levelHeading", "sourceHeading", "spanHeading", "messageHeading"].map((key) => <Caption key={key} color="muted">{t(`i18n-cont-panels-12.trace.columns.${key}`)}</Caption>)}
        </Box>
        <VirtualList ariaLabel={t("i18n-cont-panels-12.trace.runLogs")} items={entries} estimateSize={SPAN_ROW_HEIGHT} getItemKey={(log) => log.id} sx={{ flex: 1, minHeight: 0 }}
          renderItem={(log) => <Box sx={{
            display: "grid", gridTemplateColumns: logGrid(theme), columnGap: SPACING.lg, alignItems: "center", height: "100%", px: SPACING.sm, borderRadius: BORDER_RADIUS.sm,
            bgcolor: log.id === selectedLog?.id ? "action.selected" : "transparent", "&:hover": { bgcolor: log.id === selectedLog?.id ? "action.selected" : "action.hover" }
          }}>
            <Caption sx={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{new Date(log.time_ms).toLocaleTimeString(i18n.language)}</Caption>
            <Caption sx={{ color: LOG_LEVEL_COLOR[log.level ?? ""] ?? "text.secondary" }}>{logLevelLabel(log.level, t)}</Caption>
            <Caption component="div" color="muted" sx={{ minWidth: 0 }}><TruncatedText component="span" variant="inherit">{log.source ?? log.name}</TruncatedText></Caption>
            <EditorButton size="small" variant="text" aria-label={t("i18n-cont-panels-12.trace.inspectLogSpan", { id: log.span_id })} tooltip={log.span_name} onClick={() => onFocus(log.span_id)}
              sx={{ minWidth: 0, justifyContent: "flex-start", textTransform: "none", px: 0, color: "text.secondary" }}
            ><TruncatedText component="span" variant="inherit">{log.span_name}</TruncatedText></EditorButton>
            <EditorButton size="small" variant="text" aria-label={t("i18n-cont-panels-12.trace.readLogEvent", { name: log.name, id: log.id })} tooltip={logText(log).slice(0, 200)} onClick={() => setSelectedLogId(log.id)}
              sx={{ minWidth: 0, justifyContent: "flex-start", textTransform: "none", px: 0, color: log.level === "error" ? "error.main" : "text.primary" }}
            ><TruncatedText component="span" variant="inherit">{logText(log).slice(0, 200)}</TruncatedText></EditorButton>
          </Box>} />
      </FlexColumn>}
      {logs.hasNextPage && <EditorButton size="small" loading={logs.isFetchingNextPage} onClick={() => void logs.fetchNextPage()}>{t("i18n-cont-panels-12.trace.loadMoreLogs")}</EditorButton>}
    </SplitView>
  </FlexColumn>;
}

// Leads with the error message and the span that raised it, so a failed run explains itself without opening spans.
function FailureBanner({ result, onShowSpan }: FailureBannerProps): React.ReactElement | null {
  const { t } = useTranslation();
  const { run, summary } = result;
  if (run.status !== "failed" && !summary.first_failed_span_id) { return null; }
  const failing = [...summary.failure_path].reverse().find((span) => span.error) ?? summary.failure_path.at(-1);
  const message = run.error ?? failing?.error ?? t("i18n-cont-panels-12.trace.noErrorMessage");
  const failedSpanId = summary.first_failed_span_id;
  const title = run.status === "failed"
    ? (failing ? t("i18n-cont-panels-12.trace.runFailedInSpan", { name: failing.name }) : t("i18n-cont-panels-12.trace.runFailed"))
    : (failing ? t("i18n-cont-panels-12.trace.spanFailedRunContinuedInSpan", { name: failing.name }) : t("i18n-cont-panels-12.trace.spanFailedRunContinued"));
  return <AlertBanner
    compact
    severity={run.status === "failed" ? "error" : "warning"}
    title={title}
    action={failedSpanId ? <EditorButton size="small" onClick={() => onShowSpan(failedSpanId)}>{t("i18n-cont-panels-12.trace.showFailingSpan")}</EditorButton> : undefined}
  ><Text component="span" sx={{ display: "block", maxHeight: (theme) => theme.spacing(SPACING.xxxl * 3), overflow: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{message}</Text></AlertBanner>;
}

function runDuration(run: GetRunResult["run"], locale = "en"): string | null {
  if (!run.ended_at) { return null; }
  const ms = Date.parse(run.ended_at) - Date.parse(run.started_at);
  return Number.isFinite(ms) && ms >= 0 ? formatDuration(ms, locale) : null;
}

function runSummaryText({ run, summary }: GetRunResult, t: ReturnType<typeof useTranslation>["t"], locale: string): string {
  const cost = Object.values(summary.cost_by_provider).reduce((total, value) => total + value, 0);
  const duration = runDuration(run, locale);
  return [
    duration,
    t("i18n-cont-panels-12.trace.spanCount", { count: summary.span_count }),
    t("i18n-cont-panels-12.trace.eventCount", { count: summary.event_count }),
    cost > 0 ? formatUsd(cost, locale) : null,
    t("i18n-cont-panels-12.trace.startedAt", { date: new Date(run.started_at).toLocaleString(locale) })
  ].filter(Boolean).join(" · ");
}

const RUN_STATUS_TONE: Record<GetRunResult["run"]["status"], StatusPillTone> = { completed: "done", failed: "failed", cancelled: "warning", running: "rendering" };

// Workflow runs carry a job id as their source, so the name comes from a workflow already in the cache. Nothing is fetched per run.
function runTitle(run: RunRecord, workflowName: string | undefined, t: ReturnType<typeof useTranslation>["t"]): string {
  if (run.app) { return run.app.operation_id; }
  if (run.kind === "workflow") { return workflowName ?? t("i18n-cont-panels-12.trace.workflowRun"); }
  return run.kind === "chat" ? t("i18n-cont-panels-12.trace.chatTurn") : t("i18n-cont-panels-12.trace.appRun");
}

const matchesQuery = (query: string, ...fields: string[]): boolean => fields.join(" ").toLowerCase().includes(query.trim().toLowerCase());

function RunPicker({ runs, value, onChange }: RunPickerProps): React.ReactElement {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const titleOf = (run: RunRecord): string => {
    const workflowId = run.parents.find((parent) => parent.kind === "workflow")?.id;
    return runTitle(run, workflowId ? queryClient.getQueryData<Workflow>(workflowQueryKey(workflowId))?.name : undefined, t);
  };
  return <Autocomplete<RunRecord, false, false>
    label={t("i18n-cont-panels-12.trace.run")} size="small" sx={PICKER_SX} options={runs} value={runs.find((run) => run.id === value) ?? null}
    noOptionsText={t("i18n-cont-panels-12.trace.noMatchingRuns")} placeholder={t("i18n-cont-panels-12.trace.noRecentRuns")}
    getOptionLabel={(run) => `${titleOf(run)} · ${t(`i18n-cont-panels-12.trace.runStatus.${run.status}`)} · ${formatRelativeTime(run.started_at, i18n.language)}`}
    isOptionEqualToValue={(option, selected) => option.id === selected.id}
    filterOptions={(options, { inputValue }) => options.filter((run) => matchesQuery(inputValue, titleOf(run), run.kind, run.status))}
    onChange={(_, run) => { if (run) { onChange(run.id); } }}
    // MUI keys options by label, and two runs of one workflow share a label.
    renderOption={({ key: _key, ...props }, run) => <Box component="li" key={run.id || _key} {...props}>
      <FlexColumn gap={SPACING.micro} sx={{ minWidth: 0 }}>
        <Text component="span" truncate title={titleOf(run)}>{titleOf(run)}</Text>
        <FlexRow gap={SPACING.sm} sx={{ alignItems: "center" }}>
          <StatusPill tone={RUN_STATUS_TONE[run.status]}>{t(`i18n-cont-panels-12.trace.runStatus.${run.status}`)}</StatusPill>
          <Caption color="muted" sx={{ fontVariantNumeric: "tabular-nums" }}>{[t(`i18n-cont-panels-12.trace.runKind.${run.kind}`), formatRelativeTime(run.started_at, i18n.language), runDuration(run, i18n.language)].filter(Boolean).join(" · ")}</Caption>
        </FlexRow>
      </FlexColumn>
    </Box>}
  />;
}

// Spans are listed in tree order and indented by depth, so repeated names such as several llm.stream calls stay apart by position, timing and status.
function SpanPicker({ label, emptyLabel, nodes, value, onChange }: SpanPickerProps): React.ReactElement {
  const { t, i18n } = useTranslation();
  const start = nodes.length ? Math.min(...nodes.map(({ record }) => record.start_time_ms)) : 0;
  return <Autocomplete<TraceNode, false, false>
    label={label} size="small" sx={PICKER_SX} options={nodes} value={nodes.find(({ record }) => record.span_id === value) ?? null}
    placeholder={value ? t("i18n-cont-panels-12.trace.spanId", { id: value }) : emptyLabel} noOptionsText={t("i18n-cont-panels-12.trace.noMatchingSpans")}
    getOptionLabel={({ record }) => record.name}
    isOptionEqualToValue={(option, selected) => option.record.span_id === selected.record.span_id}
    filterOptions={(options, { inputValue }) => options.filter(({ record }) => matchesQuery(inputValue, record.name, record.status.code))}
    onChange={(_, node) => onChange(node?.record.span_id ?? null)}
    slotProps={{ popper: { placement: "bottom-start", sx: { minWidth: (theme) => theme.spacing(SPACING.xxxl * 14) } } }}
    renderOption={({ key: _key, ...props }, { record, depth }) => <Box component="li" key={record.span_id || _key} {...props}>
      <FlexRow gap={SPACING.md} sx={{ alignItems: "center", width: "100%", minWidth: 0, pl: Math.min(depth, 8) * SPACING.md }}>
        <Text component="span" size="small" truncate title={record.name} color={record.status.code === "ERROR" ? "error" : "inherit"} sx={{ flex: 1, minWidth: 0 }}>{record.name}</Text>
        {record.status.code === "ERROR" && <StatusPill tone="failed">{t("i18n-cont-panels-12.trace.status.error")}</StatusPill>}
        <Caption color="muted" sx={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>+{formatDuration(Math.max(0, record.start_time_ms - start), i18n.language)} · {formatDuration(record.duration_ms, i18n.language)}</Caption>
      </FlexRow>
    </Box>}
  />;
}

export default function TracePanel({ view = "trace", workflowId = null }: TracePanelProps): React.ReactElement {
  const { t, i18n } = useTranslation();
  const selectedRunId = useTraceStore((state) => state.selectedRunId);
  const selectedRunWorkflowId = useTraceStore((state) => state.selectedRunWorkflowId);
  const focusedSpanId = useTraceStore((state) => state.focusedSpanId);
  const pendingNodeId = useTraceStore((state) => state.pendingNodeId);
  const selectRun = useTraceStore((state) => state.selectRun);
  const focusSpan = useTraceStore((state) => state.focusSpan);
  const recent = useRuns(workflowId ? { workflow_id: workflowId } : {});
  const runs = [...new Map(recent.data?.pages.flatMap((page) => page.runs).map((run) => [run.id, run]) ?? []).values()];
  // A run picked in another workflow tab does not follow the user here.
  const selected = selectedRunWorkflowId === null || selectedRunWorkflowId === workflowId ? selectedRunId : null;
  const runId = selected ?? runs[0]?.id ?? null;
  const summary = useRun(runId);
  const canonicalId = summary.data?.run.id ?? runId;
  useRunLiveUpdates(canonicalId);
  // "View logs" on a node names the node, not its span: focus the span once the trace has it.
  const nodeTrace = useRunTrace(pendingNodeId ? canonicalId : null, { depth: 64, limit: 500 });
  const nodeSpanId = pendingNodeId ? nodeTrace.data?.nodes.find(({ record }) => record.attributes["node.id"] === pendingNodeId)?.record.span_id : undefined;
  useEffect(() => {
    if (nodeSpanId) { focusSpan(nodeSpanId); }
  }, [nodeSpanId, focusSpan]);
  // A run picked from an older page or a link may be missing from the recent list.
  const pickerRuns = summary.data && !runs.some((run) => run.id === summary.data.run.id) ? [summary.data.run, ...runs] : runs;
  return <FlexColumn gap={SPACING.md} sx={{ flex: 1, minHeight: 0, px: SPACING.xl, py: SPACING.md }}>
    <FlexRow gap={SPACING.lg} sx={{ alignItems: "flex-end", flexWrap: "wrap" }}>
      <Box sx={{ flex: "1 1 auto", minWidth: (theme) => theme.spacing(SPACING.xxxl * 6), maxWidth: (theme) => theme.spacing(SPACING.xxxl * 12) }}>
        <RunPicker runs={pickerRuns} value={canonicalId} onChange={(id) => selectRun(id, workflowId)} />
      </Box>
      {recent.hasNextPage && <ControlSlot><EditorButton size="small" onClick={() => void recent.fetchNextPage()}>{t("i18n-cont-panels-12.trace.olderRuns")}</EditorButton></ControlSlot>}
      {summary.data && <ControlSlot>
        <FlexRow gap={SPACING.sm} sx={{ alignItems: "center" }}>
          <StatusPill tone={RUN_STATUS_TONE[summary.data.run.status]}>{t(`i18n-cont-panels-12.trace.runStatus.${summary.data.run.status}`)}</StatusPill>
          <Caption sx={{ fontVariantNumeric: "tabular-nums" }}>{runSummaryText(summary.data, t, i18n.language)}</Caption>
        </FlexRow>
      </ControlSlot>}
      {canonicalId && <ControlSlot><AskRunAgentButton runId={canonicalId} /></ControlSlot>}
    </FlexRow>
    {recent.error && <QueryError error={recent.error} />}
    {summary.error && <QueryError error={summary.error} />}
    {summary.data && <FailureBanner result={summary.data} onShowSpan={focusSpan} />}
    {!runId && !recent.isLoading && <EmptyState title={t("i18n-cont-panels-12.trace.noRecordedRuns")} description={t("i18n-cont-panels-12.trace.noRunsDescription")} size="small" />}
    {canonicalId && (view === "logs" ? <LogsView key={canonicalId} runId={canonicalId} focusedSpanId={focusedSpanId} onFocus={focusSpan} /> : <TraceView key={canonicalId} runId={canonicalId} focusedSpanId={focusedSpanId} onFocus={focusSpan} />)}
  </FlexColumn>;
}
