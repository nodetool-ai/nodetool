import { describe, expect, it } from "vitest";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  TRANSFORMERS_JS_NODES,
  registerTransformersJsNodes
} from "../src/index.js";

describe("registerTransformersJsNodes", () => {
  it("registers every Transformers.js node", () => {
    const registry = new NodeRegistry();
    registerTransformersJsNodes(registry);

    const expected = [
      "transformers.TextClassification",
      "transformers.TokenClassification",
      "transformers.QuestionAnswering",
      "transformers.Summarization",
      "transformers.Translation",
      "transformers.TextGeneration",
      "transformers.FillMask",
      "transformers.FeatureExtraction",
      "transformers.ZeroShotClassification",
      "transformers.ImageClassification",
      "transformers.ObjectDetection",
      "transformers.ImageToText",
      "transformers.ZeroShotImageClassification",
      "transformers.AutomaticSpeechRecognition",
      "transformers.AudioClassification",
      "transformers.TextToSpeech"
    ];
    for (const nodeType of expected) {
      expect(registry.has(nodeType)).toBe(true);
    }
    expect(TRANSFORMERS_JS_NODES.length).toBe(expected.length);
  });

  it("declares unique nodeType for every node", () => {
    const seen = new Set<string>();
    for (const cls of TRANSFORMERS_JS_NODES) {
      expect(seen.has(cls.nodeType)).toBe(false);
      seen.add(cls.nodeType);
    }
  });
});
