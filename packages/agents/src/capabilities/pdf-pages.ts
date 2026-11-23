/**
 * PDF text extraction shared by the `documents` capabilities and the
 * text-document transfer. It imports nothing from either, so neither depends
 * on the other through it.
 */

import { importOptionalLibrary } from "../host-modules/limits.js";

export interface PdfExtraction {
  /** Per-page text arrays (one entry per page). */
  pages: string[];
  numPages: number;
}

/**
 * Extract text from a PDF buffer using @llamaindex/liteparse.
 * Returns per-page text so callers can slice by page range.
 */
export async function extractPdfPages(buffer: Uint8Array): Promise<PdfExtraction> {
  const { LiteParse } = await importOptionalLibrary<
    typeof import("@llamaindex/liteparse")
  >("documents", "@llamaindex/liteparse", "pdf-js");
  const parser = new LiteParse({ ocrEnabled: false });
  const result = await parser.parse(Buffer.from(buffer), true);
  const pages = result.pages.map((p) => p.text);
  return { pages, numPages: result.pages.length };
}
