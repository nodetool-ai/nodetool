/**
 * Subtitle import — SRT and WebVTT cues to script lines (PRD § 9.1).
 *
 * A subtitle file already is a script: someone wrote the words and someone
 * else timed them. So the import reads it rather than asking a model anything
 * — one line per cue, in file order, each carrying the cue's own duration as
 * the target its take should hit, all under a single `Narrator` (the file
 * records no cast).
 *
 * The two formats differ in punctuation and preamble, not in structure, so one
 * parser reads both: `,` or `.` before the milliseconds, an optional `WEBVTT`
 * header, `NOTE`/`STYLE`/`REGION` blocks, cue identifiers and cue settings
 * after the timestamp. Markup inside a cue (`<i>`, `<c.loud>`) is styling for a
 * player, not words, so it is dropped; every word survives.
 *
 * Pure: no DOM, no store, no fetch.
 */

/** One imported cue, ready to become a line. */
export interface SubtitleLine {
  /** The cue's words, newlines inside a cue joined with a space. */
  text: string;
  startMs: number;
  endMs: number;
  /** What the take should come out at, in ms. Always `endMs - startMs`. */
  durationMs: number;
}

export interface SubtitleImport {
  lines: SubtitleLine[];
  /** The single speaker a subtitle file implies (PRD § 9.1). */
  speakerName: string;
  /** The cues read back as plain text — what lands in the idea textarea. */
  text: string;
}

/** The file picker's accept list for the subtitle path. */
export const SUBTITLE_ACCEPT = ".srt,.vtt,text/vtt";

/** The single speaker every subtitle import is cast under. */
const NARRATOR = "Narrator";

/** Blocks a VTT may hold that are not cues. */
const NON_CUE_BLOCK = /^(NOTE|STYLE|REGION)\b/;

/** `hh:mm:ss,mmm` or `mm:ss.mmm`, either separator, hours optional. */
const TIMESTAMP = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;
const CUE_TIMING = new RegExp(
  `^\\s*${TIMESTAMP.source}\\s*-->\\s*${TIMESTAMP.source}`
);

const toMs = (
  hours: string | undefined,
  minutes: string,
  seconds: string,
  fraction: string
): number =>
  Number(hours ?? 0) * 3_600_000 +
  Number(minutes) * 60_000 +
  Number(seconds) * 1000 +
  Number(fraction.padEnd(3, "0"));

/**
 * One cue tag: `<b>`, `<v Name>`, `<00:00:01.000>`. The class excludes `<` so
 * only the innermost tag matches, rather than one match swallowing a nested
 * pair from its opening bracket to the outer close.
 */
const CUE_TAG = /<[^<>]*>/g;

/**
 * Player markup, which is not part of what is said.
 *
 * Repeated to a fixed point. A single pass is incomplete sanitization: removing
 * the inner tag of `<scr<b>ipt>` splices the remains into `<script>`, a tag the
 * pass has already gone past. Each pass deletes at least two characters, so the
 * loop ends. Text with a bare `<` and no `>` is left alone — a subtitle saying
 * "if x < y" is words, not markup.
 */
const stripMarkup = (text: string): string => {
  let out = text;
  let previous = "";
  while (out !== previous) {
    previous = out;
    out = out.replace(CUE_TAG, "");
  }
  return out.replace(/\s+/g, " ").trim();
};

/**
 * Read an SRT or WebVTT file. Cues with no words, and cues that end before
 * they start, are dropped rather than becoming lines nobody can voice. Throws
 * when the file holds no cue at all — the upload card writes nothing and shows
 * the notice.
 */
export function parseSrt(source: string): SubtitleImport {
  const blocks = source
    // A byte-order mark, which a subtitle file exported on Windows often has.
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/);

  const lines: SubtitleLine[] = [];
  for (const block of blocks) {
    const rows = block.split("\n").filter((row) => row.trim() !== "");
    if (rows.length === 0) continue;
    if (NON_CUE_BLOCK.test(rows[0].trim())) continue;
    if (/^WEBVTT\b/.test(rows[0].trim())) {
      rows.shift();
      if (rows.length === 0) continue;
    }

    // A cue may open with an index (SRT) or an identifier (VTT); the timing
    // row is the one that matches, wherever it sits.
    const timingIndex = rows.findIndex((row) => CUE_TIMING.test(row));
    if (timingIndex < 0) continue;
    const timing = CUE_TIMING.exec(rows[timingIndex]);
    if (!timing) continue;

    const startMs = toMs(timing[1], timing[2], timing[3], timing[4]);
    const endMs = toMs(timing[5], timing[6], timing[7], timing[8]);
    const text = stripMarkup(rows.slice(timingIndex + 1).join(" "));
    if (text === "" || endMs <= startMs) continue;

    lines.push({ text, startMs, endMs, durationMs: endMs - startMs });
  }

  if (lines.length === 0) {
    throw new Error("This subtitle file holds no cues.");
  }

  return {
    lines,
    speakerName: NARRATOR,
    text: lines.map((line) => line.text).join("\n")
  };
}

export default parseSrt;
