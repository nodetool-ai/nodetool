import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  DEVICE_VALUES,
  DTYPE_VALUES,
  asNumber,
  asString,
  ensureArray,
  extractRepoId,
  getPipeline,
  tjsModelDefault,
  loadRawImage,
  normalizeOption
} from "../transformers-base.js";
import { defaultRepoFor } from "../recommended-models.js";

const TJS_TYPE = "tjs.object_detection";

type ObjectBox = {
  label?: string;
  score?: number;
  box?: {
    xmin?: number;
    ymin?: number;
    xmax?: number;
    ymax?: number;
  };
};

export class ObjectDetectionNode extends BaseNode {
  static readonly nodeType = "transformers.ObjectDetection";
  static readonly title = "Object Detection";
  static readonly description =
    "Detect objects and their bounding boxes in an image using a Transformers.js object-detection pipeline.\n" +
    "vision, detection, bounding-box, transformers, huggingface\n\n" +
    "Use cases:\n" +
    "- Localize objects for cropping or tracking\n" +
    "- Count items in retail photos\n" +
    "- Pre-label data for downstream training";
  static readonly metadataOutputTypes = {
    detections: "list"
  };

  @prop({
    type: "image",
    default: { type: "image" },
    title: "Image",
    description: "Image to run detection on."
  })
  declare image: any;

  @prop({
    type: TJS_TYPE,
    default: tjsModelDefault(TJS_TYPE, defaultRepoFor(TJS_TYPE)),
    title: "Model",
    description: "Transformers.js model (ONNX-compatible)."
  })
  declare model: any;

  @prop({
    type: "float",
    default: 0.9,
    title: "Score Threshold",
    description: "Minimum confidence score required to keep a detection.",
    min: 0.0,
    max: 1.0
  })
  declare threshold: any;

  @prop({
    type: "bool",
    default: true,
    title: "Percentage Coordinates",
    description: "Return bounding boxes as fractions of image size."
  })
  declare percentage: any;

  @prop({
    type: "enum",
    default: "auto",
    title: "Quantization",
    description: "Model dtype / quantization level.",
    values: DTYPE_VALUES
  })
  declare dtype: any;

  @prop({
    type: "enum",
    default: "auto",
    title: "Device",
    description: "Inference device.",
    values: DEVICE_VALUES
  })
  declare device: any;

  async process(
    context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    const rawImage = await loadRawImage(this.image, context);

    const pipeline = (await getPipeline({
      task: "object-detection",
      model: extractRepoId(this.model) || undefined,
      dtype: normalizeOption(this.dtype),
      device: normalizeOption(this.device)
    })) as (
      input: unknown,
      opts?: Record<string, unknown>
    ) => Promise<ObjectBox | ObjectBox[]>;

    const raw = await pipeline(rawImage, {
      threshold: asNumber(this.threshold, 0.9),
      percentage: Boolean(this.percentage)
    });
    return { detections: ensureArray<ObjectBox>(raw) };
  }
}

export const OBJECT_DETECTION_NODES: readonly NodeClass[] = [
  ObjectDetectionNode
];
