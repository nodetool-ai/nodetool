/**
 * `@nodetool-ai/sandbox-ocr` and `@nodetool-ai/sandbox-tfjs` — the argument
 * contract, every cap, and every refusal.
 *
 * Both modules front a library that downloads on first use: tesseract.js fetches
 * a language file, the model zoo fetches tens of megabytes of weights. Nothing
 * here goes near a network. The one seam each implementation already has —
 * `importOptionalModule`, the lazy import inside the implementation — is stubbed,
 * so the code under test is the module's own logic: the caps, the coercions, the
 * tensor conversion, and the errors the guest reads.
 *
 * The image path is real: a fixture PNG goes through the sandbox's own image
 * backend, so `toTensor` is exercised against genuinely decoded pixels.
 *
 * `tests/host-modules.test.ts` covers the same two packs from inside the sandbox
 * (the import path, the dispatcher, the non-bytes refusal). These are the host
 * side of the same code.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

import {
  MAX_HOST_INPUT_BYTES,
  MAX_HOST_INPUT_CHARS
} from "../src/host-modules/limits.js";

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

    await expect(recognize(new Uint8Array([1]))).rejects.toThrow(
      'ocr.recognize: the "tesseract.js" library is not available in this runtime'
    );
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

// ---------------------------------------------------------------------------
// tfjs
// ---------------------------------------------------------------------------

interface Tensor3dCall {
  data: Uint8Array;
  shape: [number, number, number];
  dtype: string;
}

interface ClassifyCall {
  topK: number;
}

interface DetectCall {
  maxBoxes: number;
  minScore: number;
}

interface TfStub {
  tensors: Tensor3dCall[];
  disposed: () => number;
  setBackends: string[];
  ready: () => number;
}

/** A `@tensorflow/tfjs` stand-in recording the tensor the module built. */
function stubTf(options: { backendThrows?: boolean } = {}): TfStub {
  const tensors: Tensor3dCall[] = [];
  const setBackends: string[] = [];
  let disposed = 0;
  let ready = 0;
  stubLibrary("@tensorflow/tfjs", () => ({
    tensor3d: (
      data: Uint8Array,
      shape: [number, number, number],
      dtype: string
    ) => {
      tensors.push({ data, shape, dtype });
      return {
        array: async () => [[]],
        dispose: () => {
          disposed += 1;
        }
      };
    },
    setBackend: async (name: string) => {
      setBackends.push(name);
      if (options.backendThrows === true) {
        throw new Error("no cpu backend in this build");
      }
      return true;
    },
    ready: async () => {
      ready += 1;
    }
  }));
  return {
    tensors,
    disposed: () => disposed,
    setBackends,
    ready: () => ready
  };
}

function stubMobileNet(
  predictions: Array<{ className: string; probability: number }>,
  options: { calls?: ClassifyCall[]; embedding?: number[][] } = {}
): { disposed: () => number } {
  let disposed = 0;
  stubLibrary("@tensorflow-models/mobilenet", () => ({
    load: async () => ({
      classify: async (_input: unknown, topK: number) => {
        options.calls?.push({ topK });
        return predictions;
      },
      infer: () => ({
        array: async () => options.embedding ?? [[0.5, 0.25]],
        dispose: () => {
          disposed += 1;
        }
      })
    })
  }));
  return { disposed: () => disposed };
}

function stubCocoSsd(
  detections: Array<{
    bbox: [number, number, number, number];
    class: string;
    score: number;
  }>,
  calls?: DetectCall[]
): void {
  stubLibrary("@tensorflow-models/coco-ssd", () => ({
    load: async () => ({
      detect: async (_input: unknown, maxBoxes: number, minScore: number) => {
        calls?.push({ maxBoxes, minScore });
        return detections;
      }
    })
  }));
}

function stubQna(
  answers: Array<{
    text: string;
    score: number;
    startIndex: number;
    endIndex: number;
  }>
): { loads: () => number } {
  let loads = 0;
  stubLibrary("@tensorflow-models/qna", () => {
    loads += 1;
    return {
      load: async () => ({
        findAnswers: async () => answers
      })
    };
  });
  return { loads: () => loads };
}

async function loadTfjs(): Promise<typeof import("../src/host-modules/tfjs.js")> {
  return import("../src/host-modules/tfjs.js");
}

/** Four pixels with distinct channels, so the RGBA → RGB drop is visible. */
const FIXTURE_RGBA = new Uint8Array([
  255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 10, 20, 30, 255
]);

let fixturePng: Uint8Array;

beforeAll(async () => {
  const { encodePixels } = await import("../src/sandbox-media.js");
  fixturePng = await encodePixels(FIXTURE_RGBA, 2, 2);
});

describe("tfjs.classify", () => {
  it("classifies a decoded image and reports label and probability", async () => {
    stubTf();
    const calls: ClassifyCall[] = [];
    stubMobileNet(
      [
        { className: "tabby cat", probability: 0.81 },
        { className: "tiger cat", probability: 0.12 }
      ],
      { calls }
    );
    const { classify } = await loadTfjs();

    const result = await classify(fixturePng);

    expect(result).toEqual([
      { className: "tabby cat", probability: 0.81 },
      { className: "tiger cat", probability: 0.12 }
    ]);
    expect(calls).toEqual([{ topK: 5 }]);
  });

  it("hands the model int32 RGB pixels in [height, width, 3]", async () => {
    const tf = stubTf();
    stubMobileNet([]);
    const { classify } = await loadTfjs();

    await classify(fixturePng);

    expect(tf.tensors).toHaveLength(1);
    expect(tf.tensors[0].shape).toEqual([2, 2, 3]);
    expect(tf.tensors[0].dtype).toBe("int32");
    expect(Array.from(tf.tensors[0].data)).toEqual([
      255, 0, 0, 0, 255, 0, 0, 0, 255, 10, 20, 30
    ]);
  });

  it("disposes the input tensor even when the model throws", async () => {
    const tf = stubTf();
    stubLibrary("@tensorflow-models/mobilenet", () => ({
      load: async () => ({
        classify: async () => {
          throw new Error("weights are corrupt");
        },
        infer: () => {
          throw new Error("unused");
        }
      })
    }));
    const { classify } = await loadTfjs();

    await expect(classify(fixturePng)).rejects.toThrow("weights are corrupt");
    expect(tf.disposed()).toBe(1);
  });

  it.each([
    [{ topK: 0 }, 1],
    [{ topK: -40 }, 1],
    [{ topK: 3.6 }, 4],
    [{ topK: 1_000_000 }, 100],
    [{ topK: "not a number" }, 5],
    [{ topK: Number.POSITIVE_INFINITY }, 5],
    [{}, 5]
  ])("clamps topK %o to %i", async (options, expected) => {
    stubTf();
    const calls: ClassifyCall[] = [];
    stubMobileNet([], { calls });
    const { classify } = await loadTfjs();

    await classify(fixturePng, options);

    expect(calls).toEqual([{ topK: expected }]);
  });

  it("never asks for more predictions than MAX_CLASSIFY_RESULTS", async () => {
    const { MAX_CLASSIFY_RESULTS } = await loadTfjs();
    expect(MAX_CLASSIFY_RESULTS).toBe(100);
  });

  it("refuses an image past MAX_HOST_INPUT_BYTES before decoding it", async () => {
    stubTf();
    stubMobileNet([]);
    const { classify } = await loadTfjs();

    await expect(
      classify(new Uint8Array(MAX_HOST_INPUT_BYTES + 1))
    ).rejects.toThrow("tfjs.classify: input exceeds the 10485760 byte limit");
  });

  it("refuses bytes that are not an image", async () => {
    stubTf();
    stubMobileNet([]);
    const { classify } = await loadTfjs();

    // Bytes carrying no signature the decoder recognizes. A *truncated* image
    // is not covered here on purpose: @napi-rs/canvas 0.1.100 segfaults on one
    // (`loadImage(png.subarray(0, 60))`), so the case cannot be asserted from
    // inside the process it kills.
    await expect(classify(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow(Error);
  });

  it("reports tfjs itself as unavailable", async () => {
    stubMobileNet([]);
    const { classify } = await loadTfjs();

    await expect(classify(fixturePng)).rejects.toThrow(
      'tfjs: the "@tensorflow/tfjs" library is not available in this runtime'
    );
  });

  it("reports a missing model package", async () => {
    stubTf();
    const { classify } = await loadTfjs();

    await expect(classify(fixturePng)).rejects.toThrow(
      'tfjs: the "@tensorflow-models/mobilenet" library is not available in this runtime'
    );
  });

  it("selects the cpu backend once, and survives a backend that refuses", async () => {
    const tf = stubTf({ backendThrows: true });
    stubMobileNet([{ className: "cat", probability: 1 }]);
    const { classify } = await loadTfjs();

    await classify(fixturePng);
    await classify(fixturePng);

    expect(tf.setBackends).toEqual(["cpu"]);
    expect(tf.ready()).toBe(0);
  });

  it("retries a load that failed instead of caching the rejection", async () => {
    let attempts = 0;
    stubTf();
    stubLibrary("@tensorflow-models/mobilenet", () => {
      attempts += 1;
      if (attempts === 1) throw new Error("download interrupted");
      return {
        load: async () => ({
          classify: async () => [{ className: "cat", probability: 1 }],
          infer: () => ({ array: async () => [[]] })
        })
      };
    });
    const { classify } = await loadTfjs();

    await expect(classify(fixturePng)).rejects.toThrow(
      'tfjs: the "@tensorflow-models/mobilenet" library is not available in this runtime'
    );
    expect(await classify(fixturePng)).toEqual([
      { className: "cat", probability: 1 }
    ]);
    expect(attempts).toBe(2);
  });
});

describe("tfjs.embed", () => {
  it("returns the first row of the feature matrix", async () => {
    stubTf();
    stubMobileNet([], { embedding: [[0.1, 0.2, 0.3]] });
    const { embed } = await loadTfjs();

    expect(await embed(fixturePng)).toEqual([0.1, 0.2, 0.3]);
  });

  it("answers with an empty vector when the model returns no rows", async () => {
    stubTf();
    stubMobileNet([], { embedding: [] });
    const { embed } = await loadTfjs();

    expect(await embed(fixturePng)).toEqual([]);
  });

  it("disposes both the input tensor and the embedding", async () => {
    const tf = stubTf();
    const mobilenet = stubMobileNet([], { embedding: [[1]] });
    const { embed } = await loadTfjs();

    await embed(fixturePng);

    expect(tf.disposed()).toBe(1);
    expect(mobilenet.disposed()).toBe(1);
  });

  it("refuses an image past MAX_HOST_INPUT_BYTES", async () => {
    stubTf();
    stubMobileNet([]);
    const { embed } = await loadTfjs();

    await expect(embed(new Uint8Array(MAX_HOST_INPUT_BYTES + 1))).rejects.toThrow(
      "tfjs.embed: input exceeds the 10485760 byte limit"
    );
  });

  it("refuses an image that is not bytes", async () => {
    stubTf();
    stubMobileNet([]);
    const { embed } = await loadTfjs();

    await expect(embed("a photo")).rejects.toThrow(
      "tfjs.embed: image must be a Uint8Array"
    );
  });
});

describe("tfjs.detect", () => {
  it("maps a detection to a class, a score, and a pixel box", async () => {
    stubTf();
    const calls: DetectCall[] = [];
    stubCocoSsd(
      [{ bbox: [4, 8, 16, 32], class: "dog", score: 0.77 }],
      calls
    );
    const { detect } = await loadTfjs();

    const result = await detect(fixturePng);

    expect(result).toEqual([
      {
        className: "dog",
        score: 0.77,
        bbox: { x: 4, y: 8, width: 16, height: 32 }
      }
    ]);
    expect(calls).toEqual([{ maxBoxes: 20, minScore: 0.5 }]);
  });

  it.each([
    [{ maxBoxes: 0 }, 1],
    [{ maxBoxes: 9_999 }, 100],
    [{ maxBoxes: 7.4 }, 7],
    [{ maxBoxes: "many" }, 20]
  ])("clamps maxBoxes %o to %i", async (options, expected) => {
    stubTf();
    const calls: DetectCall[] = [];
    stubCocoSsd([], calls);
    const { detect } = await loadTfjs();

    await detect(fixturePng, options);

    expect(calls[0].maxBoxes).toBe(expected);
  });

  it.each([
    [{ minScore: -3 }, 0],
    [{ minScore: 5 }, 1],
    [{ minScore: 0.25 }, 0.25],
    [{ minScore: Number.NaN }, 0.5]
  ])("clamps minScore %o to %d", async (options, expected) => {
    stubTf();
    const calls: DetectCall[] = [];
    stubCocoSsd([], calls);
    const { detect } = await loadTfjs();

    await detect(fixturePng, options);

    expect(calls[0].minScore).toBe(expected);
  });

  it("pins MAX_DETECTIONS at 100", async () => {
    const { MAX_DETECTIONS } = await loadTfjs();
    expect(MAX_DETECTIONS).toBe(100);
  });

  it("disposes the input tensor", async () => {
    const tf = stubTf();
    stubCocoSsd([]);
    const { detect } = await loadTfjs();

    await detect(fixturePng);

    expect(tf.disposed()).toBe(1);
  });

  it("refuses an image past MAX_HOST_INPUT_BYTES", async () => {
    stubTf();
    stubCocoSsd([]);
    const { detect } = await loadTfjs();

    await expect(
      detect(new Uint8Array(MAX_HOST_INPUT_BYTES + 1))
    ).rejects.toThrow("tfjs.detect: input exceeds the 10485760 byte limit");
  });

  it("reports a missing coco-ssd package", async () => {
    stubTf();
    const { detect } = await loadTfjs();

    await expect(detect(fixturePng)).rejects.toThrow(
      'tfjs: the "@tensorflow-models/coco-ssd" library is not available in this runtime'
    );
  });
});

describe("tfjs.answer", () => {
  it("quotes the passage, best answer first", async () => {
    stubTf();
    stubQna([
      { text: "in 1969", score: 0.9, startIndex: 12, endIndex: 19 },
      { text: "1969", score: 0.4, startIndex: 15, endIndex: 19 }
    ]);
    const { answer } = await loadTfjs();

    expect(await answer("when?", "It happened in 1969.")).toEqual([
      { text: "in 1969", score: 0.9, startIndex: 12, endIndex: 19 },
      { text: "1969", score: 0.4, startIndex: 15, endIndex: 19 }
    ]);
  });

  it("answers nothing for a blank passage without loading the model", async () => {
    stubTf();
    const qna = stubQna([]);
    const { answer } = await loadTfjs();

    expect(await answer("who?", "   ")).toEqual([]);
    expect(qna.loads()).toBe(0);
  });

  it("refuses a question that is not text", async () => {
    const { answer } = await loadTfjs();

    await expect(answer(42, "a passage")).rejects.toThrow(
      "tfjs.answer: question must be a string"
    );
  });

  it("refuses a question past MAX_HOST_INPUT_CHARS", async () => {
    const qna = stubQna([]);
    const { answer } = await loadTfjs();

    await expect(
      answer("q".repeat(MAX_HOST_INPUT_CHARS + 1), "a passage")
    ).rejects.toThrow("tfjs.answer: input exceeds the 5242880 character limit");
    expect(qna.loads()).toBe(0);
  });

  it("refuses a passage past MAX_HOST_INPUT_CHARS", async () => {
    const qna = stubQna([]);
    const { answer } = await loadTfjs();

    await expect(
      answer("who?", "p".repeat(MAX_HOST_INPUT_CHARS + 1))
    ).rejects.toThrow("tfjs.answer: input exceeds the 5242880 character limit");
    expect(qna.loads()).toBe(0);
  });

  it("accepts a passage of exactly MAX_HOST_INPUT_CHARS", async () => {
    stubTf();
    stubQna([{ text: "p", score: 1, startIndex: 0, endIndex: 1 }]);
    const { answer } = await loadTfjs();

    const result = await answer("who?", "p".repeat(MAX_HOST_INPUT_CHARS));

    expect(result).toHaveLength(1);
  });

  it("reports a missing qna package", async () => {
    stubTf();
    const { answer } = await loadTfjs();

    await expect(answer("who?", "a passage")).rejects.toThrow(
      'tfjs: the "@tensorflow-models/qna" library is not available in this runtime'
    );
  });
});
