import { describe, expect, it } from "vitest";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import { TextClassificationNode } from "../src/nodes/text-classification.js";
import { ImageClassificationNode } from "../src/nodes/image-classification.js";
import { AutomaticSpeechRecognitionNode } from "../src/nodes/automatic-speech-recognition.js";
import { TextToSpeechNode } from "../src/nodes/text-to-speech.js";
import { FeatureExtractionNode } from "../src/nodes/feature-extraction.js";
import { TRANSFORMERS_JS_NODES } from "../src/index.js";

describe("Transformers.js node descriptors", () => {
  it("declares string text input for text classification", () => {
    const desc = TextClassificationNode.toDescriptor();
    expect(desc.propertyTypes?.text).toBe("str");
    expect(desc.propertyTypes?.model).toBe("tjs.text_classification");
    expect(desc.propertyTypes?.top_k).toBe("int");
    expect(desc.propertyTypes?.dtype).toBe("enum");
  });

  it("declares image input for vision nodes", () => {
    const desc = ImageClassificationNode.toDescriptor();
    expect(desc.propertyTypes?.image).toBe("image");
    expect(desc.propertyTypes?.model).toBe("tjs.image_classification");
  });

  it("declares audio input for audio nodes", () => {
    const asr = AutomaticSpeechRecognitionNode.toDescriptor();
    expect(asr.propertyTypes?.audio).toBe("audio");
    expect(asr.propertyTypes?.model).toBe("tjs.automatic_speech_recognition");
  });

  it("declares audio output for text-to-speech and marks autoSaveAsset", () => {
    expect(TextToSpeechNode.metadataOutputTypes).toEqual({ output: "audio" });
    expect(TextToSpeechNode.autoSaveAsset).toBe(true);
  });

  it("declares list embedding output for feature extraction", () => {
    expect(FeatureExtractionNode.metadataOutputTypes).toMatchObject({
      embedding: "list",
      dim: "int"
    });
  });

  it("exposes the primary text field as an inline body editor", () => {
    expect(TextClassificationNode.inlineFields).toEqual(["text"]);
    expect(TextClassificationNode.inputFields).toEqual([]);
  });

  it("exposes media inputs as handle-only body ports", () => {
    expect(ImageClassificationNode.inputFields).toEqual(["image"]);
    expect(AutomaticSpeechRecognitionNode.inputFields).toEqual(["audio"]);
  });

  it("every node exposes at least one body input field that maps to a real property", () => {
    for (const cls of TRANSFORMERS_JS_NODES as readonly NodeClass[]) {
      const inline = cls.inlineFields ?? [];
      const input = cls.inputFields ?? [];
      // Regression guard: a node with neither set renders an empty body
      // (no handles, no inline editors) — see field-classification + NodeContent.
      expect(
        inline.length + input.length,
        `${cls.nodeType} has no body input fields`
      ).toBeGreaterThan(0);

      const propertyTypes = cls.toDescriptor().propertyTypes ?? {};
      for (const name of [...inline, ...input]) {
        expect(
          propertyTypes,
          `${cls.nodeType} body field "${name}" is not a declared property`
        ).toHaveProperty(name);
      }
    }
  });
});
