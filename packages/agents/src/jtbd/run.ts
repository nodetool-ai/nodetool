/**
 * Running a job and recording everything the run produced.
 *
 * The loop itself is {@link runToolLoop}, unchanged — a job is not a new way to
 * drive a model, it is a new thing to ask of one and a fuller record of what
 * came back. What this file adds is the record: the transcript, the outcome
 * checks in the user's own terms, and the derived friction.
 *
 * Jobs are heterogeneous — a timeline job grades a cut, a sketch job grades
 * pixels — so {@link defineJob} closes over each job's state type and hands the
 * runner a `start()` that builds a world and knows how to grade it. The runner
 * never sees a surface's state, so nothing here is cast.
 */

import type { BaseProvider } from "@nodetool-ai/runtime";
import { runToolLoop } from "../app-build/tool-loop.js";
import type { HeadlessTool } from "../evals/tool-loop-bridge.js";
import { deriveFriction } from "./friction.js";
import type {
  FrictionOwner,
  JobRunReport,
  JobSuiteReport,
  JobToBeDone
} from "./types.js";

/** How a graded outcome check came out. */
export interface OutcomeResult {
  name: string;
  describe: string;
  passed: boolean;
}

/**
 * A job with its surface state type sealed inside. The runner drives this; the
 * registry is a list of these.
 */
export interface ErasedJob {
  id: string;
  statement: string;
  surfaces: string[];
  difficulty: JobToBeDone["difficulty"];
  objective: string;
  systemPrompt?: string;
  maxIterations?: number;
  needsModelProviders?: boolean;
  expectedToolCalls?: number;
  /** Names of the outcome checks, for `--list` without building a world. */
  outcomeNames: string[];
  /**
   * Build a fresh world for one run and return both its tools and the grader
   * that reads the state those tools left behind.
   */
  start: () => { tools: HeadlessTool[]; grade: () => OutcomeResult[] };
}

/** Seal a job's state type. The only way a job enters the registry. */
export function defineJob<TFinal>(job: JobToBeDone<TFinal>): ErasedJob {
  const erased: ErasedJob = {
    id: job.id,
    statement: job.statement,
    surfaces: job.surfaces,
    difficulty: job.difficulty,
    objective: job.objective,
    outcomeNames: job.outcomes.map((o) => o.name),
    start: () => {
      const bridge = job.createBridge();
      return {
        tools: bridge.tools,
        grade: () => {
          const state = bridge.finalState();
          return job.outcomes.map((outcome) => ({
            name: outcome.name,
            describe: outcome.describe,
            // A check that throws on a half-built world is a failed check, not
            // a failed run: the transcript is what the loop exists to produce
            // and losing it to a predicate would be the worst possible trade.
            passed: safeTest(() => outcome.test(state))
          }));
        }
      };
    }
  };
  if (job.systemPrompt !== undefined) erased.systemPrompt = job.systemPrompt;
  if (job.maxIterations !== undefined) erased.maxIterations = job.maxIterations;
  if (job.needsModelProviders !== undefined) {
    erased.needsModelProviders = job.needsModelProviders;
  }
  if (job.expectedToolCalls !== undefined) {
    erased.expectedToolCalls = job.expectedToolCalls;
  }
  return erased;
}

function safeTest(test: () => boolean): boolean {
  try {
    return test();
  } catch {
    return false;
  }
}

/** The prompt under test when a job names none. */
export const DEFAULT_JOB_SYSTEM_PROMPT = `You are an agent operating NodeTool through its tools.

Get the user's job done end to end. Discover what a tool does before guessing at
its arguments, read each result before the next call, and stop calling tools once
the job is done — then say in one line what you produced.

For a workflow-authoring job, end to end requires a \`nodetool.output.*\` node
wired to the final value. Do not call the workflow done until it surfaces the
requested result.`;

export interface RunJobOptions {
  provider: BaseProvider;
  model: string;
  /** Configured providers; a job needing them is skipped when absent. */
  providers?: Record<string, BaseProvider>;
  /** Turn cap when the job declares none. */
  maxIterations?: number;
  /** Override the prompt under test for every job (a job's own wins). */
  systemPrompt?: string;
  signal?: AbortSignal;
  onEvent?: (line: string) => void;
}

export async function runJob(
  job: ErasedJob,
  opts: RunJobOptions
): Promise<JobRunReport> {
  const startedAt = new Date().toISOString();
  const base = {
    jobId: job.id,
    statement: job.statement,
    provider: opts.provider.provider,
    model: opts.model,
    startedAt
  };

  const hasProviders =
    opts.providers !== undefined && Object.keys(opts.providers).length > 0;
  if (job.needsModelProviders === true && !hasProviders) {
    return {
      ...base,
      skipped: true,
      completed: false,
      achieved: false,
      outcomes: [],
      transcript: [],
      toolCalls: [],
      friction: [],
      totalToolCalls: 0,
      durationMs: 0,
      costUsd: 0
    };
  }

  opts.onEvent?.(`▶ ${job.id}: ${job.statement}`);
  const world = job.start();

  const loopArgs: Parameters<typeof runToolLoop>[0] = {
    provider: opts.provider,
    model: opts.model,
    tools: world.tools,
    systemPrompt:
      job.systemPrompt ?? opts.systemPrompt ?? DEFAULT_JOB_SYSTEM_PROMPT,
    userPrompt: job.objective
  };
  const iterations = job.maxIterations ?? opts.maxIterations;
  if (iterations !== undefined) loopArgs.maxIterations = iterations;
  if (opts.signal !== undefined) loopArgs.signal = opts.signal;

  const run = await runToolLoop(loopArgs);
  const outcomes = world.grade();
  const achieved =
    run.completed && outcomes.length > 0 && outcomes.every((o) => o.passed);
  const friction = deriveFriction({
    job: job.expectedToolCalls === undefined
      ? {}
      : { expectedToolCalls: job.expectedToolCalls },
    toolCalls: run.calls,
    achieved
  });

  opts.onEvent?.(
    `${achieved ? "✔" : "✘"} ${job.id} — ${run.totalCalls} calls, ${friction.length} friction signal(s)`
  );

  const report: JobRunReport = {
    ...base,
    skipped: false,
    completed: run.completed,
    achieved,
    outcomes,
    transcript: run.transcript,
    toolCalls: run.calls,
    friction,
    totalToolCalls: run.totalCalls,
    durationMs: run.durationMs,
    costUsd: run.costUsd
  };
  if (run.error !== undefined) report.error = run.error;
  return report;
}

export interface RunJobSuiteOptions extends RunJobOptions {
  /** Jobs to run; defaults to the whole registry. */
  jobs?: readonly ErasedJob[];
}

export async function runJobSuite(
  opts: RunJobSuiteOptions
): Promise<JobSuiteReport> {
  const { JOBS_TO_BE_DONE } = await import("./registry.js");
  const jobs = opts.jobs ?? JOBS_TO_BE_DONE;
  const startedAt = new Date().toISOString();
  const reports: JobRunReport[] = [];
  for (const job of jobs) {
    if (opts.signal?.aborted === true) break;
    reports.push(await runJob(job, opts));
  }

  const graded = reports.filter((r) => !r.skipped);
  const achieved = graded.filter((r) => r.achieved).length;
  const frictionByOwner: Record<FrictionOwner, number> = {
    harness: 0,
    prompt: 0,
    unattributed: 0
  };
  for (const report of reports) {
    for (const signal of report.friction) {
      frictionByOwner[signal.owner] += 1;
    }
  }

  return {
    provider: opts.provider.provider,
    model: opts.model,
    startedAt,
    jobs: reports,
    summary: {
      total: reports.length,
      skipped: reports.length - graded.length,
      achieved,
      achievementRate: graded.length === 0 ? 0 : achieved / graded.length,
      frictionByOwner,
      totalCostUsd: reports.reduce((sum, r) => sum + r.costUsd, 0)
    }
  };
}
