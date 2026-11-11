import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { timelineSequenceResponse } from '../../../../../packages/protocol/src/api-schemas/timeline';
import { buildDirectorPrompt, buildScreenplaySchema, DIRECTOR_SYSTEM_PROMPT, productionRequirement, productionGenerationSnapshot, productionVariationIdentitySchema } from '@nodetool-ai/protocol';
import { compileProductionCandidates, type CompileProductionCandidatesInput } from '../../../../../packages/timeline/src/production';
import { deterministicFingerprint } from '../../../../../web/src/hooks/storyboard/productionContext';
import { relabelWord, rippleDeleteRange, removeFillers } from '../../../../../web/src/stores/timeline/transcriptOps';
import type { TimelineClip, TimelineTrack } from '../../../../../packages/timeline/src/types';
const binary = process.env.NT_ASSIST_BINARY;
function native(operation: string, clips: TimelineClip[], payload = {}): { clips: TimelineClip[]; durationMs: number } {
  if (!binary) throw new Error('NT_ASSIST_BINARY is required');
  const tracks: TimelineTrack[] = [...new Set(clips.map(clip => clip.trackId))].map((id, index) => ({ id, index, name: id, type: 'audio', visible: true, locked: false }));
  const output = JSON.parse(execFileSync(binary, ['--assist-op'], { input: JSON.stringify({ operation, document: { id: 'sequence', name: 'Transcript', fps: 30, width: 1920, height: 1080, tracks, clips }, payload }), encoding: 'utf8', env: { ...process.env, QT_QPA_PLATFORM: 'offscreen' } }));
  return { clips: output.clips, durationMs: output.durationMs };
}
function normalize(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (key, item) => key === 'id' || key === 'linkId' ? 'identity' : item));
}
const voice: TimelineClip = { name: 'Voice', status: 'generated', locked: false, versions: [], id: 'voice', trackId: 'audio', mediaType: 'audio', sourceType: 'imported', startMs: 0, durationMs: 1000, inPointMs: 0, outPointMs: 1000, caption: { words: [{ word: 'um', startMs: 100, endMs: 200 }, { word: 'hello', startMs: 200, endMs: 700 }] } };
it('corrects canonical caption words as web relabelWord does', () => {
  expect(native('correctTranscript', [voice], { clipId: 'voice', wordIndex: 1, text: 'world' }).clips).toEqual(relabelWord([voice], 'voice', 1, 'world'));
});
it('ripple cuts every track and retains remapped overlapping clips as the web does', () => {
  const clips = [voice, { ...voice, id: 'broll', trackId: 'video', startMs: 1200, caption: undefined }];
  expect(normalize(native('deleteTranscriptRange', clips, { startMs: 100, endMs: 200 }))).toEqual(normalize(rippleDeleteRange(clips, 100, 200)));
});
it('removes fillers as the web does including duplicate overlapping captions', () => {
  const clips = [voice, { ...voice, id: 'duplicate', trackId: 'other' }];
  expect(normalize(native('removeFillers', clips))).toEqual(normalize(removeFillers(clips)));
});

function planningOracle(operation: string, document: unknown, payload: unknown): unknown {
  if (!binary) throw new Error('NT_ASSIST_BINARY is required');
  const result: unknown = JSON.parse(execFileSync(binary, ['--assist-op'], { input: JSON.stringify({ operation, document, payload }), encoding: 'utf8' }));
  return result;
}
it('Director request uses the canonical screenplay system, prompt and schema', () => {
  const document = { id: 'sequence', setup: { stage: 'idea', brief: 'A harbor film', format: 'ad-15' }, clips: [] };
  expect(planningOracle('directorRequest', document, {})).toEqual({ provider: 'nodetool', model: 'nodetool/director', system: DIRECTOR_SYSTEM_PROMPT, prompt: buildDirectorPrompt('A harbor film', '', 5, '16:9', ''), max_tokens: 8192, schema: buildScreenplaySchema(5), schema_name: 'screenplay', schema_description: 'Submit the finished screenplay with exactly the requested number of shots.' });
});
it('prepared beat cut and persisted request metadata round-trip through the canonical response schema', () => {
  const input = timelineSequenceResponse.parse({ id: 'sequence', projectId: 'project', name: 'Film', fps: 30, width: 1920, height: 1080, durationMs: 0, tracks: [], clips: [], markers: [], createdAt: 'date', updatedAt: 'date', setup: { stage: 'review', brief: 'Harbor film', format: 'ad-15', generation_settings: { voice: { provider: 'openai', model: 'tts-1', voice: 'alloy' } }, beats: [{ id: 'beat1', prompt: 'Harbor', duration_ms: 2000, voiceover: 'Hello' }, { id: 'beat2', prompt: 'Sea', duration_ms: 3000 }] } });
  const resultSchema = z.object({ document: timelineSequenceResponse, requests: z.array(z.object({ clip_id: z.string(), request_id: z.string().min(1), kind: z.enum(['video', 'voiceover', 'music']) }).passthrough()), fingerprint: z.string() }).passthrough();
  const raw = planningOracle('prepareBeatCut', input, { provider: 'test', model: 'video', voice: 'alloy', music: false });
  const result = resultSchema.parse(raw);
  expect(result).toEqual(raw);
  expect(result.document.clips).toHaveLength(3);
  expect(result.fingerprint).toBe(deterministicFingerprint({ kind: 'video-generation-preparation', beats: input.setup?.beats, width: input.width, height: input.height, provider: 'test', model: 'video', voiceover: true, voice: 'alloy', voiceProvider: 'openai', voiceModel: 'tts-1', music: false }));
  const prepared = result.document.setup?.prepared_generation;
  expect(prepared?.requests).toHaveLength(3);
  expect(prepared?.requests.map(request => request.request_id)).toEqual(result.requests.map(request => request.request_id));
  expect(new Set(result.requests.map(request => request.request_id)).size).toBe(3);
  for (const request of result.requests) {
    if (request.kind === 'video') {
      const compiled = z.object({ identity: productionVariationIdentitySchema, snapshot: productionGenerationSnapshot }).passthrough().parse(request.production);
      expect(request.request_id).toBe(compiled.identity.requestId);
      expect(compiled.snapshot.requestId).toBe(request.request_id);
      const clip = result.document.clips.find(item => item.id === request.clip_id);
      expect(clip?.paramOverrides?.productionCandidates).toContainEqual(request.production);
    } else { expect(request.request_id).toMatch(/^[0-9a-f]{32}$/); }
  }
  expect(result.document.setup?.beats?.every(beat => result.document.clips.some(clip => clip.id === beat.clip_id))).toBe(true);
});

it('production compiler matches canonical snapshots, named identities, accepted policies and exact refusals', () => {
  const base: CompileProductionCandidatesInput = { batchId: 'batch', destinationId: 'clip', destinationKind: 'timeline_clip', operation: 'initial_generation', prompt: 'Product film', provider: 'test', model: 'video', requestedDurationMs: 4000, routeSupport: { referenceToVideo: true, audioDrivenPerformance: false } };
  const product = { kind: 'product', asset_id: 'product', label: 'Approved product' };
  const character = { kind: 'character', asset_id: 'actor', entity_id: 'person', label: 'Actor' };
  const cases: CompileProductionCandidatesInput[] = [
    base,
    { ...base, entityIds: ['entity', 'entity'], referenceAssetIds: ['shared', 'shared'], referenceBindings: [{ kind: 'style', asset_id: 'shared', label: 'Palette' }], requirement: productionRequirement.parse({ local_direction: ' Keep label visible ', editorial_purpose: 'demonstration', visual_treatment: 'product_close_up', speech_mode: 'off_camera', speech_binding: { text: 'Hello', direction: 'Warm', voice: { provider: 'openai', model: 'tts-1', voice: 'alloy' }, audio_asset_id: 'speech', speaker_id: 'speaker' }, duration_ms: 3000, speech_duration_ms: 2000, reference_bindings: [product], protected_inputs: [{ id: 'copy', kind: 'exact_text', value: 'Brand', allowed_transformations: [] }], requested_take_count: 3 }) },
    { ...base, requirement: productionRequirement.parse({ media_strategy: 'hybrid', visual_treatment: 'generated_scene', local_direction: 'A quiet shot', requested_take_count: 2 }) },
    { ...base, routeSupport: { referenceToVideo: true, audioDrivenPerformance: true }, requirement: productionRequirement.parse({ speech_mode: 'on_camera', speech_binding: { text: 'Hello', audio_asset_id: 'speech', script_line_id: undefined }, speech_duration_ms: 1000, reference_bindings: [character] }) },
    { ...base, requirement: productionRequirement.parse({ media_strategy: 'still_motion_graphics' }) },
    { ...base, requirement: productionRequirement.parse({ protected_inputs: [{ id: 'logo', kind: 'logo', asset_id: 'logoAsset', allowed_transformations: [] }] }) },
    { ...base, requirement: productionRequirement.parse({ speech_mode: 'on_camera', speech_binding: { text: 'Hello' }, reference_bindings: [character] }) },
    { ...base, requirement: productionRequirement.parse({ speech_mode: 'on_camera', speech_binding: { text: 'Hello', audio_asset_id: 'speech' } }) },
    { ...base, requirement: productionRequirement.parse({ speech_mode: 'on_camera', speech_binding: { text: 'Hello', audio_asset_id: 'speech' }, reference_bindings: [character] }) },
    { ...base, requirement: productionRequirement.parse({ visual_treatment: 'product_close_up' }) },
    { ...base, requirement: productionRequirement.parse({ duration_ms: 1000, speech_duration_ms: 2000 }) },
    { ...base, routeSupport: { referenceToVideo: false, audioDrivenPerformance: false }, referenceAssetIds: ['reference'] },
    { ...base, requirement: { schema_version: 1, speech_mode: 'none', requested_take_count: 4 } }
  ];
  for (const input of cases) {
    let expected: unknown;
    try { expected = { candidates: compileProductionCandidates(input) }; }
    catch (error) { if (!(error instanceof Error)) throw error; expected = { error: error.message }; }
    const wire: unknown = JSON.parse(JSON.stringify(expected));
    expect(planningOracle('compileProduction', {}, input), JSON.stringify(input)).toEqual(wire);
  }
});

it('prepared production variations retain compiler snapshots, authored policy and editorial slot duration', () => {
  const requirement = productionRequirement.parse({ local_direction: 'Keep the product readable', duration_ms: 3000, speech_duration_ms: 1500, speech_mode: 'off_camera', speech_binding: { text: 'Hello', audio_asset_id: 'speech' }, visual_treatment: 'product_close_up', reference_bindings: [{ kind: 'product', asset_id: 'product', label: 'Approved product' }], protected_inputs: [{ id: 'brand', kind: 'exact_text', value: 'Brand', allowed_transformations: [] }], requested_take_count: 3 });
  const input = timelineSequenceResponse.parse({ id: 'sequence', projectId: 'project', name: 'Product film', fps: 30, width: 1920, height: 1080, durationMs: 0, tracks: [], clips: [], markers: [], createdAt: 'date', updatedAt: 'date', setup: { stage: 'review', brief: 'Product film', beats: [{ id: 'beat', prompt: 'Harbor', duration_ms: 2000.4, production: requirement }] } });
  const schema = z.object({ document: timelineSequenceResponse, requests: z.array(z.object({ clip_id: z.string(), request_id: z.string(), production: z.object({ identity: productionVariationIdentitySchema, snapshot: productionGenerationSnapshot }).passthrough() }).passthrough()) }).passthrough();
  const raw = planningOracle('prepareBeatCut', input, { provider: 'test', model: 'video', music: false });
  const result = schema.parse(raw);
  expect(result).toEqual(raw);
  expect(result.document.clips).toHaveLength(1);
  const clip = result.document.clips[0];
  const batch = result.document.setup?.prepared_generation;
  if (!batch) throw new Error('Prepared production batch is missing');
  const expected = compileProductionCandidates({ batchId: batch.batch_id, destinationId: clip.id, destinationKind: 'timeline_clip', operation: 'initial_generation', prompt: 'Harbor', requirement, referenceAssetIds: [], referenceBindings: [], provider: 'test', model: 'video', requestedDurationMs: 2000, routeSupport: { referenceToVideo: true, audioDrivenPerformance: false } });
  const wire: unknown = JSON.parse(JSON.stringify(expected));
  expect(result.requests.map(request => request.production)).toEqual(wire);
  expect(clip.paramOverrides?.productionCandidates).toEqual(wire);
  expect(clip.paramOverrides?.productionRequirement).toEqual(requirement);
  expect(clip.durationMs).toBe(2000);
  expect(result.requests.map(request => request.production.snapshot.requestedDurationMs)).toEqual([3000, 3000, 3000]);
  expect(new Set(result.requests.map(request => request.request_id)).size).toBe(3);
});

it('validates untrusted production JSON exactly like the canonical schema', () => {
  const cases: unknown[] = [
    {}, { local_direction: ' Keep this ', extra: { retained: true } },
    { protected_inputs: [{ id: ' copy ', kind: 'exact_text', value: ' Brand ', unknown: true }] },
    { speech_mode: 'off_camera', speech_binding: { text: ' Hello ', voice: { provider: ' p ', model: ' m ', voice: ' v ', settings: {}, extra: true }, extra: true } },
    null, [], { speech_mode: 'alien' }, { duration_ms: -1 }, { duration_ms: 1.5 },
    { reference_bindings: [{ kind: 'product', asset_id: 42 }] },
    { reference_bindings: [{ kind: 'alien', asset_id: 'asset' }] },
    { requested_take_count: 4 }, { local_direction: ' ' },
    { speech_mode: 'none', speech_binding: { text: 'Hello' } },
    { speech_mode: 'off_camera' }, { speech_mode: 'off_camera', speech_binding: { text: 'x', script_line_id: 'line' } },
    { speech_mode: 'off_camera', speech_binding: { text: 'x', voice: { provider: 'p', model: 'm', voice: 'v', settings: [] } } },
    { protected_inputs: [{ id: 'logo', kind: 'logo' }] },
    { protected_inputs: [{ id: 'copy', kind: 'exact_text', value: ' ' }] },
    { protected_inputs: [{ id: 'x', kind: 'exact_text', value: 'A' }, { id: ' x ', kind: 'exact_text', value: 'B' }] },
    { references: [{ uri: 42 }] }, { reference_bindings: Array.from({ length: 33 }, () => ({ kind: 'style', asset_id: 'asset' })) }
  ];
  const resultSchema = z.object({ value: z.unknown().optional(), error: z.string().optional() });
  for (const input of cases) {
    const expected = productionRequirement.safeParse(input);
    const actual = resultSchema.parse(planningOracle('validateProduction', {}, input));
    if (expected.success) {
      expect(actual.error, JSON.stringify(input)).toBeUndefined();
      expect(actual.value, JSON.stringify(input)).toEqual(expected.data);
    } else {
      expect(actual.error, JSON.stringify(input)).toBeTruthy();
      const compiled = resultSchema.parse(planningOracle('compileProduction', {}, { batchId: 'batch', destinationKind: 'timeline_clip', destinationId: 'clip', operation: 'initial_generation', prompt: 'Harbor', requestedDurationMs: 1000, provider: 'test', model: 'video', requirement: input }));
      expect(compiled.error, JSON.stringify(input)).toBeTruthy();
    }
  }
});
