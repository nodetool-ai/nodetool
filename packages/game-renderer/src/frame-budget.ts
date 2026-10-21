import type { GameFrameBudgets } from "@nodetool-ai/protocol";
import type { GameAudioMixerState } from "./audio/mixer.js";

export type GameFrameBudgetMetric = "drawCalls" | "triangles" | "particles" | "voices";

export type GameFrameBudgetLimits = Readonly<Record<GameFrameBudgetMetric, number>>;

/**
 * Player defaults for budgets a document leaves out. The particle budget is half the simulator's scene cap
 * and the voice budget is three quarters of the player's voice cap, so a warning comes before either cap drops work.
 */
export const DEFAULT_GAME_FRAME_BUDGETS: GameFrameBudgetLimits = Object.freeze({ drawCalls: 1000, triangles: 1_000_000, particles: 4096, voices: 24 });

/** One frame's measured load. A host leaves out what it does not measure. */
export type GameFrameBudgetSample = Partial<Record<GameFrameBudgetMetric, number>>;

export interface GameFrameBudgetOverrun {
  readonly metric: GameFrameBudgetMetric;
  readonly value: number;
  readonly budget: number;
}

const METRICS: readonly GameFrameBudgetMetric[] = ["drawCalls", "triangles", "particles", "voices"];

const LABELS: Readonly<Record<GameFrameBudgetMetric, string>> = { drawCalls: "draw calls", triangles: "triangles", particles: "particles", voices: "audio voices" };

export function resolveGameFrameBudgets(budgets?: GameFrameBudgets): GameFrameBudgetLimits {
  return Object.fromEntries(METRICS.map((metric) => [metric, budgets?.[metric] ?? DEFAULT_GAME_FRAME_BUDGETS[metric]])) as GameFrameBudgetLimits;
}

export type GameTimeBudgetMetric = "tickMs" | "frameMs";

export type GameTimeBudgetLimits = Readonly<Record<GameTimeBudgetMetric, number>>;

/**
 * Time targets for the p95 of a measured run. A 60 Hz tick leaves 16.6 ms per frame, and the 4 ms tick
 * leaves the rest of that frame to rendering. A 120 Hz display needs a document `frameMs` of 8.3.
 */
export const DEFAULT_GAME_TIME_BUDGETS: GameTimeBudgetLimits = Object.freeze({ tickMs: 4, frameMs: 16.6 });

export function resolveGameTimeBudgets(budgets?: GameFrameBudgets): GameTimeBudgetLimits {
  return { tickMs: budgets?.tickMs ?? DEFAULT_GAME_TIME_BUDGETS.tickMs, frameMs: budgets?.frameMs ?? DEFAULT_GAME_TIME_BUDGETS.frameMs };
}

export interface GameTimeBudgetOverrun {
  readonly metric: GameTimeBudgetMetric;
  readonly value: number;
  readonly budget: number;
}

/** Overruns of the measured p95 values against the time budgets. A host leaves out what it does not measure. */
export function gameTimeBudgetOverruns(sample: Partial<Record<GameTimeBudgetMetric, number>>, limits: GameTimeBudgetLimits): GameTimeBudgetOverrun[] {
  return (["tickMs", "frameMs"] as const).flatMap((metric) => {
    const value = sample[metric];
    return value !== undefined && value > limits[metric] ? [{ metric, value, budget: limits[metric] }] : [];
  });
}

export function formatGameTimeBudgetOverrun(overrun: GameTimeBudgetOverrun): string {
  return `Time budget exceeded: ${overrun.metric === "tickMs" ? "tick" : "frame"} p95 ${overrun.value.toFixed(2)} ms (budget ${overrun.budget} ms)`;
}

export function gameFrameBudgetOverruns(sample: GameFrameBudgetSample, limits: GameFrameBudgetLimits): GameFrameBudgetOverrun[] {
  return METRICS.flatMap((metric) => {
    const value = sample[metric];
    return value !== undefined && value > limits[metric] ? [{ metric, value, budget: limits[metric] }] : [];
  });
}

export function formatGameFrameBudgetOverrun(overrun: GameFrameBudgetOverrun): string {
  return `Frame budget exceeded: ${overrun.value} ${LABELS[overrun.metric]} (budget ${overrun.budget})`;
}

/** Playing voices across every bus of the mixer. */
export function gameAudioVoiceCount(state: GameAudioMixerState): number {
  return Object.values(state.buses).reduce((total, bus) => total + bus.activeVoices, 0);
}

/**
 * Warns once when a metric goes over its budget, and again only after it has come back within budget.
 * The monitor reads measurements and never changes the session, so it cannot affect simulation or replay.
 */
export class GameFrameBudgetMonitor {
  readonly limits: GameFrameBudgetLimits;
  private readonly over = new Set<GameFrameBudgetMetric>();

  constructor(budgets?: GameFrameBudgets, private readonly warn: (message: string) => void = (message) => { console.warn(message); }) {
    this.limits = resolveGameFrameBudgets(budgets);
  }

  /** Records one frame. Returns the overruns that started with this frame, which are the ones it warned about. */
  observe(sample: GameFrameBudgetSample): readonly GameFrameBudgetOverrun[] {
    const overruns = gameFrameBudgetOverruns(sample, this.limits);
    const started = overruns.filter((overrun) => !this.over.has(overrun.metric));
    for (const metric of METRICS) {
      if (sample[metric] !== undefined && !overruns.some((overrun) => overrun.metric === metric)) { this.over.delete(metric); }
    }
    for (const overrun of started) {
      this.over.add(overrun.metric);
      this.warn(formatGameFrameBudgetOverrun(overrun));
    }
    return started;
  }
}
