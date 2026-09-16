import { describe, expect, it } from "vitest";
import {
  creativeContext,
  productionRequirement,
  productionGenerationSnapshot,
  productionVariationIdentity,
  productionCandidateResult
} from "../src/production-authoring.js";
import {
  appendClipVersionInput,
  patchTimelineInput,
  timelineSequenceResponse,
  timelineDocument,
  clipVersion
} from "../src/api-schemas/timeline.js";
import {
  createStoryboardInput,
  patchStoryboardInput,
  storyboardResponse,
  storyboardDocument
} from "../src/api-schemas/storyboards.js";
import {
  createScriptInput,
  patchScriptInput,
  scriptResponse,
  scriptDocument,
  take
} from "../src/api-schemas/scripts.js";

const context = creativeContext.parse({
  product_name: "Camera",
  product_description: "A compact camera",
  audience: "Creators",
  objective: "Demonstration",
  tone: "Calm",
  approved_claims: ["Compact"],
  prohibited_claims: ["Best in class"],
  reference_bindings: [
    {
      kind: "product",
      asset_id: "product-photo",
      entity_id: "camera",
      label: "Approved photo"
    }
  ],
  origin: {
    document_id: "script-1",
    document_kind: "script",
    authoring_fingerprint: "brief-v2"
  }
});
const production = productionRequirement.parse({
  editorial_purpose: "demonstration",
  visual_treatment: "product_close_up",
  speech_mode: "off_camera",
  speech_binding: {
    script_line_id: "line-1",
    speaker_id: "speaker-1",
    direction: "Calm"
  },
  reference_bindings: context.reference_bindings,
  requested_take_count: 3,
  duration_ms: 3000,
  speech_duration_ms: 2500,
  local_direction: "Turn the camera"
});
const identity = productionVariationIdentity({
  batchId: "batch-1",
  destinationKind: "storyboard_shot",
  destinationId: "shot-1",
  variationIndex: 2
});
const snapshot = productionGenerationSnapshot.parse({
  ...identity,
  operation: "initial_generation",
  documentId: "board-1",
  ownerId: "owner-1",
  projectId: "project-1",
  authoringFingerprint: "plan-v1",
  requestedDurationMs: 3000,
  prompt: "Turn the camera",
  referenceAssetIds: ["product-photo"],
  speech: {
    text: "Try the camera.",
    scriptId: "script-1",
    scriptLineId: "line-1",
    speakerId: "speaker-1",
    takeId: "audio-take",
    audioAssetId: "speech-1"
  }
});
const result = productionCandidateResult.parse({
  sourceDurationMs: 4000,
  playableWindow: { startMs: 500, endMs: 3500 },
  audio: {
    assetId: "speech-1",
    durationMs: 2500,
    playback: "separate",
    words: [{ word: "Try", startMs: 0, endMs: 500 }]
  }
});
const metadata = {
  candidateId: identity.candidateId,
  batchId: identity.batchId,
  requestId: identity.requestId,
  variationId: identity.variationId,
  variationIndex: identity.variationIndex,
  productionSnapshot: snapshot,
  productionResult: result
};
const version = {
  id: "take-1",
  createdAt: "now",
  jobId: "job-1",
  assetId: "video-asset",
  workflowUpdatedAt: "",
  dependencyHash: "",
  paramOverridesSnapshot: {},
  status: "success",
  ...metadata
};
const shot = {
  type: "shot",
  id: "shot-1",
  index: 0,
  action: "Turn the camera",
  status: "rendered",
  production,
  script_line_ids: ["line-1"],
  script_text_snapshot: "Try the camera.",
  duration_source: "audio",
  clip: { type: "video", asset_id: "video-asset", ...metadata },
  clip_versions: [{ type: "video", asset_id: "video-asset", ...metadata }]
};
const board = {
  screenplay: null,
  shots: [shot],
  brief: "A camera demonstration",
  style: "Natural",
  aspectRatio: "9:16",
  directorModel: null,
  imageModel: null,
  videoModel: null,
  creative_context: context
};

describe("production persistence and handoff schemas", () => {
  it("round-trips Video setup, beat requirements, and take provenance through PATCH and response", () => {
    const document = {
      tracks: [],
      markers: [],
      clips: [
        {
          id: "clip-1",
          trackId: "track-1",
          name: "Demonstration",
          startMs: 1000,
          durationMs: 3000,
          mediaType: "video",
          sourceType: "generated",
          status: "generated",
          locked: false,
          currentAssetId: "video-asset",
          versions: [version]
        }
      ],
      setup: {
        stage: "done",
        brief: "Camera demonstration",
        creative_context: context,
        beats: [
          {
            id: "beat-1",
            prompt: "Turn the camera",
            duration_ms: 3000,
            clip_id: "clip-1",
            production
          }
        ]
      }
    };
    const saved = patchTimelineInput.parse(
      JSON.parse(JSON.stringify({ document }))
    ).document;
    const read = timelineSequenceResponse.parse({
      ...saved,
      id: "video-1",
      projectId: "project-1",
      name: "Demo",
      fps: 30,
      width: 1080,
      height: 1920,
      durationMs: 4000,
      createdAt: "now",
      updatedAt: "now"
    });
    expect(read.setup).toEqual(document.setup);
    expect(read.clips[0].versions[0]).toMatchObject(metadata);
    expect(appendClipVersionInput.parse(version)).toMatchObject(metadata);
  });

  it("round-trips storyboard context, shot requirements, and every take's provenance", () => {
    const created = createStoryboardInput.parse({ document: board });
    const saved = patchStoryboardInput.parse(
      JSON.parse(JSON.stringify({ document: created.document }))
    );
    const read = storyboardResponse.parse({
      id: "board-1",
      projectId: "project-1",
      name: "Demo",
      document: saved.document,
      createdAt: "now",
      updatedAt: "now"
    });
    expect(read.document.creative_context).toEqual(context);
    expect(read.document.shots[0]).toEqual(shot);
    expect(
      clipVersion.parse({ ...version, ...read.document.shots[0].clip })
    ).toMatchObject(metadata);
  });

  it("round-trips Script setup and document context with source line, speaker, entity, and take identities", () => {
    const document = {
      creative_context: context,
      setup: { stage: "done", brief: "Camera demo", creative_context: context },
      cast: [
        {
          id: "speaker-1",
          name: "Actor",
          entityId: "actor-1",
          voice: { provider: "fake", model: "tts", voice: "voice-1" }
        }
      ],
      sections: [
        {
          id: "section-1",
          lines: [
            {
              id: "line-1",
              speakerId: "speaker-1",
              text: "Try the camera.",
              currentTakeId: "audio-take",
              takes: [
                {
                  id: "audio-take",
                  assetId: "speech-1",
                  durationMs: 2500,
                  words: result.audio?.words,
                  textSnapshot: "Try the camera.",
                  voiceSnapshot: null,
                  createdAt: "now",
                  ...metadata
                }
              ]
            }
          ]
        }
      ]
    };
    const created = createScriptInput.parse({ document });
    const saved = patchScriptInput.parse(
      JSON.parse(JSON.stringify({ document: created.document }))
    );
    const read = scriptResponse.parse({
      id: "script-1",
      projectId: "project-1",
      name: "Demo",
      document: saved.document,
      createdAt: "now",
      updatedAt: "now"
    });
    expect(read.document).toEqual(document);
  });

  it("validates nested optional authoring fields instead of passing malformed values through", () => {
    expect(
      scriptDocument.safeParse({
        setup: { stage: "done", creative_context: { schema_version: 99 } }
      }).success
    ).toBe(false);
    expect(
      storyboardDocument.safeParse({
        ...board,
        shots: [{ ...shot, production: { requested_take_count: 4 } }]
      }).success
    ).toBe(false);
    expect(
      storyboardDocument.safeParse({
        ...board,
        shots: [
          {
            ...shot,
            clip_versions: [
              {
                type: "video",
                productionResult: { ...result, sourceDurationMs: 2000 }
              }
            ]
          }
        ]
      }).success
    ).toBe(false);
  });

  it("keeps legacy documents and takes valid without inventing setup or regeneration provenance", () => {
    const { creative_context: _context, ...legacyBoard } = board;
    expect(
      storyboardDocument.parse({ ...legacyBoard, shots: [] }).creative_context
    ).toBeUndefined();
    expect(scriptDocument.parse({}).setup).toBeUndefined();
    expect(
      timelineDocument.parse({ tracks: [], clips: [], markers: [] }).setup
    ).toBeUndefined();
    const legacyTake = take.parse({
      id: "legacy",
      assetId: "audio",
      durationMs: 1000,
      textSnapshot: "Hello",
      voiceSnapshot: null,
      createdAt: "then"
    });
    expect(legacyTake.productionSnapshot).toBeUndefined();
    expect(legacyTake.assetId).toBe("audio");
  });

  it("strips temporary preview state from document schemas", () => {
    const preview = {
      selections: { "shot-1": identity.candidateId },
      unresolvedDestinationIds: []
    };
    for (const document of [
      storyboardDocument.parse({ ...board, preview }),
      scriptDocument.parse({ preview }),
      timelineDocument.parse({ tracks: [], clips: [], markers: [], preview })
    ]) {
      expect(document).not.toHaveProperty("preview");
    }
  });
});
