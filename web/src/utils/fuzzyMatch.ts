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
 *   0.375– 0.50  query is a near-miss typo of the text or one of its words —
 *                a bounded edit distance corrects substitutions/transpositions
 *   0            no plausible match
 *
 * Within each tier, shorter texts (query length closer to text length) score
 * slightly higher, so "Add" beats "Add Column" for the query "add".
 */

// Char-code test rather than a regex: this runs once per character of every
// candidate text, for every node in the catalog, on every keystroke.
const isWordCharCode = (code: number): boolean =>
  (code >= 97 && code <= 122) || // a-z
  (code >= 48 && code <= 57) || // 0-9
  (code >= 65 && code <= 90); // A-Z

const isWordChar = (ch: string): boolean => isWordCharCode(ch.charCodeAt(0));

const atWordBoundary = (text: string, index: number): boolean =>
  index === 0 || !isWordChar(text[index - 1]);

/** Set of characters in `s[from, to)`, hashed into a 32-bit mask. */
const charMask = (s: string, from: number, to: number): number => {
  let mask = 0;
  for (let i = from; i < to; i++) {
    mask |= 1 << (s.charCodeAt(i) & 31);
  }
  return mask;
};

const popcount = (n: number): number => {
  let bits = n - ((n >>> 1) & 0x55555555);
  bits = (bits & 0x33333333) + ((bits >>> 2) & 0x33333333);
  return (((bits + (bits >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
};

// Three rotating rows of the DP table, reused across calls — a typo pass over
// the catalog runs this tens of thousands of times per keystroke, and a fresh
// row per iteration was most of its cost. Sharing them is safe because the
// function is synchronous and never re-enters, and it fully rewrites a row
// before reading it.
let dpTwoAgo: number[] = [];
let dpOneAgo: number[] = [];
let dpCurrent: number[] = [];

/**
 * Optimal string alignment distance (Levenshtein plus adjacent
 * transpositions), short-circuited once every cell in a row exceeds `max`.
 * Returns `max + 1` as soon as the distance is known to exceed the budget, so
 * distant pairs bail after a couple of rows instead of filling the whole table.
 */
const editDistanceWithinBudget = (
  a: string,
  b: string,
  max: number
): number => {
  const al = a.length;
  const bl = b.length;
  if (Math.abs(al - bl) > max) {
    return max + 1;
  }
  if (dpOneAgo.length < bl + 1) {
    dpTwoAgo = new Array<number>(bl + 1);
    dpOneAgo = new Array<number>(bl + 1);
    dpCurrent = new Array<number>(bl + 1);
  }
  let twoAgo = dpTwoAgo;
  let oneAgo = dpOneAgo;
  let current = dpCurrent;
  for (let j = 0; j <= bl; j++) {
    oneAgo[j] = j;
  }
  for (let i = 1; i <= al; i++) {
    current[0] = i;
    let rowMin = i;
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(
        oneAgo[j] + 1, // deletion
        current[j - 1] + 1, // insertion
        oneAgo[j - 1] + cost // substitution
      );
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        d = Math.min(d, twoAgo[j - 2] + 1); // adjacent transposition
      }
      current[j] = d;
      if (d < rowMin) {
        rowMin = d;
      }
    }
    if (rowMin > max) {
      return max + 1;
    }
    const recycled = twoAgo;
    twoAgo = oneAgo;
    oneAgo = current;
    current = recycled;
  }
  return oneAgo[bl];
};

/**
 * Lowest tier: the query is not a subsequence but is a near-miss typo of the
 * whole text or one of its words. The edit budget grows with query length
 * (`floor(len / 4)`), so 4–7 char queries tolerate one edit, 8–11 tolerate two,
 * and 1–3 char queries tolerate none — short queries are too ambiguous for typo
 * correction. Because the budget stays under a quarter of the length, corrected
 * matches always land in [0.375, 0.5), below every contiguous-match tier.
 */
const typoScore = (q: string, t: string): number => {
  const budget = Math.floor(q.length / 4);
  if (budget === 0) {
    return 0;
  }

  // A character of `q` that the candidate does not contain costs at least one
  // edit to remove, so a candidate missing more than `budget` of them cannot
  // be within budget. `charMask` hashes characters into 32 bits, which only
  // ever makes the test more permissive (collisions hide a missing
  // character), so the exact DP still decides everything it lets through.
  const qMask = charMask(q, 0, q.length);

  let best = 0;
  const consider = (unit: string, unitMask: number): void => {
    if (popcount(qMask & ~unitMask) > budget) {
      return;
    }
    const dist = editDistanceWithinBudget(q, unit, budget);
    if (dist > budget) {
      return;
    }
    const similarity = 1 - dist / Math.max(q.length, unit.length);
    if (similarity > best) {
      best = similarity;
    }
  };

  if (Math.abs(t.length - q.length) <= budget) {
    consider(t, charMask(t, 0, t.length));
  }

  // Walk the word spans in place. Splitting on a regex would allocate an
  // array of every word in the text for every candidate on every keystroke,
  // and nearly all of those words are rejected by the length or mask test
  // anyway.
  let wordStart = -1;
  let wordMask = 0;
  for (let i = 0; i <= t.length; i++) {
    if (i < t.length) {
      const code = t.charCodeAt(i);
      if (isWordCharCode(code)) {
        if (wordStart === -1) {
          wordStart = i;
          wordMask = 0;
        }
        wordMask |= 1 << (code & 31);
        continue;
      }
    }
    if (wordStart !== -1) {
      if (Math.abs(i - wordStart - q.length) <= budget) {
        consider(t.slice(wordStart, i), wordMask);
      }
      wordStart = -1;
    }
  }
  return 0.5 * best;
};

export function fuzzyScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  const t = text.toLowerCase();
  if (q.length === 0 || t.length === 0) {
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
      // Not a subsequence — fall back to bounded typo correction.
      return typoScore(q, t);
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
