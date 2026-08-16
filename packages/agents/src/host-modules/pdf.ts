/**
 * `@nodetool-ai/sandbox-pdf` — pdf-parse, on the host.
 *
 * pdf-parse drives pdf.js, which wants Node builtins and a canvas; it is not a
 * guest-module candidate. Both exports read one text layer, so they share one
 * parse: `extractText` joins what `extractPages` returns.
 *
 * The input is copied before it reaches the parser. pdf.js transfers the buffer
 * it is handed and leaves it detached, and that buffer belongs to the guest.
 */

import { requireBytes, unwrapLibrary } from "./limits.js";

interface PageTextResult {
  num: number;
  text: string;
}
interface TextResult {
  pages: PageTextResult[];
  text: string;
  total: number;
}
interface PdfParser {
  getText: (params?: { pageJoiner?: string }) => Promise<TextResult>;
  destroy: () => Promise<void>;
}
interface PdfParseLike {
  PDFParse: new (options: { data: Uint8Array }) => PdfParser;
}

async function loadPdfParse(where: string): Promise<PdfParseLike> {
  const mod: unknown = await import("pdf-parse");
  return unwrapLibrary<PdfParseLike>(
    mod,
    where,
    "pdf-parse",
    (v) => typeof (v as PdfParseLike | undefined)?.PDFParse === "function"
  );
}

/**
 * Every page's text, in order.
 *
 * `pageJoiner: ""` drops pdf-parse's default "-- 1 of 12 --" marker, which is
 * the library's own prose rather than the document's.
 */
async function readPages(where: string, bytes: unknown): Promise<PageTextResult[]> {
  const data = new Uint8Array(requireBytes(where, bytes));
  const { PDFParse } = await loadPdfParse(where);
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText({ pageJoiner: "" });
    return result.pages;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${where}: ${message}`);
  } finally {
    await parser.destroy();
  }
}

/** A PDF's text, all pages concatenated. */
export async function extractText(bytes: unknown): Promise<string> {
  const pages = await readPages("pdf.extractText", bytes);
  return pages.map((page) => page.text.trim()).join("\n\n");
}

/** One page of a PDF, as `extractPages` reports it. */
export interface PdfPage {
  index: number;
  pageNumber: number;
  text: string;
}

/** Each page's text as its own item, in page order. */
export async function extractPages(bytes: unknown): Promise<PdfPage[]> {
  const pages = await readPages("pdf.extractPages", bytes);
  return pages.map((page, index) => ({
    index,
    pageNumber: page.num,
    text: page.text.trim()
  }));
}
