import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";

type OCRLanguage =
  | "en" | "fr" | "de" | "es" | "it" | "pt" | "nl" | "pl" | "ro" | "hr"
  | "cs" | "hu" | "sk" | "sl" | "tr" | "vi" | "id" | "ms" | "la" | "ru"
  | "bg" | "uk" | "be" | "mn" | "ch" | "ja" | "ko" | "ar" | "fa" | "ur"
  | "hi" | "mr" | "ne" | "sa";

type OCRResult = {
  type: "ocr_result";
  text: string;
  score: number;
  top_left: [number, number];
  top_right: [number, number];
  bottom_right: [number, number];
  bottom_left: [number, number];
};

// Map NodeTool language codes to Tesseract language codes
const LANG_MAP: Record<string, string> = {
  en: "eng", fr: "fra", de: "deu", es: "spa", it: "ita", pt: "por",
  nl: "nld", pl: "pol", ro: "ron", hr: "hrv", cs: "ces", hu: "hun",
  sk: "slk", sl: "slv", tr: "tur", vi: "vie", id: "ind", ms: "msa",
  la: "lat", ru: "rus", bg: "bul", uk: "ukr", be: "bel", mn: "mon",
  ch: "chi_sim", ja: "jpn", ko: "kor", ar: "ara", fa: "fas", ur: "urd",
  hi: "hin", mr: "mar", ne: "nep", sa: "san",
};

export class PaddleOCRLibNode extends BaseNode {
  static readonly nodeType = "lib.ocr.PaddleOCR";
            static readonly title = "Paddle OCR";
            static readonly description = "Performs Optical Character Recognition (OCR) on images using PaddleOCR.\n    image, text, ocr, document\n\n    Use cases:\n    - Text extraction from images\n    - Document digitization\n    - Receipt/invoice processing\n    - Handwriting recognition";
        static readonly metadataOutputTypes = {
    boxes: "list[ocr_result]",
    text: "str"
  };
  
  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Input Image", description: "The image to perform OCR on" })
  declare image: any;

  @prop({ type: "enum", default: "en", title: "Language", description: "Language code for OCR", values: [
  "en",
  "fr",
  "de",
  "es",
  "it",
  "pt",
  "nl",
  "pl",
  "ro",
  "hr",
  "cs",
  "hu",
  "sk",
  "sl",
  "tr",
  "vi",
  "id",
  "ms",
  "la",
  "ru",
  "bg",
  "uk",
  "be",
  "mn",
  "ch",
  "ja",
  "ko",
  "ar",
  "fa",
  "ur",
  "hi",
  "mr",
  "ne",
  "sa"
] })
  declare language: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const image = (inputs.image ?? this.image ?? {}) as {
      uri?: string;
      data?: string | null;
    };
    const language = String(inputs.language ?? this.language ?? "en") as OCRLanguage;

    const Tesseract = await import("tesseract.js");
    const createWorker = Tesseract.createWorker;

    const lang = LANG_MAP[language] ?? "eng";

    // Resolve image data to a Buffer or URL string
    let imageInput: Buffer | string;
    if (image.data) {
      imageInput = Buffer.from(image.data, "base64");
    } else if (image.uri) {
      imageInput = image.uri;
    } else {
      throw new Error("Image must have either data or uri");
    }

    const worker = await createWorker(lang);
    try {
      const { data } = await worker.recognize(imageInput);

      const boxes: OCRResult[] = data.words.map((word) => {
        const b = word.bbox;
        return {
          type: "ocr_result",
          text: word.text,
          score: word.confidence / 100,
          top_left: [b.x0, b.y0],
          top_right: [b.x1, b.y0],
          bottom_right: [b.x1, b.y1],
          bottom_left: [b.x0, b.y1],
        };
      });

      const text = data.text;
      return { boxes, text };
    } finally {
      await worker.terminate();
    }
  }
}

export const LIB_OCR_NODES: readonly NodeClass[] = [
  PaddleOCRLibNode,
] as const;
