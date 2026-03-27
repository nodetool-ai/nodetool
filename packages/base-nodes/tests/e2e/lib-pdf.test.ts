import { describe, expect, it } from "vitest";
import {
  GetPageCountPdfPlumberNode,
  ExtractTextPdfPlumberNode,
  ExtractPageMetadataPdfPlumberNode,
  ExtractTablesPdfPlumberNode,
  ExtractImagesPdfPlumberNode,
  ExtractTextPyMuPdfNode,
  ExtractMarkdownPyMuPdfNode,
  ExtractTextBlocksPyMuPdfNode,
  ExtractTextWithStylePyMuPdfNode,
  ExtractTablesPyMuPdfNode,
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

const singlePagePdf = { data: makeTestPdf() };
const twoPagePdf = { data: makeTwoPagePdf() };

describe("lib.pdfplumber nodes", () => {
  it("GetPageCount returns page count", async () => {
    const result = await new GetPageCountPdfPlumberNode().process({ pdf: singlePagePdf });
    expect(result.output).toBe(1);

    const result2 = await new GetPageCountPdfPlumberNode().process({ pdf: twoPagePdf });
    expect(result2.output).toBe(2);
  });

  it("ExtractText extracts text from PDF", async () => {
    const result = await new ExtractTextPdfPlumberNode().process({
      pdf: singlePagePdf,
      start_page: 0,
      end_page: 0,
    });
    expect(result.output).toContain("Hello World");
  });

  it("ExtractText with page range", async () => {
    const result = await new ExtractTextPdfPlumberNode().process({
      pdf: twoPagePdf,
      start_page: 0,
      end_page: 1,
    });
    const text = String(result.output);
    expect(text).toContain("Page One");
    expect(text).toContain("Page Two");
  });

  it("ExtractPageMetadata returns page dimensions", async () => {
    const result = await new ExtractPageMetadataPdfPlumberNode().process({
      pdf: singlePagePdf,
      start_page: 0,
      end_page: 0,
    });
    const pages = result.output as Array<Record<string, unknown>>;
    expect(pages).toHaveLength(1);
    expect(pages[0].page_number).toBe(1);
    expect(pages[0].width).toBe(612);
    expect(pages[0].height).toBe(792);
    expect(pages[0].bbox).toEqual([0, 0, 612, 792]);
  });

  it("ExtractTables returns array (may be empty for simple PDFs)", async () => {
    const result = await new ExtractTablesPdfPlumberNode().process({
      pdf: singlePagePdf,
      start_page: 0,
      end_page: 0,
    });
    expect(Array.isArray(result.output)).toBe(true);
  });

  it("ExtractImages returns empty array (stub)", async () => {
    const result = await new ExtractImagesPdfPlumberNode().process({
      pdf: singlePagePdf,
    });
    expect(result.output).toEqual([]);
  });

  it("throws on missing PDF data", async () => {
    await expect(
      new GetPageCountPdfPlumberNode().process({ pdf: {} })
    ).rejects.toThrow("No PDF data or URI provided");
  });
});

describe("lib.pymupdf nodes", () => {
  it("ExtractText extracts text", async () => {
    const result = await new ExtractTextPyMuPdfNode().process({
      pdf: singlePagePdf,
      start_page: 0,
      end_page: -1,
    });
    expect(String(result.output)).toContain("Hello World");
  });

  it("ExtractMarkdown produces markdown output", async () => {
    const result = await new ExtractMarkdownPyMuPdfNode().process({
      pdf: singlePagePdf,
      start_page: 0,
      end_page: -1,
    });
    expect(typeof result.output).toBe("string");
    expect(String(result.output).length).toBeGreaterThan(0);
  });

  it("ExtractTextBlocks returns blocks with bboxes", async () => {
    const result = await new ExtractTextBlocksPyMuPdfNode().process({
      pdf: singlePagePdf,
      start_page: 0,
      end_page: -1,
    });
    const blocks = result.output as Array<Record<string, unknown>>;
    expect(Array.isArray(blocks)).toBe(true);
    if (blocks.length > 0) {
      expect(blocks[0]).toHaveProperty("text");
      expect(blocks[0]).toHaveProperty("bbox");
      expect(blocks[0]).toHaveProperty("page");
    }
  });

  it("ExtractTextWithStyle returns styled text items", async () => {
    const result = await new ExtractTextWithStylePyMuPdfNode().process({
      pdf: singlePagePdf,
      start_page: 0,
      end_page: -1,
    });
    const items = result.output as Array<Record<string, unknown>>;
    expect(Array.isArray(items)).toBe(true);
    if (items.length > 0) {
      expect(items[0]).toHaveProperty("text");
      expect(items[0]).toHaveProperty("font");
      expect(items[0]).toHaveProperty("size");
      expect(items[0]).toHaveProperty("bbox");
    }
  });

  it("ExtractTables returns array", async () => {
    const result = await new ExtractTablesPyMuPdfNode().process({
      pdf: singlePagePdf,
      start_page: 0,
      end_page: -1,
    });
    expect(Array.isArray(result.output)).toBe(true);
  });

  it("respects page range on multi-page PDF", async () => {
    const page1 = await new ExtractTextPyMuPdfNode().process({
      pdf: twoPagePdf,
      start_page: 0,
      end_page: 0,
    });
    expect(String(page1.output)).toContain("Page One");
    expect(String(page1.output)).not.toContain("Page Two");

    const page2 = await new ExtractTextPyMuPdfNode().process({
      pdf: twoPagePdf,
      start_page: 1,
      end_page: 1,
    });
    expect(String(page2.output)).toContain("Page Two");
    expect(String(page2.output)).not.toContain("Page One");
  });
});
