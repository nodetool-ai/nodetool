import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractPdfText } from "../src/index.js";

describe("shared PDF text parser", () => {
  it("extracts the actual text layer from PDF bytes", async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    pdf.addPage().drawText("NodeTool document fixture", { font });
    const result = await extractPdfText(Buffer.from(await pdf.save()));
    expect(result.pages).toBe(1);
    expect(result.text).toContain("NodeTool document fixture");
  });
});
