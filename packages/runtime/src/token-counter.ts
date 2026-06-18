/**
 * Accurate token counting via js-tiktoken.
 *
 * All token counting in the codebase routes through this module so estimates
 * match the BPE tokenization real models use instead of char- or word-based
 * approximations. Uses the `cl100k_base` encoding (GPT-3.5/4 family), a good
 * general-purpose proxy across providers for budgeting, packing and eviction.
 *
 * The encoder is built once and cached — `getEncoding` bundles the BPE ranks,
 * so there is no I/O after the first call.
 */

import { getEncoding, type Tiktoken } from "js-tiktoken";

let cachedEncoder: Tiktoken | null = null;

function getEncoder(): Tiktoken {
  if (cachedEncoder === null) {
    cachedEncoder = getEncoding("cl100k_base");
  }
  return cachedEncoder;
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
 * Count BPE tokens in a string. Returns 0 for empty/nullish input.
 */
export function countTokens(text: string | null | undefined): number {
  if (!text) return 0;
  const encoder = getEncoder();
  let total = 0;
  let buf = "";
  for (const segment of text.split(/(?=\s)/)) {
    if (segment.length > RUN_LIMIT) {
      // A boundary-free run — hard-split it to bound the per-piece BPE cost.
      if (buf) {
        total += encoder.encode(buf).length;
        buf = "";
      }
      for (let i = 0; i < segment.length; i += RUN_LIMIT) {
        total += encoder.encode(segment.slice(i, i + RUN_LIMIT)).length;
      }
      continue;
    }
    if (buf.length + segment.length > PACK_LIMIT) {
      total += encoder.encode(buf).length;
      buf = segment;
    } else {
      buf += segment;
    }
  }
  if (buf) {
    total += encoder.encode(buf).length;
  }
  return total;
}

/**
 * Truncate text to at most `maxTokens` BPE tokens, decoding the kept prefix
 * back to a string. Returns "" when `maxTokens <= 0`.
 */
export function truncateToTokens(text: string, maxTokens: number): string {
  if (maxTokens <= 0) return "";
  const encoder = getEncoder();
  const tokens = encoder.encode(text);
  if (tokens.length <= maxTokens) return text;
  return encoder.decode(tokens.slice(0, maxTokens));
}
