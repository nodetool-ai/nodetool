import { describe, expect, it } from "vitest";
import {
  captureProductionGenerationSnapshot,
  creativeContext,
  production,
  productionGenerationResult,
  productionGenerationSnapshot,
  productionSourceContext,
  resolvedProductionGenerationSnapshot,
  type ProductionGenerationSnapshot
} from "../src/production-authoring.js";
import { renderInputs } from "../src/creative.js";
import { patchScriptInput, scriptDocument, take } from "../src/api-schemas/scripts.js";
import { patchStoryboardInput, storyboardDocument, storyboardShot } from "../src/api-schemas/storyboards.js";
import { clipVersion, patchTimelineInput, timelineDocument } from "../src/api-schemas/timeline.js";

const identity = {
  batchId: "batch", requestId: "request", candidateId: "candidate",
  variationId: "variation", variationIndex: 2,
  destinationKind: "timeline_clip", destinationId: "clip", operation: "initial_generation"
};
const speech = {
  mode: "on_camera", text: "  Exact words.\n", direction: "quiet",
  voice: { provider: "tts", model: "voice-model", voice: "voice", settings: { speed: 1 } },
  audioAssetId: "spoken-audio", audioDurationMs: 2400, selectedTakeId: "spoken-take"
};
function resolvedInput() {
  return {
    ...identity, schemaVersion: 1, ownerId: "owner", projectId: "project", documentId: "sequence",
    origin: { kind: "beat", documentId: "sequence", recordId: "beat", fingerprint: "beat-v1" },
    authoringFingerprint: "plan-v1", entityIds: ["actor"], referenceAssetIds: ["portrait"],
    resolvedReferences: [{ kind: "character", entityId: "actor", assetId: "portrait", descriptor: "Blue coat" }],
    requiredCapabilities: ["audio_driven_performance"], executionRoute: "audio_driven_performance",
    prompt: "  Deliver this line.\n", speech: structuredClone(speech),
    provider: "provider", model: "model", parameters: { seed: 2, nested: { values: [1, 2] } },
    outputFormat: "video/mp4", requestedDurationMs: 5000,
    playableWindow: { startMs: 0, durationMs: 3000 }
  };
}

describe("production provenance", () => {
  it("keeps incomplete legacy recipes readable without treating them as resolved", () => {
    expect(productionGenerationSnapshot.safeParse(identity).success).toBe(true);
    expect(resolvedProductionGenerationSnapshot.safeParse(identity).success).toBe(false);
  });

  it("captures exact inputs independently of later authoring and freezes nested data", () => {
    const input = resolvedInput();
    const snapshot = captureProductionGenerationSnapshot(input);
    const stored: ProductionGenerationSnapshot = snapshot;
    input.speech.text = "Changed";
    input.resolvedReferences[0].descriptor = "Red coat";
    input.parameters.nested.values.push(3);
    expect(snapshot.speech?.text).toBe(speech.text);
    expect(snapshot.resolvedReferences[0].descriptor).toBe("Blue coat");
    expect(snapshot.parameters.nested).toEqual({ values: [1, 2] });
    expect(Object.isFrozen(snapshot.parameters.nested)).toBe(true);
    expect(Object.isFrozen(snapshot.speech?.voice.settings)).toBe(true);
    expect(() => Object.assign(snapshot, { model: "different" })).toThrow();
    expect(productionGenerationSnapshot.parse(JSON.parse(JSON.stringify(stored)))).toEqual(snapshot);
  });

  it.each(["ownerId", "projectId", "documentId", "origin", "authoringFingerprint", "provider", "model",
    "prompt", "parameters", "requiredCapabilities", "executionRoute", "outputFormat", "requestedDurationMs", "playableWindow"])(
    "rejects a submission without %s", (key) => {
      expect(resolvedProductionGenerationSnapshot.safeParse({ ...resolvedInput(), [key]: undefined }).success).toBe(false);
    }
  );

  it.each([
    { schemaVersion: 2 }, { variationIndex: 4 }, { requestedDurationMs: 2.5 },
    { referenceAssetIds: ["different-asset"] }, { entityIds: [] },
    { requiredCapabilities: [] }, { playableWindow: { startMs: 4000, durationMs: 3000 } },
    { speech: { ...speech, audioAssetId: undefined } },
    { speech: { ...speech, audioDurationMs: 3001 } },
    { speech: { ...speech, scriptLineId: "line" } },
    { parameters: { nested: { apiKey: "do-not-store" } } },
    { parameters: { inputs: ["https://example.com/audio?signature=temporary"] } },
    { parameters: { callback: () => "not-json" } },
    { providerTaskId: "execution-metadata" }, { measuredDurationMs: 5100 }
  ])("rejects invalid or unresolved submission fields: %j", (override) => {
    expect(resolvedProductionGenerationSnapshot.safeParse({ ...resolvedInput(), ...override }).success).toBe(false);
  });

  it("validates native editing source identity and millisecond windows", () => {
    const source = {
      sequenceId: "sequence", clipId: "clip", sourceAssetId: "source", sourceTakeId: "parent",
      sourceStartMs: 40000, sourceEndMs: 43000, timelineStartMs: 8000,
      timelineDurationMs: 3000, speedMultiplier: 1
    };
    const edit = { ...resolvedInput(), operation: "edit_video", parentTakeId: "parent", sourceContext: source };
    expect(resolvedProductionGenerationSnapshot.safeParse(edit).success).toBe(true);
    expect(resolvedProductionGenerationSnapshot.safeParse({ ...edit, parentTakeId: undefined }).success).toBe(false);
    expect(resolvedProductionGenerationSnapshot.safeParse({ ...edit, destinationId: "other" }).success).toBe(false);
    expect(productionSourceContext.safeParse({ ...source, sourceEndMs: 39000 }).success).toBe(false);
    expect(productionSourceContext.safeParse({ ...source, speedMultiplier: -1 }).success).toBe(false);
  });

  it("keeps measured output separate and rejects sources too short for their playable window", () => {
    const result = { assetId: "result", measuredDurationMs: 5000, playableWindow: { startMs: 1000, durationMs: 3000 } };
    expect(productionGenerationResult.safeParse(result).success).toBe(true);
    expect(productionGenerationResult.safeParse({ ...result, measuredDurationMs: 3999 }).success).toBe(false);
    expect(productionGenerationResult.safeParse({ ...result, measuredDurationMs: Infinity }).success).toBe(false);
  });
});

describe("shared production authoring", () => {
  it("preserves optional fields, defaults to one take, and keeps linked speech under Script ownership", () => {
    expect(production.parse({})).toEqual({ schema_version: 1, speech_mode: "none", requested_take_count: 1 });
    expect(production.safeParse({ speech_mode: "on_camera", speech_binding: { script_id: "script", script_line_id: "line" } }).success).toBe(true);
    expect(production.safeParse({ speech_mode: "off_camera", speech_binding: { text: "Local words", voice: speech.voice } }).success).toBe(true);
    expect(production.safeParse({ speech_mode: "on_camera", speech_binding: { script_line_id: "line", text: "Duplicate words" } }).success).toBe(false);
    expect(production.safeParse({ speech_mode: "on_camera", speech_binding: { script_line_id: "line", voice: speech.voice } }).success).toBe(false);
  });

  it.each([0, 4, -1, 1.5, Infinity])("rejects invalid take count %s", (requested_take_count) => {
    expect(production.safeParse({ requested_take_count }).success).toBe(false);
  });

  it.each([1, 2, 3])("accepts take count %s", (requested_take_count) => {
    expect(production.parse({ requested_take_count }).requested_take_count).toBe(requested_take_count);
  });

  it("keeps editorial purpose independent of visual treatment", () => {
    for (const visual_treatment of ["actor_to_camera", "product_close_up", "lifestyle_b_roll", "generated_scene"]) {
      expect(production.safeParse({ editorial_purpose: "hook", visual_treatment }).success).toBe(true);
    }
    expect(production.safeParse({ schema_version: 2 }).success).toBe(false);
    expect(creativeContext.safeParse({ schema_version: 2 }).success).toBe(false);
    expect(production.safeParse({ speech_mode: "unknown" }).success).toBe(false);
    expect(production.safeParse({ duration_ms: 1.5 }).success).toBe(false);
  });
});

describe("production persistence boundaries", () => {
  const context = creativeContext.parse({
    product_description: "Camera", audience: "Creators", objective: "Show detail", tone: "calm",
    approved_claims: ["Metal body"], prohibited_claims: ["Unbreakable"],
    reference_bindings: [{ kind: "product", asset_id: "product", required: true, revision: "v1" }],
    origin: { document_kind: "script", document_id: "script", fingerprint: "context-v1" }
  });
  const requirement = production.parse({ visual_treatment: "product_close_up", requested_take_count: 3 });

  it("round-trips creative context and production through timeline, storyboard, and Script PATCH schemas", () => {
    const shot = { type: "shot", id: "shot", index: 0, action: "Camera detail", status: "planned", production: requirement };
    const board = storyboardDocument.parse({ screenplay: null, shots: [shot], brief: "Ad", style: "", aspectRatio: "9:16",
      directorModel: null, imageModel: null, videoModel: null, creative_context: context });
    const timeline = timelineDocument.parse({ tracks: [], clips: [], markers: [], setup: { stage: "review", brief: "Ad",
      creative_context: context, beats: [{ id: "beat", prompt: "Detail", duration_ms: 3000, production: requirement }] } });
    const script = scriptDocument.parse({ creative_context: context });
    expect(patchStoryboardInput.parse(JSON.parse(JSON.stringify({ document: board }))).document).toEqual(board);
    expect(patchTimelineInput.parse(JSON.parse(JSON.stringify({ document: timeline }))).document).toEqual(timeline);
    expect(patchScriptInput.parse(JSON.parse(JSON.stringify({ document: script }))).document).toEqual(script);
    expect("creative_context" in scriptDocument.parse({})).toBe(false);
    expect(storyboardShot.parse({ ...shot, production: undefined }).production).toBeUndefined();
  });

  it("preserves snapshots on timeline, Script, and storyboard takes, including unselected versions", () => {
    const snapshot = captureProductionGenerationSnapshot(resolvedInput());
    const render = renderInputs.parse({ kind: "clip", prompt_hash: "hash", model: "model", aspect_ratio: "9:16",
      style_entity_id: null, recorded_at: "now", production_snapshot: snapshot });
    const version = clipVersion.parse({ id: "take", createdAt: "now", jobId: "job", assetId: "asset",
      workflowUpdatedAt: "now", dependencyHash: "hash", paramOverridesSnapshot: {}, status: "success", productionSnapshot: snapshot });
    const audio = take.parse({ id: "take", assetId: "asset", durationMs: 3000, textSnapshot: "words",
      voiceSnapshot: null, createdAt: "now", productionSnapshot: snapshot });
    const media = { type: "video", asset_id: "asset", render_inputs: render };
    const shot = { type: "shot", id: "shot", index: 0, action: "Detail", status: "rendered", clip: media, clip_versions: [media] };
    expect(clipVersion.parse(JSON.parse(JSON.stringify(version))).productionSnapshot).toEqual(snapshot);
    expect(take.parse(JSON.parse(JSON.stringify(audio))).productionSnapshot).toEqual(snapshot);
    const saved = storyboardShot.parse(JSON.parse(JSON.stringify(shot)));
    expect(saved.clip?.render_inputs?.production_snapshot).toEqual(snapshot);
    expect(saved.clip_versions?.[0].render_inputs?.production_snapshot).toEqual(snapshot);
    expect(storyboardShot.safeParse({ ...shot, clip_versions: [{ ...media, render_inputs: { ...render, production_snapshot: { ...snapshot, variationIndex: 4 } } }] }).success).toBe(false);
  });
});
