import { describe, expect, it } from "vitest";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import { HUGGINGFACE_NODES, registerHuggingFaceNodes } from "../src/index.js";

/** Every task documented at huggingface.co/docs/inference-providers/tasks. */
const EXPECTED_NODE_TYPES = [
  // Text / NLP
  "huggingface.ChatCompletion",
  "huggingface.TextGeneration",
  "huggingface.Summarization",
  "huggingface.Translation",
  "huggingface.FillMask",
  "huggingface.QuestionAnswering",
  "huggingface.TableQuestionAnswering",
  "huggingface.FeatureExtraction",
  "huggingface.TextClassification",
  "huggingface.TokenClassification",
  "huggingface.ZeroShotClassification",
  // Image / vision
  "huggingface.TextToImage",
  "huggingface.ImageToImage",
  "huggingface.ImageClassification",
  "huggingface.ImageSegmentation",
  "huggingface.ObjectDetection",
  // Audio
  "huggingface.AutomaticSpeechRecognition",
  "huggingface.AudioClassification",
  // Video
  "huggingface.TextToVideo"
];

describe("registerHuggingFaceNodes", () => {
  it("registers a node for every Inference Providers task", () => {
    const registry = new NodeRegistry();
    registerHuggingFaceNodes(registry);

    for (const nodeType of EXPECTED_NODE_TYPES) {
      expect(registry.has(nodeType)).toBe(true);
    }
  });

  it("exports exactly the expected node set", () => {
    const types = HUGGINGFACE_NODES.map((n) => n.nodeType).sort();
    expect(types).toEqual([...EXPECTED_NODE_TYPES].sort());
  });

  it("requires the HF_TOKEN setting on every node", () => {
    for (const node of HUGGINGFACE_NODES) {
      expect(node.requiredSettings).toContain("HF_TOKEN");
    }
  });

  it("declares output types on every node", () => {
    for (const node of HUGGINGFACE_NODES) {
      expect(node.metadataOutputTypes).toBeDefined();
      expect(Object.keys(node.metadataOutputTypes ?? {}).length).toBeGreaterThan(0);
    }
  });
});
