/**
 * `@nodetool-ai/sandbox-csv` — papaparse, on the host.
 *
 * papaparse imports `node:stream`, so the sandbox compiler cannot admit it as a
 * guest module. It runs here instead, behind the generated facade, and the
 * guest sees plain arrays.
 */

import { optionsOf, requireText, unwrapLibrary } from "./limits.js";
import { isFunction, isObjectLike } from "../utils/type-guards.js";

interface PapaparseLike {
  parse: (
    input: string,
    config?: Record<string, unknown>
  ) => { data?: unknown; errors?: { message?: string }[] };
  unparse: (input: unknown, config?: Record<string, unknown>) => string;
}

async function loadPapaparse(where: string): Promise<PapaparseLike> {
  const mod: unknown = await import("papaparse");
  return unwrapLibrary<PapaparseLike>(
    mod,
    where,
    "papaparse",
    (v) => isFunction((v as PapaparseLike | undefined)?.parse)
  );
}

/**
 * CSV text to records keyed by the header row, or raw rows with `header: false`.
 *
 * Values stay strings — no `dynamicTyping` — so a column never changes shape
 * between runs; guest code converts what it needs with `Number()`/`Date`.
 */
export async function parse(
  text: unknown,
  options?: unknown
): Promise<unknown[]> {
  const where = "csv.parse";
  const input = requireText(where, text);
  const opts = optionsOf(options);
  const header = opts.header === undefined ? true : Boolean(opts.header);
  // papaparse treats "" as auto-detect.
  const delimiter =
    opts.delimiter === undefined || opts.delimiter === null
      ? ""
      : String(opts.delimiter);
  if (delimiter.length > 1) {
    throw new Error(`${where}: delimiter must be a single character`);
  }
  const papa = await loadPapaparse(where);
  const parsed = papa.parse(input, {
    header,
    delimiter,
    dynamicTyping: false,
    skipEmptyLines: true
  });
  const rows = Array.isArray(parsed.data) ? parsed.data : [];
  return header
    ? rows.filter((row) => isObjectLike(row))
    : rows.filter((row) => Array.isArray(row));
}

/** Records or row arrays back out as CSV text — the inverse of {@link parse}. */
export async function stringify(
  rows: unknown,
  options?: unknown
): Promise<string> {
  const where = "csv.stringify";
  if (!Array.isArray(rows)) {
    throw new Error(`${where}: rows must be an array of records or arrays`);
  }
  const opts = optionsOf(options);
  const delimiter =
    opts.delimiter === undefined || opts.delimiter === null
      ? ","
      : String(opts.delimiter);
  if (delimiter.length !== 1) {
    throw new Error(`${where}: delimiter must be a single character`);
  }
  const papa = await loadPapaparse(where);
  return papa.unparse(rows, {
    delimiter,
    header: opts.header === undefined ? true : Boolean(opts.header),
    newline: "\n"
  });
}
