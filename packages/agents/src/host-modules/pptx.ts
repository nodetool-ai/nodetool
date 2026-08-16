/**
 * `@nodetool-ai/sandbox-pptx` — office-text-extractor, on the host.
 *
 * office-text-extractor reads a buffer through Node's own zip/XML stack; it is
 * not a guest-module candidate. `extractSlides` reuses the same `fflate`
 * dependency `@nodetool-ai/sandbox-zip` exposes, kept internal here since
 * per-slide XML parsing isn't a general zip operation.
 */

import { requireBytes, unwrapLibrary } from "./limits.js";
import { isFunction } from "../utils/type-guards.js";

interface TextExtractor {
  extractText: (input: { type: "buffer"; input: Buffer }) => Promise<string>;
}
interface OfficeTextExtractorLike {
  getTextExtractor: () => TextExtractor;
}

async function loadExtractor(where: string): Promise<TextExtractor> {
  const mod: unknown = await import("office-text-extractor");
  const lib = unwrapLibrary<OfficeTextExtractorLike>(
    mod,
    where,
    "office-text-extractor",
    (v) => isFunction((v as OfficeTextExtractorLike | undefined)?.getTextExtractor)
  );
  return lib.getTextExtractor();
}

/** A PowerPoint file's text, all slides concatenated. */
export async function extractText(bytes: unknown): Promise<string> {
  const where = "pptx.extractText";
  const buffer = Buffer.from(requireBytes(where, bytes));
  const extractor = await loadExtractor(where);
  return extractor.extractText({ type: "buffer", input: buffer });
}

function decodeSlideText(xml: string): string {
  const parts: string[] = [];
  const regex = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    // &amp; must decode last — decoding it first would turn a literal
    // "&amp;lt;" into "<" instead of the "&lt;" it actually represents.
    const decoded = match[1]
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&");
    if (decoded) parts.push(decoded);
  }
  return parts.join("\n").trim();
}

/** One slide of a presentation, as `extractSlides` reports it. */
export interface PptxSlide {
  index: number;
  slideNumber: number;
  text: string;
}

/** Each slide's text as its own item, in slide order. */
export async function extractSlides(bytes: unknown): Promise<PptxSlide[]> {
  const where = "pptx.extractSlides";
  const archive = requireBytes(where, bytes);
  const { unzipSync, strFromU8 } = await import("fflate");
  const entries = unzipSync(archive);
  const slidePaths = Object.keys(entries)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
      const nb = Number(b.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
      return na - nb;
    });

  const slides: PptxSlide[] = [];
  for (let i = 0; i < slidePaths.length; i++) {
    const raw = entries[slidePaths[i]];
    if (!raw) continue;
    slides.push({
      index: i,
      slideNumber: i + 1,
      text: decodeSlideText(strFromU8(raw))
    });
  }
  return slides;
}
