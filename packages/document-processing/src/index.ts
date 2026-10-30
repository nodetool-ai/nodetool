import type { ParseResult } from "@llamaindex/liteparse";

/** Load the explicitly installed PDF parser without launching it at import time. */
export async function loadLiteParse(): Promise<typeof import("@llamaindex/liteparse")> {
  return import("@llamaindex/liteparse");
}

/** Parse document bytes using the same parser as the full server. */
export async function parsePdfBuffer(buffer: Buffer): Promise<ParseResult> {
  const { LiteParse } = await loadLiteParse();
  return new LiteParse({ ocrEnabled: false }).parse(buffer, true);
}

export interface PdfTextResult { readonly text: string; readonly pages: number }

/** Extract the PDF text layer, leaving scanned pages empty. */
export async function extractPdfText(buffer: Buffer): Promise<PdfTextResult> {
  const result = await parsePdfBuffer(buffer);
  return { text: result.pages.map((page) => page.text).join("\n\n").trim(), pages: result.pages.length };
}
