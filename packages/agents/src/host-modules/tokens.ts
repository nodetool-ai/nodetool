/**
 * `@nodetool-ai/sandbox-tokens` — js-tiktoken, on the host.
 *
 * The BPE ranks for one encoding are several megabytes of base64 that the
 * compiler would have to inline into a guest bundle capped at 1 MB, so this
 * cannot be a guest module. It runs here, and the ranks load once per process
 * per encoding.
 *
 * This is what `nodetool.text.CountTokens` used to be.
 */

import { requireText, unwrapLibrary } from "./limits.js";
import { isFunction, isString } from "../utils/type-guards.js";

/** The encodings js-tiktoken ships ranks for, as the old node offered them. */
const ENCODINGS = ["cl100k_base", "p50k_base", "r50k_base", "o200k_base"] as const;

type EncodingName = (typeof ENCODINGS)[number];

interface Encoder {
  encode: (text: string) => number[];
  decode: (tokens: number[]) => string;
}

interface TiktokenLike {
  getEncoding: (name: EncodingName) => Encoder;
}

/** The encoding an argument names, defaulted, or a named error for the guest. */
function requireEncoding(where: string, value: unknown): EncodingName {
  if (value === undefined || value === null) return "cl100k_base";
  if (!isString(value) || !ENCODINGS.includes(value as EncodingName)) {
    throw new Error(
      `${where}: encoding must be one of ${ENCODINGS.join(", ")}`
    );
  }
  return value as EncodingName;
}

async function loadTiktoken(where: string): Promise<TiktokenLike> {
  const mod: unknown = await import("js-tiktoken");
  return unwrapLibrary<TiktokenLike>(mod, where, "js-tiktoken", (v) =>
    isFunction((v as TiktokenLike | undefined)?.getEncoding)
  );
}

const encoders = new Map<EncodingName, Encoder>();

async function encoderFor(where: string, encoding: EncodingName): Promise<Encoder> {
  const cached = encoders.get(encoding);
  if (cached !== undefined) return cached;
  const lib = await loadTiktoken(where);
  const encoder = lib.getEncoding(encoding);
  encoders.set(encoding, encoder);
  return encoder;
}

/** How many tokens `text` costs under `encoding` (default cl100k_base). */
export async function count(text: unknown, encoding?: unknown): Promise<number> {
  const where = "tokens.count";
  const value = requireText(where, text);
  if (value === "") return 0;
  const encoder = await encoderFor(where, requireEncoding(where, encoding));
  return encoder.encode(value).length;
}

/** The token ids `text` encodes to. */
export async function encode(
  text: unknown,
  encoding?: unknown
): Promise<number[]> {
  const where = "tokens.encode";
  const value = requireText(where, text);
  if (value === "") return [];
  const encoder = await encoderFor(where, requireEncoding(where, encoding));
  return encoder.encode(value);
}

/** The text a token id list decodes back to. */
export async function decode(
  tokens: unknown,
  encoding?: unknown
): Promise<string> {
  const where = "tokens.decode";
  if (!Array.isArray(tokens)) {
    throw new Error(`${where}: tokens must be an array of token ids`);
  }
  const ids = tokens.map((token) => {
    const id = Number(token);
    if (!Number.isInteger(id) || id < 0) {
      throw new Error(`${where}: tokens must be non-negative integers`);
    }
    return id;
  });
  if (ids.length === 0) return "";
  const encoder = await encoderFor(where, requireEncoding(where, encoding));
  return encoder.decode(ids);
}
