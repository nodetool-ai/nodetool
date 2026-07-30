/**
 * `nodetool reliability` — the reliability harness's CLI surface (C4,
 * docs/RELIABILITY_ARCHITECTURE.md §12, docs/RELIABILITY_TASKS.md Track C).
 *
 * `run <journey>` executes a journey's differential compare (every
 * non-oracle surface diffed against the kernel oracle, §6 invariants
 * aggregated per surface) and prints the report; `list` enumerates the
 * journeys under `reliability/journeys/`. Thin wrapper — all the logic lives
 * in `@nodetool-ai/reliability-harness`'s `cli.ts`/`compare.ts`, same split as
 * `commands/debug.ts` over `debug/index.js`.
 */
import type { Command } from "commander";

interface ReliabilityRunCliOptions {
  surface?: string[];
  faults?: string[];
  diff?: boolean;
  json?: boolean;
}

export function registerReliabilityCommands(program: Command): void {
  const reliability = program
    .command("reliability")
    .description("Run reliability-harness journeys across execution surfaces (§12)");

  reliability
    .command("run <journey>")
    .description(
      "Run one journey on its declared (or --surface-overridden) surfaces and diff every " +
        "non-oracle surface against the kernel oracle"
    )
    .option(
      "--surface <name>",
      "Run only this surface (repeatable) — overrides the journey's own surfaces list; " +
        "the kernel oracle is always included",
      (value: string, previous: string[] = []) => [...previous, value],
      [] as string[]
    )
    .option(
      "--faults <name>",
      "Inject this fault (repeatable) — validated only; Track D implements the fault modules",
      (value: string, previous: string[] = []) => [...previous, value],
      [] as string[]
    )
    .option("--diff", "Print the full per-channel stream diff for any diverging surface")
    .option("--json", "Print the full CompareReport as JSON instead of the human-readable summary")
    .action(async (journeyName: string, opts: ReliabilityRunCliOptions) => {
      try {
        const { runJourney, formatCompareReport } = await import(
          "@nodetool-ai/reliability-harness"
        );
        const report = await runJourney(journeyName, {
          surfaces: opts.surface,
          faults: opts.faults
        });

        if (opts.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          console.log(formatCompareReport(report, { showDiff: Boolean(opts.diff) }));
        }

        process.exit(report.verdict.ok ? 0 : 1);
      } catch (e) {
        console.error(String(e));
        process.exit(1);
      }
    });

  reliability
    .command("list")
    .description("List the journeys under reliability/journeys/")
    .option("--json", "Print the full journey summaries as JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        const { listJourneys } = await import("@nodetool-ai/reliability-harness");
        const journeys = await listJourneys();

        if (opts.json) {
          console.log(JSON.stringify(journeys, null, 2));
          return;
        }

        for (const j of journeys) {
          console.log(`${j.name}`);
          if (j.description) console.log(`  ${j.description}`);
          console.log(`  surfaces: ${j.surfaces.join(", ")}`);
          console.log(`  invariants: ${j.invariants.join(", ") || "(none)"}`);
          console.log("");
        }
      } catch (e) {
        console.error(String(e));
        process.exit(1);
      }
    });
}
