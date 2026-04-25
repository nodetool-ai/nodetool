/**
 * PDF processing nodes using @llamaindex/liteparse.
 *
 * Provides text extraction, markdown conversion, table detection,
 * layout analysis, metadata reading, screenshots, text search,
 * and OCR extraction from PDF documents.
 */
import { BaseNode, prop } from "@nodetool/node-sdk";
import type { ProcessingContext } from "@nodetool/runtime";
import type { ParseResult } from "@llamaindex/liteparse";

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

async function resolvePdfBuffer(
  pdf: DocumentRefLike,
  context?: ProcessingContext
): Promise<Buffer> {
  if (pdf.data) {
    return Buffer.from(asBytes(pdf.data));
  } else if (pdf.uri) {
    const uri = pdf.uri.startsWith("file://") ? pdf.uri.slice(7) : pdf.uri;
    if (context?.storage) {
      const stored = await context.storage.retrieve(pdf.uri);
      if (stored !== null) return Buffer.from(stored);
    }
    const { promises: fs } = await import("node:fs");
    return fs.readFile(uri);
  }
  throw new Error("No PDF data or URI provided");
}

async function parsePdf(
  pdf: DocumentRefLike,
  context?: ProcessingContext
): Promise<ParseResult> {
  const { LiteParse } = await import("@llamaindex/liteparse");
  const pdfBuffer = await resolvePdfBuffer(pdf, context);
  const parser = new LiteParse({ ocrEnabled: false });
  return parser.parse(pdfBuffer, true);
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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const result = await parsePdf(
      (this.pdf ?? {}) as DocumentRefLike,
      context
    );
    return { output: result.pages.length };
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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const result = await parsePdf(
      (this.pdf ?? {}) as DocumentRefLike,
      context
    );
    const [start, end] = resolvePageRange(
      Number(this.start_page ?? 0),
      Number(this.end_page ?? -1),
      result.pages.length
    );

    const parts: string[] = [];
    for (let i = start; i <= end; i++) {
      const page = result.pages[i];
      if (page) parts.push(page.text);
    }
    return { output: parts.join("\n\n").trim() };
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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const result = await parsePdf(
      (this.pdf ?? {}) as DocumentRefLike,
      context
    );
    const [start, end] = resolvePageRange(
      Number(this.start_page ?? 0),
      Number(this.end_page ?? -1),
      result.pages.length
    );

    const bulletRe = /^[•‣◦⁃∙\-*]\s*/;
    const numberedRe = /^(\d+)[.)]\s*/;
    const mdParts: string[] = [];

    for (let i = start; i <= end; i++) {
      const page = result.pages[i];
      if (!page) continue;

      const items = page.textItems
        .filter((it) => it.str.trim())
        .sort((a, b) => a.y - b.y || a.x - b.x);

      if (items.length === 0) continue;

      // Compute average font size for heading thresholds
      const sizes = items.map((it) => it.fontSize ?? it.height ?? 12);
      const avgSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;

      // Detect left margin for indent detection
      const leftMargin = Math.min(...items.map((it) => it.x));
      const indentThreshold = 15;

      // Group items into lines by Y coordinate
      type LineData = {
        text: string;
        maxSize: number;
        isBold: boolean;
        x: number;
        y: number;
      };
      const lineMap = new Map<number, LineData>();
      const yTol = 3;

      for (const item of items) {
        const ky = Math.round(item.y / yTol) * yTol;
        const existing = lineMap.get(ky);
        const size = item.fontSize ?? item.height ?? 12;
        const isBold = /bold/i.test(item.fontName ?? "");
        if (existing) {
          existing.text += item.str;
          existing.maxSize = Math.max(existing.maxSize, size);
          if (isBold) existing.isBold = true;
        } else {
          lineMap.set(ky, {
            text: item.str,
            maxSize: size,
            isBold,
            x: item.x,
            y: item.y
          });
        }
      }

      const lineEntries = Array.from(lineMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, ld]) => ld);

      // Detect table-like rows: groups with consistent multi-column layout
      const tableYTol = 3;
      const rowMap = new Map<number, { x: number; str: string }[]>();
      for (const item of items) {
        const ky = Math.round(item.y / tableYTol) * tableYTol;
        if (!rowMap.has(ky)) rowMap.set(ky, []);
        rowMap.get(ky)!.push({ x: item.x, str: item.str.trim() });
      }
      const rowEntries = Array.from(rowMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([y, cells]) => ({ y, cells: cells.sort((a, b) => a.x - b.x) }));

      const tableYRanges: { startY: number; endY: number; rows: string[][] }[] =
        [];
      let runStart = 0;
      while (runStart < rowEntries.length) {
        const colCount = rowEntries[runStart].cells.length;
        if (colCount < 2) {
          runStart++;
          continue;
        }
        let runEnd = runStart + 1;
        while (
          runEnd < rowEntries.length &&
          rowEntries[runEnd].cells.length === colCount
        ) {
          runEnd++;
        }
        if (runEnd - runStart >= 2) {
          tableYRanges.push({
            startY: rowEntries[runStart].y,
            endY: rowEntries[runEnd - 1].y,
            rows: rowEntries.slice(runStart, runEnd).map((r) => r.cells.map((c) => c.str))
          });
        }
        runStart = runEnd;
      }

      const isInTable = (y: number): { rows: string[][] } | null => {
        const ry = Math.round(y / tableYTol) * tableYTol;
        for (const range of tableYRanges) {
          if (ry >= range.startY - tableYTol && ry <= range.endY + tableYTol)
            return range;
        }
        return null;
      };

      const emittedTables = new Set<{ rows: string[][] }>();
      const lines: string[] = [];

      for (let li = 0; li < lineEntries.length; li++) {
        const ld = lineEntries[li];
        const text = ld.text.trim();
        if (!text) continue;

        // Paragraph break detection (large Y gap between lines)
        if (li > 0) {
          const prev = lineEntries[li - 1];
          const gap = ld.y - prev.y;
          if (gap > avgSize * 1.8) lines.push("");
        }

        const table = isInTable(ld.y);
        if (table && !emittedTables.has(table)) {
          emittedTables.add(table);
          const header = table.rows[0];
          lines.push("| " + header.join(" | ") + " |");
          lines.push("| " + header.map(() => "---").join(" | ") + " |");
          for (let ri = 1; ri < table.rows.length; ri++) {
            lines.push("| " + table.rows[ri].join(" | ") + " |");
          }
          lines.push("");
          continue;
        }
        if (table) continue;

        const bulletMatch = text.match(bulletRe);
        const numberedMatch = text.match(numberedRe);

        if (bulletMatch) {
          lines.push(`- ${text.replace(bulletRe, "")}`);
        } else if (numberedMatch) {
          lines.push(`${numberedMatch[1]}. ${text.replace(numberedRe, "")}`);
        } else if (ld.maxSize > avgSize * 1.5) {
          lines.push(`# ${text}`);
        } else if (ld.maxSize > avgSize * 1.2) {
          lines.push(`## ${text}`);
        } else if (ld.isBold && ld.maxSize >= avgSize) {
          lines.push(`### ${text}`);
        } else {
          const isIndented = ld.x - leftMargin > indentThreshold;
          void isIndented;
          lines.push(text);
        }
      }

      mdParts.push(lines.join("\n"));
    }

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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const result = await parsePdf(
      (this.pdf ?? {}) as DocumentRefLike,
      context
    );
    const [start, end] = resolvePageRange(
      Number(this.start_page ?? 0),
      Number(this.end_page ?? -1),
      result.pages.length
    );
    const yTolerance = Number(this.y_tolerance ?? 3);
    const tables: Record<string, unknown>[] = [];

    for (let pageIdx = start; pageIdx <= end; pageIdx++) {
      const page = result.pages[pageIdx];
      if (!page) continue;

      const items: { x: number; y: number; w: number; str: string }[] = [];
      for (const item of page.textItems) {
        if (!item.str.trim()) continue;
        items.push({
          x: item.x,
          y: Math.round(item.y / yTolerance) * yTolerance,
          w: item.width,
          str: item.str.trim()
        });
      }

      const rowMap = new Map<number, { x: number; w: number; str: string }[]>();
      for (const it of items) {
        if (!rowMap.has(it.y)) rowMap.set(it.y, []);
        rowMap.get(it.y)!.push({ x: it.x, w: it.w, str: it.str });
      }

      const sortedRowEntries = Array.from(rowMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, cells]) => cells.sort((a, b) => a.x - b.x));

      if (sortedRowEntries.length < 2) continue;

      const freq = new Map<number, number>();
      for (const r of sortedRowEntries) {
        freq.set(r.length, (freq.get(r.length) ?? 0) + 1);
      }
      let mostCommonCount = 0;
      let maxFreq = 0;
      for (const [cols, count] of freq) {
        if (cols >= 2 && count > maxFreq) {
          mostCommonCount = cols;
          maxFreq = count;
        }
      }
      if (mostCommonCount < 2 || maxFreq < 2) continue;

      const candidateRows = sortedRowEntries.filter(
        (r) => r.length === mostCommonCount
      );

      const colXPositions: number[][] = Array.from(
        { length: mostCommonCount },
        () => []
      );
      for (const row of candidateRows) {
        for (let ci = 0; ci < row.length; ci++) {
          colXPositions[ci].push(row[ci].x);
        }
      }

      const colCenters = colXPositions.map((xs) => {
        const sorted = xs.slice().sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)];
      });

      const maxSpread = 15;
      let aligned = true;
      for (const xs of colXPositions) {
        if (Math.max(...xs) - Math.min(...xs) > maxSpread) {
          aligned = false;
          break;
        }
      }
      if (!aligned) continue;

      const colBoundaries: number[] = [];
      for (let ci = 0; ci < mostCommonCount - 1; ci++) {
        colBoundaries.push((colCenters[ci] + colCenters[ci + 1]) / 2);
      }

      const assignColumn = (x: number): number => {
        for (let bi = 0; bi < colBoundaries.length; bi++) {
          if (x < colBoundaries[bi]) return bi;
        }
        return colBoundaries.length;
      };

      const tableRows: string[][] = [];
      for (const row of candidateRows) {
        const cells: string[] = Array.from(
          { length: mostCommonCount },
          () => ""
        );
        for (const cell of row) {
          const ci = assignColumn(cell.x);
          cells[ci] = cells[ci] ? `${cells[ci]} ${cell.str}` : cell.str;
        }
        tableRows.push(cells);
      }

      if (tableRows.length < 2) continue;

      tables.push({
        page: pageIdx,
        header: tableRows[0],
        rows: tableRows.slice(1),
        columns: mostCommonCount,
        total_rows: tableRows.length
      });
    }

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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const result = await parsePdf(
      (this.pdf ?? {}) as DocumentRefLike,
      context
    );
    const [start, end] = resolvePageRange(
      Number(this.start_page ?? 0),
      Number(this.end_page ?? -1),
      result.pages.length
    );
    const blocks: Record<string, unknown>[] = [];

    for (let i = start; i <= end; i++) {
      const page = result.pages[i];
      if (!page) continue;

      const items = page.textItems.sort((a, b) => a.y - b.y || a.x - b.x);

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
              y0: block.y0,
              x1: block.x1,
              y1: block.y1
            }
          });
        }
        block = null;
      };

      for (const item of items) {
        const h = item.height ?? 12;
        if (lastY !== null && Math.abs(item.y - lastY) > h * 1.5) flushBlock();

        if (!block) {
          block = {
            text: "",
            x0: item.x,
            y0: item.y,
            x1: item.x + item.width,
            y1: item.y + h
          };
        }
        block.text += item.str;
        block.x0 = Math.min(block.x0, item.x);
        block.y0 = Math.min(block.y0, item.y);
        block.x1 = Math.max(block.x1, item.x + item.width);
        block.y1 = Math.max(block.y1, item.y + h);
        lastY = item.y;
      }
      flushBlock();
    }

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
    "Extract text spans with font name, size, bounding box, and color (always null; liteparse does not expose per-span color).\n    pdf, text, style, font, size, formatting, color";
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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const result = await parsePdf(
      (this.pdf ?? {}) as DocumentRefLike,
      context
    );
    const [start, end] = resolvePageRange(
      Number(this.start_page ?? 0),
      Number(this.end_page ?? -1),
      result.pages.length
    );
    const spans: Record<string, unknown>[] = [];

    for (let i = start; i <= end; i++) {
      const page = result.pages[i];
      if (!page) continue;
      for (const item of page.textItems) {
        if (!item.str.trim()) continue;
        const h = item.height ?? 12;
        spans.push({
          page: i,
          text: item.str,
          font: item.fontName ?? "unknown",
          size: item.fontSize ?? h,
          color: null,
          bbox: {
            x0: item.x,
            y0: item.y,
            x1: item.x + item.width,
            y1: item.y + h
          }
        });
      }
    }

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
    "Get dimensions and bounding box for each page.\n    pdf, metadata, pages, size, dimensions";
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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const result = await parsePdf(
      (this.pdf ?? {}) as DocumentRefLike,
      context
    );
    const [start, end] = resolvePageRange(
      Number(this.start_page ?? 0),
      Number(this.end_page ?? -1),
      result.pages.length
    );
    const metadata: Record<string, unknown>[] = [];

    for (let i = start; i <= end; i++) {
      const page = result.pages[i];
      if (!page) continue;

      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const item of page.textItems) {
        if (!item.str.trim()) continue;
        const h = item.height ?? 12;
        x0 = Math.min(x0, item.x);
        y0 = Math.min(y0, item.y);
        x1 = Math.max(x1, item.x + item.width);
        y1 = Math.max(y1, item.y + h);
      }
      const hasContent = x0 !== Infinity;
      metadata.push({
        page: i,
        width: page.width,
        height: page.height,
        bbox: hasContent ? { x0, y0, x1, y1 } : null
      });
    }

    return { output: metadata };
  }
}

// ---------------------------------------------------------------------------
// Screenshot
// ---------------------------------------------------------------------------

export class PdfScreenshotNode extends BaseNode {
  static readonly nodeType = "lib.pdf.Screenshot";
  static readonly title = "PDF Page Screenshot";
  static readonly description =
    "Render PDF pages as PNG images.\n    pdf, screenshot, render, image, pages, png";
  static readonly metadataOutputTypes = { output: "list[image]" };

  @prop(PDF_INPUT)
  declare pdf: any;

  @prop({
    type: "int",
    default: 0,
    title: "Start Page",
    description: "First page to render (0-based)"
  })
  declare start_page: any;

  @prop({
    type: "int",
    default: -1,
    title: "End Page",
    description: "Last page to render (-1 for all)"
  })
  declare end_page: any;

  @prop({
    type: "int",
    default: 150,
    title: "DPI",
    description: "Rendering resolution in dots per inch",
    min: 72,
    max: 600
  })
  declare dpi: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    // Bypass liteparse's parser.screenshot(): it loads the same buffer into
    // pdf.js *and* PDFium, but pdf.js detaches the underlying ArrayBuffer
    // during its load, leaving PDFium with a detached buffer (→ "File not in
    // PDF format or corrupted"). Render directly via PDFium + sharp.
    const [{ PDFiumLibrary }, sharpModule] = await Promise.all([
      import("@hyzyla/pdfium"),
      import("sharp")
    ]);
    const sharp = sharpModule.default;
    const pdfBuffer = await resolvePdfBuffer(
      (this.pdf ?? {}) as DocumentRefLike,
      context
    );
    const dpi = Number(this.dpi ?? 150);
    const scale = dpi / 72;

    const lib = await PDFiumLibrary.init();
    const images: { type: string; data: string }[] = [];
    let doc: Awaited<ReturnType<typeof lib.loadDocument>> | null = null;
    try {
      doc = await lib.loadDocument(Buffer.from(pdfBuffer));
      const totalPages = doc.getPageCount();
      const [start, end] = resolvePageRange(
        Number(this.start_page ?? 0),
        Number(this.end_page ?? -1),
        totalPages
      );
      for (let i = start; i <= end; i++) {
        const page = doc.getPage(i);
        const image = await page.render({
          scale,
          render: async (options) =>
            sharp(options.data, {
              raw: {
                width: options.width,
                height: options.height,
                channels: 4
              }
            })
              .png({ compressionLevel: 6 })
              .withMetadata({ density: dpi })
              .toBuffer()
        });
        images.push({
          type: "image",
          data: Buffer.from(image.data).toString("base64")
        });
      }
    } finally {
      if (doc) doc.destroy();
      lib.destroy();
    }
    return { output: images };
  }
}

// ---------------------------------------------------------------------------
// SearchText
// ---------------------------------------------------------------------------

export class PdfSearchTextNode extends BaseNode {
  static readonly nodeType = "lib.pdf.SearchText";
  static readonly title = "PDF Search Text";
  static readonly description =
    "Search a PDF for a phrase and return each match with its page number and bounding box.\n    pdf, search, find, phrase, text, location, bbox";
  static readonly metadataOutputTypes = { output: "list[dict]" };
  static readonly exposeAsTool = true;

  @prop(PDF_INPUT)
  declare pdf: any;

  @prop({
    type: "str",
    default: "",
    title: "Phrase",
    description: "Text phrase to search for"
  })
  declare phrase: any;

  @prop({
    type: "bool",
    default: false,
    title: "Case Sensitive",
    description: "Whether the search is case-sensitive"
  })
  declare case_sensitive: any;

  @prop({
    type: "int",
    default: 0,
    title: "Start Page",
    description: "First page to search (0-based)"
  })
  declare start_page: any;

  @prop({
    type: "int",
    default: -1,
    title: "End Page",
    description: "Last page to search (-1 for all)"
  })
  declare end_page: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const { searchItems } = await import("@llamaindex/liteparse");
    const result = await parsePdf(
      (this.pdf ?? {}) as DocumentRefLike,
      context
    );
    const [start, end] = resolvePageRange(
      Number(this.start_page ?? 0),
      Number(this.end_page ?? -1),
      result.pages.length
    );
    const phrase = String(this.phrase ?? "");
    const caseSensitive = Boolean(this.case_sensitive ?? false);
    const matches: Record<string, unknown>[] = [];

    for (let i = start; i <= end; i++) {
      const page = result.pages[i];
      if (!page) continue;

      // Convert TextItem (str) to JsonTextItem (text) shape for searchItems
      const jsonItems = page.textItems.map((it) => ({
        text: it.str,
        x: it.x,
        y: it.y,
        width: it.width,
        height: it.height,
        fontName: it.fontName,
        fontSize: it.fontSize,
        confidence: it.confidence
      }));

      const found = searchItems(jsonItems, { phrase, caseSensitive });
      for (const m of found) {
        matches.push({
          page: i,
          text: m.text,
          x: m.x,
          y: m.y,
          width: m.width,
          height: m.height,
          fontName: m.fontName ?? null,
          fontSize: m.fontSize ?? null
        });
      }
    }

    return { output: matches };
  }
}

// ---------------------------------------------------------------------------
// ExtractOcr
// ---------------------------------------------------------------------------

export class PdfExtractOcrNode extends BaseNode {
  static readonly nodeType = "lib.pdf.ExtractOcr";
  static readonly title = "PDF Extract Text (OCR)";
  static readonly description =
    "Extract text from a PDF using OCR, suitable for scanned documents and image-based PDFs.\n    pdf, ocr, scan, text, extract, image-based";
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

  @prop({
    type: "str",
    default: "en",
    title: "OCR Language",
    description: "ISO 639-1 language code for OCR (e.g. en, fr, de, es)"
  })
  declare ocr_language: any;

  @prop({
    type: "int",
    default: 150,
    title: "DPI",
    description: "Rendering DPI for OCR — higher values improve accuracy on small text",
    min: 72,
    max: 600
  })
  declare dpi: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const { LiteParse } = await import("@llamaindex/liteparse");
    const pdfBuffer = await resolvePdfBuffer(
      (this.pdf ?? {}) as DocumentRefLike,
      context
    );
    const ocrLanguage = String(this.ocr_language ?? "en");
    const dpi = Number(this.dpi ?? 150);
    const parser = new LiteParse({ ocrEnabled: true, ocrLanguage, dpi });
    const result = await parser.parse(pdfBuffer, true);

    const [start, end] = resolvePageRange(
      Number(this.start_page ?? 0),
      Number(this.end_page ?? -1),
      result.pages.length
    );
    const parts: string[] = [];
    for (let i = start; i <= end; i++) {
      const page = result.pages[i];
      if (page) parts.push(page.text);
    }
    return { output: parts.join("\n\n").trim() };
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
  PdfPageMetadataNode,
  PdfScreenshotNode,
  PdfSearchTextNode,
  PdfExtractOcrNode
] as const;
