import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import type { ProcessingContext } from "@nodetool/runtime";

/**
 * Resolve raw bytes from various input shapes:
 * - Uint8Array / Buffer
 * - base64 string
 * - { __bytes__: base64 } (DownloadFile output)
 * - { data: ... } (document ref with inline data)
 */
function looksLikeBase64(s: string): boolean {
  return s.length > 20 && /^[A-Za-z0-9+/\n\r]+=*$/.test(s.slice(0, 100));
}

function resolveBytes(input: unknown): Buffer | null {
  if (!input) return null;
  if (input instanceof Uint8Array) return Buffer.from(input);
  if (Buffer.isBuffer(input)) return input;
  if (typeof input === "string" && looksLikeBase64(input)) {
    return Buffer.from(input, "base64");
  }
  if (typeof input === "object") {
    const obj = input as Record<string, unknown>;
    if (typeof obj.__bytes__ === "string") {
      return Buffer.from(obj.__bytes__, "base64");
    }
    if (obj.data instanceof Uint8Array) return Buffer.from(obj.data);
    if (Buffer.isBuffer(obj.data)) return obj.data as Buffer;
    if (typeof obj.data === "string" && looksLikeBase64(obj.data)) {
      return Buffer.from(obj.data, "base64");
    }
  }
  return null;
}

function isPdfBuffer(buf: Buffer): boolean {
  return buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
}

function isDocxBuffer(buf: Buffer): boolean {
  // DOCX files are ZIP archives starting with PK
  return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
}

export class ConvertToMarkdownLibNode extends BaseNode {
  static readonly nodeType = "lib.convert.ConvertToMarkdown";
  static readonly title = "Convert To Markdown";
  static readonly description =
    "Converts various document formats to markdown.\n    markdown, convert, document, pdf, docx, html, bytes\n\n    Accepts document refs, raw bytes (from DownloadFile), or text.\n    Auto-detects PDF and DOCX from binary content.";
  static readonly metadataOutputTypes = {
    output: "str"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "any",
    default: null,
    title: "Input",
    description: "Document ref, raw bytes (from DownloadFile), HTML string, or text to convert"
  })
  declare document: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const input = this.document;
    if (!input) {
      throw new Error("Input is required");
    }

    const TurndownService = (await import("turndown")).default;
    const turndown = new TurndownService();

    // Try to get a URI from the input
    const uri = (typeof input === "object" && input !== null && typeof input.uri === "string")
      ? input.uri
      : "";

    // Try to resolve raw bytes from the input
    const bytes = resolveBytes(input);

    // Auto-detect binary formats from bytes
    if (bytes && bytes.length > 0) {
      if (isPdfBuffer(bytes)) {
        return { output: await pdfToMarkdown(bytes) };
      }
      if (isDocxBuffer(bytes) || uri.toLowerCase().endsWith(".docx")) {
        const mammoth = await import("mammoth");
        const result = await mammoth.convertToHtml({ buffer: bytes });
        const markdown = turndown.turndown(result.value);
        return { output: markdown };
      }
      // Try as text
      const text = bytes.toString("utf-8");
      if (text.includes("<") && text.includes(">")) {
        return { output: turndown.turndown(text) };
      }
      return { output: text };
    }

    // Handle string input (HTML or plain text)
    const textData = typeof input === "string" ? input
      : (typeof input === "object" && input !== null && typeof input.data === "string") ? input.data
      : "";

    if (textData) {
      if (textData.includes("<") && textData.includes(">")) {
        return { output: turndown.turndown(textData) };
      }
      return { output: textData };
    }

    // Try URI-based loading
    if (uri) {
      let fileBytes: Buffer | null = null;

      if (context?.storage) {
        const stored = await context.storage.retrieve(uri);
        if (stored !== null) fileBytes = Buffer.from(stored);
      }
      if (!fileBytes) {
        let filePath = uri;
        if (filePath.startsWith("file://")) {
          filePath = decodeURIComponent(new URL(filePath).pathname);
        }
        const fs = await import("node:fs/promises");
        fileBytes = Buffer.from(await fs.readFile(filePath));
      }

      if (fileBytes) {
        if (isPdfBuffer(fileBytes)) {
          return { output: await pdfToMarkdown(fileBytes) };
        }
        if (isDocxBuffer(fileBytes) || uri.toLowerCase().endsWith(".docx")) {
          const mammoth = await import("mammoth");
          const result = await mammoth.convertToHtml({ buffer: fileBytes });
          return { output: turndown.turndown(result.value) };
        }
        const content = fileBytes.toString("utf-8");
        if (content.includes("<") && content.includes(">")) {
          return { output: turndown.turndown(content) };
        }
        return { output: content };
      }
    }

    throw new Error("Could not process input — provide a document, bytes, or text");
  }
}

/**
 * Convert PDF bytes to markdown using pdfjs-dist.
 */
async function pdfToMarkdown(pdfBytes: Buffer): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes) }).promise;
  const parts: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const sizes: number[] = [];
    for (const item of content.items as any[]) {
      if (item.str?.trim()) {
        sizes.push(item.height || item.transform?.[0] || 12);
      }
    }
    const avgSize = sizes.length > 0 ? sizes.reduce((a, b) => a + b, 0) / sizes.length : 12;

    let lastY: number | null = null;
    const lines: string[] = [];
    let currentLine = "";

    for (const item of content.items as any[]) {
      const text = item.str ?? "";
      if (!text) continue;
      const y = item.transform?.[5] ?? 0;
      const size = item.height || item.transform?.[0] || 12;

      if (lastY !== null && Math.abs(y - lastY) > size * 0.5) {
        if (currentLine.trim()) {
          const trimmed = currentLine.trim();
          if (size > avgSize * 1.4) {
            lines.push(`## ${trimmed}`);
          } else if (size > avgSize * 1.2) {
            lines.push(`### ${trimmed}`);
          } else {
            lines.push(trimmed);
          }
        }
        currentLine = text;
      } else {
        currentLine += text;
      }
      lastY = y;
    }
    if (currentLine.trim()) {
      lines.push(currentLine.trim());
    }
    parts.push(lines.join("\n"));
  }

  return parts.join("\n\n---\n\n");
}

export const LIB_MARKITDOWN_NODES: readonly NodeClass[] = [
  ConvertToMarkdownLibNode
] as const;
