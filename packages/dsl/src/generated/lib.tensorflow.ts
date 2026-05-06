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

export function mobileNetClassify(inputs: MobileNetClassifyInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<MobileNetClassifyOutputs, "output"> {
  return createNode("lib.tensorflow.MobileNetClassify", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// TensorFlow MobileNet Embedding — lib.tensorflow.MobileNetEmbedding
export interface MobileNetEmbeddingInputs {
  image?: Connectable<ImageRef>;
}

export interface MobileNetEmbeddingOutputs {
  output: unknown[];
}

export function mobileNetEmbedding(inputs: MobileNetEmbeddingInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<MobileNetEmbeddingOutputs, "output"> {
  return createNode("lib.tensorflow.MobileNetEmbedding", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
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

export function cocoSsdDetect(inputs: CocoSsdDetectInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<CocoSsdDetectOutputs, "output"> {
  return createNode("lib.tensorflow.CocoSsdDetect", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// TensorFlow BERT QnA — lib.tensorflow.Qna
export interface QnaInputs {
  question?: Connectable<string>;
  passage?: Connectable<string>;
}

export interface QnaOutputs {
  output: unknown[];
}

export function qna(inputs: QnaInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<QnaOutputs, "output"> {
  return createNode("lib.tensorflow.Qna", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}
