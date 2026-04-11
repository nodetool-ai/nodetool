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
 * Resolve bytes from a document/video/audio/image ref or raw Uint8Array.
 * Handles cross-context Uint8Array (constructor name check).
 */
function refToBytes(ref: unknown): Buffer | null {
  if (!ref || typeof ref !== "object") return null;
  const obj = ref as Record<string, unknown>;

  // Real Uint8Array or Buffer
  if (ref instanceof Uint8Array) return Buffer.from(ref);
  if (Buffer.isBuffer(ref)) return ref;

  // Cross-context Uint8Array (from MsgPack/kernel)
  const name = (ref as object).constructor?.name;
  if ((name === "Uint8Array" || name === "Buffer") && typeof (ref as any).length === "number") {
    // Use the underlying ArrayBuffer to avoid byte-by-byte copy
    const v = ref as { buffer?: ArrayBuffer; byteOffset?: number; byteLength?: number; length: number; [i: number]: number };
    if (v.buffer instanceof ArrayBuffer) {
      return Buffer.from(v.buffer, v.byteOffset ?? 0, v.byteLength ?? v.length);
    }
    // Fallback: copy via Uint8Array constructor which handles array-like objects
    return Buffer.from(new Uint8Array(v as unknown as ArrayLike<number>));
  }

  // Inline data field (nested Uint8Array or base64-only string)
  if (obj.data instanceof Uint8Array) return Buffer.from(obj.data);
  if (Buffer.isBuffer(obj.data)) return obj.data as Buffer;
  if (typeof obj.data === "string" && obj.data.length > 20 &&
      /^[A-Za-z0-9+/\n\r]+=*$/.test(obj.data.slice(0, 200))) {
    return Buffer.from(obj.data, "base64");
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
// PDF → Text (pdftotext from poppler)
// ---------------------------------------------------------------------------

async function findBinary(name: string): Promise<string> {
  // Check conda env first
  const condaPrefix = process.env.CONDA_PREFIX;
  if (condaPrefix) {
    const condaPath = path.join(condaPrefix, "bin", name);
    try { await fs.access(condaPath); return condaPath; } catch { /* not there */ }
  }
  // Check common conda locations
  const home = process.env.HOME || os.homedir();
  for (const envDir of [
    path.join(home, "conda/envs/nodetool/bin"),
    path.join(home, ".nodetool/conda_env/bin"),
    path.join(home, "miniconda3/envs/nodetool/bin"),
  ]) {
    const p = path.join(envDir, name);
    try { await fs.access(p); return p; } catch { /* not there */ }
  }
  // Fall back to PATH
  return name;
}

async function pdfToText(inputBytes: Buffer): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-pdf-"));
  const inputPath = path.join(tmpDir, "input.pdf");
  const outputPath = path.join(tmpDir, "output.txt");
  try {
    await fs.writeFile(inputPath, inputBytes);
    const bin = await findBinary("pdftotext");
    console.log(`[pdfToText] running: ${bin} -layout ${inputPath}`);
    await execFile(bin, ["-layout", inputPath, outputPath], {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 60000
    });
    return await fs.readFile(outputPath, "utf-8");
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// DOCX → Markdown (pandoc)
// ---------------------------------------------------------------------------

async function docxToMarkdown(inputBytes: Buffer): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-docx-"));
  const inputPath = path.join(tmpDir, "input.docx");
  try {
    await fs.writeFile(inputPath, inputBytes);
    const bin = await findBinary("pandoc");
    const { stdout } = await execFile(
      bin,
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
  static readonly requiredRuntimes = ["pdftotext", "pandoc"];
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
    const t0 = Date.now();
    const TurndownService = (await import("turndown")).default;
    const turndown = new TurndownService();
    console.log(`[ConvertToMarkdown] import turndown: ${Date.now() - t0}ms`);

    // 1. Document ref input
    const doc = this.document;
    if (doc && typeof doc === "object") {
      console.log(`[ConvertToMarkdown] doc: constructor=${doc.constructor?.name}, instanceof=${doc instanceof Uint8Array}, keys=${Object.keys(doc).slice(0,5)}, length=${doc.length}`);
      const uri = typeof doc.uri === "string" ? doc.uri : "";
      const t1 = Date.now();
      let bytes = refToBytes(doc);
      console.log(`[ConvertToMarkdown] refToBytes: ${Date.now() - t1}ms, got=${bytes ? bytes.length : "null"}`);
      if ((!bytes || bytes.length === 0) && uri) {
        const t2 = Date.now();
        bytes = await loadFromUri(uri, context);
        console.log(`[ConvertToMarkdown] loadFromUri: ${Date.now() - t2}ms, got=${bytes ? bytes.length : "null"}`);
      }
      if (bytes && bytes.length > 0) {
        const t3 = Date.now();
        const result = await convertBytes(bytes, turndown);
        console.log(`[ConvertToMarkdown] convertBytes: ${Date.now() - t3}ms, total: ${Date.now() - t0}ms`);
        return { output: result };
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
