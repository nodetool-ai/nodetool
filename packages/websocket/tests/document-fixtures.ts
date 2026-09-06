/**
 * Fixtures for the `POST /api/documents/extract-text` tests.
 *
 * The PDFs and the DOCX are built here rather than checked in as binaries:
 * each is under a kilobyte of structure, and a reader can see exactly why the
 * scanned PDF has no text layer.
 */
import { strToU8, zipSync } from "fflate";

/**
 * A one-page PDF whose content stream is `content`. Written with an explicit
 * xref table so pdf.js accepts it without reconstructing offsets.
 */
function buildPdf(content: string): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
      "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const startxref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${startxref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

/** A PDF with a real text layer: every line comes back from extraction. */
export function textPdf(lines: string[]): Buffer {
  const ops = lines
    .map((line, i) => `BT /F1 12 Tf 72 ${700 - i * 20} Td (${line}) Tj ET`)
    .join("\n");
  return buildPdf(`${ops}\n`);
}

/**
 * A scanned PDF: one page that paints a filled rectangle and nothing else.
 * The page is readable, so the parser reports it, but there are no text
 * operators to extract — the same shape a page scan has.
 */
export function scannedPdf(): Buffer {
  return buildPdf("0.5 g 72 72 468 648 re f\n");
}

/** The smallest DOCX mammoth accepts: one paragraph per line. */
export function docx(lines: string[]): Buffer {
  const paragraphs = lines
    .map((line) => `<w:p><w:r><w:t>${line}</w:t></w:r></w:p>`)
    .join("");
  const files = {
    "[Content_Types].xml":
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      "</Types>",
    "_rels/.rels":
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      "</Relationships>",
    "word/document.xml":
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      `<w:body>${paragraphs}</w:body></w:document>`
  };
  const entries: Record<string, Uint8Array> = {};
  for (const [name, xml] of Object.entries(files)) {
    entries[name] = strToU8(xml);
  }
  return Buffer.from(zipSync(entries));
}

const BOUNDARY = "----nodetoolTestBoundary";

/** `multipart/form-data` with a single file part named `file`. */
export function multipartBody(
  file: { name: string; type: string; bytes: Buffer } | null,
  field = "file"
): { body: Buffer; contentType: string } {
  const parts: Buffer[] = [];
  if (file) {
    parts.push(
      Buffer.from(
        `--${BOUNDARY}\r\n` +
          `content-disposition: form-data; name="${field}"; filename="${file.name}"\r\n` +
          `content-type: ${file.type}\r\n\r\n`,
        "utf8"
      ),
      file.bytes,
      Buffer.from("\r\n", "utf8")
    );
  }
  parts.push(Buffer.from(`--${BOUNDARY}--\r\n`, "utf8"));
  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${BOUNDARY}`
  };
}
