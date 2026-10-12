import { useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { useTheme } from "@mui/material/styles";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import StopRoundedIcon from "@mui/icons-material/StopRounded";

import GamePanelHeader from "../../GamePanelHeader";
import {
  Box, BORDER_RADIUS, Caption, CONTROL, Divider, EditorButton, EmptyState, FlexColumn, FlexRow, FONT_SIZE_SANS, getSpacingPx, ScrollArea,
  SPACING, Text, TYPOGRAPHY
} from "../../../ui_primitives";
import type { GameProfiler } from "./gameProfiler";
import {
  downloadGameProfile, formatGameProfileBytes, formatGameProfileMs, gameProfileExport, gameProfileValues, summarizeGameProfile,
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

/** The graphs show at most this many of the newest samples. */
const GRAPH_SAMPLES = 600;
const SCRIPT_ROWS = 8;
const NO_VALUE = "—";

function count(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

/** A line graph of the newest values with an optional budget line. Values above the budget draw the budget line in the warning color. */
function Sparkline({ values, budget, label }: { readonly values: readonly number[]; readonly budget?: number; readonly label: string }): ReactElement {
  const theme = useTheme();
  const shown = values.slice(-GRAPH_SAMPLES);
  const top = Math.max(budget ?? 0, ...shown, Number.EPSILON) * 1.1;
  const width = Math.max(shown.length - 1, 1);
  const height = 100;
  const points = shown.map((value, index) => `${index},${(height - (value / top) * height).toFixed(2)}`).join(" ");
  const over = budget !== undefined && shown.some((value) => value > budget);
  const budgetY = budget === undefined ? null : height - (budget / top) * height;
  return <Box component="svg" role="img" aria-label={label} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none"
    sx={{ width: "100%", height: CONTROL.height.xl, flexShrink: 0, borderRadius: BORDER_RADIUS.sm,
      backgroundColor: theme.vars.palette.action.hover }}>
    {budgetY !== null && <line x1={0} x2={width} y1={budgetY} y2={budgetY} vectorEffect="non-scaling-stroke" strokeDasharray="4 4"
      stroke={over ? theme.vars.palette.warning.main : theme.vars.palette.text.disabled} strokeWidth={1} />}
    {shown.length > 1 && <polyline points={points} fill="none" vectorEffect="non-scaling-stroke" strokeWidth={1.5}
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
  return stat ? `${formatGameProfileMs(stat.avg)} avg · ${formatGameProfileMs(stat.p95)} p95 · ${formatGameProfileMs(stat.max)} max` : NO_VALUE;
}

function countStat(stat: GameProfileStat | null): string {
  return stat ? `${count(stat.last)} now · ${count(stat.max)} max` : NO_VALUE;
}

function bytesStat(stat: GameProfileStat | null): string {
  return stat ? `${formatGameProfileBytes(stat.last)} now · ${formatGameProfileBytes(stat.max)} max` : NO_VALUE;
}

/**
 * Frame time, simulation and script CPU time, renderer, physics and audio counts from the running play session.
 * It records while shown and redraws a few times per second. Record captures a profile to export as JSON.
 */
export default function GameProfilerPanel({ profiler, source, document }: GameProfilerPanelProps): ReactElement {
  const theme = useTheme();
  const root = useRef<HTMLDivElement>(null);
  const { view, refresh } = useGameProfilerView(profiler, root);
  const [showCapture, setShowCapture] = useState(false);
  const capture = view.capture;
  const viewingCapture = showCapture && capture !== null && !view.capturing;
  const samples = viewingCapture ? capture.samples : view.samples;
  const summary = useMemo(() => summarizeGameProfile(samples), [samples]);
  const frameValues = useMemo(() => gameProfileValues(samples.slice(-GRAPH_SAMPLES), "frameMs"), [samples]);
  const stepValues = useMemo(() => gameProfileValues(samples.slice(-GRAPH_SAMPLES), "stepMs"), [samples]);
  const entityNames = useMemo(() => new Map(document.scenes.flatMap((scene) => scene.entities.map((entity) => [entity.id, entity.name] as const))), [document]);
  const budgetMs = 1000 / source.tickRate;
  const slowestSystem = Math.max(...summary.systems.map((system) => system.avgMs), Number.EPSILON);
  const metrics = summary.metrics;
  const toggleCapture = (): void => {
    if (!profiler) { return; }
    if (profiler.capturing()) {
      profiler.stopCapture();
      setShowCapture(true);
    } else {
      profiler.startCapture();
      setShowCapture(false);
    }
    refresh();
  };
  const exportCapture = (): void => {
    if (capture) { downloadGameProfile(gameProfileExport(source, capture)); }
  };
  const captureSeconds = capture ? ((capture.endedAt - capture.startedAt) / 1000).toFixed(1) : "0";
  return <FlexColumn ref={root} sx={{ height: "100%", minHeight: 0 }}>
    <GamePanelHeader title="Profiler" fill>
      <Caption role="status" data-testid="profiler-status" color="secondary" sx={{ flex: 1, minWidth: 0, pl: SPACING.xs, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {view.capturing ? `Recording a capture · ${count(summary.samples)} ticks in view`
          : viewingCapture ? `Capture · ${captureSeconds} s · ${count(capture.samples.length)} ticks${capture.truncated ? " · oldest ticks dropped" : ""}`
            : `Live · last ${count(summary.samples)} ticks`}
      </Caption>
      <EditorButton disabled={!profiler} onClick={toggleCapture}
        startIcon={view.capturing
          ? <StopRoundedIcon aria-hidden sx={{ fontSize: FONT_SIZE_SANS.body }} />
          : <FiberManualRecordIcon aria-hidden sx={{ fontSize: FONT_SIZE_SANS.body, color: theme.vars.palette.error.main }} />}
        sx={{ height: CONTROL.height.sm, px: SPACING.sm, "& .MuiButton-startIcon": { mr: SPACING.xs } }}>
        {view.capturing ? "Stop" : "Record"}
      </EditorButton>
      {viewingCapture && <EditorButton onClick={() => setShowCapture(false)} sx={{ height: CONTROL.height.sm, color: "text.secondary" }}>Live</EditorButton>}
      <Divider orientation="vertical" flexItem sx={{ mx: SPACING.xs, my: SPACING.xs }} />
      <EditorButton disabled={!capture || view.capturing} onClick={exportCapture} sx={{ height: CONTROL.height.sm }}>Export JSON</EditorButton>
      <EditorButton disabled={!profiler} onClick={() => { profiler?.clear(); setShowCapture(false); refresh(); }}
        sx={{ height: CONTROL.height.sm, color: "text.secondary" }}>Clear</EditorButton>
    </GamePanelHeader>
    <ScrollArea sx={{ flex: 1, minHeight: 0 }}>
      {summary.samples === 0
        ? <EmptyState variant="no-data" size="small" title="No samples yet"
          description="Press Play. The profiler records each tick while this panel is open." />
        : <Box sx={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${getSpacingPx(SPACING.xxl * 10)}, 1fr))`,
          gap: getSpacingPx(SPACING.lg), p: SPACING.md, alignItems: "start" }}>
          <Section title="Frame time">
            <Sparkline values={frameValues} budget={budgetMs} label={`Frame time, ${msStat(metrics.frameMs)}, budget ${formatGameProfileMs(budgetMs)}`} />
            <Row label="Frame">{msStat(metrics.frameMs)}</Row>
            <Row label="Budget">{formatGameProfileMs(budgetMs)}</Row>
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
                <Row key={script.entityId} label={entityNames.get(script.entityId) || script.entityId}>
                  {`${formatGameProfileMs(script.avgMs)} avg · ${formatGameProfileMs(script.maxMs)} max · ${count(script.calls)} calls`}
                </Row>)}
            {summary.scripts.length > SCRIPT_ROWS && <Caption color="muted">{`${summary.scripts.length - SCRIPT_ROWS} more entities in the export`}</Caption>}
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
