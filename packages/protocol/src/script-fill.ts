/**
 * @nodetool-ai/protocol — Filling a template script.
 *
 * A script written once and approved becomes a template when its lines carry
 * `{{key}}` placeholders: a batch fills them per row and voices the result.
 * {@link fillScript} is that substitution, pure, so the `nodetool.script.FillScript`
 * node, an agent capability and the editor all fill a script the same way.
 *
 * Two rules the tests pin:
 *
 * - **An unresolved placeholder stays.** A key with no value is reported in
 *   `unresolved` and left in the text verbatim. Blanking it would ship a line
 *   reading "Buy  today" and nothing downstream could tell that from an
 *   authored gap.
 * - **Takes survive.** A line's `takes` and `currentTakeId` ride through
 *   untouched. Staleness is derived, not stored: `needsVoicing`
 *   (`@nodetool-ai/timeline`) compares each take's `textSnapshot` against the
 *   line's text, so a line whose text moved is already stale and a line that
 *   held still is already voiced. A later `VoiceScript` therefore pays only
 *   for the lines the fill actually changed.
 */

import type { ScriptDocumentSchema } from "./api-schemas/scripts.js";

/**
 * The placeholder grammar: `{{key}}`, with optional inner whitespace. A key is
 * a word plus `.`/`-`, which covers the CSV column names a batch fills from.
 * `fillTimelineText` (`@nodetool-ai/timeline`) matches the same grammar, so a
 * script and the cut's text overlay accept one set of values.
 */
const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_][A-Za-z0-9_.-]*)\s*\}\}/g;

export interface FillScriptResult {
  /** A new document; the input is never mutated. */
  document: ScriptDocumentSchema;
  /** Keys that were substituted at least once, in first-seen order. */
  filled: string[];
  /** Keys the text names that `values` has no entry for, in first-seen order. */
  unresolved: string[];
}

/** Substitute one string, recording which keys resolved and which did not. */
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

/**
 * Fill `{{key}}` placeholders in every line's text.
 *
 * Only `ScriptLine.text` is filled — a speaker name or a section title is
 * structure, not spoken words. Lines with no placeholder come back by
 * reference, so a caller can tell what the fill touched by identity.
 */
export function fillScript(
  doc: ScriptDocumentSchema,
  values: Record<string, string>
): FillScriptResult {
  const filled = new Set<string>();
  const unresolved = new Set<string>();

  const sections = doc.sections.map((section) => {
    let changed = false;
    const lines = section.lines.map((line) => {
      const text = fillText(line.text, values, filled, unresolved);
      if (text === line.text) return line;
      changed = true;
      return { ...line, text };
    });
    return changed ? { ...section, lines } : section;
  });

  return {
    document: { ...doc, sections },
    filled: [...filled],
    unresolved: [...unresolved]
  };
}
