import { useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { useTheme } from "@mui/material/styles";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import StopRoundedIcon from "@mui/icons-material/StopRounded";

import DockPanelHeader from "../../../dock/DockPanelHeader";
import {
  Box, BORDER_RADIUS, Caption, CONTROL, Divider, EditorButton, EmptyState, FlexColumn, FlexRow, FONT_SIZE_SANS, getSpacingPx, ScrollArea,
  SPACING, Text, TYPOGRAPHY
} from "../../../ui_primitives";
import { GAME_PROFILER_OTHER_ENTITIES, type GameProfileCapture, type GameProfiler } from "./gameProfiler";
import {
  downloadGameProfile, formatGameProfileBytes, formatGameProfileMs, gameProfileExport, summarizeGameProfile,
  type GameProfileSource, type GameProfileStat
} from "./gameProfileModel";
import { useGameProfilerView } from "./useGameProfilerView";

interface ProfilerDocument {
  readonly scenes: readonly { readonly entities: readonly { readonly id: string; readonly name?: string }[] }[];
}

interface GameProfilerPanelProps {
  /** The play session's profiler. Absent while the session is loading. */
  readonly profiler?: GameProfiler;
  readonly source: GameProfileSource;
  readonly document: ProfilerDocument;
}

/** The graphs show at most this many of the newest values. */
const GRAPH_POINTS = 600;
const SCRIPT_ROWS = 8;
const NO_VALUE = "—";

function count(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

/** The newest recorded values of a column, skipping missing ones. */
function graphValues(values: Float32Array | undefined): number[] {
  const result: number[] = [];
  if (!values) { return result; }
  for (let index = values.length - 1; index >= 0 && result.length < GRAPH_POINTS; index--) {
    if (!Number.isNaN(values[index])) { result.push(values[index]); }
  }
  return result.reverse();
}

/** A line graph of the newest values with an optional budget line. Values above the budget draw the budget line in the warning color. */
function Sparkline({ values, budget, label }: { readonly values: readonly number[]; readonly budget?: number; readonly label: string }): ReactElement {
  const theme = useTheme();
  let top = Math.max(budget ?? 0, Number.EPSILON);
  for (const value of values) { top = Math.max(top, value); }
  top *= 1.1;
  const width = Math.max(values.length - 1, 1);
  const height = 100;
  const points = values.map((value, index) => `${index},${(height - (value / top) * height).toFixed(2)}`).join(" ");
  const over = budget !== undefined && values.some((value) => value > budget);
  const budgetY = budget === undefined ? null : height - (budget / top) * height;
  return <Box component="svg" role="img" aria-label={label} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none"
    sx={{ width: "100%", height: CONTROL.height.xl, flexShrink: 0, borderRadius: BORDER_RADIUS.sm,
      backgroundColor: theme.vars.palette.action.hover }}>
    {budgetY !== null && <line x1={0} x2={width} y1={budgetY} y2={budgetY} vectorEffect="non-scaling-stroke" strokeDasharray="4 4"
      stroke={over ? theme.vars.palette.warning.main : theme.vars.palette.text.disabled} strokeWidth={1} />}
    {values.length > 1 && <polyline points={points} fill="none" vectorEffect="non-scaling-stroke" strokeWidth={1.5}
      stroke={theme.vars.palette.primary.main} />}
  </Box>;
}

function Row({ label, children }: { readonly label: ReactNode; readonly children: ReactNode }): ReactElement {
  return <FlexRow align="center" justify="space-between" gap={SPACING.md} sx={{ minWidth: 0, py: SPACING.micro }}>
    <Caption component="span" color="secondary" sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</Caption>
    <Caption component="span" sx={{ flexShrink: 0, fontVariantNumeric: "tabular-nums", color: "text.primary" }}>{children}</Caption>
  </FlexRow>;
}

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }): ReactElement {
  return <FlexColumn component="section" aria-label={title} gap={SPACING.xs} sx={{ minWidth: 0 }}>
    <Text component="h3" size="small" sx={{ ...TYPOGRAPHY.sans.label, m: 0, color: "text.primary" }}>{title}</Text>
    {children}
  </FlexColumn>;
}

function msStat(stat: GameProfileStat | null): string {
  return stat ? `${formatGameProfileMs(stat.avg)} avg · ${formatGameProfileMs(stat.p95 ?? stat.max)} p95 · ${formatGameProfileMs(stat.max)} max` : NO_VALUE;
}

function countStat(stat: GameProfileStat | null): string {
  return stat ? `${count(stat.last)} now · ${count(stat.max)} max` : NO_VALUE;
}

function bytesStat(stat: GameProfileStat | null): string {
  return stat ? `${formatGameProfileBytes(stat.last)} now · ${formatGameProfileBytes(stat.max)} max` : NO_VALUE;
}

/**
 * Frame time, simulation and script CPU time, renderer, physics and audio counts from the running play session.
 * It records while shown and redraws a few times per second. Record captures a profile. Export JSON saves the
 * capture on screen, or the live window when no capture is shown.
 */
export default function GameProfilerPanel({ profiler, source, document }: GameProfilerPanelProps): ReactElement {
  const theme = useTheme();
  const root = useRef<HTMLDivElement>(null);
  const { view, refresh } = useGameProfilerView(profiler, root);
  // The capture the user switched away from with Live. A newer capture is shown again.
  const [liveOver, setLiveOver] = useState<GameProfileCapture | null>(null);
  const capture = view.capture;
  const viewingCapture = capture !== null && !view.capturing && liveOver !== capture;
  const data = viewingCapture ? capture.data : view.live;
  // A capture's summary is computed once. The live window holds at most 600 ticks and frames.
  const summary = useMemo(() => data ? summarizeGameProfile(data) : null, [data]);
  const frameValues = useMemo(() => graphValues(data?.frames.frameMs), [data]);
  const stepValues = useMemo(() => graphValues(data?.steps.stepMs), [data]);
  const entityNames = useMemo(() => new Map(document.scenes.flatMap((scene) => scene.entities.map((entity) => [entity.id, entity.name] as const))), [document]);
  const tickBudgetMs = 1000 / source.tickRate;
  const metrics = summary?.metrics;
  const slowestSystem = Math.max(...(summary?.systems ?? []).map((system) => system.avgMs), Number.EPSILON);
  const empty = !summary || summary.ticks + summary.frames === 0;
  const toggleCapture = (): void => {
    if (!profiler) { return; }
    if (profiler.capturing()) { profiler.stopCapture(); }
    else { profiler.startCapture(); }
    refresh();
  };
  const exportProfile = (): void => {
    if (viewingCapture) { downloadGameProfile(gameProfileExport(source, { kind: "capture", capture })); }
    else if (view.live) { downloadGameProfile(gameProfileExport(source, { kind: "live", data: view.live })); }
  };
  const captureSeconds = capture ? ((capture.endedAt - capture.startedAt) / 1000).toFixed(1) : "0";
  const status = view.capturing ? "Recording a capture · showing the live window"
    : viewingCapture ? `Capture · ${captureSeconds} s · ${count(summary?.ticks ?? 0)} ticks${capture.full ? " · stopped when full" : ""}`
      : `Live · last ${count(summary?.ticks ?? 0)} ticks`;
  return <FlexColumn ref={root} sx={{ height: "100%", minHeight: 0 }}>
    <DockPanelHeader title="Profiler" fill>
      <Caption role="status" data-testid="profiler-status" color="secondary" sx={{ flex: 1, minWidth: 0, pl: SPACING.xs, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {status}
      </Caption>
      <EditorButton disabled={!profiler} onClick={toggleCapture}
        startIcon={view.capturing
          ? <StopRoundedIcon aria-hidden sx={{ fontSize: FONT_SIZE_SANS.body }} />
          : <FiberManualRecordIcon aria-hidden sx={{ fontSize: FONT_SIZE_SANS.body, color: theme.vars.palette.error.main }} />}
        sx={{ height: CONTROL.height.sm, px: SPACING.sm, "& .MuiButton-startIcon": { mr: SPACING.xs } }}>
        {view.capturing ? "Stop" : "Record"}
      </EditorButton>
      {viewingCapture && <EditorButton onClick={() => setLiveOver(capture)} sx={{ height: CONTROL.height.sm, color: "text.secondary" }}>Live</EditorButton>}
      <Divider orientation="vertical" flexItem sx={{ mx: SPACING.xs, my: SPACING.xs }} />
      <EditorButton disabled={view.capturing || empty} onClick={exportProfile} sx={{ height: CONTROL.height.sm }}>Export JSON</EditorButton>
      <EditorButton disabled={!profiler} onClick={() => { profiler?.clear(); refresh(); }}
        sx={{ height: CONTROL.height.sm, color: "text.secondary" }}>Clear</EditorButton>
    </DockPanelHeader>
    <ScrollArea sx={{ flex: 1, minHeight: 0 }}>
      {empty || !summary || !metrics
        ? <EmptyState variant="no-data" size="small" title="No samples yet"
          description="Press Play. The profiler records each tick while this panel is open." />
        : <Box sx={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${getSpacingPx(SPACING.xxl * 10)}, 1fr))`,
          gap: getSpacingPx(SPACING.lg), p: SPACING.md, alignItems: "start" }}>
          <Section title="Frame time">
            <Sparkline values={frameValues} budget={tickBudgetMs}
              label={`Frame time per rendered frame, ${msStat(metrics.frameMs)}, tick budget ${formatGameProfileMs(tickBudgetMs)}`} />
            <Row label="Frame">{msStat(metrics.frameMs)}</Row>
            <Row label="Tick budget">{formatGameProfileMs(tickBudgetMs)}</Row>
          </Section>
          <Section title="Simulation CPU">
            <Sparkline values={stepValues} label={`Simulation step time, ${msStat(metrics.stepMs)}`} />
            <Row label="Step">{msStat(metrics.stepMs)}</Row>
            {summary.systems.map((system) => <FlexColumn key={system.system} gap={SPACING.micro}>
              <Row label={system.system}>{`${formatGameProfileMs(system.avgMs)} avg · ${formatGameProfileMs(system.maxMs)} max`}</Row>
              <Box aria-hidden sx={{ height: getSpacingPx(SPACING.micro), borderRadius: BORDER_RADIUS.pill, backgroundColor: theme.vars.palette.primary.main,
                width: `${Math.max(1, (system.avgMs / slowestSystem) * 100)}%` }} />
            </FlexColumn>)}
          </Section>
          <Section title="Scripts">
            <Row label="All scripts">{msStat(metrics.scriptMs)}</Row>
            {summary.scripts.length === 0
              ? <Caption color="muted">No script ran.</Caption>
              : summary.scripts.slice(0, SCRIPT_ROWS).map((script) =>
                <Row key={script.entityId} label={script.entityId === GAME_PROFILER_OTHER_ENTITIES ? "Other entities" : entityNames.get(script.entityId) || script.entityId}>
                  {`${formatGameProfileMs(script.avgMs)} avg · ${formatGameProfileMs(script.maxMs)} max · ${count(script.calls)} calls`}
                </Row>)}
            {summary.scripts.length > SCRIPT_ROWS && <Caption color="muted">{`${summary.scripts.length - SCRIPT_ROWS} more entities in the export`}</Caption>}
            {!viewingCapture && summary.scripts.length > 0 && <Caption color="muted">Totals since Play or Clear.</Caption>}
          </Section>
          <Section title="Rendering">
            <Row label="Draw calls">{countStat(metrics.drawCalls)}</Row>
            <Row label="Triangles">{source.dimension === "2d" ? "Not reported in 2D" : countStat(metrics.triangles)}</Row>
            <Row label="Texture memory">{bytesStat(metrics.textureBytes)}</Row>
            <Row label="Geometry memory">{source.dimension === "2d" ? "Not reported in 2D" : bytesStat(metrics.geometryBytes)}</Row>
          </Section>
          <Section title="Physics and audio">
            <Row label="Bodies">{countStat(metrics.bodies)}</Row>
            <Row label="Contacts">{countStat(metrics.contacts)}</Row>
            <Row label="Audio voices">{countStat(metrics.voices)}</Row>
          </Section>
        </Box>}
    </ScrollArea>
  </FlexColumn>;
}
