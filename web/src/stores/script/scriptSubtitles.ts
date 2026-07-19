/**
 * scriptSubtitles — export a script's current takes as SRT or WebVTT.
 *
 * Text is the source of truth, audio (and its word timings) is derived: this
 * walks the script's lines in document order, takes each line's *current* take,
 * and lays the takes end to end with the authored `pauseAfterMs` gaps — the same
 * layout `assembleScriptTimeline` uses — then renders subtitle cues via the
 * shared `@nodetool-ai/timeline` formatter. Unvoiced lines (no current take) are
 * skipped.
 */

import {
  assembleSubtitleCues,
  formatSubtitles,
  type SubtitleEntry,
  type SubtitleFormat,
  type SubtitleGranularity
} from "@nodetool-ai/timeline";

import type { ScriptDraft } from "./ScriptStore";

/** Fallback cue length for a current take whose duration is unknown. */
const PLACEHOLDER_LINE_MS = 3000;

export interface ScriptSubtitleOptions {
  format?: SubtitleFormat;
  granularity?: SubtitleGranularity;
}

export interface ScriptSubtitleResult {
  /** The rendered subtitle file content. */
  text: string;
  format: SubtitleFormat;
  cueCount: number;
}

/** Build the voiced entries a subtitle export lays onto its timeline. */
export const scriptSubtitleEntries = (script: ScriptDraft): SubtitleEntry[] => {
  const entries: SubtitleEntry[] = [];
  for (const section of script.sections) {
    for (const line of section.lines) {
      const take = line.takes.find((t) => t.id === line.currentTakeId);
      if (!take || !take.assetId) continue;
      if (!line.text.trim()) continue;
      entries.push({
        text: line.text,
        durationMs: take.durationMs > 0 ? take.durationMs : PLACEHOLDER_LINE_MS,
        words: take.words,
        pauseAfterMs: line.pauseAfterMs
      });
    }
  }
  return entries;
};

/**
 * Render a script's current takes as subtitles. Returns `null` when the script
 * has no voiced lines to export.
 */
export const exportScriptSubtitles = (
  script: ScriptDraft,
  options: ScriptSubtitleOptions = {}
): ScriptSubtitleResult | null => {
  const format = options.format ?? "srt";
  const entries = scriptSubtitleEntries(script);
  if (entries.length === 0) return null;
  const cues = assembleSubtitleCues(entries, {
    granularity: options.granularity ?? "line"
  });
  return { text: formatSubtitles(cues, format), format, cueCount: cues.length };
};
