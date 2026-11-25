import { readFile } from "node:fs/promises";
import type { GameDocument, GameInputFrame } from "@nodetool-ai/protocol/game.js";
import { parseGameBotSpec, runGameBot, type GameBotRunResult, type GameBotSpec, type GameSession, type GameStepResult } from "@nodetool-ai/game-runtime";

/** Seeds one sweep may run. */
export const MAX_SWEEP_SEEDS = 1000;

export interface SweepOptions {
  ticks: string;
  seed: string;
  seeds?: string;
  bot?: string;
  botFile?: string;
  endEvent?: string[];
  maxSessionTicks?: string;
  expectWin?: boolean;
  expectNoWin?: boolean;
  expectMinScore?: string;
  expectMaxScore?: string;
  expectScore?: string;
  assertions?: string;
  verifyReplay?: boolean;
  inputs?: string;
  json?: boolean;
}

/** Per-run save storage, created fresh for each seed so runs do not share saves. */
export interface SweepSaves {
  prepare(input: GameInputFrame): GameInputFrame;
  after(result: GameStepResult, session: GameSession): Promise<void>;
}

export interface SweepDependencies {
  readonly inputs: readonly GameInputFrame[];
  readonly createSaves: () => Promise<SweepSaves>;
}

/** True when `simulate` runs a bot or a seed sweep instead of one recorded run. */
export function isSweep(options: Pick<SweepOptions, "bot" | "seeds">): boolean {
  return options.bot !== undefined || options.seeds !== undefined;
}

function count(value: string, name: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  }
  return parsed;
}

function optionalCount(value: string | undefined, name: string): number | undefined {
  return value === undefined ? undefined : count(value, name, 0);
}

async function botSpec(options: SweepOptions, inputs: readonly GameInputFrame[]): Promise<{ spec: GameBotSpec; label: string }> {
  if (options.bot === undefined) {
    if (options.botFile !== undefined) { throw new Error("--bot-file needs --bot with a skill from 0 to 1"); }
    return { spec: { kind: "inputs", frames: inputs }, label: options.inputs === undefined ? "idle" : "inputs" };
  }
  if (options.inputs !== undefined) { throw new Error("--bot and --inputs both choose the player. Pass one"); }
  const source = options.botFile === undefined ? undefined : await readFile(options.botFile, "utf8");
  return { spec: parseGameBotSpec(options.bot, source), label: options.bot.trim() };
}

/** Rejects single-run checks that a sweep cannot apply, instead of ignoring them. */
function rejectSingleRunOptions(options: SweepOptions): void {
  const unsupported = [
    options.assertions !== undefined && "--assertions",
    options.verifyReplay === true && "--verify-replay",
    options.expectScore !== undefined && "--expect-score (use --expect-min-score and --expect-max-score)"
  ].filter((value): value is string => typeof value === "string");
  if (unsupported.length > 0) { throw new Error(`${unsupported.join(", ")} cannot be combined with --bot or --seeds`); }
  if (options.expectWin && options.expectNoWin) { throw new Error("--expect-win and --expect-no-win contradict each other"); }
}

interface SweepCheck {
  readonly name: string;
  readonly ok: boolean;
  readonly failedSeeds: readonly number[];
  readonly message: string;
}

function check(name: string, runs: readonly GameBotRunResult[], failed: (run: GameBotRunResult) => boolean, message: string): SweepCheck {
  const failedSeeds = runs.filter(failed).map((run) => run.seed);
  return { name, ok: failedSeeds.length === 0, failedSeeds, message };
}

/**
 * Plays the game once per seed with a bot or a recording and checks every run. A run that throws, a score outside
 * the expected range, or a session longer than `--max-session-ticks` fails the sweep.
 */
export async function runSimulateSweep(document: GameDocument, options: SweepOptions, dependencies: SweepDependencies): Promise<void> {
  rejectSingleRunOptions(options);
  const ticks = count(options.ticks, "ticks", 1);
  const firstSeed = count(options.seed, "seed", 0);
  const seedCount = options.seeds === undefined ? 1 : count(options.seeds, "seeds", 1, MAX_SWEEP_SEEDS);
  const maxSessionTicks = optionalCount(options.maxSessionTicks, "max-session-ticks");
  const minScore = optionalCount(options.expectMinScore, "expect-min-score");
  const maxScore = optionalCount(options.expectMaxScore, "expect-max-score");
  const { spec, label } = await botSpec(options, dependencies.inputs);
  const endEvents = options.endEvent ?? [];

  const runs: GameBotRunResult[] = [];
  for (let offset = 0; offset < seedCount; offset += 1) {
    const saves = await dependencies.createSaves();
    runs.push(await runGameBot(document, { bot: spec, seed: firstSeed + offset, ticks, endEvents, sessionOptions: { test: true },
      prepareInput: (input) => saves.prepare(input), afterStep: (result, session) => saves.after(result, session) }));
  }

  const checks: SweepCheck[] = [check("errors", runs, (run) => run.error !== undefined, "Every run finishes without a script or bot error")];
  if (options.expectWin) { checks.push(check("win", runs, (run) => !run.won, "Every run wins")); }
  if (options.expectNoWin) { checks.push(check("noWin", runs, (run) => run.won, "No run wins")); }
  if (minScore !== undefined) { checks.push(check("minScore", runs, (run) => run.score < minScore, `Every run scores at least ${minScore}`)); }
  if (maxScore !== undefined) { checks.push(check("maxScore", runs, (run) => run.score > maxScore, `Every run scores at most ${maxScore}`)); }
  if (maxSessionTicks !== undefined) {
    checks.push(check("sessionLength", runs, (run) => run.endTick === null || run.endTick > maxSessionTicks,
      `Every session ends within ${maxSessionTicks} ticks`));
  }

  const ended = runs.filter((run) => run.endTick !== null);
  const scores = runs.map((run) => run.score);
  const lengths = ended.map((run) => run.endTick as number);
  const summary = {
    runs: runs.length,
    wins: runs.filter((run) => run.won).length,
    ended: ended.length,
    errors: runs.filter((run) => run.error !== undefined).length,
    minScore: Math.min(...scores),
    maxScore: Math.max(...scores),
    /** Session length in ticks over the runs that ended. Null when none ended. */
    sessionTicks: lengths.length === 0 ? null : { min: Math.min(...lengths), max: Math.max(...lengths),
      mean: lengths.reduce((sum, value) => sum + value, 0) / lengths.length }
  };
  const ok = checks.every((entry) => entry.ok);
  const report = { mode: "sweep", bot: label, ticks, endEvents, seeds: runs.map((run) => run.seed), runs, summary, checks, ok };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } else {
    for (const run of runs) {
      const end = run.endTick === null ? `did not end in ${run.ticks} ticks` : `ended at tick ${run.endTick} (${run.endEvent ?? run.endReason})`;
      const error = run.error ? `, failed at tick ${run.error.tick}: ${run.error.message}` : "";
      process.stdout.write(`Seed ${run.seed}: score ${run.score}, won ${run.won}, ${end}${error}\n`);
    }
    const length = summary.sessionTicks ? `, session ${summary.sessionTicks.min}-${summary.sessionTicks.max} ticks` : "";
    process.stdout.write(`Bot ${label}: ${summary.wins}/${summary.runs} won, ${summary.ended}/${summary.runs} ended, score ${summary.minScore}-${summary.maxScore}${length}\n`);
    for (const entry of checks) {
      if (!entry.ok) { process.stdout.write(`Failed: ${entry.message}. Seeds ${entry.failedSeeds.join(", ")}\n`); }
    }
  }
  if (!ok) { process.exitCode = 1; }
}
