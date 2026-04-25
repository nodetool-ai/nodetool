/**
 * Lightweight registration / interface tests for TensorFlow.js nodes.
 *
 * The model classes themselves are skipped because loading the full BERT,
 * MobileNet and COCO-SSD weights from the public TF Hub mirrors over the
 * network is too heavy for the unit-test suite. Heavy end-to-end runs live
 * in tests/e2e/lib-tensorflow.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  TensorflowMobileNetClassifyNode,
  TensorflowMobileNetEmbeddingNode,
  TensorflowCocoSsdDetectNode,
  TensorflowQnaNode,
  LIB_TENSORFLOW_NODES
} from "../src/index.js";

describe("TensorFlow.js nodes — registration & interface", () => {
  it("exports a stable list of node classes", () => {
    expect(LIB_TENSORFLOW_NODES).toEqual([
      TensorflowMobileNetClassifyNode,
      TensorflowMobileNetEmbeddingNode,
      TensorflowCocoSsdDetectNode,
      TensorflowQnaNode
    ]);
  });

  it("each node has a unique nodeType under lib.tensorflow.*", () => {
    const types = LIB_TENSORFLOW_NODES.map((n) => n.nodeType);
    expect(new Set(types).size).toBe(types.length);
    for (const t of types) {
      expect(t.startsWith("lib.tensorflow.")).toBe(true);
    }
  });

  it("each node declares title, description and metadataOutputTypes", () => {
    for (const NodeClass of LIB_TENSORFLOW_NODES) {
      expect(NodeClass.title.length).toBeGreaterThan(0);
      expect(NodeClass.description.length).toBeGreaterThan(0);
      expect(NodeClass.metadataOutputTypes).toBeDefined();
      expect(NodeClass.metadataOutputTypes!.output).toBeDefined();
    }
  });

  it("each node is exposed as an agent tool", () => {
    for (const NodeClass of LIB_TENSORFLOW_NODES) {
      expect(NodeClass.exposeAsTool).toBe(true);
    }
  });

  it("MobileNet classify declares image + top_k properties", () => {
    const props = TensorflowMobileNetClassifyNode.getDeclaredProperties();
    const names = props.map((p) => p.name).sort();
    expect(names).toEqual(["image", "top_k"]);
    const topK = props.find((p) => p.name === "top_k")!;
    expect(topK.options.type).toBe("int");
    expect(topK.options.default).toBe(5);
  });

  it("MobileNet embedding declares only an image property", () => {
    const props = TensorflowMobileNetEmbeddingNode.getDeclaredProperties();
    expect(props.map((p) => p.name)).toEqual(["image"]);
  });

  it("COCO-SSD detect declares image + max_detections + min_score", () => {
    const props = TensorflowCocoSsdDetectNode.getDeclaredProperties();
    const names = props.map((p) => p.name).sort();
    expect(names).toEqual(["image", "max_detections", "min_score"]);
    const minScore = props.find((p) => p.name === "min_score")!;
    expect(minScore.options.type).toBe("float");
    expect(minScore.options.default).toBe(0.5);
  });

  it("BERT QnA declares question + passage", () => {
    const props = TensorflowQnaNode.getDeclaredProperties();
    expect(props.map((p) => p.name).sort()).toEqual(["passage", "question"]);
    for (const p of props) {
      expect(p.options.type).toBe("str");
    }
  });
});

describe("TensorFlow.js QnA — input validation", () => {
  it("returns an empty answer list when question or passage is empty", async () => {
    const node = new TensorflowQnaNode();
    node.assign({ question: "", passage: "" });
    const result = await node.process();
    expect(result.output).toEqual([]);
  });

  it("returns an empty answer list when only the question is empty", async () => {
    const node = new TensorflowQnaNode();
    node.assign({ question: "  ", passage: "Some passage." });
    const result = await node.process();
    expect(result.output).toEqual([]);
  });

  it("returns an empty answer list when only the passage is empty", async () => {
    const node = new TensorflowQnaNode();
    node.assign({ question: "What is up?", passage: "" });
    const result = await node.process();
    expect(result.output).toEqual([]);
  });
});

describe("TensorFlow.js image nodes — input validation", () => {
  it("MobileNet classify rejects an empty image ref", async () => {
    const node = new TensorflowMobileNetClassifyNode();
    node.assign({ image: { type: "image" }, top_k: 1 });
    await expect(node.process()).rejects.toThrow(/No image data or URI/i);
  });

  it("MobileNet embedding rejects an empty image ref", async () => {
    const node = new TensorflowMobileNetEmbeddingNode();
    node.assign({ image: { type: "image" } });
    await expect(node.process()).rejects.toThrow(/No image data or URI/i);
  });

  it("COCO-SSD detect rejects an empty image ref", async () => {
    const node = new TensorflowCocoSsdDetectNode();
    node.assign({ image: { type: "image" }, max_detections: 1, min_score: 0 });
    await expect(node.process()).rejects.toThrow(/No image data or URI/i);
  });
});
