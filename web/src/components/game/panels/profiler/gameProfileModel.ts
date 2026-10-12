import {
  GAME_PROFILE_FRAME_METRICS, GAME_PROFILE_STEP_METRICS, type GameProfileCapture, type GameProfileData, type GameProfileFrameMetric,
  type GameProfileStepMetric
} from "./gameProfiler";

export interface GameProfileStat {
  readonly avg: number;
  /** Absent for counts, whose panel rows show only the newest and largest value. */
  readonly p95?: number;
  readonly max: number;
  readonly last: number;
  readonly count: number;
}

export interface GameProfileSystemStat {
  readonly system: string;
  readonly avgMs: number;
  readonly maxMs: number;
}

export interface GameProfileScriptStat {
  readonly entityId: string;
  /** Mean CPU time per tick, over the ticks that reported script stats. */
  readonly avgMs: number;
  readonly maxMs: number;
  readonly calls: number;
}

export type GameProfileMetric = Exclude<GameProfileStepMetric, "tick"> | GameProfileFrameMetric;

/** Metrics measured in milliseconds, which get a 95th percentile. */
const TIME_METRICS: ReadonlySet<GameProfileMetric> = new Set(["frameMs", "stepMs", "scriptMs"]);

export interface GameProfileSummary {
  readonly ticks: number;
  readonly frames: number;
  readonly firstTick: number | null;
  readonly lastTick: number | null;
  readonly metrics: Readonly<Record<GameProfileMetric, GameProfileStat | null>>;
  /** Systems in the order the pipeline ran them. */
  readonly systems: readonly GameProfileSystemStat[];
  /** Entities with the most script time first. */
  readonly scripts: readonly GameProfileScriptStat[];
}

/** Statistics over the values that are not NaN. Null when there are none. One pass, plus a typed sort for `p95`. */
export function gameProfileStat(values: Float32Array, percentile = true): GameProfileStat | null {
  let total = 0;
  let max = Number.NEGATIVE_INFINITY;
  let last = Number.NaN;
  let count = 0;
  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    if (Number.isNaN(value)) { continue; }
    total += value;
    if (value > max) { max = value; }
    last = value;
    count += 1;
  }
  if (count === 0) { return null; }
  const stat = { avg: total / count, max, last, count };
  if (!percentile) { return stat; }
  const sorted = new Float32Array(count);
  let next = 0;
  for (let index = 0; index < values.length; index++) {
    if (!Number.isNaN(values[index])) { sorted[next++] = values[index]; }
  }
  sorted.sort();
  return { ...stat, p95: sorted[Math.ceil(count * 0.95) - 1] };
}

function column(data: GameProfileData, metric: GameProfileMetric): Float32Array {
  return metric in data.steps ? data.steps[metric as GameProfileStepMetric] : data.frames[metric as GameProfileFrameMetric];
}

export const GAME_PROFILE_METRICS: readonly GameProfileMetric[] = [
  ...GAME_PROFILE_STEP_METRICS.filter((metric): metric is Exclude<GameProfileStepMetric, "tick"> => metric !== "tick"),
  ...GAME_PROFILE_FRAME_METRICS
];

/** Linear in the recorded ticks and frames. A full capture summarizes in a few milliseconds. */
export function summarizeGameProfile(data: GameProfileData): GameProfileSummary {
  const metrics = Object.fromEntries(GAME_PROFILE_METRICS.map((metric) => [metric, gameProfileStat(column(data, metric), TIME_METRICS.has(metric))])) as
    Record<GameProfileMetric, GameProfileStat | null>;
  const ticks = data.steps.tick;
  return {
    ticks: ticks.length,
    frames: data.frames.drawCalls.length,
    firstTick: ticks.length > 0 ? ticks[0] : null,
    lastTick: ticks.length > 0 ? ticks[ticks.length - 1] : null,
    metrics,
    systems: data.systems.flatMap(({ system, values }) => {
      const stat = gameProfileStat(values, false);
      return stat ? [{ system, avgMs: stat.avg, maxMs: stat.max }] : [];
    }),
    scripts: data.scripts.map((script) => ({ entityId: script.entityId, avgMs: data.scriptTicks > 0 ? script.totalMs / data.scriptTicks : 0,
      maxMs: script.maxMs, calls: script.calls }))
  };
}

export const GAME_PROFILE_FORMAT = "nodetool.game-profile";

export interface GameProfileSource {
  readonly gameId: string;
  readonly name: string;
  readonly dimension: "2d" | "3d";
  readonly tickRate: number;
}

/** A column as JSON numbers rounded to 0.1 µs or 0.0001 of a count, with null for a missing value. */
type GameProfileColumnJson = readonly (number | null)[];

export interface GameProfileExport {
  readonly format: typeof GAME_PROFILE_FORMAT;
  readonly version: 1;
  readonly game: GameProfileSource;
  /** "capture" for a recorded capture, "live" for the live window. */
  readonly source: "capture" | "live";
  readonly startedAt: string | null;
  readonly endedAt: string | null;
  /** True when a capture filled its buffers and stopped by itself. */
  readonly full: boolean;
  readonly summary: GameProfileSummary;
  /** One entry per simulation step. */
  readonly steps: Readonly<Record<GameProfileStepMetric, GameProfileColumnJson>>;
  /** CPU time per system, one entry per simulation step. */
  readonly systems: Readonly<Record<string, GameProfileColumnJson>>;
  /** One entry per rendered frame. */
  readonly frames: Readonly<Record<GameProfileFrameMetric, GameProfileColumnJson>>;
  /** Script time per entity, totalled over the profile rather than stored per tick. */
  readonly scripts: GameProfileData["scripts"];
}

function columnJson(values: Float32Array): GameProfileColumnJson {
  return Array.from(values, (value) => Number.isNaN(value) ? null : Math.round(value * 10_000) / 10_000);
}

function isoTime(time: number | null): string | null {
  return time === null ? null : new Date(time).toISOString();
}

export function gameProfileExport(game: GameProfileSource, profile: { readonly kind: "capture"; readonly capture: GameProfileCapture } |
  { readonly kind: "live"; readonly data: GameProfileData }): GameProfileExport {
  const data = profile.kind === "capture" ? profile.capture.data : profile.data;
  return {
    format: GAME_PROFILE_FORMAT, version: 1, game, source: profile.kind,
    startedAt: isoTime(profile.kind === "capture" ? profile.capture.startedAt : data.startedAt),
    endedAt: isoTime(profile.kind === "capture" ? profile.capture.endedAt : data.endedAt),
    full: profile.kind === "capture" && profile.capture.full,
    summary: summarizeGameProfile(data),
    steps: Object.fromEntries(GAME_PROFILE_STEP_METRICS.map((key) => [key, columnJson(data.steps[key])])) as Record<GameProfileStepMetric, GameProfileColumnJson>,
    systems: Object.fromEntries(data.systems.map(({ system, values }) => [system, columnJson(values)])),
    frames: Object.fromEntries(GAME_PROFILE_FRAME_METRICS.map((key) => [key, columnJson(data.frames[key])])) as Record<GameProfileFrameMetric, GameProfileColumnJson>,
    scripts: data.scripts
  };
}

/** A file name from the game's name and the profile's start, with characters that are unsafe in file names replaced. */
export function gameProfileFileName(profile: GameProfileExport): string {
  const name = profile.game.name.trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "game";
  const time = (profile.startedAt ?? profile.endedAt ?? new Date().toISOString()).replace(/[:.]/g, "-");
  return `${name}-${profile.source === "live" ? "live-profile" : "profile"}-${time}.json`;
}

/** Saves the profile as compact JSON. */
export function downloadGameProfile(profile: GameProfileExport): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(profile)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = gameProfileFileName(profile);
  link.click();
  // Releasing the blob synchronously cancels the download in Firefox and for large files.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const BYTE_UNITS = ["B", "KB", "MB", "GB"] as const;

export function formatGameProfileBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${BYTE_UNITS[unit]}`;
}

export function formatGameProfileMs(ms: number): string {
  return ms >= 10 ? `${ms.toFixed(1)} ms` : `${ms.toFixed(2)} ms`;
}
