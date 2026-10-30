import type { ParseResult } from "@llamaindex/liteparse";
import { importOptionalModule } from "@nodetool-ai/config";
import { missingRuntimePackageError } from "@nodetool-ai/protocol";

/** Load the explicitly installed PDF parser without launching it at import time. */
export async function loadLiteParse(): Promise<typeof import("@llamaindex/liteparse")> {
  try {
    return await importOptionalModule<typeof import("@llamaindex/liteparse")>("@llamaindex/liteparse");
  } catch (cause) {
    throw missingRuntimePackageError("@llamaindex/liteparse", "pdf-js", cause);
  }
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
