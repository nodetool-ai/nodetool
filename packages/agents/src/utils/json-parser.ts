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
  const trimmed = text.trim();

  // Strategy 1: direct parse
  try {
    return JSON.parse(trimmed);
  } catch {
    // continue
  }

  // Strategy 2: fenced code block
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch?.[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // continue
    }
  }

  // Strategy 3: balanced braces
  const startIdx = trimmed.indexOf("{");
  if (startIdx !== -1) {
    let depth = 0;
    let inString = false;
    let escape = false;
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
      if (ch === "{") depth++;
      if (ch === "}") {
        depth--;
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
