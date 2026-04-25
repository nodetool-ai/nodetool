import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import type { ProcessingContext } from "@nodetool/runtime";
import { execFile as execFileCb } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

/**
 * Resolve bytes from a ref object or raw Uint8Array.
 */
function isByte(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 255;
}

function bufferFromArrayLike(
  value: { length: number; [index: number]: unknown }
): Buffer | null {
  if (!Number.isSafeInteger(value.length) || value.length < 0) {
    return null;
  }
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (!isByte(item)) {
      return null;
    }
    bytes[i] = item;
  }
  return Buffer.from(bytes);
}

function bufferFromNumericObject(obj: Record<string, unknown>): Buffer | null {
  if (!Object.hasOwn(obj, "0")) {
    return null;
  }

  let length = 0;
  while (Object.hasOwn(obj, String(length))) {
    if (!isByte(obj[String(length)])) {
      return null;
    }
    length++;
  }

  if (length === 0) {
    return null;
  }

  const bytes = new Uint8Array(length);
  let numericKeyCount = 0;
  for (const key in obj) {
    if (!Object.hasOwn(obj, key) || !/^\d+$/.test(key)) {
      continue;
    }
    const index = Number(key);
    if (index >= length) {
      return null;
    }
    const value = obj[key];
    if (!isByte(value)) {
      return null;
    }
    bytes[index] = value;
    numericKeyCount++;
  }

  if (numericKeyCount !== length) {
    return null;
  }

  return Buffer.from(bytes);
}

function bufferFromBase64(value: string): Buffer | null {
  const trimmed = value.trim();
  const dataUriMatch = trimmed.match(/^data:[^;]+;base64,(.+)$/s);
  const payload = dataUriMatch ? dataUriMatch[1] : trimmed;

  if (
    (!dataUriMatch && payload.length <= 20) ||
    payload.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/\n\r]+=*$/.test(payload)
  ) {
    return null;
  }

  return Buffer.from(payload, "base64");
}

function refToBytes(ref: unknown): Buffer | null {
  if (ref == null) return null;

  if (typeof ref === "string") {
    return bufferFromBase64(ref);
  }

  // Native Uint8Array/Buffer — always copy to own the memory
  if (ref instanceof Uint8Array) return Buffer.copyBytesFrom(ref);
  if (Buffer.isBuffer(ref)) return Buffer.from(ref);
  if (ref instanceof ArrayBuffer) return Buffer.from(new Uint8Array(ref));
  if (ArrayBuffer.isView(ref)) {
    const view = ref as ArrayBufferView;
    return Buffer.from(
      new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
    );
  }
  if (Array.isArray(ref)) {
    return bufferFromArrayLike(ref);
  }
  if (typeof ref !== "object") return null;

  // Cross-context Uint8Array (constructor name match, instanceof fails)
  const name = (ref as object).constructor?.name;
  if (
    (name === "Uint8Array" || name === "Buffer") &&
    typeof (ref as any).length === "number"
  ) {
    const fromArrayLike = bufferFromArrayLike(ref as {
      length: number;
      [index: number]: unknown;
    });
    if (fromArrayLike) {
      return fromArrayLike;
    }
  }

  const obj = ref as Record<string, unknown>;
  const fromNumericObject = bufferFromNumericObject(obj);
  if (fromNumericObject) {
    return fromNumericObject;
  }
  if ("data" in obj) {
    return refToBytes(obj.data);
  }

  return null;
}

async function loadFromUri(uri: string, context?: ProcessingContext): Promise<Buffer | null> {
  if (!uri) return null;
  if (context?.storage) {
    const stored = await context.storage.retrieve(uri);
    if (stored !== null) return Buffer.from(stored);
  }
  let filePath = uri;
  if (filePath.startsWith("file://")) {
    filePath = decodeURIComponent(new URL(filePath).pathname);
  }
  try {
    return Buffer.from(await fs.readFile(filePath));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// PDF → Markdown
// ---------------------------------------------------------------------------

async function pdfToText(inputBytes: Buffer): Promise<string> {
  const { LiteParse } = await import("@llamaindex/liteparse");
  const parser = new LiteParse({ ocrEnabled: false });
  const result = await parser.parse(inputBytes, true);
  return result.text;
}

// ---------------------------------------------------------------------------
// DOCX → Markdown (pandoc)
// ---------------------------------------------------------------------------

async function docxToMarkdown(inputBytes: Buffer): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-docx-"));
  const inputPath = path.join(tmpDir, "input.docx");
  try {
    await fs.writeFile(inputPath, inputBytes);
    const { stdout } = await execFile(
      "pandoc",
      [inputPath, "-f", "docx", "-t", "markdown", "--wrap=none"],
      { maxBuffer: 50 * 1024 * 1024, timeout: 60000 }
    );
    return stdout;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Shared byte format detection
// ---------------------------------------------------------------------------

async function convertBytes(bytes: Buffer, turndown: { turndown(html: string): string }): Promise<string> {
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return pdfToText(bytes);
  }
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return docxToMarkdown(bytes);
  }
  const text = bytes.toString("utf-8");
  if (text.includes("<") && text.includes(">")) {
    return turndown.turndown(text);
  }
  return text;
}

// ---------------------------------------------------------------------------
// ConvertToMarkdown node
// ---------------------------------------------------------------------------

export class ConvertToMarkdownLibNode extends BaseNode {
  static readonly nodeType = "lib.convert.ConvertToMarkdown";
  static readonly title = "Convert To Markdown";
  static readonly description =
    "Converts PDF, DOCX, or HTML to markdown text.\n    markdown, convert, document, pdf, docx, html, bytes\n\n    Connect one input — document ref, raw bytes, or HTML string.";
  static readonly requiredRuntimes = ["pandoc"];
  static readonly metadataOutputTypes = {
    output: "str"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "document",
    default: { type: "document", uri: "", asset_id: null, data: null, metadata: null },
    title: "Document",
    description: "A document ref (PDF, DOCX, or text file)"
  })
  declare document: any;

  @prop({
    type: "bytes",
    default: null,
    title: "Bytes",
    description: "Raw PDF or DOCX bytes (e.g. from HTTP GET Bytes)"
  })
  declare bytes: any;

  @prop({
    type: "str",
    default: "",
    title: "HTML",
    description: "HTML string to convert to markdown"
  })
  declare html: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const TurndownService = (await import("turndown")).default;
    const turndown = new TurndownService();

    // 1. Document ref input
    const doc = this.document;
    if (doc && typeof doc === "object") {
      const uri = typeof doc.uri === "string" ? doc.uri : "";
      let bytes = refToBytes(doc);
      if ((!bytes || bytes.length === 0) && uri) {
        bytes = await loadFromUri(uri, context);
      }
      if (bytes && bytes.length > 0) {
        return { output: await convertBytes(bytes, turndown) };
      }
      if (typeof doc.data === "string" && doc.data) {
        if (doc.data.includes("<") && doc.data.includes(">")) {
          return { output: turndown.turndown(doc.data) };
        }
        return { output: doc.data };
      }
    }

    // 2. Raw bytes input
    const rawBytes = refToBytes(this.bytes);
    if (rawBytes && rawBytes.length > 0) {
      return { output: await convertBytes(rawBytes, turndown) };
    }

    // 3. HTML string input
    const html = String(this.html ?? "");
    if (html) {
      return { output: turndown.turndown(html) };
    }

    throw new Error("Provide a document, bytes, or HTML input");
  }
}

export const LIB_MARKITDOWN_NODES: readonly NodeClass[] = [
  ConvertToMarkdownLibNode
] as const;
