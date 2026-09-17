import { describe, expect, it } from "vitest";
import {
  captureProductionGenerationSnapshot,
  productionCandidate,
  productionCandidateResult,
  productionGenerationSnapshot,
  productionVariationIdentity,
  landProductionCandidateInactive
} from "../src/production-authoring.js";

function submitted() {
  return {
    ...productionVariationIdentity({
      batchId: "batch-1",
      destinationKind: "timeline_clip",
      destinationId: "clip-1",
      variationIndex: 1
    }),
    operation: "initial_generation",
    ownerId: "owner-1",
    projectId: "project-1",
    documentId: "video-1",
    targetVersion: 4,
    originatingBeatId: "beat-1",
    authoringFingerprint: "reviewed-inputs",
    prompt: "The character demonstrates the camera.",
    entityIds: ["actor-1"],
    referenceAssetIds: ["portrait-1"],
    references: [
      {
        kind: "character",
        entityId: "actor-1",
        assetId: "portrait-1",
        descriptor: "Short red hair",
        revision: "r2"
      }
    ],
    requiredCapabilities: ["audio_to_video"],
    executionRoute: "audio_driven_performance",
    provider: "fake",
    model: "performance",
    parameters: { seed: 2, controls: { intensity: 0.6 } },
    outputFormat: "mp4",
    requestedDurationMs: 3000,
    playableWindow: { startMs: 100, endMs: 3100 },
    speech: {
      text: "Try this camera.",
      direction: "Calm",
      scriptId: "script-1",
      scriptLineId: "line-1",
      speakerId: "speaker-1",
      takeId: "take-1",
      audioAssetId: "speech-1",
      durationMs: 2400,
      voice: {
        provider: "fake",
        model: "tts",
        voice: "actor",
        settings: { speed: 1 }
      }
    }
  };
}

const result = {
  sourceDurationMs: 4000,
  playableWindow: { startMs: 100, endMs: 3100 },
  audio: {
    assetId: "speech-1",
    durationMs: 2400,
    playback: "separate",
    words: [
      { word: "Try", startMs: 0, endMs: 400 },
      { word: "this", startMs: 500, endMs: 800 },
      {
        word: "camera",
        startMs: 900,
        endMs: 2400,
        confidence: 0.99,
        kind: "word"
      }
    ]
  }
};

describe("production snapshots and measured results", () => {
  it("captures detached frozen inputs while completion records measured outputs separately", () => {
    const input = submitted();
    const snapshot = captureProductionGenerationSnapshot(input);
    const before = JSON.stringify(snapshot);
    input.parameters.controls.intensity = 1;
    input.references[0].descriptor = "Changed entity";
    input.speech.voice.settings.speed = 2;
    const candidate = productionCandidate.parse({
      ...snapshot,
      snapshot,
      status: "generating",
      result
    });
    const landed = landProductionCandidateInactive(candidate, "video-asset");
    expect(JSON.stringify(snapshot)).toBe(before);
    expect(landed.snapshot).toEqual(snapshot);
    expect(landed.result).toEqual(result);
    expect(landed).toMatchObject({ active: false, accepted: false });
    expect(snapshot).not.toHaveProperty("sourceDurationMs");
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.parameters?.controls)).toBe(true);
    expect(Object.isFrozen(snapshot.references?.[0])).toBe(true);
    expect(Object.isFrozen(snapshot.speech?.voice?.settings)).toBe(true);
  });

  it("validates owner and project identifiers without pretending to authorize them", () => {
    for (const ownerId of ["owner-1", "owner-2"]) {
      expect(
        captureProductionGenerationSnapshot({ ...submitted(), ownerId }).ownerId
      ).toBe(ownerId);
    }
    for (const key of [
      "ownerId",
      "projectId",
      "documentId",
      "provider",
      "model",
      "executionRoute",
      "authoringFingerprint"
    ]) {
      expect(
        () =>
          captureProductionGenerationSnapshot({ ...submitted(), [key]: "" }),
        key
      ).toThrow();
    }
  });

  it("keeps legacy partial provenance readable but unavailable for dispatch replay", () => {
    const legacy = {
      ...productionVariationIdentity({
        batchId: "old",
        destinationKind: "storyboard_shot",
        destinationId: "shot-1",
        variationIndex: 1
      }),
      operation: "initial_generation"
    };
    expect(productionGenerationSnapshot.safeParse(legacy).success).toBe(true);
    expect(() => captureProductionGenerationSnapshot(legacy)).toThrow();
  });

  it.each([
    { requestedDurationMs: -1 },
    { requestedDurationMs: 2.5 },
    { playableWindow: { startMs: 200, endMs: 100 } },
    { playableWindow: { startMs: 100, endMs: 3000 } },
    { speech: { ...submitted().speech, durationMs: 3001 } }
  ])("rejects invalid requested timing %#", (change) => {
    expect(
      productionGenerationSnapshot.safeParse({ ...submitted(), ...change })
        .success
    ).toBe(false);
  });

  it("requires resolved audio before a performance dispatch", () => {
    const { audioAssetId: _audio, ...speech } = submitted().speech;
    expect(() =>
      captureProductionGenerationSnapshot({ ...submitted(), speech })
    ).toThrow("resolved speech audio");
  });

  it("requires an edit parent and exact native source window", () => {
    const input = {
      ...submitted(),
      operation: "edit_video",
      executionRoute: "video_to_video"
    };
    expect(() => captureProductionGenerationSnapshot(input)).toThrow(
      "parent take"
    );
    const sourceContext = {
      sequenceId: "video-1",
      clipId: "clip-1",
      sourceAssetId: "source-asset",
      sourceTakeId: "parent",
      sourceStartMs: 1000,
      sourceEndMs: 4000,
      timelineStartMs: 8000,
      timelineDurationMs: 3000,
      speedMultiplier: 1
    };
    expect(
      captureProductionGenerationSnapshot({
        ...input,
        parentTakeId: "parent",
        sourceContext
      }).sourceContext
    ).toEqual(sourceContext);
    expect(() =>
      captureProductionGenerationSnapshot({
        ...input,
        parentTakeId: "parent",
        sourceContext: { ...sourceContext, sourceEndMs: 500 }
      })
    ).toThrow();
  });

  it("preserves handles and exactly one authoritative playback source with word timings", () => {
    for (const playback of ["embedded", "separate"]) {
      expect(
        productionCandidateResult.parse({
          ...result,
          audio: { ...result.audio, playback }
        })
      ).toEqual({
        ...result,
        audio: { ...result.audio, playback }
      });
    }
  });

  it.each([
    { sourceDurationMs: 3000 },
    { audio: { ...result.audio, playback: "both" } },
    { audio: { ...result.audio, durationMs: 3001 } },
    {
      audio: {
        ...result.audio,
        words: [{ word: "Bad", startMs: 0, endMs: 2500 }]
      }
    },
    {
      audio: {
        ...result.audio,
        words: [{ word: "Bad", startMs: 100, endMs: 0 }]
      }
    },
    {
      audio: {
        ...result.audio,
        words: [{ word: "Bad", startMs: -1, endMs: 100 }]
      }
    }
  ])("rejects invalid measured media or speech timing %#", (change) => {
    expect(
      productionCandidateResult.safeParse({ ...result, ...change }).success
    ).toBe(false);
  });

  it("rejects a short result and speech that differs from the submitted audio", () => {
    const snapshot = captureProductionGenerationSnapshot(submitted());
    for (const measured of [
      { ...result, playableWindow: { startMs: 0, endMs: 2400 } },
      { ...result, playableWindow: { startMs: 0, endMs: 3000 } },
      { ...result, audio: { ...result.audio, durationMs: 2500 } },
      { ...result, audio: { ...result.audio, assetId: "other-speech" } }
    ]) {
      expect(
        productionCandidate.safeParse({
          ...snapshot,
          snapshot,
          status: "ready",
          assetId: "video",
          result: measured
        }).success
      ).toBe(false);
    }
  });
});
