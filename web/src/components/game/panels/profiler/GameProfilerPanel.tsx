import { useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { useTheme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
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

/**
 * Frame time, simulation and script CPU time, renderer, physics and audio counts from the running play session.
 * It records while shown and redraws a few times per second. Record captures a profile. Export JSON saves the
 * capture on screen, or the live window when no capture is shown.
 */
export default function GameProfilerPanel({ profiler, source, document }: GameProfilerPanelProps): ReactElement {
  const { t, i18n } = useTranslation();
  const count = (value: number): string => Math.round(value).toLocaleString(i18n.language);
  const msStat = (stat: GameProfileStat | null): string => stat ? t("i18n-next2.profiler.msStat", {
    avg: formatGameProfileMs(stat.avg), p95: formatGameProfileMs(stat.p95 ?? stat.max), max: formatGameProfileMs(stat.max)
  }) : NO_VALUE;
  const countStat = (stat: GameProfileStat | null): string => stat ? t("i18n-next2.profiler.countStat", { now: count(stat.last), max: count(stat.max) }) : NO_VALUE;
  const bytesStat = (stat: GameProfileStat | null): string => stat ? t("i18n-next2.profiler.bytesStat", {
    now: formatGameProfileBytes(stat.last), max: formatGameProfileBytes(stat.max)
  }) : NO_VALUE;
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
  const status = view.capturing ? t("i18n-next2.profiler.recordingStatus")
    : viewingCapture ? t("i18n-next2.profiler.captureStatus", { seconds: captureSeconds, count: count(summary?.ticks ?? 0), full: capture.full ? t("i18n-next2.profiler.stoppedWhenFull") : "" })
      : t("i18n-next2.profiler.liveStatus", { count: count(summary?.ticks ?? 0) });
  return <FlexColumn ref={root} sx={{ height: "100%", minHeight: 0 }}>
    <DockPanelHeader title={t("i18n-next2.profiler.title")} fill>
      <Caption role="status" data-testid="profiler-status" color="secondary" sx={{ flex: 1, minWidth: 0, pl: SPACING.xs, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {status}
      </Caption>
      <EditorButton disabled={!profiler} onClick={toggleCapture}
        startIcon={view.capturing
          ? <StopRoundedIcon aria-hidden sx={{ fontSize: FONT_SIZE_SANS.body }} />
          : <FiberManualRecordIcon aria-hidden sx={{ fontSize: FONT_SIZE_SANS.body, color: theme.vars.palette.error.main }} />}
        sx={{ height: CONTROL.height.sm, px: SPACING.sm, "& .MuiButton-startIcon": { mr: SPACING.xs } }}>
        {view.capturing ? t("i18n-next2.profiler.stop") : t("i18n-next2.profiler.record")}
      </EditorButton>
      {viewingCapture && <EditorButton onClick={() => setLiveOver(capture)} sx={{ height: CONTROL.height.sm, color: "text.secondary" }}>{t("i18n-next2.profiler.live")}</EditorButton>}
      <Divider orientation="vertical" flexItem sx={{ mx: SPACING.xs, my: SPACING.xs }} />
      <EditorButton disabled={view.capturing || empty} onClick={exportProfile} sx={{ height: CONTROL.height.sm }}>{t("i18n-next2.profiler.exportJson")}</EditorButton>
      <EditorButton disabled={!profiler} onClick={() => { profiler?.clear(); refresh(); }}
        sx={{ height: CONTROL.height.sm, color: "text.secondary" }}>{t("i18n-next2.profiler.clear")}</EditorButton>
    </DockPanelHeader>
    <ScrollArea sx={{ flex: 1, minHeight: 0 }}>
      {empty || !summary || !metrics
        ? <EmptyState variant="no-data" size="small" title={t("i18n-next2.profiler.noSamples")}
          description={t("i18n-next2.profiler.noSamplesDescription")} />
        : <Box sx={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${getSpacingPx(SPACING.xxl * 10)}, 1fr))`,
          gap: getSpacingPx(SPACING.lg), p: SPACING.md, alignItems: "start" }}>
          <Section title={t("i18n-next2.profiler.frameTime")}>
            <Sparkline values={frameValues} budget={tickBudgetMs}
              label={t("i18n-next2.profiler.frameSparkline", { stats: msStat(metrics.frameMs), budget: formatGameProfileMs(tickBudgetMs) })} />
            <Row label={t("i18n-next2.profiler.frame")}>{msStat(metrics.frameMs)}</Row>
            <Row label={t("i18n-next2.profiler.tickBudget")}>{formatGameProfileMs(tickBudgetMs)}</Row>
          </Section>
          <Section title={t("i18n-next2.profiler.simulationCpu")}>
            <Sparkline values={stepValues} label={t("i18n-next2.profiler.simulationSparkline", { stats: msStat(metrics.stepMs) })} />
            <Row label={t("i18n-next2.profiler.step")}>{msStat(metrics.stepMs)}</Row>
            {summary.systems.map((system) => <FlexColumn key={system.system} gap={SPACING.micro}>
              <Row label={system.system}>{t("i18n-next2.profiler.averageMaximum", { avg: formatGameProfileMs(system.avgMs), max: formatGameProfileMs(system.maxMs) })}</Row>
              <Box aria-hidden sx={{ height: getSpacingPx(SPACING.micro), borderRadius: BORDER_RADIUS.pill, backgroundColor: theme.vars.palette.primary.main,
                width: `${Math.max(1, (system.avgMs / slowestSystem) * 100)}%` }} />
            </FlexColumn>)}
          </Section>
          <Section title={t("i18n-next2.profiler.scripts")}>
            <Row label={t("i18n-next2.profiler.allScripts")}>{msStat(metrics.scriptMs)}</Row>
            {summary.scripts.length === 0
              ? <Caption color="muted">{t("i18n-next2.profiler.noScriptRan")}</Caption>
              : summary.scripts.slice(0, SCRIPT_ROWS).map((script) =>
                <Row key={script.entityId} label={script.entityId === GAME_PROFILER_OTHER_ENTITIES ? t("i18n-next2.profiler.otherEntities") : entityNames.get(script.entityId) || script.entityId}>
                  {t("i18n-next2.profiler.scriptStats", { avg: formatGameProfileMs(script.avgMs), max: formatGameProfileMs(script.maxMs), count: count(script.calls) })}
                </Row>)}
            {summary.scripts.length > SCRIPT_ROWS && <Caption color="muted">{t("i18n-next2.profiler.moreEntities", { count: summary.scripts.length - SCRIPT_ROWS })}</Caption>}
            {!viewingCapture && summary.scripts.length > 0 && <Caption color="muted">{t("i18n-next2.profiler.totalsSincePlayOrClear")}</Caption>}
          </Section>
          <Section title={t("i18n-next2.profiler.rendering")}>
            <Row label={t("i18n-next2.profiler.drawCalls")}>{countStat(metrics.drawCalls)}</Row>
            <Row label={t("i18n-next2.profiler.triangles")}>{source.dimension === "2d" ? t("i18n-next2.profiler.notReported2d") : countStat(metrics.triangles)}</Row>
            <Row label={t("i18n-next2.profiler.textureMemory")}>{bytesStat(metrics.textureBytes)}</Row>
            <Row label={t("i18n-next2.profiler.geometryMemory")}>{source.dimension === "2d" ? t("i18n-next2.profiler.notReported2d") : bytesStat(metrics.geometryBytes)}</Row>
          </Section>
          <Section title={t("i18n-next2.profiler.physicsAudio")}>
            <Row label={t("i18n-next2.profiler.bodies")}>{countStat(metrics.bodies)}</Row>
            <Row label={t("i18n-next2.profiler.contacts")}>{countStat(metrics.contacts)}</Row>
            <Row label={t("i18n-next2.profiler.audioVoices")}>{countStat(metrics.voices)}</Row>
          </Section>
        </Box>}
    </ScrollArea>
  </FlexColumn>;
}
