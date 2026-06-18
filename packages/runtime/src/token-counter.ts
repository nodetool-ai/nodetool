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
 * js-tiktoken's pure-JS BPE is O(n²) within a single regex "piece", so an
 * unbroken run of identical characters (e.g. a 20k-char blob with no
 * whitespace) can take tens of seconds to encode. Splitting the input into
 * fixed-size chunks caps that worst case: normal text is already broken on
 * whitespace/punctuation by the cl100k regex, so the only cost is an occasional
 * token split at a chunk boundary — a sub-percent over-count that is harmless
 * for the budgeting / packing / eviction use cases this module serves.
 */
const ENCODE_CHUNK_CHARS = 1024;

/**
 * Count BPE tokens in a string. Returns 0 for empty/nullish input.
 */
export function countTokens(text: string | null | undefined): number {
  if (!text) return 0;
  const encoder = getEncoder();
  if (text.length <= ENCODE_CHUNK_CHARS) {
    return encoder.encode(text).length;
  }
  let total = 0;
  for (let i = 0; i < text.length; i += ENCODE_CHUNK_CHARS) {
    total += encoder.encode(text.slice(i, i + ENCODE_CHUNK_CHARS)).length;
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
