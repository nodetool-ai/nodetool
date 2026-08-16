/**
 * `@nodetool-ai/sandbox-epub` — epub2, on the host.
 *
 * epub2 reads from a file path, not bytes, so this module stages the input in
 * a temp file for the duration of one call and always removes it afterward.
 */

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { optionsOf, requireBytes, unwrapLibrary } from "./limits.js";
import { isFunction, isString } from "../utils/type-guards.js";

/**
 * An EPUB's OPF metadata, mirroring the fields epub2 parses out of the package
 * document. A book may declare further keys; they ride along as strings.
 */
export interface EpubMetadata {
  title?: string;
  creator?: string;
  creatorFileAs?: string;
  publisher?: string;
  language?: string;
  subject?: string[];
  description?: string;
  date?: string;
  ISBN?: string;
  UUID?: string;
  cover?: string;
  readonly [key: string]: string | string[] | undefined;
}

/** One table-of-contents entry, as `tableOfContents` reports it. */
export interface EpubTocItem {
  id: string | undefined;
  title: string | undefined;
  href: string | undefined;
  order: number | undefined;
}

/** One chapter's text, as `extractChapters` reports it. */
export interface EpubChapter {
  id: string;
  title: string;
  href: string;
  text: string;
}

interface EpubTocEntry {
  id?: string;
  title?: string;
  href?: string;
  order?: number;
}
interface EpubFlowItem {
  id?: string;
  href?: string;
}
interface EpubInstance {
  metadata: EpubMetadata;
  toc: EpubTocEntry[];
  flow: EpubFlowItem[];
  getChapterAsync: (id: string) => Promise<string>;
}
interface Epub2Like {
  EPub: { createAsync: (path: string) => Promise<EpubInstance> };
}

async function loadEpub2(where: string): Promise<Epub2Like> {
  const mod: unknown = await import("epub2");
  return unwrapLibrary<Epub2Like>(
    mod,
    where,
    "epub2",
    (v) => isFunction((v as Epub2Like | undefined)?.EPub?.createAsync)
  );
}

function stripHtml(html: string): string {
  // &amp; must decode last — decoding it first would turn a literal
  // "&amp;lt;" into "<" instead of the "&lt;" it actually represents.
  return html
    .replace(/<style[\s\S]*?<\/style\b[^>]*>/gi, " ")
    .replace(/<script[\s\S]*?<\/script\b[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Stage `bytes` in a temp file, load it with epub2, and always clean up. */
async function withEpub<T>(
  where: string,
  bytes: unknown,
  fn: (epub: EpubInstance) => Promise<T>
): Promise<T> {
  const buffer = requireBytes(where, bytes);
  const { EPub } = await loadEpub2(where);
  const tmp = path.join(
    os.tmpdir(),
    `nodetool-sandbox-epub-${Date.now()}-${Math.random().toString(36).slice(2)}.epub`
  );
  await fs.writeFile(tmp, buffer);
  try {
    const epub = await EPub.createAsync(tmp);
    return await fn(epub);
  } finally {
    await fs.unlink(tmp).catch(() => {});
  }
}

/** An EPUB's metadata: title, creator, language, publisher, and the rest. */
export async function metadata(bytes: unknown): Promise<EpubMetadata> {
  return withEpub("epub.metadata", bytes, async (epub) => ({ ...epub.metadata }));
}

/** The table of contents, in reading order. */
export async function tableOfContents(bytes: unknown): Promise<EpubTocItem[]> {
  return withEpub("epub.tableOfContents", bytes, async (epub) =>
    (epub.toc ?? []).map((entry) => ({
      id: entry.id,
      title: entry.title,
      href: entry.href,
      order: entry.order
    }))
  );
}

/** All chapters concatenated to plain text, joined by `options.chapterSeparator`. */
export async function extractText(bytes: unknown, options?: unknown): Promise<string> {
  const opts = optionsOf(options);
  const separator =
    isString(opts.chapterSeparator) ? opts.chapterSeparator : "\n\n";
  return withEpub("epub.extractText", bytes, async (epub) => {
    const parts: string[] = [];
    for (const item of epub.flow ?? []) {
      if (!item.id) continue;
      const html = await epub.getChapterAsync(item.id);
      const text = stripHtml(html);
      if (text) parts.push(text);
    }
    return parts.join(separator);
  });
}

/** Each chapter as its own item, with the title the table of contents gives it. */
export async function extractChapters(bytes: unknown): Promise<EpubChapter[]> {
  return withEpub("epub.extractChapters", bytes, async (epub) => {
    const titleById = new Map<string, string>();
    for (const entry of epub.toc ?? []) {
      if (isString(entry.id) && isString(entry.title)) {
        titleById.set(entry.id, entry.title);
      }
    }
    const chapters: EpubChapter[] = [];
    for (const item of epub.flow ?? []) {
      if (!item.id) continue;
      const html = await epub.getChapterAsync(item.id);
      chapters.push({
        id: item.id,
        title: titleById.get(item.id) ?? "",
        href: item.href ?? "",
        text: stripHtml(html)
      });
    }
    return chapters;
  });
}
