/**
 * yt-dlp format selectors, split so yt-dlp never merges.
 *
 * yt-dlp merges a `+` selector (`bv*+ba`) with the ffmpeg binary. NodeTool
 * ships no ffmpeg, so a caller downloads each side of the top-level `+` with
 * its own yt-dlp call and muxes the two files in process with
 * `muxStreamCopy` from `@nodetool-ai/runtime/media`.
 */

/** What NodeTool asks for when no selector is given: best picture, best sound. */
export const DEFAULT_YT_DLP_FORMAT = "bv*+ba/b";

/**
 * Split `selector` on its top-level `+`.
 *
 * The result has one component (download one file, no mux) or two (the
 * video side, then the audio side). A `/` fallback stays inside its component
 * for yt-dlp to resolve, so `bv+ba/b` splits into `bv` and `ba/b`. A `+`
 * inside `[...]` is part of a filter and does not split. A `+` inside `(...)`
 * is a merge this cannot split, so it throws, as do unbalanced brackets, an
 * empty side, more than two sides, and a top-level `,` beside a `+`.
 */
export function splitYtDlpFormat(selector: string): string[] {
  const text = selector.trim();
  if (!text) throw new Error("The format selector is empty");
  const cuts: number[] = [];
  let depth = 0;
  let inFilter = false;
  let quote: string | null = null;
  let plusInGroup = false;
  let commaAtTop = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (inFilter) {
      if (ch === "'" || ch === '"') quote = ch;
      else if (ch === "]") inFilter = false;
      continue;
    }
    if (ch === "[") inFilter = true;
    else if (ch === "]") throw new Error(`Format selector "${text}" has a "]" with no "["`);
    else if (ch === "(") depth += 1;
    else if (ch === ")") {
      if (depth === 0) throw new Error(`Format selector "${text}" has a ")" with no "("`);
      depth -= 1;
    } else if (ch === "+") {
      if (depth > 0) plusInGroup = true;
      else cuts.push(i);
    } else if (ch === "," && depth === 0) {
      commaAtTop = true;
    }
  }
  if (inFilter || quote) throw new Error(`Format selector "${text}" has an unclosed "["`);
  if (depth > 0) throw new Error(`Format selector "${text}" has an unclosed "("`);
  if (plusInGroup) {
    throw new Error(
      `Format selector "${text}" merges inside parentheses. NodeTool merges ` +
        `without ffmpeg only at the top level: write it as "<video>+<audio>".`
    );
  }
  if (cuts.length === 0) return [text];
  if (commaAtTop) {
    throw new Error(
      `Format selector "${text}" mixes "," and "+". Ask for one video and ` +
        `one audio format, as "<video>+<audio>".`
    );
  }
  if (cuts.length > 1) {
    throw new Error(
      `Format selector "${text}" merges ${cuts.length + 1} formats. NodeTool ` +
        `muxes one video and one audio format, as "<video>+<audio>".`
    );
  }
  const parts = [text.slice(0, cuts[0]).trim(), text.slice(cuts[0] + 1).trim()];
  if (parts.some((part) => part.length === 0)) {
    throw new Error(`Format selector "${text}" has an empty side of "+"`);
  }
  return parts;
}
