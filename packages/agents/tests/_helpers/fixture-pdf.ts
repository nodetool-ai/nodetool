/**
 * A real PDF, small enough to build here rather than commit as a binary.
 *
 * One Helvetica text run per page, with the xref offsets a parser needs. Shared
 * by the `@nodetool-ai/sandbox-pdf` host-module tests and the `lib.pdf.*` node
 * migration test, so both read the same document.
 */
export function buildPdf(pages: readonly string[]): Uint8Array {
  const objects: string[] = [];
  const add = (body: string): number => objects.push(body); // push returns the 1-based number

  const fontNum = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const contentNums = pages.map((text) => {
    const stream = `BT /F1 24 Tf 72 700 Td (${text.replace(/([()\\])/g, "\\$1")}) Tj ET`;
    return add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  // The page objects name their parent, which is written after them.
  const pagesNum = objects.length + pages.length + 1;
  const pageNums = contentNums.map((contentNum) =>
    add(
      `<< /Type /Page /Parent ${pagesNum} 0 R /MediaBox [0 0 612 792] ` +
        `/Resources << /Font << /F1 ${fontNum} 0 R >> >> /Contents ${contentNum} 0 R >>`
    )
  );
  add(
    `<< /Type /Pages /Kids [${pageNums.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageNums.length} >>`
  );
  const catalogNum = add(`<< /Type /Catalog /Pages ${pagesNum} 0 R >>`);

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogNum} 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf, "latin1"));
}
