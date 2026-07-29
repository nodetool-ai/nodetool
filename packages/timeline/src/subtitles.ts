/**
 * Subtitle export — turn timed caption words into SRT or WebVTT.
 *
 * Captions in this codebase are word-level (`CaptionWord`: word + start/end in
 * ms), timed relative to the clip/take they belong to. A subtitle file is a flat
 * list of cues laid on an absolute timeline, so exporting is two steps:
 *
 *   1. assemble cues — walk a sequence of voiced entries (script lines, timeline
 *      clips), offsetting each entry's local word timings by a running cursor and
 *      the authored pauses between them (`assembleSubtitleCues`);
 *   2. format — render the cues as `.srt` or `.vtt` text (`cuesToSrt`/`cuesToVtt`).
 *
 * The module is pure and framework-agnostic (no protocol/model imports) so both
 * the script graph nodes and the web editor can share one source of truth.
 */

/** A word timed relative to the entry (line/take/clip) it belongs to. */
export interface SubtitleWord {
  word: string;
  startMs: number;
  endMs: number;
}

/** One rendered subtitle cue on the absolute output timeline. */
export interface SubtitleCue {
  startMs: number;
  endMs: number;
  text: string;
}

/** A voiced entry to lay onto the subtitle timeline, in playback order. */
export interface SubtitleEntry {
  /** The full spoken text of the entry (used for line-granularity cues). */
  text: string;
  /** Duration of the entry's audio in ms; the cue span when words are absent. */
  durationMs: number;
  /** Entry-local word timings, when available (drives word granularity). */
  words?: SubtitleWord[];
  /** Authored silence after this entry before the next one starts. */
  pauseAfterMs?: number;
}

export type SubtitleGranularity = "line" | "word";
export type SubtitleFormat = "srt" | "vtt";

export interface AssembleSubtitleOptions {
  /**
   * `"line"` (default) emits one cue per entry spanning its whole duration;
   * `"word"` emits one cue per timed word, falling back to a line cue for
   * entries that carry no word timings.
   */
  granularity?: SubtitleGranularity;
}

/** Minimum cue length so a zero/negative span still renders as a visible cue. */
const MIN_CUE_MS = 1;

/**
 * Lay a sequence of voiced entries onto an absolute timeline, producing subtitle
 * cues. Entries run end to end, separated by their `pauseAfterMs`. Empty-text
 * entries and entries with a non-positive duration are skipped.
 */
export function assembleSubtitleCues(
  entries: SubtitleEntry[],
  options: AssembleSubtitleOptions = {}
): SubtitleCue[] {
  const granularity = options.granularity ?? "line";
  const cues: SubtitleCue[] = [];
  let cursorMs = 0;

  for (const entry of entries) {
    const text = entry.text.trim();
    const durationMs = entry.durationMs;
    if (!text || durationMs <= 0) continue;

    if (granularity === "word" && entry.words && entry.words.length > 0) {
      for (const word of entry.words) {
        const label = word.word.trim();
        if (!label) continue;
        const startMs = cursorMs + Math.max(0, word.startMs);
        const endMs = cursorMs + Math.max(word.startMs, word.endMs);
        cues.push({
          startMs,
          endMs: Math.max(startMs + MIN_CUE_MS, endMs),
          text: label
        });
      }
    } else {
      cues.push({
        startMs: cursorMs,
        endMs: cursorMs + Math.max(MIN_CUE_MS, durationMs),
        text
      });
    }

    cursorMs += durationMs + Math.max(0, entry.pauseAfterMs ?? 0);
  }

  return cues;
}

/** `HH:MM:SS<sep>mmm` — SRT uses a comma separator, WebVTT a period. */
function formatTimestamp(totalMs: number, sep: "," | "."): string {
  const ms = Math.max(0, Math.round(totalMs));
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  const millis = ms % 1000;
  const pad = (n: number, width = 2): string => String(n).padStart(width, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}${sep}${pad(millis, 3)}`;
}

/** Render cues as SubRip (`.srt`): numbered blocks, comma-decimal timestamps. */
export function cuesToSrt(cues: SubtitleCue[]): string {
  return (
    cues
      .map((cue, index) => {
        const start = formatTimestamp(cue.startMs, ",");
        const end = formatTimestamp(cue.endMs, ",");
        return `${index + 1}\n${start} --> ${end}\n${cue.text}`;
      })
      .join("\n\n") + (cues.length > 0 ? "\n" : "")
  );
}

/** Render cues as WebVTT (`.vtt`): `WEBVTT` header, period-decimal timestamps. */
export function cuesToVtt(cues: SubtitleCue[]): string {
  if (cues.length === 0) return "WEBVTT\n";
  const blocks = cues.map((cue) => {
    const start = formatTimestamp(cue.startMs, ".");
    const end = formatTimestamp(cue.endMs, ".");
    return `${start} --> ${end}\n${cue.text}`;
  });
  return `WEBVTT\n\n${blocks.join("\n\n")}\n`;
}

/** Render cues in the requested format. */
export function formatSubtitles(
  cues: SubtitleCue[],
  format: SubtitleFormat
): string {
  return format === "vtt" ? cuesToVtt(cues) : cuesToSrt(cues);
}
