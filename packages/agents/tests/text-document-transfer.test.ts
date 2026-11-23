import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { convertDocumentBytesToMarkdown } from "../src/text-document-transfer.js";

function minimalDocx(heading: string, body: string): Uint8Array {
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const text = (t: string) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`;
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const rel = (id: string, type: string, target: string) =>
    `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`;
  const documentXml =
    `${xml}<w:document ${W}><w:body>` +
    `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>${text(heading)}</w:p>` +
    `<w:p>${text(body)}</w:p>` +
    "</w:body></w:document>";
  return zipSync({
    "[Content_Types].xml": strToU8(
      `${xml}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        "</Types>"
    ),
    "_rels/.rels": strToU8(
      `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        rel("rId1", "officeDocument", "word/document.xml") +
        "</Relationships>"
    ),
    "word/_rels/document.xml.rels": strToU8(
      `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        rel("rId1", "styles", "styles.xml") +
        "</Relationships>"
    ),
    "word/document.xml": strToU8(documentXml),
    "word/styles.xml": strToU8(
      `${xml}<w:styles ${W}><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`
    )
  });
}

async function minimalPdf(text: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 200]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(text, { x: 40, y: 120, size: 16, font });
  return doc.save();
}

describe("convertDocumentBytesToMarkdown", () => {
  it("converts HTML identified by filename or content type with charset", async () => {
    const html = new TextEncoder().encode("<h1>Brief</h1><p>Ship <strong>now</strong>.</p>");

    const byName = await convertDocumentBytesToMarkdown({
      bytes: html,
      filename: "brief.html"
    });
    expect(byName).toMatch(/^# Brief/m);
    expect(byName).toContain("**now**");

    const byMime = await convertDocumentBytesToMarkdown({
      bytes: html,
      contentType: "text/html; charset=utf-8"
    });
    expect(byMime).toMatch(/^# Brief/m);
  });

  it("sniffs DOCX bytes without filename or content type", async () => {
    const docx = minimalDocx("Launch Plan", "Ship the release.");
    const markdown = await convertDocumentBytesToMarkdown({ bytes: docx });
    expect(markdown).toMatch(/^# Launch Plan/m);
    expect(markdown).toContain("Ship the release.");
  });

  it("sniffs PDF bytes without filename or content type", async () => {
    const pdf = await minimalPdf("Quarterly Summary");
    const markdown = await convertDocumentBytesToMarkdown({ bytes: pdf });
    expect(markdown).toContain("Quarterly Summary");
  });

  it("returns null for non-DOCX ZIP archives and unknown formats", async () => {
    const plainZip = zipSync({ "hello.txt": strToU8("hello") });
    expect(await convertDocumentBytesToMarkdown({ bytes: plainZip })).toBeNull();
    expect(
      await convertDocumentBytesToMarkdown({
        bytes: new TextEncoder().encode("sku,name\n1,Lamp\n"),
        filename: "catalog.csv",
        contentType: "text/csv"
      })
    ).toBeNull();
  });
});
