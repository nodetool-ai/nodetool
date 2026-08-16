/**
 * `@nodetool-ai/sandbox-mammoth` — mammoth, on the host.
 *
 * mammoth reads a `.docx` buffer through Node's zip/XML stack; it is not a
 * guest-module candidate. The guest gets plain text or HTML back.
 */

import { requireBytes, unwrapLibrary } from "./limits.js";

interface MammothResult {
  value: string;
  messages: unknown[];
}
interface MammothLike {
  extractRawText: (input: { buffer: Buffer }) => Promise<MammothResult>;
  convertToHtml: (input: { buffer: Buffer }) => Promise<MammothResult>;
}

async function loadMammoth(where: string): Promise<MammothLike> {
  const mod: unknown = await import("mammoth");
  return unwrapLibrary<MammothLike>(
    mod,
    where,
    "mammoth",
    (v) => typeof (v as MammothLike | undefined)?.extractRawText === "function"
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

/** A Word document rendered as HTML — headings, lists, tables, and images kept. */
export async function convertToHtml(bytes: unknown): Promise<string> {
  const where = "mammoth.convertToHtml";
  const buffer = Buffer.from(requireBytes(where, bytes));
  const mammoth = await loadMammoth(where);
  const result = await mammoth.convertToHtml({ buffer });
  return result.value;
}
