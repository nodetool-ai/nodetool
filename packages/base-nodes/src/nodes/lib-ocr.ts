/**
 * Image OCR (text recognition) nodes using tesseract.js.
 */
import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";

type ImageRefLike = {
  uri?: string;
  data?: Uint8Array | string;
};

function toBytes(data: Uint8Array | string | undefined): Uint8Array {
  if (!data) return new Uint8Array();
  if (data instanceof Uint8Array) return data;
  return Uint8Array.from(Buffer.from(data, "base64"));
}

function uriToFilePath(uri: string): string {
  if (uri.startsWith("file://")) {
    try {
      return fileURLToPath(new URL(uri));
    } catch {
      return uri.slice("file://".length);
    }
  }
  return uri;
}

async function resolveImageBuffer(
  image: ImageRefLike,
  context?: ProcessingContext
): Promise<Buffer> {
  if (image.data) return Buffer.from(toBytes(image.data));
  if (typeof image.uri === "string" && image.uri) {
    if (context?.storage) {
      const stored = await context.storage.retrieve(image.uri);
      if (stored !== null) return Buffer.from(stored);
    }
    if (image.uri.startsWith("http://") || image.uri.startsWith("https://")) {
      const response = await fetch(image.uri);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch image: ${response.status} ${response.statusText}`
        );
      }
      return Buffer.from(await response.arrayBuffer());
    }
    return fs.readFile(uriToFilePath(image.uri));
  }
  throw new Error("No image data or URI provided");
}

const IMAGE_INPUT = {
  type: "image" as const,
  default: {
    type: "image",
    uri: "",
    asset_id: null,
    data: null,
    metadata: null
  },
  title: "Image",
  description: "The image to perform OCR on"
};

const LANGUAGE_PROP = {
  type: "str" as const,
  default: "eng",
  title: "Language",
  description:
    "Tesseract language code(s), '+' separated for multi-language (e.g. 'eng+deu'). See https://tesseract-ocr.github.io/tessdoc/Data-Files-in-different-versions.html"
};

export class OcrExtractTextLibNode extends BaseNode {
  static readonly nodeType = "lib.ocr.ExtractText";
  static readonly title = "OCR Extract Text";
  static readonly description =
    "Extract plain text from an image using Tesseract OCR.\n    ocr, image, text, recognition, tesseract";
  static readonly metadataOutputTypes = { output: "str" };
  static readonly exposeAsTool = true;

  @prop(IMAGE_INPUT)
  declare image: any;

  @prop(LANGUAGE_PROP)
  declare language: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const buffer = await resolveImageBuffer(
      (this.image ?? {}) as ImageRefLike,
      context
    );
    const language = String(this.language ?? "eng") || "eng";
    const Tesseract = await import("tesseract.js");
    const recognize = Tesseract.recognize ?? Tesseract.default?.recognize;
    if (typeof recognize !== "function") {
      throw new Error("tesseract.js recognize() is not available");
    }
    const result = await recognize(buffer, language);
    return { output: result.data?.text ?? "" };
  }
}

export class OcrExtractDataLibNode extends BaseNode {
  static readonly nodeType = "lib.ocr.ExtractData";
  static readonly title = "OCR Extract Data";
  static readonly description =
    "Run OCR on an image and return structured data: full text, mean confidence, and per-word boxes.\n    ocr, image, text, words, confidence, bounding boxes";
  static readonly metadataOutputTypes = { output: "dict" };
  static readonly exposeAsTool = true;

  @prop(IMAGE_INPUT)
  declare image: any;

  @prop(LANGUAGE_PROP)
  declare language: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const buffer = await resolveImageBuffer(
      (this.image ?? {}) as ImageRefLike,
      context
    );
    const language = String(this.language ?? "eng") || "eng";
    const Tesseract = await import("tesseract.js");
    const recognize = Tesseract.recognize ?? Tesseract.default?.recognize;
    if (typeof recognize !== "function") {
      throw new Error("tesseract.js recognize() is not available");
    }
    const result = await recognize(buffer, language);
    const data = result.data ?? ({} as Record<string, unknown>);
    const blocks = Array.isArray(data.blocks) ? data.blocks : [];
    const words: Array<{ text: string; confidence: number; bbox: unknown }> =
      [];
    for (const block of blocks) {
      for (const paragraph of block.paragraphs ?? []) {
        for (const line of paragraph.lines ?? []) {
          for (const word of line.words ?? []) {
            words.push({
              text: word.text,
              confidence: word.confidence,
              bbox: word.bbox
            });
          }
        }
      }
    }
    return {
      output: {
        text: data.text ?? "",
        confidence: data.confidence ?? 0,
        words
      }
    };
  }
}

export const LIB_OCR_NODES = [
  OcrExtractTextLibNode,
  OcrExtractDataLibNode
] as const;
