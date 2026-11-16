/**
 * mammoth on the host, for the DOCX script import route
 * (`POST /api/documents/extract-text`).
 *
 * mammoth reads a `.docx` buffer through Node's zip/XML stack. No sandbox
 * pack exposes it.
 */

import {
  importOptionalLibrary,
  requireBytes,
  unwrapLibrary
} from "./limits.js";
import { isFunction } from "../utils/type-guards.js";

interface MammothResult {
  value: string;
  messages: unknown[];
}
interface MammothLike {
  extractRawText: (input: { buffer: Buffer }) => Promise<MammothResult>;
}

async function loadMammoth(where: string): Promise<MammothLike> {
  const mod = await importOptionalLibrary<unknown>(
    where,
    "mammoth",
    "office-documents"
  );
  return unwrapLibrary<MammothLike>(
    mod,
    where,
    "mammoth",
    (v) => isFunction((v as MammothLike | undefined)?.extractRawText)
  );
}

/** A Word document's text, with formatting discarded. */
export async function extractRawText(bytes: unknown): Promise<string> {
  const where = "mammoth.extractRawText";
  const buffer = Buffer.from(requireBytes(where, bytes));
  const mammoth = await loadMammoth(where);
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}
