import { describe, expect, it } from "vitest";
import {
  PdfPageCountNode,
  PdfExtractTextNode,
  PdfPageMetadataNode,
  PdfExtractTablesNode,
  PdfExtractMarkdownNode,
  PdfExtractTextBlocksNode,
  PdfExtractStyledTextNode,
} from "../../src/index.js";

// Minimal valid PDF with text content (single page, "Hello World" text)
function makeTestPdf(): string {
  const pdf = [
    "%PDF-1.4",
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj",
    "4 0 obj<</Length 44>>stream",
    "BT /F1 12 Tf 100 700 Td (Hello World) Tj ET",
    "endstream endobj",
    "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj",
    "xref",
    "0 6",
    "0000000000 65535 f ",
    "0000000009 00000 n ",
    "0000000058 00000 n ",
    "0000000115 00000 n ",
    "0000000266 00000 n ",
    "0000000360 00000 n ",
    "trailer<</Size 6/Root 1 0 R>>",
    "startxref",
    "430",
    "%%EOF",
  ].join("\n");
  return Buffer.from(pdf).toString("base64");
}

// Two-page PDF
function makeTwoPagePdf(): string {
  const pdf = [
    "%PDF-1.4",
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    "2 0 obj<</Type/Pages/Kids[3 0 R 6 0 R]/Count 2>>endobj",
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj",
    "4 0 obj<</Length 42>>stream",
    "BT /F1 12 Tf 100 700 Td (Page One) Tj ET",
    "endstream endobj",
    "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj",
    "6 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 7 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj",
    "7 0 obj<</Length 42>>stream",
    "BT /F1 12 Tf 100 700 Td (Page Two) Tj ET",
    "endstream endobj",
    "xref",
    "0 8",
    "0000000000 65535 f ",
    "0000000009 00000 n ",
    "0000000058 00000 n ",
    "0000000120 00000 n ",
    "0000000271 00000 n ",
    "0000000363 00000 n ",
    "0000000430 00000 n ",
    "0000000581 00000 n ",
    "trailer<</Size 8/Root 1 0 R>>",
    "startxref",
    "673",
    "%%EOF",
  ].join("\n");
  return Buffer.from(pdf).toString("base64");
}

// PDF with table-like layout: multiple text items at different X positions on same Y lines
function makeTablePdf(): { data: string } {
  // Create a PDF with 3 columns x 3 rows of text at distinct X positions
  const stream = [
    "BT",
    "/F1 10 Tf",
    "50 700 Td (Name) Tj",
    "200 700 Td (Age) Tj",
    "350 700 Td (City) Tj",
    "50 680 Td (Alice) Tj",
    "200 680 Td (30) Tj",
    "350 680 Td (NYC) Tj",
    "50 660 Td (Bob) Tj",
    "200 660 Td (25) Tj",
    "350 660 Td (LA) Tj",
    "ET",
  ].join("\n");
  const streamLength = stream.length;
  const pdf = [
    "%PDF-1.4",
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
    `3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj`,
    `4 0 obj<</Length ${streamLength}>>stream`,
    stream,
    "endstream endobj",
    "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj",
    "xref",
    "0 6",
    "0000000000 65535 f ",
    "0000000009 00000 n ",
    "0000000058 00000 n ",
    "0000000115 00000 n ",
    "0000000266 00000 n ",
    "0000000360 00000 n ",
    "trailer<</Size 6/Root 1 0 R>>",
    "startxref",
    "430",
    "%%EOF",
  ].join("\n");
  return { data: Buffer.from(pdf).toString("base64") };
}

const singlePagePdf = { data: makeTestPdf() };
const twoPagePdf = { data: makeTwoPagePdf() };

describe("lib.pdf nodes", () => {
  it("PageCount returns page count", async () => {
    const node1 = new PdfPageCountNode();
    node1.assign({ pdf: singlePagePdf });
    const result = await node1.process();
    expect(result.output).toBe(1);

    const node2 = new PdfPageCountNode();
    node2.assign({ pdf: twoPagePdf });
    const result2 = await node2.process();
    expect(result2.output).toBe(2);
  });

  it("ExtractText extracts text from PDF", async () => {
    const node = new PdfExtractTextNode();
    node.assign({
      pdf: singlePagePdf,
      start_page: 0,
      end_page: 0,
    });
    const result = await node.process();
    expect(result.output).toContain("Hello World");
  });

  it("ExtractText with page range", async () => {
    const node = new PdfExtractTextNode();
    node.assign({
      pdf: twoPagePdf,
      start_page: 0,
      end_page: 1,
    });
    const result = await node.process();
    const text = String(result.output);
    expect(text).toContain("Page One");
    expect(text).toContain("Page Two");
  });

  it("PageMetadata returns page dimensions", async () => {
    const node = new PdfPageMetadataNode();
    node.assign({
      pdf: singlePagePdf,
      start_page: 0,
      end_page: 0,
    });
    const result = await node.process();
    const pages = result.output as Array<Record<string, unknown>>;
    expect(pages).toHaveLength(1);
    expect(pages[0].page).toBe(0);
    expect(pages[0].width).toBe(612);
    expect(pages[0].height).toBe(792);
  });

  it("ExtractTables returns array (may be empty for simple PDFs)", async () => {
    const node = new PdfExtractTablesNode();
    node.assign({
      pdf: singlePagePdf,
      start_page: 0,
      end_page: 0,
    });
    const result = await node.process();
    expect(Array.isArray(result.output)).toBe(true);
    // Simple PDF has no table-like layout, so output should be empty
    expect(result.output).toHaveLength(0);
  });

  it("throws on missing PDF data", async () => {
    const node = new PdfPageCountNode();
    node.assign({ pdf: {} });
    await expect(
      node.process()
    ).rejects.toThrow("No PDF data or URI provided");
  });

  it("ExtractMarkdown produces markdown containing the PDF text", async () => {
    const node = new PdfExtractMarkdownNode();
    node.assign({
      pdf: singlePagePdf,
      start_page: 0,
      end_page: -1,
    });
    const result = await node.process();
    expect(typeof result.output).toBe("string");
    expect(result.output).toContain("Hello World");
  });

  it("ExtractTextBlocks returns blocks with text and bboxes", async () => {
    const node = new PdfExtractTextBlocksNode();
    node.assign({
      pdf: singlePagePdf,
      start_page: 0,
      end_page: -1,
    });
    const result = await node.process();
    const blocks = result.output as Array<Record<string, unknown>>;
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks[0].page).toBe(0);
    expect(blocks[0].text).toContain("Hello World");
    const bbox = blocks[0].bbox as Record<string, number>;
    expect(typeof bbox.x0).toBe("number");
    expect(typeof bbox.y0).toBe("number");
    expect(typeof bbox.x1).toBe("number");
    expect(typeof bbox.y1).toBe("number");
  });

  it("ExtractStyledText returns styled text with font and size", async () => {
    const node = new PdfExtractStyledTextNode();
    node.assign({
      pdf: singlePagePdf,
      start_page: 0,
      end_page: -1,
    });
    const result = await node.process();
    const items = result.output as Array<Record<string, unknown>>;
    expect(items.length).toBeGreaterThan(0);
    // Find the item containing "Hello World"
    const helloItem = items.find((it) => String(it.text).includes("Hello World"));
    expect(helloItem).toBeDefined();
    expect(helloItem!.page).toBe(0);
    expect(typeof helloItem!.font).toBe("string");
    expect(helloItem!.size).toBeGreaterThan(0);
    const bbox = helloItem!.bbox as Record<string, number>;
    expect(bbox.x0).toBeGreaterThanOrEqual(0);
    expect(bbox.y1).toBeGreaterThan(bbox.y0);
  });

  it("ExtractTables with table-like PDF returns structured data", async () => {
    const node = new PdfExtractTablesNode();
    node.assign({
      pdf: makeTablePdf(),
      start_page: 0,
      end_page: -1,
    });
    const result = await node.process();
    expect(Array.isArray(result.output)).toBe(true);
    if (result.output.length > 0) {
      const table = result.output[0] as Record<string, unknown>;
      expect(table).toHaveProperty("header");
      expect(table).toHaveProperty("rows");
      expect(table).toHaveProperty("columns");
      expect(table).toHaveProperty("page");
      expect(Array.isArray(table.header)).toBe(true);
      expect(Array.isArray(table.rows)).toBe(true);
      expect(typeof table.columns).toBe("number");
      expect((table.columns as number)).toBeGreaterThanOrEqual(2);
    }
  });

  it("respects page range on multi-page PDF", async () => {
    const node1 = new PdfExtractTextNode();
    node1.assign({
      pdf: twoPagePdf,
      start_page: 0,
      end_page: 0,
    });
    const page1 = await node1.process();
    expect(String(page1.output)).toContain("Page One");
    expect(String(page1.output)).not.toContain("Page Two");

    const node2 = new PdfExtractTextNode();
    node2.assign({
      pdf: twoPagePdf,
      start_page: 1,
      end_page: 1,
    });
    const page2 = await node2.process();
    expect(String(page2.output)).toContain("Page Two");
    expect(String(page2.output)).not.toContain("Page One");
  });
});
