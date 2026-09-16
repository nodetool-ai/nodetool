import { describe, expect, it } from "vitest";
import {
  createRecordedVoiceReplacementRequest,
  recordedVoiceReplacementProvenance
} from "../src/recordedVoiceReplacement.js";

const model = {
  id: "voice-converter",
  provider: "provider",
  supportedTasks: ["audio_to_audio"],
  supportedOperations: ["recorded_voice_replacement"]
};

describe("recorded voice replacement", () => {
  it.each([
    {
      source: { kind: "clean_speech" as const, assetId: "clean-speech" },
      target: { kind: "voice" as const, voiceId: "target-voice" }
    },
    {
      source: {
        kind: "isolated_speech" as const,
        assetId: "isolated-speech",
        isolationRequestId: "isolation-request"
      },
      target: { kind: "voice" as const, voiceId: "target-voice" }
    }
  ])("builds an immutable audio candidate request for $source.kind", (variant) => {
    const result = createRecordedVoiceReplacementRequest({
      requestId: "replace-request",
      sequenceId: "sequence",
      clipId: "dialogue-clip",
      model,
      ...variant
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request).toMatchObject({
      operation: "recorded_voice_replacement",
      modelTask: "audio_to_audio",
      source: variant.source,
      target: variant.target,
      result: { mediaType: "audio", disposition: "candidate" }
    });
    expect(Object.isFrozen(result.request)).toBe(true);
    expect(Object.isFrozen(result.request.source)).toBe(true);
    expect(Object.isFrozen(result.request.target)).toBe(true);
  });

  it("requires an explicit clean or isolated speech source", () => {
    expect(
      createRecordedVoiceReplacementRequest({
        requestId: "replace-request",
        sequenceId: "sequence",
        clipId: "dialogue-clip",
        source: null,
        target: { kind: "voice", voiceId: "target-voice" },
        model
      })
    ).toMatchObject({ ok: false, code: "missing_speech_source" });
  });

  it("requires a target voice", () => {
    expect(
      createRecordedVoiceReplacementRequest({
        requestId: "replace-request",
        sequenceId: "sequence",
        clipId: "dialogue-clip",
        source: { kind: "clean_speech", assetId: "clean-speech" },
        target: null,
        model
      })
    ).toMatchObject({ ok: false, code: "missing_target" });
  });

  it("rejects reference audio until a replacement adapter supports it", () => {
    expect(
      createRecordedVoiceReplacementRequest({
        requestId: "replace-request",
        sequenceId: "sequence",
        clipId: "dialogue-clip",
        source: { kind: "clean_speech", assetId: "clean-speech" },
        target: { kind: "reference_audio", assetId: "voice-reference" },
        model
      })
    ).toMatchObject({ ok: false, code: "unsupported_target" });
  });

  it("rejects a model that would run a different operation", () => {
    expect(
      createRecordedVoiceReplacementRequest({
        requestId: "replace-request",
        sequenceId: "sequence",
        clipId: "dialogue-clip",
        source: { kind: "clean_speech", assetId: "clean-speech" },
        target: { kind: "voice", voiceId: "target-voice" },
        model: { ...model, supportedTasks: ["lip_sync"] }
      })
    ).toMatchObject({ ok: false, code: "unsupported_model_task" });
  });

  it.each([
    {
      name: "a generic audio transform",
      model: {
        id: "audio-transform",
        provider: "provider",
        supportedTasks: ["audio_to_audio"]
      }
    },
    {
      name: "a music transform",
      model: {
        id: "music-transform",
        provider: "provider",
        supportedTasks: ["audio_to_audio", "text_to_music"],
        supportedOperations: ["music_remix"]
      }
    }
  ])("rejects $name without replacement-operation support", ({ model }) => {
    expect(
      createRecordedVoiceReplacementRequest({
        requestId: "replace-request",
        sequenceId: "sequence",
        clipId: "dialogue-clip",
        source: { kind: "clean_speech", assetId: "clean-speech" },
        target: { kind: "voice", voiceId: "target-voice" },
        model
      })
    ).toMatchObject({ ok: false, code: "unsupported_model_operation" });
  });

  it("records the operation identity without implying acceptance", () => {
    const result = createRecordedVoiceReplacementRequest({
      requestId: "replace-request",
      sequenceId: "sequence",
      clipId: "dialogue-clip",
      source: { kind: "clean_speech", assetId: "clean-speech" },
      target: { kind: "voice", voiceId: "target-voice" },
      model
    });
    if (!result.ok) throw new Error(result.error);

    expect(recordedVoiceReplacementProvenance(result.request)).toEqual({
      requestId: "replace-request",
      operation: "recorded_voice_replacement",
      resultDisposition: "candidate",
      request: result.request
    });
  });
});
