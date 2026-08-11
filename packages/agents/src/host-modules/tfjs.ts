/**
 * `@nodetool-ai/sandbox-tfjs` — TensorFlow.js and its model zoo, on the host.
 *
 * The models are tens of megabytes of weights fetched over the network and
 * held between calls; the guest has neither the heap for them nor a way to
 * keep anything alive past a run. So the library runs here, each model is
 * loaded once per process, and the guest passes encoded image bytes and gets
 * plain records back.
 *
 * These are the four readings `lib.tensorflow.*` used to expose as nodes.
 */

import { imageOps } from "../sandbox-media.js";
import {
  importOptionalLibrary,
  optionsOf,
  requireBytes,
  requireText
} from "./limits.js";

/** Predictions `classify` returns at most. */
export const MAX_CLASSIFY_RESULTS = 100;
/** Detections `detect` returns at most. */
export const MAX_DETECTIONS = 100;

// The model packages have no useful public types (`load()` returns an
// implementation class), so each is described by what this module calls.
interface TensorLike {
  array: () => Promise<number[][]>;
  dispose?: () => void;
}
interface TfLike {
  tensor3d: (
    data: Uint8Array,
    shape: [number, number, number],
    dtype: "int32"
  ) => TensorLike;
  setBackend?: (name: string) => Promise<boolean>;
  ready?: () => Promise<void>;
}
interface MobileNetLike {
  classify: (
    input: TensorLike,
    topK: number
  ) => Promise<Array<{ className: string; probability: number }>>;
  infer: (input: TensorLike, embedding: boolean) => TensorLike;
}
interface CocoSsdLike {
  detect: (
    input: TensorLike,
    maxBoxes: number,
    minScore: number
  ) => Promise<
    Array<{ bbox: [number, number, number, number]; class: string; score: number }>
  >;
}
interface QnaLike {
  findAnswers: (
    question: string,
    passage: string
  ) => Promise<
    Array<{ text: string; score: number; startIndex: number; endIndex: number }>
  >;
}

/**
 * Load once per process, and forget a rejection so a failed weight download
 * does not poison every later call with the same settled promise.
 */
function once<T>(factory: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => {
    if (pending !== null) return pending;
    const promise = factory();
    pending = promise;
    promise.catch(() => {
      if (pending === promise) pending = null;
    });
    return promise;
  };
}

const loadTf = once(async (): Promise<TfLike> => {
  const tf = await importOptionalLibrary<TfLike>("tfjs", "@tensorflow/tfjs");
  try {
    await tf.setBackend?.("cpu");
    await tf.ready?.();
  } catch {
    // Backend selection is best-effort; the default backend still works.
  }
  return tf;
});

const loadMobileNet = once(async (): Promise<MobileNetLike> => {
  await loadTf();
  const mod = await importOptionalLibrary<{
    load: (opts: { version: number; alpha: number }) => Promise<MobileNetLike>;
  }>("tfjs", "@tensorflow-models/mobilenet");
  return mod.load({ version: 2, alpha: 1.0 });
});

const loadCocoSsd = once(async (): Promise<CocoSsdLike> => {
  await loadTf();
  const mod = await importOptionalLibrary<{
    load: (opts: { base: string }) => Promise<CocoSsdLike>;
  }>("tfjs", "@tensorflow-models/coco-ssd");
  return mod.load({ base: "mobilenet_v2" });
});

const loadQna = once(async (): Promise<QnaLike> => {
  await loadTf();
  const mod = await importOptionalLibrary<{ load: () => Promise<QnaLike> }>(
    "tfjs",
    "@tensorflow-models/qna"
  );
  return mod.load();
});

/**
 * Encoded image bytes to the int32 RGB tensor every vision model here wants.
 *
 * Decoding goes through the sandbox's own `image` backend, so an image the
 * guest could not decode with `image.decode` cannot get in this way either,
 * and the pixel caps that bridge enforces apply unchanged.
 */
async function toTensor(where: string, image: unknown): Promise<TensorLike> {
  const bytes = requireBytes(where, image, "image");
  const decoded = await imageOps.decode(bytes);
  const width = Number(decoded.width);
  const height = Number(decoded.height);
  const rgba = decoded.pixels as Uint8Array;
  const rgb = new Uint8Array(width * height * 3);
  for (let pixel = 0; pixel < width * height; pixel++) {
    rgb[pixel * 3] = rgba[pixel * 4];
    rgb[pixel * 3 + 1] = rgba[pixel * 4 + 1];
    rgb[pixel * 3 + 2] = rgba[pixel * 4 + 2];
  }
  const tf = await loadTf();
  return tf.tensor3d(rgb, [height, width, 3], "int32");
}

function bounded(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

/**
 * ImageNet labels for an image, most likely first.
 *
 * ```js
 * const labels = await classify(await workspace.readBytes("cat.png"), { topK: 3 });
 * ```
 */
export async function classify(
  image: unknown,
  options?: unknown
): Promise<Array<Record<string, unknown>>> {
  const where = "tfjs.classify";
  const opts = optionsOf(options);
  const topK = Math.round(bounded(opts.topK, 5, 1, MAX_CLASSIFY_RESULTS));
  const input = await toTensor(where, image);
  try {
    const model = await loadMobileNet();
    const predictions = await model.classify(input, topK);
    return predictions.map((prediction) => ({
      className: prediction.className,
      probability: prediction.probability
    }));
  } finally {
    input.dispose?.();
  }
}

/**
 * A MobileNet feature vector for an image — the penultimate layer, for
 * nearest-neighbour search and transfer learning.
 */
export async function embed(image: unknown): Promise<number[]> {
  const where = "tfjs.embed";
  const input = await toTensor(where, image);
  try {
    const model = await loadMobileNet();
    const embedding = model.infer(input, true);
    try {
      const rows = await embedding.array();
      return rows[0] ?? [];
    } finally {
      embedding.dispose?.();
    }
  } finally {
    input.dispose?.();
  }
}

/**
 * COCO-SSD object detections: a class, a score, and a pixel box each.
 *
 * ```js
 * const objects = await detect(bytes, { maxBoxes: 10, minScore: 0.6 });
 * ```
 */
export async function detect(
  image: unknown,
  options?: unknown
): Promise<Array<Record<string, unknown>>> {
  const where = "tfjs.detect";
  const opts = optionsOf(options);
  const maxBoxes = Math.round(bounded(opts.maxBoxes, 20, 1, MAX_DETECTIONS));
  const minScore = bounded(opts.minScore, 0.5, 0, 1);
  const input = await toTensor(where, image);
  try {
    const model = await loadCocoSsd();
    const detections = await model.detect(input, maxBoxes, minScore);
    return detections.map((detection) => ({
      className: detection.class,
      score: detection.score,
      bbox: {
        x: detection.bbox[0],
        y: detection.bbox[1],
        width: detection.bbox[2],
        height: detection.bbox[3]
      }
    }));
  } finally {
    input.dispose?.();
  }
}

/**
 * Extractive question answering with BERT: spans of the passage that answer
 * the question, best first. It quotes the passage — it never writes prose.
 */
export async function answer(
  question: unknown,
  passage: unknown
): Promise<Array<Record<string, unknown>>> {
  const where = "tfjs.answer";
  const asked = requireText(where, question, "question").trim();
  const text = requireText(where, passage, "passage").trim();
  if (!asked || !text) return [];
  const model = await loadQna();
  const answers = await model.findAnswers(asked, text);
  return answers.map((found) => ({
    text: found.text,
    score: found.score,
    startIndex: found.startIndex,
    endIndex: found.endIndex
  }));
}
