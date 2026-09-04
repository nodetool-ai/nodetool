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
/**
 * A value `JSON.parse` can produce — the only shapes that survive a JSON round
 * trip, and therefore the only ones that cross a text or WASM boundary.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export function extractJSON(text: string): JsonValue | null {
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

/**
 * The largest reply {@link salvageTruncatedJSON} will try to repair.
 *
 * Repair walks candidate cut points and re-parses at each, so an unbounded
 * input is quadratic. A judge reply that runs past this is not a truncated
 * object; it is something else.
 */
const MAX_SALVAGE_CHARS = 200_000;

/** How many cut points a single salvage may try before giving up. */
const MAX_SALVAGE_ATTEMPTS = 300;

/** Characters that can legally end a complete JSON value. */
const VALUE_END = new Set([
  "}",
  "]",
  '"',
  "e", // true / false
  "l", // null
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9"
]);

/**
 * Recover the complete prefix of a JSON object that was cut off mid-write.
 *
 * A vision judge asked for `{"verdict": …, "defects": […]}` and stopped at its
 * token ceiling three defects in. {@link extractJSON} returns null for that —
 * every strategy needs a balanced document — so the caller reported "did not
 * return parseable JSON" and threw away a verdict and two usable defects that
 * were fully written.
 *
 * This drops the incomplete tail: it walks back from the end to the last point
 * where a value had just closed, closes the brackets that were still open
 * there, and parses that. Returns null when nothing parses — a reply that is
 * not JSON at all stays an error, and a *complete* document is
 * {@link extractJSON}'s job, so try that first.
 */
export function salvageTruncatedJSON(text: string): JsonValue | null {
  if (text.length > MAX_SALVAGE_CHARS) return null;
  const fence = text.match(/```(?:json)?\s*\n?([\s\S]*)$/);
  const body = fence?.[1] ?? text;
  const start = (() => {
    const brace = body.indexOf("{");
    const bracket = body.indexOf("[");
    if (brace === -1) return bracket;
    if (bracket === -1) return brace;
    return Math.min(brace, bracket);
  })();
  if (start === -1) return null;

  // Forward pass: for every index, the bracket stack in force and whether the
  // scanner is inside a string literal there.
  const stacks: string[][] = [];
  const inString: boolean[] = [];
  const stack: string[] = [];
  let open = false;
  let escape = false;
  for (let i = start; i < body.length; i++) {
    stacks.push([...stack]);
    inString.push(open);
    const ch = body[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (open) {
      if (ch === "\\") escape = true;
      else if (ch === '"') open = false;
      continue;
    }
    if (ch === '"') open = true;
    else if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }
  stacks.push([...stack]);
  inString.push(open);

  let attempts = 0;
  for (let cut = body.length; cut > start; cut--) {
    const rel = cut - start;
    if (inString[rel]) continue;
    const prev = body[cut - 1];
    if (!VALUE_END.has(prev)) continue;
    const closers = stacks[rel];
    if (closers.length === 0) continue; // a balanced document is extractJSON's
    if (++attempts > MAX_SALVAGE_ATTEMPTS) break;
    const candidate = body.slice(start, cut) + closers.slice().reverse().join("");
    try {
      return JSON.parse(candidate) as JsonValue;
    } catch {
      // keep walking back
    }
  }
  return null;
}

/**
 * {@link extractJSON}, falling back to {@link salvageTruncatedJSON}.
 *
 * For callers where a partial answer beats no answer — a critique whose
 * defects list was cut short is still a critique. Never use it where a
 * truncated document would be mistaken for a complete instruction.
 */
export function extractJSONAllowingTruncation(text: string): JsonValue | null {
  return extractJSON(text) ?? salvageTruncatedJSON(text);
}
