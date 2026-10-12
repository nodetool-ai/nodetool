import type { GameProfileCapture, GameProfileSample } from "./gameProfiler";

export interface GameProfileStat {
  readonly avg: number;
  readonly p95: number;
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

export type GameProfileMetric = "frameMs" | "stepMs" | "scriptMs" | "drawCalls" | "triangles" | "textureBytes" | "geometryBytes" | "bodies" | "contacts" | "voices";

export const GAME_PROFILE_METRICS: readonly GameProfileMetric[] =
  ["frameMs", "stepMs", "scriptMs", "drawCalls", "triangles", "textureBytes", "geometryBytes", "bodies", "contacts", "voices"];

export interface GameProfileSummary {
  readonly samples: number;
  readonly firstTick: number | null;
  readonly lastTick: number | null;
  readonly metrics: Readonly<Record<GameProfileMetric, GameProfileStat | null>>;
  /** Systems in the order the pipeline ran them. */
  readonly systems: readonly GameProfileSystemStat[];
  /** Entities with the most script time first. */
  readonly scripts: readonly GameProfileScriptStat[];
}

/** Statistics over the samples that reported a value. Null when none did. */
export function gameProfileStat(values: readonly number[]): GameProfileStat | null {
  if (values.length === 0) { return null; }
  const sorted = [...values].sort((left, right) => left - right);
  const total = values.reduce((sum, value) => sum + value, 0);
  return { avg: total / values.length, p95: sorted[Math.ceil(sorted.length * 0.95) - 1], max: sorted[sorted.length - 1],
    last: values[values.length - 1], count: values.length };
}

export function gameProfileValues(samples: readonly GameProfileSample[], metric: GameProfileMetric): number[] {
  const values: number[] = [];
  for (const sample of samples) {
    const value = sample[metric];
    if (value !== undefined) { values.push(value); }
  }
  return values;
}

export function summarizeGameProfile(samples: readonly GameProfileSample[]): GameProfileSummary {
  const metrics = Object.fromEntries(GAME_PROFILE_METRICS.map((metric) => [metric, gameProfileStat(gameProfileValues(samples, metric))])) as
    Record<GameProfileMetric, GameProfileStat | null>;
  const systems = new Map<string, { total: number; max: number; count: number }>();
  const scripts = new Map<string, { total: number; max: number; calls: number }>();
  let scriptTicks = 0;
  for (const sample of samples) {
    for (const timing of sample.systems ?? []) {
      const entry = systems.get(timing.system) ?? { total: 0, max: 0, count: 0 };
      entry.total += timing.durationMs;
      entry.max = Math.max(entry.max, timing.durationMs);
      entry.count += 1;
      systems.set(timing.system, entry);
    }
    if (!sample.scriptsByEntity) { continue; }
    scriptTicks += 1;
    for (const [entityId, stats] of Object.entries(sample.scriptsByEntity)) {
      const entry = scripts.get(entityId) ?? { total: 0, max: 0, calls: 0 };
      entry.total += stats.durationMs;
      entry.max = Math.max(entry.max, stats.durationMs);
      entry.calls += stats.calls;
      scripts.set(entityId, entry);
    }
  }
  return {
    samples: samples.length,
    firstTick: samples[0]?.tick ?? null,
    lastTick: samples[samples.length - 1]?.tick ?? null,
    metrics,
    systems: [...systems].map(([system, entry]) => ({ system, avgMs: entry.total / entry.count, maxMs: entry.max })),
    scripts: [...scripts].map(([entityId, entry]) => ({ entityId, avgMs: entry.total / scriptTicks, maxMs: entry.max, calls: entry.calls }))
      .sort((left, right) => right.avgMs - left.avgMs || left.entityId.localeCompare(right.entityId))
  };
}

export const GAME_PROFILE_FORMAT = "nodetool.game-profile";

export interface GameProfileSource {
  readonly gameId: string;
  readonly name: string;
  readonly dimension: "2d" | "3d";
  readonly tickRate: number;
}

export interface GameProfileExport {
  readonly format: typeof GAME_PROFILE_FORMAT;
  readonly version: 1;
  readonly game: GameProfileSource;
  /** ISO times of the capture, or of the export for a live window. */
  readonly startedAt: string;
  readonly endedAt: string;
  readonly truncated: boolean;
  readonly summary: GameProfileSummary;
  readonly samples: readonly GameProfileSample[];
}

export function gameProfileExport(source: GameProfileSource, capture: GameProfileCapture): GameProfileExport {
  return { format: GAME_PROFILE_FORMAT, version: 1, game: source, startedAt: new Date(capture.startedAt).toISOString(),
    endedAt: new Date(capture.endedAt).toISOString(), truncated: capture.truncated, summary: summarizeGameProfile(capture.samples),
    samples: capture.samples };
}

/** A file name from the game's name and the capture's start, with characters that are unsafe in file names replaced. */
export function gameProfileFileName(profile: GameProfileExport): string {
  const name = profile.game.name.trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "game";
  return `${name}-profile-${profile.startedAt.replace(/[:.]/g, "-")}.json`;
}

/** Saves the profile as a JSON download. */
export function downloadGameProfile(profile: GameProfileExport): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" }));
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
