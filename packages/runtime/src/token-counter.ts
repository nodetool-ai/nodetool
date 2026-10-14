/**
 * Synchronous token budgeting with a calibrated estimate until the optional
 * cl100k_base encoder is ready. Long BPE runs remain bounded below.
 */
import { importOptionalModule } from "@nodetool-ai/config";

interface Encoder {
  encode(text: string, allowedSpecial: string[], disallowedSpecial: string[]): number[];
  decode(tokens: number[]): string;
}

let cachedEncoder: Encoder | null = null;
let initialization: Promise<void> | undefined;

/** Start one optional load. Async callers can await exact counting readiness. */
export function initializeTokenCounter(): Promise<void> {
  // Start inside the chain: this runs on module load, so a loader that throws
  // synchronously must reject here instead of failing every importer.
  initialization ??= Promise.resolve()
    .then(() =>
      importOptionalModule<{
        getEncoding(name: "cl100k_base"): Encoder;
      }>("js-tiktoken")
    )
    .then((library) => {
      cachedEncoder = library.getEncoding("cl100k_base");
    })
    .catch(() => {
      // Token budgeting remains available when the optional encoder cannot load.
    });
  return initialization;
}

// Do not block synchronous callers or startup on loading the encoding tables.
void initializeTokenCounter();

/**
 * ASCII letters and whitespace use 4.5 chars/token, digits use 3, punctuation uses
 * 2 chars/token. CJK needs separate weights: Han 1, kana 0.8, Hangul 1.25
 * tokens/character. Calibration fixtures stay between exact and 35% over.
 * These are budgeting estimates, not universal BPE upper bounds.
 * Integer units avoid rounding drift in long inputs. No splitting is needed.
 */
function characterUnits(code: number): number {
  if (code < 128) {
    if (code >= 48 && code <= 57) {
      return 60;
    }
    const letter =
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122);
    return letter || code === 32 || (code >= 9 && code <= 13) ? 40 : 90;
  }
  if (code >= 0x3040 && code <= 0x30ff) {
    return 144;
  }
  if (code >= 0xac00 && code <= 0xd7af) {
    return 225;
  }
  return code > 0xffff ? 540 : 180;
}

function estimateTokens(text: string): number {
  let units = 0;
  for (const character of text) {
    units += characterUnits(character.codePointAt(0) ?? 0);
  }
  return Math.ceil(units / 180);
}

/**
 * js-tiktoken's pure-JS BPE is O(n²) within a single regex "piece", so a long
 * run of characters with no internal whitespace (a hash, base64 blob, or a
 * `"x".repeat(20000)` tool result) can take tens of seconds to encode.
 *
 * To bound that, the input is split *before* each whitespace run so every piece
 * keeps its leading whitespace — these boundaries coincide with cl100k's own
 * regex-piece boundaries, so summing the per-piece counts is exact for normal
 * text. Whitespace-delimited pieces are then packed up to {@link PACK_LIMIT}
 * chars to keep the number of `encode` calls small; a single boundary-free run
 * longer than {@link RUN_LIMIT} is hard-split, capping the worst case (~0.4s
 * for a 50k-char unbroken run instead of minutes).
 */
const PACK_LIMIT = 4096;
const RUN_LIMIT = 128;

/**
 * Split text into bounded pieces for encoding. Splitting *before* each
 * whitespace run keeps the leading whitespace with each piece, so the cut
 * points coincide with cl100k's own regex-piece boundaries — per-piece token
 * counts therefore sum exactly for normal text. Whitespace-delimited pieces are
 * packed up to {@link PACK_LIMIT} chars to keep the `encode` call count low; a
 * single boundary-free run longer than {@link RUN_LIMIT} is hard-split.
 */
function* encodingPieces(text: string): Generator<string> {
  let buf = "";
  for (const segment of text.split(/(?=\s)/)) {
    if (segment.length > RUN_LIMIT) {
      // A boundary-free run — hard-split it to bound the per-piece BPE cost.
      if (buf) {
        yield buf;
        buf = "";
      }
      for (let i = 0; i < segment.length; ) {
        let end = Math.min(i + RUN_LIMIT, segment.length);
        // Never cut between a surrogate pair: if the last code unit of the
        // slice is a high surrogate, back off by one so the astral character
        // stays whole. Splitting it would encode each half as U+FFFD, both
        // overcounting tokens and leaving a replacement char in truncated text.
        if (
          end < segment.length &&
          segment.charCodeAt(end - 1) >= 0xd800 &&
          segment.charCodeAt(end - 1) <= 0xdbff
        ) {
          end -= 1;
        }
        yield segment.slice(i, end);
        i = end;
      }
      continue;
    }
    if (buf.length + segment.length > PACK_LIMIT) {
      yield buf;
      buf = segment;
    } else {
      buf += segment;
    }
  }
  if (buf) {
    yield buf;
  }
}

/**
 * Count tokens exactly when ready, otherwise estimate. Empty/nullish input is 0.
 */
export function countTokens(text: string | null | undefined): number {
  if (!text) return 0;
  const encoder = cachedEncoder;
  if (encoder === null) {
    return estimateTokens(text);
  }
  let total = 0;
  for (const piece of encodingPieces(text)) {
    total += encoder.encode(piece, [], []).length;
  }
  return total;
}

/**
 * Truncate text to at most `maxTokens` counted tokens, decoding the exact prefix
 * back to a string. Returns "" when `maxTokens <= 0`.
 *
 * Encodes piece-by-piece (same splitting as {@link countTokens}) and stops once
 * the budget is reached, so it never feeds a huge boundary-free run to `encode`
 * in one shot — the input is bounded the same way the count is.
 *
 * A token boundary can fall in the middle of a multi-byte UTF-8 character, so
 * decoding the kept prefix can leave a trailing U+FFFD replacement character or
 * a lone UTF-16 surrogate. Any such trailing partial character is stripped so
 * the result is always well-formed text.
 */
export function truncateToTokens(text: string, maxTokens: number): string {
  if (maxTokens <= 0) return "";
  const encoder = cachedEncoder;
  if (encoder === null) {
    let units = 0;
    let end = 0;
    for (const character of text) {
      units += characterUnits(character.codePointAt(0) ?? 0);
      if (Math.ceil(units / 180) > maxTokens) {
        break;
      }
      end += character.length;
    }
    return stripTrailingPartialChar(text.slice(0, end));
  }
  const kept: number[] = [];
  let truncated = false;
  for (const piece of encodingPieces(text)) {
    for (const token of encoder.encode(piece, [], [])) {
      if (kept.length >= maxTokens) {
        truncated = true;
        break;
      }
      kept.push(token);
    }
    if (truncated) break;
  }
  // Within budget: return the original text untouched (no decode round-trip).
  if (!truncated) return text;
  return stripTrailingPartialChar(encoder.decode(kept));
}

/**
 * Drop a trailing partial character left by cutting at a token boundary: a
 * U+FFFD replacement char (an incomplete UTF-8 sequence), a lone high surrogate
 * (an incomplete UTF-16 pair), or a lone low surrogate not preceded by a high
 * surrogate (a dangling second half of a pair).
 */
function stripTrailingPartialChar(text: string): string {
  let end = text.length;
  while (end > 0) {
    const code = text.charCodeAt(end - 1);
    if (code === 0xfffd || (code >= 0xd800 && code <= 0xdbff)) {
      end -= 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      // Trailing low surrogate: only a valid pair if preceded by a high
      // surrogate. If it is, leave the pair intact; otherwise strip the lone
      // low surrogate.
      const prev = end >= 2 ? text.charCodeAt(end - 2) : 0;
      if (prev >= 0xd800 && prev <= 0xdbff) break;
      end -= 1;
    } else {
      break;
    }
  }
  return end === text.length ? text : text.slice(0, end);
}
