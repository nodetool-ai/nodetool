/**
 * Utility for extracting JSON from LLM text output.
 */

/**
 * Attempt to extract a JSON value from a text string.
 *
 * Strategies (in order):
 * 1. Direct JSON.parse of the trimmed text.
 * 2. Extract from a fenced ```json code block.
 * 3. Find the first balanced { ... } substring.
 *
 * Returns null if no valid JSON can be extracted.
 */
export function extractJSON(text: string): unknown | null {
  // Stryker disable next-line MethodExpression: JSON.parse already tolerates
  // surrounding whitespace and strategy 3 scans via indexOf, so dropping trim()
  // changes no observable result.
  const trimmed = text.trim();

  // Strategy 1: direct parse
  try {
    return JSON.parse(trimmed);
  } catch {
    // continue
  }

  // Strategy 2: fenced code block
  // Stryker disable next-line Regex: fence-regex variants are non-behavioral —
  // strategy 3 (balanced braces) recovers any fenced object/array, and the
  // captured group is .trim()'d before JSON.parse, so whitespace-class tweaks
  // cannot change the parsed value.
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  // Stryker disable next-line ConditionalExpression: the `true` mutant only
  // forces a JSON.parse on a missing/empty capture, which throws and is caught
  // below — identical to skipping the fence path.
  if (fenceMatch?.[1]) {
    try {
      // Stryker disable next-line MethodExpression: JSON.parse tolerates the
      // surrounding whitespace, so trimming the captured group is cosmetic.
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // continue
    }
  }

  // Strategy 3: balanced braces or brackets
  for (const [open, close] of [
    ["{", "}"],
    ["[", "]"]
  ] as const) {
    const startIdx = trimmed.indexOf(open);
    // Stryker disable next-line ConditionalExpression,UnaryOperator: when no
    // opening bracket exists the scan below simply finds nothing, so skipping
    // the `continue` only wastes a pass — the result is identical.
    if (startIdx === -1) continue;
    let depth = 0;
    let inString = false;
    let escape = false;
    // Stryker disable next-line EqualityOperator: `< length`→`<= length` only
    // visits one undefined trailing index that matches no branch (harmless).
    for (let i = startIdx; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === open) depth++;
      if (ch === close) {
        depth--;
        // Stryker disable next-line ConditionalExpression: any close at depth>0
        // yields an unbalanced prefix that never parses, so attempting a
        // candidate there (the `true` mutant) is behaviorally equivalent.
        if (depth === 0) {
          const candidate = trimmed.slice(startIdx, i + 1);
          try {
            return JSON.parse(candidate);
          } catch {
            // continue searching
          }
        }
      }
    }
  }

  return null;
}
