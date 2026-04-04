/**
 * PDF processing nodes — pure TypeScript using pdfjs-dist.
 *
 * Provides text extraction, markdown conversion, table detection,
 * layout analysis, and metadata reading from PDF documents.
 */
import { BaseNode, prop } from "@nodetool/node-sdk";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

type DocumentRefLike = {
  uri?: string;
  data?: Uint8Array | string;
};

function asBytes(data: Uint8Array | string | undefined): Uint8Array {
  if (!data) return new Uint8Array();
  if (data instanceof Uint8Array) return data;
  return Uint8Array.from(Buffer.from(data, "base64"));
}

async function loadPdfDocument(pdf: DocumentRefLike) {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  let pdfData: Uint8Array;
  if (pdf.data) {
    pdfData = asBytes(pdf.data);
  } else if (pdf.uri) {
    const { promises: fs } = await import("node:fs");
    const uri = pdf.uri.startsWith("file://") ? pdf.uri.slice(7) : pdf.uri;
    pdfData = new Uint8Array(await fs.readFile(uri));
  } else {
    throw new Error("No PDF data or URI provided");
  }
  const loadingTask = pdfjsLib.getDocument({
    data: pdfData,
    useSystemFonts: true
  });
  return await loadingTask.promise;
}

function resolvePageRange(
  startPage: number,
  endPage: number,
  totalPages: number
): [number, number] {
  const start = Math.max(0, startPage);
  const end =
    endPage === -1 ? totalPages - 1 : Math.min(endPage, totalPages - 1);
  return [start, end];
}

/** Standard page-range props shared by most nodes. */
const PDF_INPUT = {
  type: "document" as const,
  default: {
    type: "document",
    uri: "",
    asset_id: null,
    data: null,
    metadata: null
  },
  title: "PDF",
  description: "The PDF document to process"
};

// ---------------------------------------------------------------------------
// PageCount
// ---------------------------------------------------------------------------

export class PdfPageCountNode extends BaseNode {
  static readonly nodeType = "lib.pdf.PageCount";
  static readonly title = "PDF Page Count";
  static readonly description =
    "Get the total number of pages in a PDF document.\n    pdf, pages, count, length";
  static readonly metadataOutputTypes = { output: "int" };

  @prop(PDF_INPUT)
  declare pdf: any;

  async process(): Promise<Record<string, unknown>> {
    const doc = await loadPdfDocument((this.pdf ?? {}) as DocumentRefLike);
    const count = doc.numPages;
    void doc.destroy();
    return { output: count };
  }
}

// ---------------------------------------------------------------------------
// ExtractText
// ---------------------------------------------------------------------------

export class PdfExtractTextNode extends BaseNode {
  static readonly nodeType = "lib.pdf.ExtractText";
  static readonly title = "PDF Extract Text";
  static readonly description =
    "Extract plain text from a PDF, preserving line breaks based on layout position.\n    pdf, text, extract, read, content";
  static readonly metadataOutputTypes = { output: "str" };
  static readonly exposeAsTool = true;

  @prop(PDF_INPUT)
  declare pdf: any;

  @prop({
    type: "int",
    default: 0,
    title: "Start Page",
    description: "First page (0-based)"
  })
  declare start_page: any;

  @prop({
    type: "int",
    default: -1,
    title: "End Page",
    description: "Last page (-1 for all)"
  })
  declare end_page: any;

  async process(): Promise<Record<string, unknown>> {
    const doc = await loadPdfDocument((this.pdf ?? {}) as DocumentRefLike);
    const [start, end] = resolvePageRange(
      Number(this.start_page ?? 0),
      Number(this.end_page ?? -1),
      doc.numPages
    );

    let text = "";
    for (let i = start; i <= end; i++) {
      const page = await doc.getPage(i + 1);
      const content = await page.getTextContent();
      let lastY: number | null = null;
      for (const item of content.items as any[]) {
        const y = item.transform[5];
        if (lastY !== null && Math.abs(y - lastY) > 2) text += "\n";
        text += item.str;
        lastY = y;
      }
      text += "\n\n";
    }

    void doc.destroy();
    return { output: text.trim() };
  }
}

// ---------------------------------------------------------------------------
// ExtractMarkdown
// ---------------------------------------------------------------------------

export class PdfExtractMarkdownNode extends BaseNode {
  static readonly nodeType = "lib.pdf.ExtractMarkdown";
  static readonly title = "PDF to Markdown";
  static readonly description =
    "Convert PDF to Markdown, inferring headings from font size.\n    pdf, markdown, convert, headings, structure";
  static readonly metadataOutputTypes = { output: "str" };
  static readonly exposeAsTool = true;

  @prop(PDF_INPUT)
  declare pdf: any;

  @prop({
    type: "int",
    default: 0,
    title: "Start Page",
    description: "First page (0-based)"
  })
  declare start_page: any;

  @prop({
    type: "int",
    default: -1,
    title: "End Page",
    description: "Last page (-1 for all)"
  })
  declare end_page: any;

  async process(): Promise<Record<string, unknown>> {
    const doc = await loadPdfDocument((this.pdf ?? {}) as DocumentRefLike);
    const [start, end] = resolvePageRange(
      Number(this.start_page ?? 0),
      Number(this.end_page ?? -1),
      doc.numPages
    );

    const mdParts: string[] = [];

    for (let i = start; i <= end; i++) {
      const page = await doc.getPage(i + 1);
      const content = await page.getTextContent();

      // Collect font sizes to determine heading thresholds
      const sizes: number[] = [];
      for (const item of content.items as any[]) {
        if (item.str?.trim()) {
          sizes.push(item.height || item.transform?.[0] || 12);
        }
      }
      const avgSize =
        sizes.length > 0 ? sizes.reduce((a, b) => a + b, 0) / sizes.length : 12;

      const lines: string[] = [];
      let lastY: number | null = null;
      let currentLine = "";
      let currentSize = 0;

      const flushLine = () => {
        const trimmed = currentLine.trim();
        if (!trimmed) {
          lines.push("");
        } else if (currentSize > avgSize * 1.5) {
          lines.push(`# ${trimmed}`);
        } else if (currentSize > avgSize * 1.2) {
          lines.push(`## ${trimmed}`);
        } else {
          lines.push(trimmed);
        }
        currentLine = "";
        currentSize = 0;
      };

      for (const item of content.items as any[]) {
        const y = item.transform[5];
        const h = item.height || item.transform?.[0] || 12;
        if (lastY !== null && Math.abs(y - lastY) > 2) flushLine();
        currentLine += item.str;
        currentSize = Math.max(currentSize, h);
        lastY = y;
      }
      flushLine();
      mdParts.push(lines.join("\n"));
    }

    void doc.destroy();
    return { output: mdParts.join("\n\n---\n\n") };
  }
}

// ---------------------------------------------------------------------------
// ExtractTables
// ---------------------------------------------------------------------------

export class PdfExtractTablesNode extends BaseNode {
  static readonly nodeType = "lib.pdf.ExtractTables";
  static readonly title = "PDF Extract Tables";
  static readonly description =
    "Detect and extract tables from a PDF by analysing text layout.\n    pdf, tables, extract, data, rows, columns";
  static readonly metadataOutputTypes = { output: "list[dict]" };
  static readonly exposeAsTool = true;

  @prop(PDF_INPUT)
  declare pdf: any;

  @prop({
    type: "int",
    default: 0,
    title: "Start Page",
    description: "First page (0-based)"
  })
  declare start_page: any;

  @prop({
    type: "int",
    default: -1,
    title: "End Page",
    description: "Last page (-1 for all)"
  })
  declare end_page: any;

  @prop({
    type: "int",
    default: 3,
    title: "Y Tolerance",
    description: "Pixel tolerance for grouping text into rows",
    min: 1,
    max: 20
  })
  declare y_tolerance: any;

  async process(): Promise<Record<string, unknown>> {
    const doc = await loadPdfDocument((this.pdf ?? {}) as DocumentRefLike);
    const [start, end] = resolvePageRange(
      Number(this.start_page ?? 0),
      Number(this.end_page ?? -1),
      doc.numPages
    );
    const yTolerance = Number(this.y_tolerance ?? 3);
    const tables: Record<string, unknown>[] = [];

    for (let pageIdx = start; pageIdx <= end; pageIdx++) {
      const page = await doc.getPage(pageIdx + 1);
      const content = await page.getTextContent();

      // Group items by Y position (rows)
      const rows: Map<number, { x: number; str: string }[]> = new Map();
      for (const item of content.items as any[]) {
        if (!item.str?.trim()) continue;
        const y = Math.round(item.transform[5] / yTolerance) * yTolerance;
        if (!rows.has(y)) rows.set(y, []);
        rows.get(y)!.push({ x: item.transform[4], str: item.str.trim() });
      }

      // Sort rows top-to-bottom (PDF Y is bottom-up)
      const sortedRows = Array.from(rows.entries())
        .sort((a, b) => b[0] - a[0])
        .map(([, cells]) => cells.sort((a, b) => a.x - b.x).map((c) => c.str));

      if (sortedRows.length < 2) continue;

      // Find most common column count
      const freq = new Map<number, number>();
      for (const r of sortedRows)
        freq.set(r.length, (freq.get(r.length) ?? 0) + 1);
      let mostCommon = 0;
      let maxFreq = 0;
      for (const [cols, count] of freq) {
        if (cols >= 2 && count > maxFreq) {
          mostCommon = cols;
          maxFreq = count;
        }
      }
      if (mostCommon < 2) continue;

      const tableRows = sortedRows.filter((r) => r.length === mostCommon);
      if (tableRows.length < 2) continue;

      tables.push({
        page: pageIdx,
        header: tableRows[0],
        rows: tableRows.slice(1),
        columns: mostCommon,
        total_rows: tableRows.length
      });
    }

    void doc.destroy();
    return { output: tables };
  }
}

// ---------------------------------------------------------------------------
// ExtractTextBlocks
// ---------------------------------------------------------------------------

export class PdfExtractTextBlocksNode extends BaseNode {
  static readonly nodeType = "lib.pdf.ExtractTextBlocks";
  static readonly title = "PDF Extract Text Blocks";
  static readonly description =
    "Extract text blocks with bounding boxes, useful for layout analysis.\n    pdf, text, blocks, layout, bbox, position";
  static readonly metadataOutputTypes = { output: "list[dict]" };
  static readonly exposeAsTool = true;

  @prop(PDF_INPUT)
  declare pdf: any;

  @prop({
    type: "int",
    default: 0,
    title: "Start Page",
    description: "First page (0-based)"
  })
  declare start_page: any;

  @prop({
    type: "int",
    default: -1,
    title: "End Page",
    description: "Last page (-1 for all)"
  })
  declare end_page: any;

  async process(): Promise<Record<string, unknown>> {
    const doc = await loadPdfDocument((this.pdf ?? {}) as DocumentRefLike);
    const [start, end] = resolvePageRange(
      Number(this.start_page ?? 0),
      Number(this.end_page ?? -1),
      doc.numPages
    );
    const blocks: Record<string, unknown>[] = [];

    for (let i = start; i <= end; i++) {
      const page = await doc.getPage(i + 1);
      const content = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1.0 });

      let block: {
        text: string;
        x0: number;
        y0: number;
        x1: number;
        y1: number;
      } | null = null;
      let lastY: number | null = null;

      const flushBlock = () => {
        if (block?.text.trim()) {
          blocks.push({
            page: i,
            text: block.text.trim(),
            bbox: {
              x0: block.x0,
              y0: viewport.height - block.y1,
              x1: block.x1,
              y1: viewport.height - block.y0
            }
          });
        }
        block = null;
      };

      for (const item of content.items as any[]) {
        const x = item.transform[4];
        const y = item.transform[5];
        const w = item.width || 0;
        const h = item.height || item.transform[0] || 12;

        if (lastY !== null && Math.abs(y - lastY) > h * 1.5) flushBlock();

        if (!block) block = { text: "", x0: x, y0: y, x1: x + w, y1: y + h };
        block.text += item.str;
        block.x0 = Math.min(block.x0, x);
        block.y0 = Math.min(block.y0, y);
        block.x1 = Math.max(block.x1, x + w);
        block.y1 = Math.max(block.y1, y + h);
        lastY = y;
      }
      flushBlock();
    }

    void doc.destroy();
    return { output: blocks };
  }
}

// ---------------------------------------------------------------------------
// ExtractStyledText
// ---------------------------------------------------------------------------

export class PdfExtractStyledTextNode extends BaseNode {
  static readonly nodeType = "lib.pdf.ExtractStyledText";
  static readonly title = "PDF Extract Styled Text";
  static readonly description =
    "Extract text spans with font name, size, and bounding box.\n    pdf, text, style, font, size, formatting";
  static readonly metadataOutputTypes = { output: "list[dict]" };
  static readonly exposeAsTool = true;

  @prop(PDF_INPUT)
  declare pdf: any;

  @prop({
    type: "int",
    default: 0,
    title: "Start Page",
    description: "First page (0-based)"
  })
  declare start_page: any;

  @prop({
    type: "int",
    default: -1,
    title: "End Page",
    description: "Last page (-1 for all)"
  })
  declare end_page: any;

  async process(): Promise<Record<string, unknown>> {
    const doc = await loadPdfDocument((this.pdf ?? {}) as DocumentRefLike);
    const [start, end] = resolvePageRange(
      Number(this.start_page ?? 0),
      Number(this.end_page ?? -1),
      doc.numPages
    );
    const spans: Record<string, unknown>[] = [];

    for (let i = start; i <= end; i++) {
      const page = await doc.getPage(i + 1);
      const content = await page.getTextContent();
      for (const item of content.items as any[]) {
        if (!item.str?.trim()) continue;
        const x = item.transform[4];
        const y = item.transform[5];
        const w = item.width || 0;
        const h = item.height || item.transform[0] || 12;
        spans.push({
          page: i,
          text: item.str,
          font: item.fontName || "unknown",
          size: h,
          bbox: { x0: x, y0: y, x1: x + w, y1: y + h }
        });
      }
    }

    void doc.destroy();
    return { output: spans };
  }
}

// ---------------------------------------------------------------------------
// PageMetadata
// ---------------------------------------------------------------------------

export class PdfPageMetadataNode extends BaseNode {
  static readonly nodeType = "lib.pdf.PageMetadata";
  static readonly title = "PDF Page Metadata";
  static readonly description =
    "Get dimensions, rotation, and bounding box for each page.\n    pdf, metadata, pages, size, dimensions, rotation";
  static readonly metadataOutputTypes = { output: "list[dict]" };

  @prop(PDF_INPUT)
  declare pdf: any;

  @prop({
    type: "int",
    default: 0,
    title: "Start Page",
    description: "First page (0-based)"
  })
  declare start_page: any;

  @prop({
    type: "int",
    default: -1,
    title: "End Page",
    description: "Last page (-1 for all)"
  })
  declare end_page: any;

  async process(): Promise<Record<string, unknown>> {
    const doc = await loadPdfDocument((this.pdf ?? {}) as DocumentRefLike);
    const [start, end] = resolvePageRange(
      Number(this.start_page ?? 0),
      Number(this.end_page ?? -1),
      doc.numPages
    );
    const metadata: Record<string, unknown>[] = [];

    for (let i = start; i <= end; i++) {
      const page = await doc.getPage(i + 1);
      const viewport = page.getViewport({ scale: 1.0 });
      metadata.push({
        page: i,
        width: viewport.width,
        height: viewport.height,
        rotation: page.rotate
      });
    }

    void doc.destroy();
    return { output: metadata };
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const LIB_PDF_NODES = [
  PdfPageCountNode,
  PdfExtractTextNode,
  PdfExtractMarkdownNode,
  PdfExtractTablesNode,
  PdfExtractTextBlocksNode,
  PdfExtractStyledTextNode,
  PdfPageMetadataNode
] as const;
