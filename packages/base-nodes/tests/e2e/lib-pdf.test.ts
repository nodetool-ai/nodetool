import { describe, expect, it } from "vitest";
import { PdfScreenshotNode, PdfToppmNode } from "../../src/index.js";

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
    "%%EOF"
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
    "%%EOF"
  ].join("\n");
  return Buffer.from(pdf).toString("base64");
}

const singlePagePdf = { data: makeTestPdf() };
const twoPagePdf = { data: makeTwoPagePdf() };

describe("lib.pdf nodes", () => {
  it("throws on missing PDF data", async () => {
    const node = new PdfScreenshotNode();
    node.assign({ pdf: {} });
    await expect(node.process()).rejects.toThrow("No PDF data or URI provided");
  });

  it("Screenshot renders a PDF page as a PNG image", async () => {
    const node = new PdfScreenshotNode();
    node.assign({
      pdf: singlePagePdf,
      start_page: 0,
      end_page: 0,
      dpi: 72
    });
    const result = await node.process();
    const images = result.output as Array<{ type: string; data: string }>;
    expect(images).toHaveLength(1);
    expect(images[0].type).toBe("image");
    // PNG header: base64 "iVBORw0KGgo" = bytes 89 50 4e 47 0d 0a 1a 0a
    expect(images[0].data.startsWith("iVBORw0KGgo")).toBe(true);
  });

  it("Screenshot honors page range across multi-page PDFs", async () => {
    const node = new PdfScreenshotNode();
    node.assign({
      pdf: twoPagePdf,
      start_page: 0,
      end_page: -1,
      dpi: 72
    });
    const result = await node.process();
    const images = result.output as Array<{ type: string; data: string }>;
    expect(images).toHaveLength(2);
  });

  it("Pdftoppm declares the pdftoppm runtime and rejects missing PDF data", async () => {
    expect(PdfToppmNode.nodeType).toBe("lib.pdf.Pdftoppm");
    expect(PdfToppmNode.requiredRuntimes).toEqual(["pdftoppm"]);

    const node = new PdfToppmNode();
    node.assign({ pdf: {} });
    await expect(node.process()).rejects.toThrow("No PDF data or URI provided");
  });
});
