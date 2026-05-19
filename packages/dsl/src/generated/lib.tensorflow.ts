// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef } from "../types.js";

// TensorFlow MobileNet Classify — lib.tensorflow.MobileNetClassify
export interface MobileNetClassifyInputs {
  image?: Connectable<ImageRef>;
  top_k?: Connectable<number>;
}

export interface MobileNetClassifyOutputs {
  output: unknown[];
}

export function mobileNetClassify(inputs: MobileNetClassifyInputs): DslNode<MobileNetClassifyOutputs, "output"> {
  return createNode("lib.tensorflow.MobileNetClassify", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// TensorFlow MobileNet Embedding — lib.tensorflow.MobileNetEmbedding
export interface MobileNetEmbeddingInputs {
  image?: Connectable<ImageRef>;
}

export interface MobileNetEmbeddingOutputs {
  output: unknown[];
}

export function mobileNetEmbedding(inputs: MobileNetEmbeddingInputs): DslNode<MobileNetEmbeddingOutputs, "output"> {
  return createNode("lib.tensorflow.MobileNetEmbedding", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// TensorFlow COCO-SSD Detect — lib.tensorflow.CocoSsdDetect
export interface CocoSsdDetectInputs {
  image?: Connectable<ImageRef>;
  max_detections?: Connectable<number>;
  min_score?: Connectable<number>;
}

export interface CocoSsdDetectOutputs {
  output: unknown[];
}

export function cocoSsdDetect(inputs: CocoSsdDetectInputs): DslNode<CocoSsdDetectOutputs, "output"> {
  return createNode("lib.tensorflow.CocoSsdDetect", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// TensorFlow BERT QnA — lib.tensorflow.Qna
export interface QnaInputs {
  question?: Connectable<string>;
  passage?: Connectable<string>;
}

export interface QnaOutputs {
  output: unknown[];
}

export function qna(inputs: QnaInputs): DslNode<QnaOutputs, "output"> {
  return createNode("lib.tensorflow.Qna", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}
