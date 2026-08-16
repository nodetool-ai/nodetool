/**
 * Renders a `TimelineDebugReport` as human-readable Markdown for the bundle.
 */
import type { TimelineDebugIssue, TimelineDebugReport } from "./types.js";
import { isString } from "../predicates.js";
import { isObjectLike } from "../predicates.js";

const short = (value: unknown, max = 120): string => {
  if (value === undefined) return "—";
  let s: string;
  try {
    s = isString(value) ? value : JSON.stringify(value);
  } catch {
    s = String(value);
  }
  s = (s ?? "null").replace(/\s+/g, " ");
  return s.length > max ? `${s.slice(0, max)}…` : s;
};

const where = (issue: TimelineDebugIssue): string => {
  const parts = [
    issue.clipId ? `clip \`${issue.clipId}\`` : null,
    issue.trackId ? `track \`${issue.trackId}\`` : null,
    issue.path ? `\`${issue.path}\`` : null
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : "—";
};

function issueTable(
  title: string,
  issues: ReadonlyArray<TimelineDebugIssue>,
  lines: string[]
): void {
  if (issues.length === 0) return;
  lines.push("", `## ${title}`, "");
  lines.push("| Severity | Code | Where | Message |");
  lines.push("| --- | --- | --- | --- |");
  for (const issue of issues) {
    lines.push(
      `| ${issue.severity} | \`${issue.code}\` | ${where(issue)} | ${short(issue.message, 300)} |`
    );
  }
}

interface SnapshotTrack {
  id?: string;
  name?: string;
  type?: string;
  index?: number;
}

interface SnapshotClip {
  id?: string;
  name?: string;
  trackId?: string;
  mediaType?: string;
  startMs?: number;
  durationMs?: number;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  isObjectLike(value) ? value : null;

/**
 * The bridge snapshot carries full `documentTracks`/`documentClips` for the
 * report's `finalDocument`; the markdown only needs the reduced view, so
 * render per-track/per-clip lines instead of one giant JSON dump.
 */
function finalStateLines(state: unknown): string[] {
  const record = asRecord(state);
  const tracks = Array.isArray(record?.tracks) ? (record.tracks as SnapshotTrack[]) : null;
  const clips = Array.isArray(record?.clips) ? (record.clips as SnapshotClip[]) : null;
  if (!tracks || !clips) return [`- ${short(state, 600)}`];

  const lines: string[] = [];
  for (const track of tracks) {
    const onTrack = clips.filter((clip) => clip.trackId === track.id);
    lines.push(
      `- track \`${track.id ?? "?"}\` (${track.type ?? "?"}, index ${track.index ?? "?"})` +
        `${track.name ? ` "${track.name}"` : ""} — ${onTrack.length} clip(s)`
    );
    for (const clip of onTrack) {
      const end = (clip.startMs ?? 0) + (clip.durationMs ?? 0);
      lines.push(
        `  - \`${clip.id ?? "?"}\`${clip.name ? ` "${clip.name}"` : ""} ` +
          `${clip.mediaType ?? "?"} ${clip.startMs ?? 0}–${end}ms`
      );
    }
  }
  const orphaned = clips.filter(
    (clip) => !tracks.some((track) => track.id === clip.trackId)
  );
  for (const clip of orphaned) {
    lines.push(
      `- orphaned clip \`${clip.id ?? "?"}\` on missing track \`${clip.trackId ?? "?"}\``
    );
  }
  return lines;
}

export function renderTimelineReportMarkdown(report: TimelineDebugReport): string {
  const lines: string[] = [];
  const title = report.target.name ?? report.target.ref;
  lines.push(`# Timeline debug: ${title}`);
  lines.push("");
  lines.push(`${report.verdict.ok ? "✅" : "❌"} ${report.verdict.headline}`);
  lines.push("");
  lines.push(`Target: \`${report.target.ref}\` (${report.target.kind})`);
  lines.push(
    `Sequence: ${report.meta.width}×${report.meta.height} @ ${report.meta.fps}fps · ` +
      `${report.meta.durationMs}ms · ${report.meta.trackCount} track(s), ` +
      `${report.meta.clipCount} clip(s)`
  );

  if (report.verdict.issues.length > 0) {
    lines.push("", "## Issues", "");
    for (const issue of report.verdict.issues) lines.push(`- ${issue}`);
  }

  issueTable("Validation", [...report.validation.errors, ...report.validation.warnings], lines);

  if (report.interactions.length > 0) {
    lines.push("", "## Interactions", "");
    lines.push("| Tool | OK | Input | Error |");
    lines.push("| --- | --- | --- | --- |");
    for (const step of report.interactions) {
      lines.push(
        `| \`${step.tool}\` | ${step.ok ? "✅" : "❌"} | ${short(step.input)} | ${
          step.error ? short(step.error, 200) : "—"
        } |`
      );
    }
  }

  if (report.finalValidation) {
    issueTable(
      "Validation after edits",
      [...report.finalValidation.errors, ...report.finalValidation.warnings],
      lines
    );
  }

  if (report.finalState !== undefined) {
    lines.push("", "## Final state", "");
    lines.push(...finalStateLines(report.finalState));
  }

  if (report.notSimulated.length > 0) {
    lines.push("", "## Not simulated", "");
    for (const entry of report.notSimulated) lines.push(`- ${entry}`);
  }

  lines.push("");
  return lines.join("\n");
}
