/**
 * The text of a `document` value (document editor PRD R12): the Markdown of a
 * project document, or the content of any other text file. A binary document
 * such as a PDF or DOCX has no text here, and gives an empty string.
 */
import type { DocumentRef } from "@nodetool-ai/protocol";

/** A document value as nodes receive it: the ref plus any inline bytes. */
type DocumentValue = Partial<DocumentRef> & { data?: unknown; text?: unknown };

/** The context members this reader uses. */
export interface DocumentTextContext {
  resolveAssetBytes?: (
    assetId: string,
    options?: { requireOwnedAsset?: boolean }
  ) => Promise<{ bytes: Uint8Array | null; attempts: string[] }>;
  storage?: { retrieve(uri: string): Promise<Uint8Array | null> } | null;
}

/** Bytes sampled when deciding whether a file is text. */
const SNIFF_BYTES = 8192;

function looksBinary(bytes: Uint8Array): boolean {
  const end = Math.min(bytes.length, SNIFF_BYTES);
  for (let index = 0; index < end; index += 1) {
    if (bytes[index] === 0) return true;
  }
  // %PDF and the ZIP header of DOCX, XLSX and PPTX.
  const head = String.fromCharCode(...bytes.subarray(0, 4));
  return head === "%PDF" || head === "PK\u0003\u0004";
}

function inlineBytes(data: unknown): Uint8Array | null {
  if (data instanceof Uint8Array) return data.length > 0 ? data : null;
  if (typeof data === "string" && data.length > 0) {
    return Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
  }
  return null;
}

async function documentBytes(
  value: DocumentValue,
  context: DocumentTextContext | undefined
): Promise<Uint8Array | null> {
  const inline = inlineBytes(value.data);
  if (inline) return inline;
  const uri = typeof value.uri === "string" ? value.uri : "";
  const reference = uri.startsWith("asset://")
    ? uri
    : value.asset_id
      ? `asset://${value.asset_id}`
      : null;
  if (reference) {
    // A host with no asset store (a browser preview) has no text to give.
    if (!context?.resolveAssetBytes) return null;
    const { bytes } = await context.resolveAssetBytes(reference, {
      requireOwnedAsset: true
    });
    if (!bytes) throw new Error(`Cannot read document ${reference}.`);
    return bytes;
  }
  if (uri && context?.storage) return context.storage.retrieve(uri);
  return null;
}

/** The document's text, or "" when it holds none or is binary. */
export async function readDocumentText(
  value: DocumentValue | null | undefined,
  context?: DocumentTextContext
): Promise<string> {
  if (!value) return "";
  // A value built in a graph can carry its text inline, as SaveDocument
  // accepts it.
  if (typeof value.text === "string") return value.text;
  const bytes = await documentBytes(value, context);
  if (!bytes || bytes.length === 0 || looksBinary(bytes)) return "";
  return new TextDecoder("utf-8").decode(bytes);
}

