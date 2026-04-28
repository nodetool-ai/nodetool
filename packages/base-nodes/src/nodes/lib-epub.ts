/**
 * EPUB processing nodes using epub2.
 *
 * Provides metadata, table of contents, chapter list, and full-text
 * extraction from EPUB e-book files.
 */
import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

type DocumentRefLike = {
  uri?: string;
  data?: Uint8Array | string;
};

function asBytes(data: Uint8Array | string | undefined): Uint8Array {
  if (!data) return new Uint8Array();
  if (data instanceof Uint8Array) return data;
  return Uint8Array.from(Buffer.from(data, "base64"));
}

function expandUser(p: string): string {
  if (!p) return p;
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

async function resolveEpubPath(
  doc: DocumentRefLike,
  context?: ProcessingContext
): Promise<{ filePath: string; cleanup?: () => Promise<void> }> {
  if (doc.uri && !doc.data) {
    const uri = doc.uri.startsWith("file://") ? doc.uri.slice(7) : doc.uri;
    if (context?.storage) {
      const stored = await context.storage.retrieve(doc.uri);
      if (stored !== null) {
        const tmp = path.join(
          os.tmpdir(),
          `nodetool-epub-${Date.now()}-${Math.random().toString(36).slice(2)}.epub`
        );
        await fs.writeFile(tmp, Buffer.from(stored));
        return { filePath: tmp, cleanup: async () => fs.unlink(tmp).catch(() => {}) };
      }
    }
    return { filePath: expandUser(uri) };
  }
  if (doc.data) {
    const tmp = path.join(
      os.tmpdir(),
      `nodetool-epub-${Date.now()}-${Math.random().toString(36).slice(2)}.epub`
    );
    await fs.writeFile(tmp, Buffer.from(asBytes(doc.data)));
    return { filePath: tmp, cleanup: async () => fs.unlink(tmp).catch(() => {}) };
  }
  throw new Error("No EPUB data or URI provided");
}

async function loadEpub(
  doc: DocumentRefLike,
  context?: ProcessingContext
): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  epub: any;
  cleanup: () => Promise<void>;
}> {
  const { EPub } = await import("epub2");
  const { filePath, cleanup } = await resolveEpubPath(doc, context);
  const epub = await EPub.createAsync(filePath);
  return {
    epub,
    cleanup: async () => {
      if (cleanup) await cleanup();
    }
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const EPUB_INPUT = {
  type: "document" as const,
  default: {
    type: "document",
    uri: "",
    asset_id: null,
    data: null,
    metadata: null
  },
  title: "EPUB",
  description: "The EPUB document to process"
};

export class EpubMetadataLibNode extends BaseNode {
  static readonly nodeType = "lib.epub.Metadata";
  static readonly title = "EPUB Metadata";
  static readonly description =
    "Read metadata (title, author, language, publisher, etc.) from an EPUB file.\n    epub, ebook, metadata, title, author";
  static readonly metadataOutputTypes = { output: "dict" };
  static readonly exposeAsTool = true;

  @prop(EPUB_INPUT)
  declare epub: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const { epub, cleanup } = await loadEpub(
      (this.epub ?? {}) as DocumentRefLike,
      context
    );
    try {
      return { output: { ...epub.metadata } };
    } finally {
      await cleanup();
    }
  }
}

export class EpubTableOfContentsLibNode extends BaseNode {
  static readonly nodeType = "lib.epub.TableOfContents";
  static readonly title = "EPUB Table of Contents";
  static readonly description =
    "Get the table of contents (chapter titles, ids, hrefs) from an EPUB file.\n    epub, ebook, toc, chapters, contents";
  static readonly metadataOutputTypes = { output: "list[dict]" };
  static readonly exposeAsTool = true;

  @prop(EPUB_INPUT)
  declare epub: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const { epub, cleanup } = await loadEpub(
      (this.epub ?? {}) as DocumentRefLike,
      context
    );
    try {
      const toc = (epub.toc ?? []) as Array<Record<string, unknown>>;
      const out = toc.map((entry) => ({
        id: entry.id,
        title: entry.title,
        href: entry.href,
        order: entry.order
      }));
      return { output: out };
    } finally {
      await cleanup();
    }
  }
}

export class EpubExtractTextLibNode extends BaseNode {
  static readonly nodeType = "lib.epub.ExtractText";
  static readonly title = "EPUB Extract Text";
  static readonly description =
    "Extract plain text from an EPUB file by concatenating all chapters.\n    epub, ebook, text, extract, content";
  static readonly metadataOutputTypes = { output: "str" };
  static readonly exposeAsTool = true;

  @prop(EPUB_INPUT)
  declare epub: any;

  @prop({
    type: "str",
    default: "\n\n",
    title: "Chapter Separator",
    description: "String inserted between chapters in the output"
  })
  declare chapter_separator: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const { epub, cleanup } = await loadEpub(
      (this.epub ?? {}) as DocumentRefLike,
      context
    );
    try {
      const separator = String(this.chapter_separator ?? "\n\n");
      const flow = (epub.flow ?? []) as Array<{ id: string }>;
      const parts: string[] = [];
      for (const item of flow) {
        if (!item.id) continue;
        const html = await epub.getChapterAsync(item.id);
        const text = stripHtml(html);
        if (text) parts.push(text);
      }
      return { output: parts.join(separator) };
    } finally {
      await cleanup();
    }
  }
}

export class EpubExtractChaptersLibNode extends BaseNode {
  static readonly nodeType = "lib.epub.ExtractChapters";
  static readonly title = "EPUB Extract Chapters";
  static readonly description =
    "Extract each chapter as a separate text item with its title.\n    epub, ebook, chapters, split, text";
  static readonly metadataOutputTypes = { output: "list[dict]" };
  static readonly exposeAsTool = true;

  @prop(EPUB_INPUT)
  declare epub: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const { epub, cleanup } = await loadEpub(
      (this.epub ?? {}) as DocumentRefLike,
      context
    );
    try {
      const toc = (epub.toc ?? []) as Array<Record<string, unknown>>;
      const titleById = new Map<string, string>();
      for (const entry of toc) {
        if (typeof entry.id === "string" && typeof entry.title === "string") {
          titleById.set(entry.id, entry.title);
        }
      }
      const flow = (epub.flow ?? []) as Array<{ id: string; href?: string }>;
      const chapters: Array<Record<string, unknown>> = [];
      for (const item of flow) {
        if (!item.id) continue;
        const html = await epub.getChapterAsync(item.id);
        const text = stripHtml(html);
        chapters.push({
          id: item.id,
          title: titleById.get(item.id) ?? "",
          href: item.href ?? "",
          text
        });
      }
      return { output: chapters };
    } finally {
      await cleanup();
    }
  }
}

export const LIB_EPUB_NODES = [
  EpubMetadataLibNode,
  EpubTableOfContentsLibNode,
  EpubExtractTextLibNode,
  EpubExtractChaptersLibNode
] as const;
