/**
 * Filling a template cut's placeholders.
 *
 * A sequence approved once becomes a template when its text carries `{{key}}`:
 * a per-SKU batch fills the overlay ("{{name}} — {{price}}") and renders. This
 * is that substitution, pure, so the `nodetool.timeline.FillTimelineText` node
 * and any editor affordance fill a cut the same way.
 *
 * An unresolved key is reported and left in the text. Blanking it would ship a
 * frame reading "Aero 9 — " with nothing downstream able to tell that from an
 * authored dash.
 */

import type { TimelineClip, TimelineSequence } from "./types.js";

/**
 * The placeholder grammar, identical to `fillScript`'s in
 * `@nodetool-ai/protocol/script-fill.ts`: `{{key}}`, optional inner whitespace,
 * a key of word characters plus `.`/`-`. One grammar, so a script and the cut's
 * overlay accept the same value bag.
 */
const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_][A-Za-z0-9_.-]*)\s*\}\}/g;

export interface FillTimelineTextResult {
  /** A new sequence; the input is never mutated. */
  sequence: TimelineSequence;
  /** Keys that were substituted at least once, in first-seen order. */
  filled: string[];
  /** Keys the text names that `values` has no entry for, in first-seen order. */
  unresolved: string[];
}

function fillText(
  text: string,
  values: Record<string, string>,
  filled: Set<string>,
  unresolved: Set<string>
): string {
  return text.replace(PLACEHOLDER, (match, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(values, key)) {
      unresolved.add(key);
      return match;
    }
    filled.add(key);
    return values[key];
  });
}

/** One clip's text and caption words, filled. Unchanged clips come back as-is. */
function fillClip(
  clip: TimelineClip,
  values: Record<string, string>,
  filled: Set<string>,
  unresolved: Set<string>
): TimelineClip {
  let next = clip;

  const style = clip.textStyle;
  if (style) {
    const text = fillText(style.text, values, filled, unresolved);
    if (text !== style.text) {
      next = { ...next, textStyle: { ...style, text } };
    }
  }

  const caption = clip.caption;
  if (caption) {
    let changed = false;
    const words = caption.words.map((entry) => {
      const word = fillText(entry.word, values, filled, unresolved);
      if (word === entry.word) return entry;
      changed = true;
      return { ...entry, word };
    });
    if (changed) {
      next = { ...next, caption: { ...caption, words } };
    }
  }

  return next;
}

/**
 * Fill `{{key}}` placeholders in every text clip's authored text and in every
 * caption word.
 *
 * Nothing else is touched: a clip name, a marker label or a transcript line is
 * editor furniture, not what the frame draws.
 */
export function fillTimelineText(
  seq: TimelineSequence,
  values: Record<string, string>
): FillTimelineTextResult {
  const filled = new Set<string>();
  const unresolved = new Set<string>();
  const clips = seq.clips.map((clip) =>
    fillClip(clip, values, filled, unresolved)
  );
  return {
    sequence: { ...seq, clips },
    filled: [...filled],
    unresolved: [...unresolved]
  };
}
