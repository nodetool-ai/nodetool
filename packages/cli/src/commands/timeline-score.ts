/**
 * `nodetool timeline score` — the deterministic craft scorecard.
 *
 * Reuses `resolveTimelineTarget` for target resolution (id, file, bundle),
 * `@nodetool-ai/execution/timeline-debug`'s `scoreTimelineCraft` for the
 * metrics and formula, and `runTimelineRender`'s `--sheet` code path for the
 * optional contact sheet — never a second renderer.
 */
import type { Command } from "commander";
import type { TimelineCraftScoreResult } from "@nodetool-ai/execution/timeline-debug";
import type { TimelineSequenceRecord } from "../timeline-debug/target.js";
import { printCommandError } from "../command-errors.js";
import { runTimelineRender } from "./timeline-render.js";

/** Evenly spaced frames a `--sheet` render samples by default. */
const SHEET_FRAME_COUNT = 12;

interface TimelineScoreCliOptions {
  json?: boolean;
  minScore?: string;
  sheet?: string;
}

export function evenlySpacedFrames(
  totalFrames: number,
  count: number
): number[] {
  if (totalFrames <= 1) return [0];
  const n = Math.min(count, totalFrames);
  const frames = new Set<number>();
  for (let i = 0; i < n; i += 1) {
    frames.add(Math.round((i * (totalFrames - 1)) / Math.max(1, n - 1)));
  }
  return [...frames].sort((a, b) => a - b);
}

export function registerTimelineScoreCommand(
  timeline: Command,
  loadSequence: () => Promise<
    (id: string) => Promise<TimelineSequenceRecord | null>
  >
): void {
  timeline
    .command("score <timeline_id_or_file>")
    .description(
      "Score a timeline document's craft against the shipped showcase examples (kite, prism, serein, tidewater, voltra) — a deterministic, no-LLM scorecard. Takes a timeline JSON file or a timeline_sequences row id"
    )
    .option("--json", "Print the full TimelineCraftScoreResult as JSON")
    .option(
      "--min-score <n>",
      "Exit non-zero when the score is below this threshold"
    )
    .option(
      "--sheet <out.png>",
      `Also render a GPU contact sheet of ${SHEET_FRAME_COUNT} evenly spaced frames through the same renderer 'timeline render --sheet' uses`
    )
    .action(async (ref: string, opts: TimelineScoreCliOptions) => {
      try {
        const { resolveTimelineTarget } =
          await import("../timeline-debug/target.js");
        const { scoreTimelineCraft } =
          await import("@nodetool-ai/execution/timeline-debug");
        const sequenceLoader = await loadSequence();
        const resolved = await resolveTimelineTarget(ref, {
          loadSequence: sequenceLoader
        });
        const result = await scoreTimelineCraft(resolved.raw, {
          fps: resolved.meta.fps,
          width: resolved.meta.width,
          height: resolved.meta.height
        });

        if (opts.sheet) {
          const fps =
            resolved.meta.fps && resolved.meta.fps > 0
              ? resolved.meta.fps
              : 30;
          const durationMs =
            resolved.meta.durationMs && resolved.meta.durationMs > 0
              ? resolved.meta.durationMs
              : resolved.document.clips.reduce(
                  (end, clip) => Math.max(end, clip.startMs + clip.durationMs),
                  0
                );
          const totalFrames = Math.max(
            1,
            Math.round((durationMs / 1000) * fps)
          );
          const frames = evenlySpacedFrames(totalFrames, SHEET_FRAME_COUNT);
          await runTimelineRender(
            ref,
            { out: opts.sheet, sheet: true, frames: frames.join(",") },
            sequenceLoader
          );
        }

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(renderTimelineScore(result).join("\n"));
        }

        const failed =
          opts.minScore !== undefined && result.score < Number(opts.minScore);
        process.exit(failed ? 1 : 0);
      } catch (e) {
        printCommandError(e, opts.json);
        process.exit(1);
      }
    });
}

/** Human-readable rendering of a `TimelineCraftScoreResult`. */
export function renderTimelineScore(
  result: TimelineCraftScoreResult
): string[] {
  const lines: string[] = [];
  const distinctCodes = Object.keys(result.showcaseWarningCodeCounts).length;
  lines.push(
    `Craft score: ${result.score.toFixed(1)}/100 (raw ${result.rawScore.toFixed(1)}, -${result.penalty} for ${distinctCodes} distinct showcase warning code(s))`
  );
  lines.push(
    `Reference band: ${result.reference.entries.map((e) => e.slug).join(", ") || "(none found)"}`
  );
  lines.push("");
  lines.push("Metric                         value    median   credit");
  for (const metric of result.metricScores) {
    lines.push(
      `${metric.metric.padEnd(30)} ${metric.value.toFixed(2).padStart(8)} ${metric.referenceMedian.toFixed(2).padStart(8)} ${metric.credit.toFixed(2).padStart(8)}`
    );
  }
  if (result.showcaseWarnings.length > 0) {
    lines.push("");
    lines.push("Showcase warnings (penalized once per code, all instances shown):");
    for (const [code, count] of Object.entries(result.showcaseWarningCodeCounts)) {
      lines.push(`  - ${code} ×${count}`);
    }
    lines.push("");
    for (const warning of result.showcaseWarnings) {
      lines.push(`  - [${warning.code}] ${warning.message}`);
    }
  }
  if (!result.validation.ok) {
    lines.push("");
    lines.push(
      `Document has ${result.validation.errors.length} validation error(s) — run 'timeline validate' for details.`
    );
  }
  return lines;
}
