/**
 * Dependency-free fuzzy string scorer (replaces the old fuse.js fallback).
 *
 * `fuzzyScore(query, text)` returns a score in [0, 1], higher = better:
 *
 *   1.0          exact match (case-insensitive)
 *   0.85 – 0.95  query is a prefix of the text
 *   0.70 – 0.80  query is a substring starting at a word boundary
 *   0.55 – 0.65  query is a substring elsewhere
 *   0    – 0.50  query is a scattered subsequence — denser, more consecutive,
 *                boundary-aligned matches score higher
 *   0            no match (query is not a subsequence of the text)
 *
 * Within each tier, shorter texts (query length closer to text length) score
 * slightly higher, so "Add" beats "Add Column" for the query "add".
 */

const isWordChar = (ch: string): boolean => /[a-z0-9]/i.test(ch);

const atWordBoundary = (text: string, index: number): boolean =>
  index === 0 || !isWordChar(text[index - 1]);

export function fuzzyScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  const t = text.toLowerCase();
  if (q.length === 0 || t.length === 0 || q.length > t.length) {
    return 0;
  }
  if (q === t) {
    return 1;
  }

  // Length affinity in (0, 1): rewards texts close in length to the query.
  const affinity = q.length / t.length;

  if (t.startsWith(q)) {
    return 0.85 + 0.1 * affinity;
  }

  const substringIndex = t.indexOf(q);
  if (substringIndex !== -1) {
    return atWordBoundary(t, substringIndex)
      ? 0.7 + 0.1 * affinity
      : 0.55 + 0.1 * affinity;
  }

  // Greedy leftmost subsequence match. A contiguous match anywhere in the
  // text was already handled above, so any match found here has gaps.
  let textIndex = 0;
  let firstMatch = -1;
  let previousMatch = -2;
  let consecutive = 0;
  let boundaryHits = 0;
  for (let queryIndex = 0; queryIndex < q.length; queryIndex++) {
    const ch = q[queryIndex];
    while (textIndex < t.length && t[textIndex] !== ch) {
      textIndex++;
    }
    if (textIndex >= t.length) {
      return 0;
    }
    if (firstMatch === -1) {
      firstMatch = textIndex;
    }
    if (textIndex === previousMatch + 1) {
      consecutive++;
    }
    if (atWordBoundary(t, textIndex)) {
      boundaryHits++;
    }
    previousMatch = textIndex;
    textIndex++;
  }

  const span = previousMatch - firstMatch + 1;
  // span > q.length here (contiguous matches returned earlier), so
  // density < 1 and the subsequence tier stays strictly below 0.5.
  const density = q.length / span;
  const consecutiveRatio = q.length > 1 ? consecutive / (q.length - 1) : 1;
  const boundaryRatio = boundaryHits / q.length;
  return (
    0.5 *
    (0.55 * density +
      0.25 * consecutiveRatio +
      0.15 * boundaryRatio +
      0.05 * affinity)
  );
}
