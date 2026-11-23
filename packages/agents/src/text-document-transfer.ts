/**
 * Documents in and out of NodeTool (document editor PRD R17, R18, R19).
 *
 * Import turns a Markdown, text, HTML, DOCX or PDF file, or a Google Doc,
 * into a Markdown document in a project folder. Export writes a document as
 * PDF or HTML next to it, or as a new Google Doc. The `import_document` and
 * `export_document` capabilities and the editor's tRPC routes share these
 * functions.
 *
 * DOCX import keeps headings, lists, tables, links and emphasis (mammoth to
 * HTML, then turndown). PDF import keeps the text only: a PDF stores
 * positioned glyphs, not structure.
 */
import type { Asset } from "@nodetool-ai/models";

import { convertDocumentBytes } from "./capabilities/document-conversion.js";
import { extractPdfPages } from "./capabilities/documents.js";
import { isString } from "./utils/type-guards.js";

/** The formats a document imports from. */
export type ImportFormat = "markdown" | "text" | "html" | "docx" | "pdf";

/** The formats a document exports to as a file. */
export type ExportFileFormat = "md" | "txt" | "pdf" | "html";

const IMPORT_EXTENSIONS: Readonly<Record<string, ImportFormat>> = {
  md: "markdown",
  markdown: "markdown",
  txt: "text",
  text: "text",
  html: "html",
  htm: "html",
  docx: "docx",
  pdf: "pdf"
};

const IMPORT_CONTENT_TYPES: Readonly<Record<string, ImportFormat>> = {
  "text/markdown": "markdown",
  "text/x-markdown": "markdown",
  "text/plain": "text",
  "text/html": "html",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/pdf": "pdf"
};

const EXPORTS: Readonly<Record<ExportFileFormat, { contentType: string; extension: string }>> = {
  md: { contentType: "text/markdown", extension: "md" },
  txt: { contentType: "text/plain", extension: "txt" },
  pdf: { contentType: "application/pdf", extension: "pdf" },
  html: { contentType: "text/html", extension: "html" }
};

const EXPORT_STRIP_EXTENSIONS: Readonly<Record<ExportFileFormat, RegExp>> = {
  md: /\.(md|markdown)$/i,
  txt: /\.txt$/i,
  pdf: /\.pdf$/i,
  html: /\.(html|htm)$/i
};

/** Thrown for a source or target the transfer cannot handle. */
export class DocumentTransferError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentTransferError";
  }
}

/** The import format of a file, by extension first, or null. */
export function importFormatOf(name: string, contentType?: string | null): ImportFormat | null {
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  const mime = (contentType ?? "").toLowerCase().split(";")[0]?.trim() ?? "";
  return IMPORT_EXTENSIONS[extension] ?? IMPORT_CONTENT_TYPES[mime] ?? null;
}

function sniffImportFormat(bytes: Uint8Array): ImportFormat | null {
  if (bytes.length < 4) return null;
  const head = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
  if (head === "%PDF") return "pdf";
  if (
    head === "PK\u0003\u0004" &&
    Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).includes("word/document.xml")
  ) {
    return "docx";
  }
  return null;
}

/** Markdown for the bytes of a file in `format`. */
export async function markdownFromBytes(bytes: Uint8Array, format: ImportFormat): Promise<string> {
  switch (format) {
    case "markdown":
    case "text":
      return new TextDecoder("utf-8").decode(bytes);
    case "html":
    case "docx":
      return String(await convertDocumentBytes(bytes, format, "markdown"));
    case "pdf": {
      const { pages } = await extractPdfPages(bytes);
      return `${pages.map((page) => page.trim()).filter(Boolean).join("\n\n")}\n`;
    }
  }
}

/**
 * Convert document bytes (`.md`, `.txt`, `.html`, `.docx`, or `.pdf`) to
 * Markdown, or return `null` when the format is unrecognized.
 */
export async function convertDocumentBytesToMarkdown(args: {
  bytes: Uint8Array;
  filename?: string | null;
  contentType?: string | null;
}): Promise<string | null> {
  const format =
    importFormatOf(args.filename ?? "", args.contentType) ??
    sniffImportFormat(args.bytes);
  if (!format) return null;
  return markdownFromBytes(args.bytes, format);
}

/** The bytes of `markdown` exported as `format`. */
export async function exportMarkdownBytes(
  markdown: string,
  format: ExportFileFormat
): Promise<Uint8Array> {
  const encoded = new TextEncoder().encode(markdown);
  if (format === "md") return encoded;
  const targetFormat = format === "txt" ? "text" : format;
  const converted = await convertDocumentBytes(encoded, "markdown", targetFormat);
  return isString(converted) ? new TextEncoder().encode(converted) : converted;
}

function baseName(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

function directoryOf(path: string | null): string {
  if (!path) return "";
  const slash = path.lastIndexOf("/");
  return slash > 0 ? path.slice(0, slash) : "";
}

function normalizeExportDirectory(directory: string): string {
  const normalized = directory.trim().replaceAll("\\", "/");
  const segments: string[] = [];
  for (const segment of normalized.split("/")) {
    if (segment === "..") {
      throw new DocumentTransferError(
        "Export directory must stay inside the project folder."
      );
    }
    if (segment === "" || segment === ".") continue;
    if (segment.toLowerCase() === ".nodetool") {
      throw new DocumentTransferError(
        "Export directory cannot target the reserved .nodetool folder."
      );
    }
    segments.push(segment);
  }
  return segments.join("/");
}

function exportBaseName(
  documentName: string,
  format: ExportFileFormat,
  requestedName?: string
): string {
  const trimmed = requestedName?.trim();
  if (trimmed) {
    const stripped = trimmed.replace(EXPORT_STRIP_EXTENSIONS[format], "").trim();
    if (stripped) return stripped;
  }
  return baseName(documentName);
}

/** Import the user's file asset `sourceAssetId` as a new Markdown document beside it. */
export async function importAssetAsDocument(args: {
  userId: string;
  sourceAssetId: string;
  /** The project for a source outside any project folder. */
  projectId?: string | null;
  name?: string;
}): Promise<Asset> {
  const { Asset } = await import("@nodetool-ai/models");
  const { createTextDocument, readAssetFileBytes } = await import(
    "@nodetool-ai/asset-services/text-documents"
  );
  const source = await Asset.find(args.userId, args.sourceAssetId);
  if (!source || source.content_type === "folder") {
    throw new DocumentTransferError(`File ${args.sourceAssetId} was not found.`);
  }
  const format = importFormatOf(source.name, source.content_type);
  if (!format) {
    throw new DocumentTransferError(
      `${source.name} cannot be imported. Import reads .md, .txt, .html, .docx and .pdf files.`
    );
  }
  const markdown = await markdownFromBytes(await readAssetFileBytes(source), format);
  return createTextDocument({
    userId: args.userId,
    projectId: source.project_id ?? args.projectId ?? null,
    name: args.name?.trim() || baseName(source.name),
    content: markdown,
    directory: directoryOf(source.workspace_path)
  });
}

/** Write document `document` as an `.md`, `.txt`, `.pdf` or `.html` file in the project folder. */
export async function exportDocumentFile(
  document: Asset,
  format: ExportFileFormat,
  options?: { directory?: string; name?: string; contentOverride?: string }
): Promise<Asset> {
  const { readTextDocument, saveProjectAsset } = await import("@nodetool-ai/asset-services");
  const target = EXPORTS[format];
  const directory =
    options?.directory !== undefined
      ? normalizeExportDirectory(options.directory)
      : directoryOf(document.workspace_path);
  const stem = exportBaseName(document.name, format, options?.name);
  const markdown =
    options?.contentOverride !== undefined
      ? options.contentOverride
      : await readTextDocument(document);
  const bytes = await exportMarkdownBytes(markdown, format);
  return saveProjectAsset({
    userId: document.user_id,
    projectId: document.project_id,
    name: `${stem}.${target.extension}`,
    contentType: target.contentType,
    directory,
    bytes
  });
}

/** The document id in a Google Doc URL, or the value itself when it is an id. */
export function googleDocIdOf(value: string): string | null {
  const trimmed = value.trim();
  const fromUrl = /\/document\/(?:u\/\d+\/)?d\/([\w-]+)/.exec(trimmed);
  if (fromUrl) return fromUrl[1] ?? null;
  return /^[\w-]{10,}$/.test(trimmed) ? trimmed : null;
}

/** Import Google Doc `documentId` as a new Markdown document. */
export async function importGoogleDoc(args: {
  userId: string;
  token: string;
  documentId: string;
  projectId: string | null;
  directory?: string;
}): Promise<Asset> {
  const { docsExportMarkdown } = await import("@nodetool-ai/runtime");
  const { createTextDocument } = await import("@nodetool-ai/asset-services/text-documents");
  const { name, markdown } = await docsExportMarkdown(args.token, args.documentId);
  return createTextDocument({
    userId: args.userId,
    projectId: args.projectId,
    name,
    content: markdown,
    directory: args.directory
  });
}

/** Export document `document` to a new Google Doc. Returns its id and URL. */
export async function exportGoogleDoc(args: {
  token: string;
  document: Asset;
  title?: string;
  contentOverride?: string;
}): Promise<{ id: string; name: string; url: string | null }> {
  const { docsCreateFromMarkdown } = await import("@nodetool-ai/runtime");
  const { readTextDocument } = await import("@nodetool-ai/asset-services/text-documents");
  const markdown =
    args.contentOverride !== undefined
      ? args.contentOverride
      : await readTextDocument(args.document);
  const file = await docsCreateFromMarkdown(args.token, {
    name: args.title?.trim() || baseName(args.document.name),
    markdown
  });
  return { id: file.id, name: file.name, url: file.webViewLink ?? null };
}
