/**
 * `@nodetool-ai/sandbox-ocr` — the argument contract, every cap, and every
 * refusal.
 *
 * tesseract.js fetches a language file on first use. Nothing here goes near a
 * network. The one seam the implementation already has —
 * `importOptionalModule`, the lazy import inside the implementation — is
 * stubbed, so the code under test is the module's own logic: the caps, the
 * coercions, and the errors the guest reads.
 *
 * `tests/host-modules.test.ts` covers the same pack from inside the sandbox
 * (the import path, the dispatcher, the non-bytes refusal). These are the host
 * side of the same code.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

import { MAX_HOST_INPUT_BYTES } from "../src/host-modules/limits.js";

const { libraries } = vi.hoisted(() => ({
  libraries: new Map<string, () => unknown>()
}));

vi.mock("@nodetool-ai/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@nodetool-ai/config")>();
  return {
    ...actual,
    importOptionalModule: async (packageName: string): Promise<unknown> => {
      const factory = libraries.get(packageName);
      if (factory === undefined) {
        throw new Error(`this test declares no stub for "${packageName}"`);
      }
      return factory();
    }
  };
});

/** Install the module a specifier resolves to for the rest of the test. */
function stubLibrary(specifier: string, factory: () => unknown): void {
  libraries.set(specifier, factory);
}

beforeEach(() => {
  libraries.clear();
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// ocr
// ---------------------------------------------------------------------------

interface TesseractWordFixture {
  text?: unknown;
  confidence?: unknown;
  bbox?: { x0?: unknown; y0?: unknown; x1?: unknown; y1?: unknown };
}

interface RecognizeCall {
  image: Uint8Array;
  language: string;
}

/**
 * A tesseract.js stand-in. It records what the module handed it and answers
 * with the `{ data }` shape the real library returns.
 */
function stubTesseract(
  answer: unknown,
  options: { calls?: RecognizeCall[]; wrapInDefault?: boolean } = {}
): { loads: () => number } {
  let loads = 0;
  const recognize = async (
    image: Uint8Array,
    language: string
  ): Promise<unknown> => {
    options.calls?.push({ image, language });
    return answer;
  };
  stubLibrary("tesseract.js", () => {
    loads += 1;
    return options.wrapInDefault === true
      ? { default: { recognize } }
      : { recognize };
  });
  return { loads: () => loads };
}

function pageOf(words: TesseractWordFixture[], text = "page text"): unknown {
  return { data: { text, confidence: 88.5, words } };
}

async function loadOcr(): Promise<typeof import("../src/host-modules/ocr.js")> {
  return import("../src/host-modules/ocr.js");
}

describe("ocr.recognize", () => {
  it("returns the page text, the mean confidence, and one entry per word", async () => {
    const calls: RecognizeCall[] = [];
    stubTesseract(
      pageOf([
        { text: "Hello", confidence: 96, bbox: { x0: 10, y0: 20, x1: 60, y1: 44 } },
        { text: "world", confidence: 91, bbox: { x0: 70, y0: 20, x1: 130, y1: 44 } }
      ]),
      { calls }
    );
    const { recognize } = await loadOcr();

    const result = await recognize(new Uint8Array([1, 2, 3]));

    expect(result).toEqual({
      text: "page text",
      confidence: 88.5,
      words: [
        { text: "Hello", confidence: 96, bbox: { x: 10, y: 20, width: 50, height: 24 } },
        { text: "world", confidence: 91, bbox: { x: 70, y: 20, width: 60, height: 24 } }
      ]
    });
    expect(calls).toHaveLength(1);
    expect(Array.from(calls[0].image)).toEqual([1, 2, 3]);
  });

  it("reports a word with no box as bbox null, and fills missing fields", async () => {
    stubTesseract(pageOf([{}, { text: "x", bbox: {} }]));
    const { recognize } = await loadOcr();

    const result = await recognize(new Uint8Array([1]));

    expect(result.words).toEqual([
      { text: "", confidence: 0, bbox: null },
      { text: "x", confidence: 0, bbox: { x: 0, y: 0, width: 0, height: 0 } }
    ]);
  });

  it("answers empty for a result carrying no data at all", async () => {
    stubTesseract({});
    const { recognize } = await loadOcr();

    expect(await recognize(new Uint8Array([1]))).toEqual({
      text: "",
      confidence: 0,
      words: []
    });
  });

  it("defaults to eng and passes a multi-language code through", async () => {
    const calls: RecognizeCall[] = [];
    stubTesseract(pageOf([]), { calls });
    const { recognize } = await loadOcr();

    await recognize(new Uint8Array([1]));
    await recognize(new Uint8Array([1]), { language: " eng+deu " });
    await recognize(new Uint8Array([1]), { language: "   " });
    await recognize(new Uint8Array([1]), ["not an options bag"]);

    expect(calls.map((call) => call.language)).toEqual([
      "eng",
      "eng+deu",
      "eng",
      "eng"
    ]);
  });

  it.each(["en", "eng+", "eng+de", "eng ita", "e2g", "../etc"])(
    "refuses %o as a language code before loading the library",
    async (language) => {
      const stub = stubTesseract(pageOf([]));
      const { recognize } = await loadOcr();

      await expect(
        recognize(new Uint8Array([1]), { language })
      ).rejects.toThrow(
        `ocr.recognize: "${language}" is not a Tesseract language code (e.g. "eng", "eng+deu")`
      );
      expect(stub.loads()).toBe(0);
    }
  );

  it("accepts exactly MAX_OCR_WORDS words", async () => {
    const { MAX_OCR_WORDS } = await loadOcr();
    const words: TesseractWordFixture[] = Array.from(
      { length: MAX_OCR_WORDS },
      () => ({ text: "w", confidence: 1 })
    );
    stubTesseract(pageOf(words));
    const { recognize } = await loadOcr();

    const result = await recognize(new Uint8Array([1]));

    expect(result.words).toHaveLength(MAX_OCR_WORDS);
  });

  it("refuses one word past MAX_OCR_WORDS, naming the count and the limit", async () => {
    const { MAX_OCR_WORDS } = await loadOcr();
    const words: TesseractWordFixture[] = Array.from(
      { length: MAX_OCR_WORDS + 1 },
      () => ({ text: "w" })
    );
    stubTesseract(pageOf(words));
    const { recognize } = await loadOcr();

    await expect(recognize(new Uint8Array([1]))).rejects.toThrow(
      `ocr.recognize: ${MAX_OCR_WORDS + 1} words exceeds the ${MAX_OCR_WORDS} word limit`
    );
  });

  it("pins MAX_OCR_WORDS at 20000", async () => {
    const { MAX_OCR_WORDS } = await loadOcr();
    expect(MAX_OCR_WORDS).toBe(20_000);
  });

  it("accepts an image of exactly MAX_HOST_INPUT_BYTES", async () => {
    const calls: RecognizeCall[] = [];
    stubTesseract(pageOf([]), { calls });
    const { recognize } = await loadOcr();

    await recognize(new Uint8Array(MAX_HOST_INPUT_BYTES));

    expect(calls[0].image).toHaveLength(MAX_HOST_INPUT_BYTES);
  });

  it("refuses one byte past MAX_HOST_INPUT_BYTES before loading the library", async () => {
    const stub = stubTesseract(pageOf([]));
    const { recognize } = await loadOcr();

    await expect(
      recognize(new Uint8Array(MAX_HOST_INPUT_BYTES + 1))
    ).rejects.toThrow("ocr.recognize: input exceeds the 10485760 byte limit");
    expect(stub.loads()).toBe(0);
  });

  it("reports a library that will not import", async () => {
    // No stub registered: the mock rejects, the way a missing package does.
    const { recognize } = await loadOcr();

    await expect(recognize(new Uint8Array([1]))).rejects.toMatchObject({
      name: "MissingRuntimePackageError",
      runtimePackage: "tesseract-ocr",
      details: { runtimePackage: "tesseract-ocr", missing: "tesseract.js",
        reason: "missing", managed: "nodetool packs add tesseract-ocr --yes" }
    });
  });

  it("reports a library that imports without a recognize export", async () => {
    stubLibrary("tesseract.js", () => ({ createWorker: () => undefined }));
    const { recognize } = await loadOcr();

    await expect(recognize(new Uint8Array([1]))).rejects.toThrow(
      'ocr.recognize: the "tesseract.js" library is not available in this runtime'
    );
  });

  it("reaches recognize through a CJS default interop wrapper", async () => {
    stubTesseract(pageOf([{ text: "wrapped", confidence: 50 }]), {
      wrapInDefault: true
    });
    const { recognize } = await loadOcr();

    const result = await recognize(new Uint8Array([1]));

    expect(result.words).toEqual([
      { text: "wrapped", confidence: 50, bbox: null }
    ]);
  });

  it("loads the library on every call, so a failed download is retryable", async () => {
    const stub = stubTesseract(pageOf([]));
    const { recognize } = await loadOcr();

    await recognize(new Uint8Array([1]));
    await recognize(new Uint8Array([1]));

    expect(stub.loads()).toBe(2);
  });
});
