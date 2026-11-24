/**
 * The text of a `document` value (document editor PRD R12): the Markdown of a
 * project document, or the content of any other text file. `DocumentInput`
 * converts non-Markdown documents (`.pdf`, `.docx`, `.html`) to Markdown when
 * the host supplies a converter; other readers return an empty string for
 * binary files.
 */
import type { DocumentRef } from "@nodetool-ai/protocol";

/** A document value as nodes receive it: the ref plus any inline bytes. */
export type DocumentValue = Partial<DocumentRef> & {
  data?: unknown;
  text?: unknown;
};

/** Result of reading a `DocumentInput` value, including runtime conversion. */
export type DocumentInputResult = {
  output: DocumentValue;
  text: string;
};

/** The context members this reader uses. */
export interface DocumentTextContext {
  resolveAssetBytes?: (
    assetId: string,
    options?: { requireOwnedAsset?: boolean }
  ) => Promise<{ bytes: Uint8Array | null; attempts: string[] }>;
  getAssetInfo?: (
    assetId: string
  ) => Promise<{ name?: string | null; content_type?: string | null } | null>;
  convertDocumentToMarkdown?: (args: {
    bytes: Uint8Array;
    filename?: string | null;
    contentType?: string | null;
  }) => Promise<string | null>;
  storage?: { retrieve(uri: string): Promise<Uint8Array | null> } | null;
}

/** Bytes sampled when deciding whether a file is text. */
const SNIFF_BYTES = 8192;
const HTML_EXTENSION = /\.(html|htm)$/i;

function looksBinary(bytes: Uint8Array): boolean {
  const end = Math.min(bytes.length, SNIFF_BYTES);
  for (let index = 0; index < end; index += 1) {
    if (bytes[index] === 0) return true;
  }
  // %PDF and the ZIP header of DOCX, XLSX and PPTX.
  const head = String.fromCharCode(...bytes.subarray(0, 4));
  return head === "%PDF" || head === "PK\u0003\u0004";
}

function isHtmlDocument(
  filename: string | null | undefined,
  contentType: string | null | undefined
): boolean {
  const mime = (contentType ?? "").toLowerCase().split(";")[0]?.trim() ?? "";
  if (mime === "text/html") return true;
  return Boolean(filename && HTML_EXTENSION.test(filename));
}

function inlineBytes(data: unknown): Uint8Array | null {
  if (data instanceof Uint8Array) return data.length > 0 ? data : null;
  if (typeof data === "string" && data.length > 0) {
    return Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
  }
  return null;
}

function dataUriBytes(
  uri: string
): { bytes: Uint8Array; contentType: string | null } | null {
  if (!uri.startsWith("data:")) return null;
  const comma = uri.indexOf(",");
  if (comma === -1) return null;
  const header = uri.slice(5, comma);
  const payload = uri.slice(comma + 1);
  const parts = header.split(";");
  const contentType = parts[0]?.trim() || null;
  const isBase64 = parts.some((part) => part.trim().toLowerCase() === "base64");
  if (isBase64) {
    return {
      bytes: Uint8Array.from(atob(payload), (char) => char.charCodeAt(0)),
      contentType
    };
  }
  return {
    bytes: new TextEncoder().encode(decodeURIComponent(payload)),
    contentType
  };
}

function extractAssetId(value: DocumentValue): string | null {
  if (typeof value.asset_id === "string" && value.asset_id.length > 0) {
    return value.asset_id;
  }
  const uri = typeof value.uri === "string" ? value.uri : "";
  if (!uri.startsWith("asset://")) return null;
  const rest = uri.slice("asset://".length).split(/[?#]/)[0] ?? "";
  const stem = rest.includes(".") ? rest.slice(0, rest.indexOf(".")) : rest;
  return stem || null;
}

function filenameFromUri(uri: string): string | null {
  if (!uri || uri.startsWith("data:")) return null;
  const clean = uri.split(/[?#]/)[0] ?? "";
  const slash = clean.lastIndexOf("/");
  const segment = slash >= 0 ? clean.slice(slash + 1) : clean;
  if (!segment || (uri.startsWith("asset://") && !segment.includes("."))) {
    return null;
  }
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

async function documentBytes(
  value: DocumentValue,
  context: DocumentTextContext | undefined
): Promise<{ bytes: Uint8Array | null; contentType: string | null }> {
  const inline = inlineBytes(value.data);
  if (inline) return { bytes: inline, contentType: null };
  const uri = typeof value.uri === "string" ? value.uri : "";
  const fromDataUri = dataUriBytes(uri);
  if (fromDataUri) return fromDataUri;
  const reference = uri.startsWith("asset://")
    ? uri
    : value.asset_id
      ? `asset://${value.asset_id}`
      : null;
  if (reference) {
    // A host with no asset store (a browser preview) has no text to give.
    if (!context?.resolveAssetBytes) return { bytes: null, contentType: null };
    const { bytes } = await context.resolveAssetBytes(reference, {
      requireOwnedAsset: true
    });
    if (!bytes) throw new Error(`Cannot read document ${reference}.`);
    return { bytes, contentType: null };
  }
  if (uri && context?.storage) {
    return { bytes: await context.storage.retrieve(uri), contentType: null };
  }
  return { bytes: null, contentType: null };
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
  const { bytes } = await documentBytes(value, context);
  if (!bytes || bytes.length === 0 || looksBinary(bytes)) return "";
  return new TextDecoder("utf-8").decode(bytes);
}

/**
 * Resolve a `DocumentInput` value into its output document ref and Markdown
 * text. Non-Markdown inputs (`.pdf`, `.docx`, `.html`) are converted to
 * Markdown on the fly when the host provides `convertDocumentToMarkdown`.
 */
export async function readDocumentInput(
  value: DocumentValue | null | undefined,
  context?: DocumentTextContext
): Promise<DocumentInputResult> {
  if (!value) return { output: {}, text: "" };
  if (typeof value.text === "string") {
    return { output: value, text: value.text };
  }
  const { bytes, contentType: dataUriContentType } = await documentBytes(
    value,
    context
  );
  if (!bytes || bytes.length === 0) {
    return { output: value, text: "" };
  }
  const binary = looksBinary(bytes);
  const uri = typeof value.uri === "string" ? value.uri : "";
  let filename = filenameFromUri(uri);
  let contentType = dataUriContentType;
  const assetId = extractAssetId(value);
  if (assetId && context?.getAssetInfo && (!filename || !contentType)) {
    try {
      const info = await context.getAssetInfo(assetId);
      if (info?.name) filename = info.name;
      if (info?.content_type) contentType = info.content_type;
    } catch {
      // Metadata lookup is best-effort; magic bytes and URI still apply.
    }
  }
  if (
    (binary || isHtmlDocument(filename, contentType)) &&
    context?.convertDocumentToMarkdown
  ) {
    const markdown = await context.convertDocumentToMarkdown({
      bytes,
      filename,
      contentType
    });
    if (markdown !== null) {
      return {
        output: {
          ...value,
          type: "document",
          uri,
          asset_id: value.asset_id ?? null,
          data: null,
          text: markdown
        },
        text: markdown
      };
    }
  }
  if (binary) {
    return { output: value, text: "" };
  }
  return {
    output: value,
    text: new TextDecoder("utf-8").decode(bytes)
  };
}

