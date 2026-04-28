import { describe, expect, it } from "vitest";
import { NodeRegistry } from "@nodetool/node-sdk";
import { registerElevenLabsNodes } from "../src/index.js";
import { RealtimeSpeechToTextNode } from "../src/nodes/realtime-stt.js";
import { RealtimeTextToSpeechNode } from "../src/nodes/realtime-tts.js";

describe("registerElevenLabsNodes", () => {
  it("registers the ElevenLabs node pack", () => {
    const registry = new NodeRegistry();

    registerElevenLabsNodes(registry);

    expect(registry.has("elevenlabs.TextToSpeech")).toBe(true);
    expect(registry.has("elevenlabs.SpeechToText")).toBe(true);
    expect(registry.has("elevenlabs.RealtimeTextToSpeech")).toBe(true);
    expect(registry.has("elevenlabs.RealtimeSpeechToText")).toBe(true);
  });

  it("declares chunk outputs for realtime nodes", () => {
    expect(RealtimeTextToSpeechNode.metadataOutputTypes).toEqual({
      chunk: "chunk"
    });
    expect(RealtimeSpeechToTextNode.metadataOutputTypes).toEqual({
      chunk: "chunk"
    });
    expect(RealtimeSpeechToTextNode.toDescriptor().propertyTypes?.chunk).toBe(
      "chunk"
    );
    expect(
      RealtimeSpeechToTextNode.toDescriptor().propertyTypes?.model_id
    ).toBe("str");
  });
});
