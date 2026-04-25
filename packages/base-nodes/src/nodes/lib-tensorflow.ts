/**
 * TensorFlow.js model nodes.
 *
 * Wraps the official @tensorflow-models/* libraries from
 * https://www.tensorflow.org/js/models so they can be used directly in
 * NodeTool workflows.
 *
 * Models are loaded lazily on first use and cached for the lifetime of the
 * process. The pure-JS `@tensorflow/tfjs` backend is used so no native
 * compilation step is required.
 *
 * Coverage:
 *   - MobileNet image classification
 *   - COCO-SSD object detection
 *   - BERT QnA (extractive question answering)
 */
import { BaseNode, prop } from "@nodetool/node-sdk";
import type { ProcessingContext } from "@nodetool/runtime";
import sharp from "sharp";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

type ImageRefLike = {
  uri?: string;
  data?: Uint8Array | string;
  asset_id?: string | null;
};

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

function asBytes(data: Uint8Array | string | undefined): Uint8Array {
  if (!data) return new Uint8Array();
  if (data instanceof Uint8Array) return data;
  return Uint8Array.from(Buffer.from(data, "base64"));
}

async function resolveImageBuffer(
  image: ImageRefLike,
  context?: ProcessingContext
): Promise<Buffer> {
  if (image.data) return Buffer.from(asBytes(image.data));
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

interface RgbTensorSource {
  data: Uint8Array;
  width: number;
  height: number;
}

async function imageToRgbTensorSource(buf: Buffer): Promise<RgbTensorSource> {
  const { data, info } = await sharp(buf, { failOn: "none" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    data: new Uint8Array(data),
    width: info.width,
    height: info.height
  };
}

// Lazy module accessors. Each model package is imported on demand so that
// users who never invoke a TensorFlow node never pay the load cost.

let tfPromise: Promise<unknown> | null = null;
async function loadTf(): Promise<any> {
  if (!tfPromise) {
    tfPromise = (async () => {
      const tf = await import("@tensorflow/tfjs");
      try {
        await (tf as any).setBackend("cpu");
        await (tf as any).ready();
      } catch {
        // backend selection is best-effort; default backend remains.
      }
      return tf;
    })();
  }
  return tfPromise;
}

function tensorFromRgbSource(tf: any, src: RgbTensorSource): any {
  return tf.tensor3d(src.data, [src.height, src.width, 3], "int32");
}

// ---------------------------------------------------------------------------
// Image classification — MobileNet
// ---------------------------------------------------------------------------

let mobilenetPromise: Promise<any> | null = null;
async function loadMobileNet(version: 1 | 2 = 2): Promise<any> {
  if (!mobilenetPromise) {
    mobilenetPromise = (async () => {
      await loadTf();
      const mobilenet = await import("@tensorflow-models/mobilenet");
      return mobilenet.load({ version, alpha: 1.0 });
    })();
  }
  return mobilenetPromise;
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
  description: "The image to analyse"
};

export class TensorflowMobileNetClassifyNode extends BaseNode {
  static readonly nodeType = "lib.tensorflow.MobileNetClassify";
  static readonly title = "TensorFlow MobileNet Classify";
  static readonly description =
    "Classify an image with the MobileNet ImageNet model from TensorFlow.js.\n    tensorflow, image, classification, mobilenet, imagenet";
  static readonly metadataOutputTypes = { output: "list" };
  static readonly exposeAsTool = true;

  @prop(IMAGE_INPUT)
  declare image: any;

  @prop({
    type: "int",
    default: 5,
    title: "Top K",
    description: "Number of top predictions to return",
    min: 1,
    max: 1000
  })
  declare top_k: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const buf = await resolveImageBuffer(
      (this.image ?? {}) as ImageRefLike,
      context
    );
    const src = await imageToRgbTensorSource(buf);
    const tf = await loadTf();
    const model = await loadMobileNet(2);
    const input = tensorFromRgbSource(tf, src);
    try {
      const topK = Math.max(1, Math.min(1000, Number(this.top_k ?? 5)));
      const predictions = await model.classify(input, topK);
      const output = (predictions as Array<{
        className: string;
        probability: number;
      }>).map((p) => ({
        class_name: p.className,
        probability: p.probability
      }));
      return { output };
    } finally {
      input.dispose?.();
    }
  }
}

// ---------------------------------------------------------------------------
// MobileNet feature extraction — penultimate-layer embeddings useful for
// transfer learning / nearest-neighbour search.
// ---------------------------------------------------------------------------

export class TensorflowMobileNetEmbeddingNode extends BaseNode {
  static readonly nodeType = "lib.tensorflow.MobileNetEmbedding";
  static readonly title = "TensorFlow MobileNet Embedding";
  static readonly description =
    "Extract a fixed-length feature embedding from an image using the MobileNet penultimate layer.\n    Useful as input to a custom classifier or nearest-neighbour search.\n    tensorflow, image, embedding, features, mobilenet, transfer learning";
  static readonly metadataOutputTypes = { output: "list" };
  static readonly exposeAsTool = true;

  @prop(IMAGE_INPUT)
  declare image: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const buf = await resolveImageBuffer(
      (this.image ?? {}) as ImageRefLike,
      context
    );
    const src = await imageToRgbTensorSource(buf);
    const tf = await loadTf();
    const model = await loadMobileNet(2);
    const input = tensorFromRgbSource(tf, src);
    try {
      const embedding = model.infer(input, true);
      try {
        const arr = (await embedding.array()) as number[][];
        return { output: arr[0] ?? [] };
      } finally {
        embedding.dispose?.();
      }
    } finally {
      input.dispose?.();
    }
  }
}

// ---------------------------------------------------------------------------
// Object detection — COCO-SSD
// ---------------------------------------------------------------------------

let cocoSsdPromise: Promise<any> | null = null;
async function loadCocoSsd(): Promise<any> {
  if (!cocoSsdPromise) {
    cocoSsdPromise = (async () => {
      await loadTf();
      const cocoSsd = await import("@tensorflow-models/coco-ssd");
      return cocoSsd.load({ base: "mobilenet_v2" });
    })();
  }
  return cocoSsdPromise;
}

export class TensorflowCocoSsdDetectNode extends BaseNode {
  static readonly nodeType = "lib.tensorflow.CocoSsdDetect";
  static readonly title = "TensorFlow COCO-SSD Detect";
  static readonly description =
    "Detect objects in an image using the COCO-SSD model from TensorFlow.js.\n    Returns class name, score and bounding box ({x, y, width, height}) for each detection.\n    tensorflow, object detection, coco, ssd, bounding box";
  static readonly metadataOutputTypes = { output: "list" };
  static readonly exposeAsTool = true;

  @prop(IMAGE_INPUT)
  declare image: any;

  @prop({
    type: "int",
    default: 20,
    title: "Max Detections",
    description: "Maximum number of detections to return",
    min: 1,
    max: 100
  })
  declare max_detections: any;

  @prop({
    type: "float",
    default: 0.5,
    title: "Min Score",
    description: "Minimum confidence score (0–1) to keep a detection",
    min: 0,
    max: 1
  })
  declare min_score: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const buf = await resolveImageBuffer(
      (this.image ?? {}) as ImageRefLike,
      context
    );
    const src = await imageToRgbTensorSource(buf);
    const tf = await loadTf();
    const model = await loadCocoSsd();
    const input = tensorFromRgbSource(tf, src);
    try {
      const max = Math.max(1, Math.min(100, Number(this.max_detections ?? 20)));
      const minScore = Math.max(0, Math.min(1, Number(this.min_score ?? 0.5)));
      const detections = await model.detect(input, max, minScore);
      const output = (detections as Array<{
        bbox: [number, number, number, number];
        class: string;
        score: number;
      }>).map((d) => ({
        class_name: d.class,
        score: d.score,
        bbox: { x: d.bbox[0], y: d.bbox[1], width: d.bbox[2], height: d.bbox[3] }
      }));
      return { output };
    } finally {
      input.dispose?.();
    }
  }
}

// ---------------------------------------------------------------------------
// BERT QnA — extractive question answering
// ---------------------------------------------------------------------------

let qnaPromise: Promise<any> | null = null;
async function loadQna(): Promise<any> {
  if (!qnaPromise) {
    qnaPromise = (async () => {
      await loadTf();
      const qna = await import("@tensorflow-models/qna");
      return qna.load();
    })();
  }
  return qnaPromise;
}

export class TensorflowQnaNode extends BaseNode {
  static readonly nodeType = "lib.tensorflow.Qna";
  static readonly title = "TensorFlow BERT QnA";
  static readonly description =
    "Answer a natural-language question against a passage of context using the TensorFlow.js BERT QnA model.\n    tensorflow, qna, bert, nlp, extractive, reading comprehension";
  static readonly metadataOutputTypes = { output: "list" };
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Question",
    description: "Natural-language question to answer"
  })
  declare question: any;

  @prop({
    type: "str",
    default: "",
    title: "Passage",
    description: "Passage of text to extract the answer from"
  })
  declare passage: any;

  async process(): Promise<Record<string, unknown>> {
    const question = String(this.question ?? "").trim();
    const passage = String(this.passage ?? "").trim();
    if (!question || !passage) return { output: [] };
    const model = await loadQna();
    const answers = (await model.findAnswers(question, passage)) as Array<{
      text: string;
      score: number;
      startIndex: number;
      endIndex: number;
    }>;
    const output = answers.map((a) => ({
      text: a.text,
      score: a.score,
      start_index: a.startIndex,
      end_index: a.endIndex
    }));
    return { output };
  }
}

export const LIB_TENSORFLOW_NODES = [
  TensorflowMobileNetClassifyNode,
  TensorflowMobileNetEmbeddingNode,
  TensorflowCocoSsdDetectNode,
  TensorflowQnaNode
] as const;
