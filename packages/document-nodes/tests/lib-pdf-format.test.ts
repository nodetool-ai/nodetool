import { describe, expect, it } from "vitest";
import { PdfExtractTextNode, PdfToppmNode } from "@nodetool-ai/document-nodes";

const asData = (text: string) => ({
  type: "document",
  uri: "notes.md",
  data: Buffer.from(text).toString("base64")
});

describe("lib.pdf nodes given another format (R25)", () => {
  it("names Markdown instead of failing in the PDF parser", async () => {
    const node = new PdfExtractTextNode();
    node.assign({ pdf: asData("# Heading\n\nBody") });
    await expect(node.process()).rejects.toThrow("the document is a Markdown document");
  });

  it("names a DOCX file", async () => {
    const node = new PdfToppmNode();
    node.assign({
      pdf: { type: "document", uri: "report.docx", data: Buffer.from("PK\u0003\u0004rest").toString("base64") }
    });
    await expect(node.process()).rejects.toThrow("a DOCX document");
  });
});
