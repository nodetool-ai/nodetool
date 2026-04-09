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

    // Bullet/numbered list pattern: leading bullet chars or "1.", "2." etc.
    const bulletRe = /^[\u2022\u2023\u25E6\u2043\u2219\-*]\s*/;
    const numberedRe = /^(\d+)[.)]\s*/;

    for (let i = start; i <= end; i++) {
      const page = await doc.getPage(i + 1);
      const content = await page.getTextContent();

      // Collect font sizes to determine heading thresholds
      const sizes: number[] = [];
      const fontNames: string[] = [];
      for (const item of content.items as any[]) {
        if (item.str?.trim()) {
          sizes.push(item.height || item.transform?.[0] || 12);
          fontNames.push(item.fontName || "");
        }
      }
      const avgSize =
        sizes.length > 0 ? sizes.reduce((a, b) => a + b, 0) / sizes.length : 12;

      // Detect minimum X (left margin) for indent detection
      const xPositions: number[] = [];
      for (const item of content.items as any[]) {
        if (item.str?.trim()) xPositions.push(item.transform[4]);
      }
      const leftMargin =
        xPositions.length > 0 ? Math.min(...xPositions) : 0;
      const indentThreshold = 15; // pixels from left margin to count as indented

      // Collect line data before flushing
      type LineData = {
        text: string;
        maxSize: number;
        isBold: boolean;
        x: number;
        y: number;
        prevY: number | null;
      };

      const lineItems: LineData[] = [];
      let lastY: number | null = null;
      let currentLine = "";
      let currentSize = 0;
      let currentBold = false;
      let currentX = 0;
      let lineStartY = 0;
      let prevFlushY: number | null = null;

      const flushLine = () => {
        const trimmed = currentLine.trim();
        if (trimmed || (lastY !== null && prevFlushY !== null)) {
          lineItems.push({
            text: trimmed,
            maxSize: currentSize,
            isBold: currentBold,
            x: currentX,
            y: lineStartY,
            prevY: prevFlushY
          });
          prevFlushY = lineStartY;
        }
        currentLine = "";
        currentSize = 0;
        currentBold = false;
      };

      for (const item of content.items as any[]) {
        const y = item.transform[5];
        const h = item.height || item.transform?.[0] || 12;
        const fontName: string = item.fontName || "";
        if (lastY !== null && Math.abs(y - lastY) > 2) flushLine();
        if (!currentLine) {
          currentX = item.transform[4];
          lineStartY = y;
        }
        currentLine += item.str;
        currentSize = Math.max(currentSize, h);
        // Detect bold from font name (common patterns: Bold, -Bold, _Bold, .Bold)
        if (/bold/i.test(fontName)) currentBold = true;
        lastY = y;
      }
      flushLine();

      // Now convert lineItems to markdown
      const lines: string[] = [];

      // Detect table-like regions: consecutive lines with consistent tab/space separation
      // We do a simple pass to detect and collect table blocks
      const tableYTolerance = 3;
      const yTolerance = 3;

      // Try to detect tables on this page for markdown conversion
      const pageItems: { x: number; y: number; str: string }[] = [];
      for (const item of content.items as any[]) {
        if (!item.str?.trim()) continue;
        pageItems.push({
          x: item.transform[4],
          y: Math.round(item.transform[5] / tableYTolerance) * tableYTolerance,
          str: item.str.trim()
        });
      }
      const tableRowMap = new Map<number, { x: number; str: string }[]>();
      for (const it of pageItems) {
        if (!tableRowMap.has(it.y)) tableRowMap.set(it.y, []);
        tableRowMap.get(it.y)!.push({ x: it.x, str: it.str });
      }
      const tableRowEntries = Array.from(tableRowMap.entries())
        .sort((a, b) => b[0] - a[0])
        .map(([y, cells]) => ({
          y,
          cells: cells.sort((a, b) => a.x - b.x).map((c) => c.str)
        }));

      // Find runs of rows with same column count >= 2 (tables)
      const tableYRanges: { startY: number; endY: number; rows: string[][] }[] =
        [];
      let runStart = 0;
      while (runStart < tableRowEntries.length) {
        const colCount = tableRowEntries[runStart].cells.length;
        if (colCount < 2) {
          runStart++;
          continue;
        }
        let runEnd = runStart + 1;
        while (
          runEnd < tableRowEntries.length &&
          tableRowEntries[runEnd].cells.length === colCount
        ) {
          runEnd++;
        }
        if (runEnd - runStart >= 2) {
          const rows = tableRowEntries
            .slice(runStart, runEnd)
            .map((r) => r.cells);
          tableYRanges.push({
            startY: tableRowEntries[runEnd - 1].y,
            endY: tableRowEntries[runStart].y,
            rows
          });
        }
        runStart = runEnd;
      }

      // Check if a Y position falls within a table range
      const isInTable = (y: number): { rows: string[][] } | null => {
        const ry = Math.round(y / tableYTolerance) * tableYTolerance;
        for (const range of tableYRanges) {
          if (ry >= range.startY - yTolerance && ry <= range.endY + yTolerance) {
            return range;
          }
        }
        return null;
      };

      const emittedTables = new Set<{ rows: string[][] }>();

      for (const ld of lineItems) {
        // Check for paragraph break (large Y gap)
        if (ld.prevY !== null) {
          const gap = Math.abs(ld.y - ld.prevY);
          if (gap > avgSize * 1.8) {
            lines.push("");
          }
        }

        if (!ld.text) continue;

        // Check if this line is part of a detected table
        const table = isInTable(ld.y);
        if (table && !emittedTables.has(table)) {
          emittedTables.add(table);
          // Emit markdown table
          const header = table.rows[0];
          lines.push("| " + header.join(" | ") + " |");
          lines.push("| " + header.map(() => "---").join(" | ") + " |");
          for (let ri = 1; ri < table.rows.length; ri++) {
            lines.push("| " + table.rows[ri].join(" | ") + " |");
          }
          lines.push("");
          continue;
        }
        if (table) continue; // already emitted this table

        // Detect bullet lists (indented + leading bullet character)
        const isIndented = ld.x - leftMargin > indentThreshold;
        const bulletMatch = ld.text.match(bulletRe);
        const numberedMatch = ld.text.match(numberedRe);

        if (bulletMatch) {
          lines.push(`- ${ld.text.replace(bulletRe, "")}`);
          continue;
        }
        if (numberedMatch) {
          lines.push(`${numberedMatch[1]}. ${ld.text.replace(numberedRe, "")}`);
          continue;
        }
        if (isIndented && !bulletMatch && !numberedMatch) {
          // Could be a sub-item or indented paragraph
          // Treat as plain text (preserving it as-is)
        }

        // Heading detection: large font size OR bold with size above average
        if (ld.maxSize > avgSize * 1.5) {
          lines.push(`# ${ld.text}`);
        } else if (ld.maxSize > avgSize * 1.2) {
          lines.push(`## ${ld.text}`);
        } else if (ld.isBold && ld.maxSize >= avgSize) {
          lines.push(`### ${ld.text}`);
        } else {
          lines.push(ld.text);
        }
      }
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

      // Collect all text items with positions
      const items: { x: number; y: number; w: number; str: string }[] = [];
      for (const item of content.items as any[]) {
        if (!item.str?.trim()) continue;
        items.push({
          x: item.transform[4],
          y: Math.round(item.transform[5] / yTolerance) * yTolerance,
          w: item.width || 0,
          str: item.str.trim()
        });
      }

      // Group items by Y position (rows)
      const rowMap = new Map<number, { x: number; w: number; str: string }[]>();
      for (const it of items) {
        if (!rowMap.has(it.y)) rowMap.set(it.y, []);
        rowMap.get(it.y)!.push({ x: it.x, w: it.w, str: it.str });
      }

      // Sort rows top-to-bottom (PDF Y is bottom-up)
      const sortedRowEntries = Array.from(rowMap.entries())
        .sort((a, b) => b[0] - a[0])
        .map(([, cells]) => cells.sort((a, b) => a.x - b.x));

      if (sortedRowEntries.length < 2) continue;

      // Find rows with consistent column counts (potential table rows)
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

      // Filter to rows matching the most common column count
      const candidateRows = sortedRowEntries.filter(
        (r) => r.length === mostCommonCount
      );

      // Detect column boundaries via X-position clustering
      // Collect all X positions from candidate rows, grouped by column index
      const colXPositions: number[][] = Array.from(
        { length: mostCommonCount },
        () => []
      );
      for (const row of candidateRows) {
        for (let ci = 0; ci < row.length; ci++) {
          colXPositions[ci].push(row[ci].x);
        }
      }

      // Compute column boundaries as midpoints between column centers
      const colCenters = colXPositions.map((xs) => {
        const sorted = xs.slice().sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)]; // median
      });

      // Verify columns are consistently aligned (low variance)
      const maxSpread = 15; // max pixel spread within a column
      let aligned = true;
      for (const xs of colXPositions) {
        const mn = Math.min(...xs);
        const mx = Math.max(...xs);
        if (mx - mn > maxSpread) {
          aligned = false;
          break;
        }
      }
      if (!aligned) continue;

      // Build column boundaries for splitting
      const colBoundaries: number[] = [];
      for (let ci = 0; ci < mostCommonCount - 1; ci++) {
        colBoundaries.push((colCenters[ci] + colCenters[ci + 1]) / 2);
      }

      // Assign each cell to its column based on boundaries
      const assignColumn = (x: number): number => {
        for (let bi = 0; bi < colBoundaries.length; bi++) {
          if (x < colBoundaries[bi]) return bi;
        }
        return colBoundaries.length;
      };

      // Re-split all candidate rows using detected column boundaries
      const tableRows: string[][] = [];
      for (const row of candidateRows) {
        const cells: string[] = Array.from({ length: mostCommonCount }, () => "");
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
    "Extract text spans with font name, size, bounding box, and color (best-effort).\n    pdf, text, style, font, size, formatting, color\n\n    Note: Color extraction depends on pdfjs-dist exposing color data in text content items. Not all PDFs provide per-span color; when unavailable the color field will be null.";
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
        // Best-effort color extraction: pdfjs-dist may expose color via
        // item.color (an [r,g,b] array) on some builds/PDFs. When not
        // available the field is null.
        let color: string | null = null;
        if (item.color && Array.isArray(item.color) && item.color.length >= 3) {
          const [r, g, b] = item.color.map((c: number) =>
            Math.round(c * 255)
              .toString(16)
              .padStart(2, "0")
          );
          color = `#${r}${g}${b}`;
        }
        spans.push({
          page: i,
          text: item.str,
          font: item.fontName || "unknown",
          size: h,
          color,
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

      // Compute content bounding box from text items
      const content = await page.getTextContent();
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const item of content.items as any[]) {
        if (!item.str?.trim()) continue;
        const x = item.transform[4];
        const y = item.transform[5];
        const w = item.width || 0;
        const h = item.height || item.transform[0] || 12;
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x + w);
        y1 = Math.max(y1, y + h);
      }
      const hasContent = x0 !== Infinity;
      metadata.push({
        page: i,
        width: viewport.width,
        height: viewport.height,
        rotation: page.rotate,
        bbox: hasContent
          ? {
              x0,
              y0: viewport.height - y1,
              x1,
              y1: viewport.height - y0
            }
          : null
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
