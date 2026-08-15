/**
 * `@nodetool-ai/sandbox-exif` — exifr, on the host.
 *
 * exifr reaches workers and DOM-ish globals the guest probe refuses.
 * The guest sends image bytes; this module returns a plain tag object.
 */

import { requireBytes, unwrapLibrary } from "./limits.js";

interface ExifrLike {
  parse: (input: Uint8Array, opts?: unknown) => Promise<Record<string, unknown> | undefined>;
}

async function loadExifr(where: string): Promise<ExifrLike> {
  const mod: unknown = await import("exifr");
  return unwrapLibrary<ExifrLike>(
    mod,
    where,
    "exifr",
    (v) => typeof (v as ExifrLike | undefined)?.parse === "function"
  );
}

export async function parse(bytes: unknown): Promise<Record<string, unknown> | null> {
  const where = "exif.parse";
  const exifr = await loadExifr(where);
  const tags = await exifr.parse(requireBytes(where, bytes));
  return tags ?? null;
}
