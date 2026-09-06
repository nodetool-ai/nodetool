/**
 * PDF text extraction as a pure function: bytes in, per-page text out.
 *
 * The `lib.pdf.*` nodes resolve a document ref and carry the node-sdk registry
 * with them. Callers that only have a buffer — the websocket import route —
 * import this module instead, so they load liteparse (and its bundled pdfium)
 * without loading the nodes.
 */
import type { ParseResult } from "@llamaindex/liteparse";

/**
 * Parse a PDF buffer. `liteparse` is imported lazily because it pulls in
 * pdfium and pdf.js, which cost far more than this module's own load.
 */
export async function parsePdfBuffer(buffer: Buffer): Promise<ParseResult> {
  const { LiteParse } = await import("@llamaindex/liteparse");
  const parser = new LiteParse({ ocrEnabled: false });
  return parser.parse(buffer, true);
}

export interface PdfTextResult {
  /** Every page's text, joined by a blank line. Empty for a scanned PDF. */
  text: string;
  /** Pages liteparse could read. Zero means the file is not a readable PDF. */
  pages: number;
}

/** A PDF's whole text layer. No OCR: a scanned page contributes nothing. */
export async function extractPdfText(buffer: Buffer): Promise<PdfTextResult> {
  const result = await parsePdfBuffer(buffer);
  return {
    text: result.pages
      .map((page) => page.text)
      .join("\n\n")
      .trim(),
    pages: result.pages.length
  };
}
