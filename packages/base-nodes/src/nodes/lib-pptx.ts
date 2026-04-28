/**
 * PowerPoint (PPTX) text extraction nodes using office-text-extractor.
 */
import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { promises as fs } from "node:fs";

type DocumentRefLike = {
  uri?: string;
  data?: Uint8Array | string;
};

function asBytes(data: Uint8Array | string | undefined): Uint8Array {
  if (!data) return new Uint8Array();
  if (data instanceof Uint8Array) return data;
  return Uint8Array.from(Buffer.from(data, "base64"));
}

async function resolvePptxBuffer(
  doc: DocumentRefLike,
  context?: ProcessingContext
): Promise<Buffer> {
  if (doc.data) {
    return Buffer.from(asBytes(doc.data));
  }
  if (doc.uri) {
    const uri = doc.uri.startsWith("file://") ? doc.uri.slice(7) : doc.uri;
    if (context?.storage) {
      const stored = await context.storage.retrieve(doc.uri);
      if (stored !== null) return Buffer.from(stored);
    }
    return fs.readFile(uri);
  }
  throw new Error("No PPTX data or URI provided");
}

const PPTX_INPUT = {
  type: "document" as const,
  default: {
    type: "document",
    uri: "",
    asset_id: null,
    data: null,
    metadata: null
  },
  title: "PPTX",
  description: "The PowerPoint document to process"
};

export class PptxExtractTextLibNode extends BaseNode {
  static readonly nodeType = "lib.pptx.ExtractText";
  static readonly title = "PPTX Extract Text";
  static readonly description =
    "Extract plain text from a PowerPoint (.pptx) file.\n    pptx, powerpoint, slides, text, extract";
  static readonly metadataOutputTypes = { output: "str" };
  static readonly exposeAsTool = true;

  @prop(PPTX_INPUT)
  declare pptx: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const buffer = await resolvePptxBuffer(
      (this.pptx ?? {}) as DocumentRefLike,
      context
    );
    const { getTextExtractor } = await import("office-text-extractor");
    const extractor = getTextExtractor();
    const text = await extractor.extractText({
      type: "buffer",
      input: buffer
    });
    return { output: text };
  }
}

export class PptxExtractSlidesLibNode extends BaseNode {
  static readonly nodeType = "lib.pptx.ExtractSlides";
  static readonly title = "PPTX Extract Slides";
  static readonly description =
    "Extract text from each slide of a PowerPoint (.pptx) file as a list, preserving slide order.\n    pptx, powerpoint, slides, list, text";
  static readonly metadataOutputTypes = { output: "list[dict]" };
  static readonly exposeAsTool = true;

  @prop(PPTX_INPUT)
  declare pptx: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const buffer = await resolvePptxBuffer(
      (this.pptx ?? {}) as DocumentRefLike,
      context
    );
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(buffer);
    const slidePaths = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a, b) => {
        const na = Number(a.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
        const nb = Number(b.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
        return na - nb;
      });

    const slides: Array<Record<string, unknown>> = [];
    for (let i = 0; i < slidePaths.length; i++) {
      const file = zip.file(slidePaths[i]);
      if (!file) continue;
      const xml = await file.async("string");
      const text = extractSlideText(xml);
      slides.push({
        index: i,
        slide_number: i + 1,
        text
      });
    }
    return { output: slides };
  }
}

function extractSlideText(xml: string): string {
  const parts: string[] = [];
  const regex = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    const decoded = match[1]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
    if (decoded) parts.push(decoded);
  }
  return parts.join("\n").trim();
}

export const LIB_PPTX_NODES = [
  PptxExtractTextLibNode,
  PptxExtractSlidesLibNode
] as const;
