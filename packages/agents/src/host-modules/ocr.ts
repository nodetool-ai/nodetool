/**
 * `@nodetool-ai/sandbox-ocr` — tesseract.js, on the host.
 *
 * tesseract.js runs a WASM engine, spawns workers and downloads its language
 * data at first use. None of that fits inside the QuickJS guest, and the guest
 * has no network of its own to fetch a traineddata file with, so the library
 * runs here and the guest gets the reading.
 */

import { importOptionalLibrary, optionsOf, requireBytes } from "./limits.js";
import { isFunction } from "../utils/type-guards.js";

/** Words one call reports. A dense page is a few thousand. */
export const MAX_OCR_WORDS = 20_000;

interface TesseractWord {
  text?: unknown;
  confidence?: unknown;
  bbox?: { x0?: unknown; y0?: unknown; x1?: unknown; y1?: unknown };
}
interface TesseractResult {
  data?: {
    text?: unknown;
    confidence?: unknown;
    words?: TesseractWord[];
  };
}
type Recognize = (
  image: Uint8Array,
  language: string
) => Promise<TesseractResult>;

async function loadRecognize(where: string): Promise<Recognize> {
  const mod = await importOptionalLibrary<Record<string, unknown>>(
    where,
    "tesseract.js"
  );
  const candidate =
    isFunction(mod.recognize)
      ? mod.recognize
      : (mod.default as Record<string, unknown> | undefined)?.recognize;
  if (!isFunction(candidate)) {
    throw new Error(
      `${where}: the "tesseract.js" library is not available in this runtime`
    );
  }
  return candidate as Recognize;
}

function box(word: TesseractWord): Record<string, number> | null {
  const bbox = word.bbox;
  if (bbox === undefined || bbox === null) return null;
  const x = Number(bbox.x0 ?? 0);
  const y = Number(bbox.y0 ?? 0);
  return {
    x,
    y,
    width: Number(bbox.x1 ?? 0) - x,
    height: Number(bbox.y1 ?? 0) - y
  };
}

/**
 * Read the text in an image.
 *
 * ```js
 * const { text, words } = await recognize(await workspace.readBytes("scan.png"));
 * ```
 *
 * `language` takes Tesseract's codes, `+`-joined for several at once
 * (`"eng+deu"`); the data file for a language it has not seen is downloaded on
 * first use. The answer carries the full `text`, the page's mean `confidence`,
 * and one entry per word with its own confidence and pixel box — everything
 * `lib.ocr.ExtractText` and `lib.ocr.ExtractData` used to return, from one call.
 */
export async function recognize(
  image: unknown,
  options?: unknown
): Promise<Record<string, unknown>> {
  const where = "ocr.recognize";
  const bytes = requireBytes(where, image, "image");
  const opts = optionsOf(options);
  const language = String(opts.language ?? "eng").trim() || "eng";
  if (!/^[a-z_]{3,}(\+[a-z_]{3,})*$/i.test(language)) {
    throw new Error(
      `${where}: "${language}" is not a Tesseract language code (e.g. "eng", "eng+deu")`
    );
  }

  const run = await loadRecognize(where);
  const result = await run(new Uint8Array(bytes), language);
  const data = result.data ?? {};
  const words = Array.isArray(data.words) ? data.words : [];
  if (words.length > MAX_OCR_WORDS) {
    throw new Error(
      `${where}: ${words.length} words exceeds the ${MAX_OCR_WORDS} word limit`
    );
  }
  return {
    text: String(data.text ?? ""),
    confidence: Number(data.confidence ?? 0),
    words: words.map((word) => ({
      text: String(word.text ?? ""),
      confidence: Number(word.confidence ?? 0),
      bbox: box(word)
    }))
  };
}
