/**
 * `nodetool timeline validate`, `debug` and `versions` — the timeline harness
 * commands.
 *
 * `validate` checks a timeline document statically: tracks a clip points at,
 * fields a round trip through the schema would strip, timings that cannot
 * render. `debug` additionally replays a scripted `--interact` edit session
 * against the headless `ui_timeline_*` bridge and writes a bundle. Both take a
 * timeline JSON file or a `timeline_sequences` row id. `versions`
 * (timeline-versions.ts) reads and restores a sequence's snapshot history.
 *
 * Heavy dependencies (the database, the validator core, the bridge) are
 * imported lazily inside each action, so command registration stays light and
 * unit-testable.
 */
import type { Command } from "commander";
import type { TimelineDebugReport } from "@nodetool-ai/execution/timeline-debug";
import type { TimelineSequenceRecord } from "../timeline-debug/target.js";
import { printCommandError } from "../command-errors.js";
import { renderTimelineValidation } from "./timeline-validation-output.js";
import { registerTimelineVersionsCommands } from "./timeline-versions.js";

export { renderTimelineValidation };

interface TimelineValidateCliOptions {
  json?: boolean;
  warningsAsErrors?: boolean;
}

interface TimelineDebugCliOptions {
  interact?: string;
  out?: string;
  json?: boolean;
}

/** Read a sequence row through the local database. */
async function sequenceLoader(): Promise<
  (id: string) => Promise<TimelineSequenceRecord | null>
> {
  const { initDb, TimelineSequence } = await import("@nodetool-ai/models");
  const { getDefaultDbPath } = await import("@nodetool-ai/config");
  let ready = false;
  return async (id: string) => {
    if (!ready) {
      initDb(getDefaultDbPath());
      ready = true;
    }
    const row = await TimelineSequence.findById(id);
    return row
      ? {
          id: row.id,
          name: row.name,
          fps: row.fps,
          width: row.width,
          height: row.height,
          document: row.document
        }
      : null;
  };
}

export function registerTimelineCommands(program: Command): void {
  const timeline = program
    .command("timeline")
    .description("Work with timeline sequences");

  timeline
    .command("validate <timeline_id_or_file>")
    .description(
      "Validate a timeline document without rendering it: clips on missing tracks, fields a schema round trip would strip, unrenderable timings. Takes a timeline JSON file or a timeline_sequences row id"
    )
    .option("--json", "Print the full TimelineValidation as JSON")
    .option(
      "--warnings-as-errors",
      "Exit non-zero when there are warnings (not just errors)"
    )
    .action(async (ref: string, opts: TimelineValidateCliOptions) => {
      try {
        const { runTimelineValidate } =
          await import("../timeline-debug/index.js");
        const { target, validation } = await runTimelineValidate(ref, {
          loadSequence: await sequenceLoader()
        });

        if (opts.json) {
          console.log(JSON.stringify({ target, validation }, null, 2));
        } else {
          console.log(renderTimelineValidation(validation).join("\n"));
        }

        const failed =
          !validation.ok ||
          (opts.warningsAsErrors === true && validation.warnings.length > 0);
        process.exit(failed ? 1 : 0);
      } catch (e) {
        printCommandError(e, opts.json);
        process.exit(1);
      }
    });

  timeline
    .command("debug <timeline_id_or_file>")
    .description(
      "Replay a scripted edit session against a timeline headlessly and collect a debug bundle (the document, the report, every step's result)"
    )
    .option(
      "--interact <json>",
      'Scripted steps: [{"tool":"add_track","input":{"type":"audio"}}] — the ui_timeline_ prefix is optional'
    )
    .option(
      "--out <dir>",
      "Bundle output directory (default: nodetool-debug/timeline-<id>-<timestamp>)"
    )
    .option("--json", "Print the full TimelineDebugReport as JSON to stdout")
    .action(async (ref: string, opts: TimelineDebugCliOptions) => {
      try {
        const { parseInteractionScript, runTimelineDebug } =
          await import("../timeline-debug/index.js");
        const interact = opts.interact
          ? parseInteractionScript(opts.interact)
          : undefined;

        const debugOptions: Parameters<typeof runTimelineDebug>[1] = {};
        if (interact) {
          debugOptions.interact = interact;
        }
        if (opts.out) {
          debugOptions.outDir = opts.out;
        }
        const { report, bundleDir } = await runTimelineDebug(
          ref,
          debugOptions,
          {
            loadSequence: await sequenceLoader(),
            onLog: (line) => console.error(line)
          }
        );

        if (opts.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          printTimelineSummary(report, bundleDir);
        }
        process.exit(report.verdict.ok ? 0 : 1);
      } catch (e) {
        printCommandError(e, opts.json);
        process.exit(1);
      }
    });

  registerTimelineVersionsCommands(timeline);
}

function printTimelineSummary(
  report: TimelineDebugReport,
  bundleDir: string
): void {
  const mark = report.verdict.ok ? "✅" : "❌";
  console.log(`\n${mark} ${report.verdict.headline}`);
  console.log(
    `  timeline: ${report.meta.trackCount} track(s), ${report.meta.clipCount} clip(s), ${report.meta.durationMs}ms @ ${report.meta.fps}fps`
  );
  const failed = report.interactions.filter((i) => !i.ok).length;
  if (report.interactions.length > 0) {
    console.log(
      `  session:  ${report.interactions.length} step(s), ${failed} failed`
    );
  }
  if (report.verdict.issues.length > 0) {
    console.log("\nIssues:");
    for (const issue of report.verdict.issues) console.log(`  - ${issue}`);
  }
  if (report.verdict.warnings && report.verdict.warnings.length > 0) {
    console.log("\nWarnings:");
    for (const warning of report.verdict.warnings)
      console.log(`  - ${warning}`);
  }
  console.log(`\nDebug bundle: ${bundleDir}`);
  console.log("  report.md / report.json · timeline.json");
}
