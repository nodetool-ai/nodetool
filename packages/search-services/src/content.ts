/**
 * The content extractors (D6): one per kind, each turning a source row's
 * file or document into body passages with locators. Size, page and time
 * limits bound every extraction (D14). A file that cannot be read stays
 * findable by name and metadata (R8).
 */

import { Buffer } from "node:buffer";
import { and, eq } from "drizzle-orm";
import { importOptionalModule } from "@nodetool-ai/config";
import { Asset, getPortableDb } from "@nodetool-ai/models";
import type { SearchResourceType } from "@nodetool-ai/protocol";
import { chunkLines, chunkMarkdown, chunkPlainText } from "./chunking.js";
import { assetContentFormat, type ExtractedChunk } from "./extract.js";
import {
  parseProjectFileResourceId,
  projectFileContentType,
  projectFileSource
} from "./project-files.js";
import { DOCUMENT_TABLES, type DocumentResourceType } from "./sources.js";

/** Largest file the indexer reads. */
export const MAX_CONTENT_BYTES = 50 * 1024 * 1024;
/** Most text kept from one item. */
export const MAX_CONTENT_CHARS = 2_000_000;
/** Most PDF pages read from one file. */
export const MAX_PDF_PAGES = 2_000;
/** Longest one extraction may take. */
export const EXTRACTION_TIMEOUT_MS = 120_000;

/** What one extraction produced. */
export type ContentResult =
  | { status: "ready"; chunks: ExtractedChunk[] }
  /** The item has nothing the indexer can read. It stays findable by metadata. */
  | { status: "skipped"; reason: string };

/** The bytes of an asset's file. Injected in tests. */
export type AssetBytesReader = (asset: Asset) => Promise<Uint8Array>;

const defaultReadBytes: AssetBytesReader = async (asset) => {
  const { readAssetFileBytes } = await import("@nodetool-ai/asset-services/text-documents");
  return readAssetFileBytes(asset);
};

let readBytes: AssetBytesReader = defaultReadBytes;

/** Replace how asset bytes are read, or restore the default with `null`. */
export function setAssetBytesReader(reader: AssetBytesReader | null): void {
  readBytes = reader ?? defaultReadBytes;
}

/** The bytes of an asset's file, through the installed reader. */
export function readAssetBytes(asset: Asset): Promise<Uint8Array> {
  return readBytes(asset);
}

function capped(text: string): string {
  return text.length > MAX_CONTENT_CHARS ? text.slice(0, MAX_CONTENT_CHARS) : text;
}

async function withTimeout<T>(work: Promise<T>, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${what} took longer than ${EXTRACTION_TIMEOUT_MS / 1000} s`)),
      EXTRACTION_TIMEOUT_MS
    );
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

interface MammothModule {
  extractRawText(input: { buffer: Buffer }): Promise<{ value: string }>;
}

async function pdfPassages(bytes: Uint8Array): Promise<ContentResult> {
  const { parsePdfBuffer } = await import("@nodetool-ai/document-processing");
  const parsed = await parsePdfBuffer(Buffer.from(bytes));
  const chunks: ExtractedChunk[] = [];
  let chars = 0;
  for (const [index, page] of parsed.pages.slice(0, MAX_PDF_PAGES).entries()) {
    if (chars >= MAX_CONTENT_CHARS) break;
    const text = page.text ?? "";
    chars += text.length;
    chunks.push(...chunkPlainText(text, { page: index + 1 }));
  }
  if (chunks.length === 0) {
    return { status: "skipped", reason: "The PDF has no text layer." };
  }
  return { status: "ready", chunks };
}

const TOO_LARGE = `The file is larger than ${MAX_CONTENT_BYTES / 1024 / 1024} MB.`;

/** Passages of one file, read by `read` once its declared size passes the limit. */
async function fileContent(
  file: { contentType: string; name: string; size: number | null | undefined },
  read: () => Promise<Uint8Array>
): Promise<ContentResult> {
  const format = assetContentFormat(file.contentType, file.name);
  if (!format) return { status: "skipped", reason: `No extractor for ${file.contentType}.` };
  if (file.size !== null && file.size !== undefined && file.size > MAX_CONTENT_BYTES) {
    return { status: "skipped", reason: TOO_LARGE };
  }
  const bytes = await read();
  if (bytes.byteLength > MAX_CONTENT_BYTES) return { status: "skipped", reason: TOO_LARGE };
  if (format === "pdf") return withTimeout(pdfPassages(bytes), "Reading the PDF");
  if (format === "docx") {
    const mammoth = await importOptionalModule<MammothModule>("mammoth");
    const result = await withTimeout(
      mammoth.extractRawText({ buffer: Buffer.from(bytes) }),
      "Reading the Word file"
    );
    return { status: "ready", chunks: chunkPlainText(capped(result.value)) };
  }
  const text = capped(new TextDecoder("utf-8", { fatal: false }).decode(bytes));
  return {
    status: "ready",
    chunks: format === "markdown" ? chunkMarkdown(text) : chunkPlainText(text)
  };
}

function assetContent(asset: Asset): Promise<ContentResult> {
  return fileContent(
    { contentType: asset.content_type, name: asset.name, size: asset.size },
    () => readBytes(asset)
  );
}

/** A project folder file's passages, or null when the file or its project is gone. */
async function projectFileContent(userId: string, resourceId: string): Promise<ContentResult | null> {
  const parsed = parseProjectFileResourceId(resourceId);
  if (!parsed) return null;
  const folders = projectFileSource();
  if (!folders) throw new Error("This process cannot read project folders.");
  const contentType = projectFileContentType(parsed.path);
  if (!contentType) return null;
  const bytes = await folders.read(userId, parsed.projectId, parsed.path);
  if (bytes === null) return null;
  return fileContent({ contentType, name: parsed.path, size: bytes.byteLength }, async () => bytes);
}

/** The locator key each document kind names its parts by (D6). */
const LOCATOR_KEY: Record<DocumentResourceType, string> = {
  workflow: "node_id",
  application: "block_id",
  image_document: "layer_id",
  script: "block_id",
  storyboard: "shot_id",
  timeline_sequence: "clip_id",
  js_script: "block_id",
  game: "block_id"
};

/** Keys whose string values are text a person wrote, whatever their length. */
const TEXT_KEYS = new Set([
  "title",
  "name",
  "label",
  "description",
  "prompt",
  "negative_prompt",
  "text",
  "content",
  "caption",
  "dialogue",
  "line",
  "lines",
  "notes",
  "comment",
  "voiceover",
  "narration",
  "summary",
  "logline",
  "action",
  "subject",
  "setting"
]);

const REFERENCE = /^(?:[a-z][a-z0-9+.-]*:\/\/|data:|\/api\/|#[0-9a-f]{3,8}$)/i;
const IDENTIFIER = /^[\w.-]+$/;

/** Whether a string under an unknown key reads as prose: words and spaces, not an id or a path. */
function isProse(value: string): boolean {
  return value.length >= 12 && /\s/.test(value) && !REFERENCE.test(value);
}

function isText(key: string, value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || REFERENCE.test(trimmed)) return false;
  if (TEXT_KEYS.has(key)) return !(IDENTIFIER.test(trimmed) && trimmed.length > 24);
  return isProse(trimmed);
}

/**
 * The text of a document's JSON, grouped by the nearest object with an `id`:
 * a workflow node, a storyboard shot, a timeline clip, a sketch layer.
 */
export function documentTextGroups(document: unknown): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  let total = 0;
  const visit = (value: unknown, key: string, owner: string): void => {
    if (total >= MAX_CONTENT_CHARS) return;
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry, key, owner);
      return;
    }
    if (value === null || typeof value !== "object") {
      if (typeof value === "string" && isText(key, value)) {
        const list = groups.get(owner) ?? [];
        list.push(value.trim());
        groups.set(owner, list);
        total += value.length;
      }
      return;
    }
    const record = value as Record<string, unknown>;
    const id = typeof record.id === "string" && record.id ? record.id : owner;
    for (const [childKey, child] of Object.entries(record)) {
      if (childKey === "id") continue;
      visit(child, childKey, id);
    }
  };
  visit(document, "", "");
  return groups;
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/** Passages of a document's text, one group per located part. */
function documentPassages(resourceType: DocumentResourceType, document: unknown): ExtractedChunk[] {
  const key = LOCATOR_KEY[resourceType];
  const chunks: ExtractedChunk[] = [];
  for (const [owner, texts] of documentTextGroups(document)) {
    const unique = [...new Set(texts)];
    const locator = owner ? { [key]: owner } : {};
    chunks.push(...chunkPlainText(unique.join("\n\n"), locator));
  }
  return chunks;
}

async function documentContent(
  resourceType: DocumentResourceType,
  userId: string,
  resourceId: string
): Promise<ContentResult | null> {
  const table = DOCUMENT_TABLES[resourceType];
  const [row] = (await getPortableDb()
    .select()
    .from(table)
    .where(and(eq(table.id, resourceId), eq(table.user_id, userId)))
    .limit(1)) as Array<Record<string, unknown>>;
  if (!row) return null;
  if (resourceType === "workflow") {
    return { status: "ready", chunks: documentPassages(resourceType, row.graph) };
  }
  if (!("document" in row)) {
    return { status: "skipped", reason: "This kind keeps its content in files." };
  }
  const document = parseJson(row.document);
  if (resourceType === "js_script") {
    const code = (document as { code?: unknown } | null)?.code;
    const chunks = typeof code === "string" ? chunkLines(capped(code)) : [];
    return { status: "ready", chunks };
  }
  return { status: "ready", chunks: documentPassages(resourceType, document) };
}

/**
 * Extract the content of one source row, or null when the row is gone. A
 * thrown error is a failure the indexer retries with backoff.
 */
export async function extractContent(
  resourceType: SearchResourceType,
  userId: string,
  resourceId: string
): Promise<ContentResult | null> {
  if (resourceType === "asset") {
    const asset = await Asset.find(userId, resourceId);
    return asset ? assetContent(asset) : null;
  }
  if (resourceType === "project_file") return projectFileContent(userId, resourceId);
  return documentContent(resourceType, userId, resourceId);
}

