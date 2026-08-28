/**
 * `nodetool jtbd` — run the jobs an agent is asked to get done, and review how
 * the runs went.
 *
 * Three subcommands, one loop:
 *
 *   list      what jobs exist, what they cross, how hard they are meant to be
 *   run       drive a model through them and write a bundle per run
 *   optimize  read those bundles back and propose a fix per run
 *
 * `run` and `optimize` are separate commands rather than one flag because the
 * bundle is the handoff. A run costs model time and produces a record worth
 * keeping; reviewing it is a different model, a different prompt, and often a
 * different day. Splitting them means a bundle can be re-reviewed with a better
 * optimizer without paying for the runs again — and that a human can read the
 * transcript before any model proposes anything.
 *
 * `optimize` writes proposals into the bundle. It changes no prompt and no
 * tool; see `packages/agents/src/jtbd/optimize.ts` for why.
 */

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Command } from "commander";
import type { JobRunReport, JobSuiteReport } from "@nodetool-ai/agents";
import { parseNumericOption } from "../numeric-options.js";

const DEFAULT_OUT = "nodetool-debug/jtbd";

interface JtbdListOptions {
  json?: boolean;
}

interface JtbdRunOptions {
  provider?: string;
  model?: string;
  jobs?: string;
  out?: string;
  json?: boolean;
  maxIterations?: string;
  minAchieved?: string;
  findModel?: boolean;
}

interface JtbdOptimizeOptions {
  provider?: string;
  model?: string;
  bundle?: string;
  json?: boolean;
  /** Review the runs that got the job done too, not only the failures. */
  all?: boolean;
}

const slug = (text: string): string =>
  text.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "");

async function listJobs(opts: JtbdListOptions): Promise<void> {
  const { JOBS_TO_BE_DONE } = await import("@nodetool-ai/agents");
  if (opts.json) {
    console.log(
      JSON.stringify(
        JOBS_TO_BE_DONE.map((job) => ({
          id: job.id,
          statement: job.statement,
          surfaces: job.surfaces,
          difficulty: job.difficulty,
          objective: job.objective,
          outcomes: job.outcomeNames,
          expectedToolCalls: job.expectedToolCalls
        })),
        null,
        2
      )
    );
    return;
  }
  for (const job of JOBS_TO_BE_DONE) {
    console.log(`${job.id}  [${job.difficulty}]  ${job.surfaces.join(", ")}`);
    console.log(`  ${job.statement}`);
    console.log(`  outcomes: ${job.outcomeNames.join(", ")}`);
    console.log("");
  }
}

/**
 * One directory per run, holding the report, the transcript on its own (so a
 * person can read it without wading through JSON), and the friction. The
 * transcript is the artifact the whole loop exists to produce, so it gets its
 * own file rather than living only as a field.
 */
async function writeRunBundle(
  dir: string,
  report: JobRunReport
): Promise<string> {
  const runDir = join(dir, slug(report.jobId));
  await mkdir(runDir, { recursive: true });
  await writeFile(
    join(runDir, "report.json"),
    JSON.stringify(report, null, 2),
    "utf-8"
  );
  const { renderRunForReview } = await import("@nodetool-ai/agents");
  await writeFile(join(runDir, "review.md"), renderRunForReview(report), "utf-8");
  return runDir;
}

async function runJobs(opts: JtbdRunOptions): Promise<void> {
  if (!opts.provider || !opts.model) {
    console.error("--provider and --model are required");
    process.exitCode = 1;
    return;
  }
  const [agents, providersMod] = await Promise.all([
    import("@nodetool-ai/agents"),
    import("../providers.js")
  ]);
  const { JOBS_TO_BE_DONE, runJobSuite } = agents;

  const ids = opts.jobs
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const jobs =
    ids === undefined
      ? JOBS_TO_BE_DONE
      : JOBS_TO_BE_DONE.filter((job) => ids.includes(job.id));
  if (jobs.length === 0) {
    console.error(`No jobs matched ${ids?.join(", ") ?? "(none)"}`);
    process.exitCode = 1;
    return;
  }

  const provider = await providersMod.createProviderStrict(opts.provider);
  const providers =
    opts.findModel === false
      ? undefined
      : await providersMod.buildConfiguredProviders();

  const runOptions: Parameters<typeof runJobSuite>[0] = {
    provider,
    model: opts.model,
    jobs,
    onEvent: (line) => {
      if (!opts.json) console.log(line);
    }
  };
  if (providers !== undefined) runOptions.providers = providers;
  if (opts.maxIterations !== undefined) {
    runOptions.maxIterations = parseNumericOption(
      opts.maxIterations,
      "--max-iterations",
      { integer: true, min: 1 }
    );
  }

  const report = await runJobSuite(runOptions);

  const outDir = resolve(opts.out ?? DEFAULT_OUT);
  await mkdir(outDir, { recursive: true });
  for (const run of report.jobs) {
    if (run.skipped) continue;
    await writeRunBundle(outDir, run);
  }
  await writeFile(
    join(outDir, "suite.json"),
    JSON.stringify(report, null, 2),
    "utf-8"
  );

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printSuite(report, outDir);
  }

  if (opts.minAchieved !== undefined) {
    const threshold = parseNumericOption(opts.minAchieved, "--min-achieved", {
      min: 0,
      max: 1
    });
    if (report.summary.achievementRate < threshold) {
      console.error(
        `Achievement rate ${report.summary.achievementRate.toFixed(2)} is below --min-achieved ${threshold}`
      );
      process.exitCode = 1;
    }
  }
}

function printSuite(report: JobSuiteReport, outDir: string): void {
  const { summary } = report;
  console.log("");
  console.log(`${report.provider}/${report.model}`);
  for (const run of report.jobs) {
    if (run.skipped) {
      console.log(`  ‑ ${run.jobId}: skipped (needs model providers)`);
      continue;
    }
    const failed = run.outcomes.filter((o) => !o.passed).map((o) => o.name);
    console.log(
      `  ${run.achieved ? "✔" : "✘"} ${run.jobId}: ${run.totalToolCalls} calls` +
        (failed.length > 0 ? `, missed ${failed.join(", ")}` : "")
    );
    for (const signal of run.friction) {
      console.log(`      ⚠ [${signal.owner}] ${signal.summary}`);
    }
  }
  console.log("");
  console.log(
    `achieved ${summary.achieved}/${summary.total - summary.skipped}` +
      ` (${(summary.achievementRate * 100).toFixed(0)}%)` +
      `  friction: ${summary.frictionByOwner.harness} harness,` +
      ` ${summary.frictionByOwner.prompt} prompt,` +
      ` ${summary.frictionByOwner.unattributed} unattributed` +
      `  $${summary.totalCostUsd.toFixed(4)}`
  );
  console.log(`bundle: ${outDir}`);
}

/** Every `report.json` under the bundle directory, one per job run. */
async function loadRunReports(dir: string): Promise<JobRunReport[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const reports: JobRunReport[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const path = join(dir, entry.name, "report.json");
    try {
      reports.push(JSON.parse(await readFile(path, "utf-8")) as JobRunReport);
    } catch {
      // A directory without a readable report is not a run bundle. Skipping it
      // is right: the bundle dir is a normal folder a user may keep notes in.
    }
  }
  return reports;
}

async function optimizeRuns(opts: JtbdOptimizeOptions): Promise<void> {
  if (!opts.provider || !opts.model) {
    console.error("--provider and --model are required");
    process.exitCode = 1;
    return;
  }
  const dir = resolve(opts.bundle ?? DEFAULT_OUT);
  const reports = await loadRunReports(dir);
  if (reports.length === 0) {
    console.error(`No run bundles found under ${dir} — run \`nodetool jtbd run\` first`);
    process.exitCode = 1;
    return;
  }

  const [{ optimizeFromRun }, providersMod] = await Promise.all([
    import("@nodetool-ai/agents"),
    import("../providers.js")
  ]);
  const provider = await providersMod.createProviderStrict(opts.provider);

  const selected =
    opts.all === true ? reports : reports.filter((r) => !r.achieved || r.friction.length > 0);
  if (selected.length === 0) {
    console.log("Every run was clean — nothing to review. Use --all to review anyway.");
    return;
  }

  const results = [];
  for (const report of selected) {
    if (!opts.json) console.log(`▶ reviewing ${report.jobId}`);
    const optimization = await optimizeFromRun(report, {
      provider,
      model: opts.model
    });
    results.push(optimization);
    await writeFile(
      join(dir, slug(report.jobId), "proposals.json"),
      JSON.stringify(optimization, null, 2),
      "utf-8"
    );
    if (opts.json) continue;
    if (optimization.error !== undefined) {
      console.log(`  ! review failed: ${optimization.error}`);
      continue;
    }
    if (optimization.proposals.length === 0) {
      console.log("  (nothing worth changing)");
    }
    for (const proposal of optimization.proposals) {
      console.log(
        `  [${proposal.owner}] ${proposal.target} (confidence ${proposal.confidence.toFixed(2)})`
      );
      console.log(`      ${proposal.diagnosis}`);
      console.log(`      → ${proposal.change}`);
    }
  }

  if (opts.json) console.log(JSON.stringify(results, null, 2));
  else console.log(`\nproposals written under ${dir}`);
}

export function registerJtbdCommand(program: Command): void {
  const cmd = program
    .command("jtbd")
    .description(
      "Jobs to be done: run end-to-end agent jobs, record the transcripts, and review how they went"
    );

  cmd
    .command("list")
    .description("List the jobs, the surfaces they cross, and their outcomes")
    .option("--json", "Print as JSON")
    .action((opts: JtbdListOptions) => listJobs(opts));

  cmd
    .command("run")
    .description("Drive a model through the jobs and write a bundle per run")
    .option("-p, --provider <id>", "Provider id (anthropic, openai, ollama, ...)")
    .option("-m, --model <id>", "Model id for the provider")
    .option("--jobs <ids>", "Comma-separated job ids (default: all; see list)")
    .option("--out <dir>", `Bundle directory (default ${DEFAULT_OUT})`)
    .option("--max-iterations <n>", "Turn cap per job when the job declares none")
    .option(
      "--min-achieved <rate>",
      "Exit non-zero when the achievement rate is below this threshold (0..1)"
    )
    .option("--no-find-model", "Run without configured model providers")
    .option("--json", "Print the full report as JSON")
    .action((opts: JtbdRunOptions) => runJobs(opts));

  cmd
    .command("optimize")
    .description(
      "Review recorded runs and propose a harness or prompt fix per run (writes proposals; changes nothing)"
    )
    .option("-p, --provider <id>", "Reviewing provider — use a different one than ran the jobs")
    .option("-m, --model <id>", "Reviewing model id")
    .option("--bundle <dir>", `Bundle directory to review (default ${DEFAULT_OUT})`)
    .option("--all", "Review clean runs too, not just failures and friction")
    .option("--json", "Print the proposals as JSON")
    .action((opts: JtbdOptimizeOptions) => optimizeRuns(opts));
}
