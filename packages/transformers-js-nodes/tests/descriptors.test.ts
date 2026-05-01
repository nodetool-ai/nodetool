import { describe, expect, it } from "vitest";
import { TextClassificationNode } from "../src/nodes/text-classification.js";
import { ImageClassificationNode } from "../src/nodes/image-classification.js";
import { AutomaticSpeechRecognitionNode } from "../src/nodes/automatic-speech-recognition.js";
import { TextToSpeechNode } from "../src/nodes/text-to-speech.js";
import { FeatureExtractionNode } from "../src/nodes/feature-extraction.js";

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
});
