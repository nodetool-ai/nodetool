import { describe, expect, it } from "vitest";
import {
  createLipSyncCandidateRequest,
  lipSyncCandidateProvenance
} from "../src/lipSyncRequest.js";

const model = {
  id: "lip-sync-model",
  provider: "provider",
  supportedTasks: ["lip_sync"]
};

const acceptedReplacementAudio = {
  assetId: "accepted-replacement-audio",
  status: "accepted" as const,
  provenance: {
    requestId: "replace-request",
    operation: "recorded_voice_replacement"
  }
};

describe("lip-sync request", () => {
  it("consumes accepted replacement audio and requests a video candidate", () => {
    const result = createLipSyncCandidateRequest({
      requestId: "lip-sync-request",
      sequenceId: "sequence",
      clipId: "video-clip",
      sourceVideoAssetId: "source-video",
      replacementAudio: acceptedReplacementAudio,
      model
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request).toEqual({
      operation: "lip_sync",
      modelTask: "lip_sync",
      requestId: "lip-sync-request",
      sequenceId: "sequence",
      clipId: "video-clip",
      sourceVideoAssetId: "source-video",
      replacementAudio: acceptedReplacementAudio,
      provider: "provider",
      model: "lip-sync-model",
      result: { mediaType: "video", disposition: "candidate" }
    });
    expect(Object.isFrozen(result.request)).toBe(true);
    expect(Object.isFrozen(result.request.replacementAudio)).toBe(true);
  });

  it.each([
    {
      name: "a pending candidate",
      replacementAudio: {
        ...acceptedReplacementAudio,
        status: "candidate" as const
      }
    },
    {
      name: "an asset without provenance",
      replacementAudio: {
        assetId: "replacement-audio",
        status: "accepted" as const
      }
    }
  ])("rejects $name", ({ replacementAudio }) => {
    expect(
      createLipSyncCandidateRequest({
        requestId: "lip-sync-request",
        sequenceId: "sequence",
        clipId: "video-clip",
        sourceVideoAssetId: "source-video",
        replacementAudio,
        model
      })
    ).toMatchObject({
      ok: false,
      code: "replacement_audio_not_accepted"
    });
  });

  it.each(["audio_to_audio", "text_to_music", "change_line_delivery"])(
    "rejects accepted audio with unsupported %s provenance",
    (operation) => {
      expect(
        createLipSyncCandidateRequest({
          requestId: "lip-sync-request",
          sequenceId: "sequence",
          clipId: "video-clip",
          sourceVideoAssetId: "source-video",
          replacementAudio: {
            ...acceptedReplacementAudio,
            provenance: {
              requestId: "other-request",
              operation
            }
          },
          model
        })
      ).toMatchObject({
        ok: false,
        code: "replacement_audio_not_accepted"
      });
    }
  );

  it("rejects an audio-to-audio model so the selected operation stays clear", () => {
    expect(
      createLipSyncCandidateRequest({
        requestId: "lip-sync-request",
        sequenceId: "sequence",
        clipId: "video-clip",
        sourceVideoAssetId: "source-video",
        replacementAudio: acceptedReplacementAudio,
        model: { ...model, supportedTasks: ["audio_to_audio"] }
      })
    ).toMatchObject({ ok: false, code: "unsupported_model_task" });
  });

  it("records lip-sync provenance as candidate-only", () => {
    const result = createLipSyncCandidateRequest({
      requestId: "lip-sync-request",
      sequenceId: "sequence",
      clipId: "video-clip",
      sourceVideoAssetId: "source-video",
      replacementAudio: acceptedReplacementAudio,
      model
    });
    if (!result.ok) throw new Error(result.error);

    expect(lipSyncCandidateProvenance(result.request)).toEqual({
      requestId: "lip-sync-request",
      operation: "lip_sync",
      resultDisposition: "candidate",
      request: result.request
    });
  });
});
