import {
  DEFAULT_MEDIA_CLIP_DURATION_MS,
  ANIMATION_PRESETS,
  CUSTOM_ANIMATION_CONTRACT,
  createTimeOrderedUuid,
  type TimelineClip,
  type TimelineTrack,
  type AnimationRole,
} from '@nodetool-ai/timeline';
import {
  applyTimelineOp,
  timelineOpFromToolArgs,
  type TimelineOp,
  type TimelineOpName,
  type TimelineOpState,
  type TimelineOpContext,
  type TimelineOpOutcome,
} from '@nodetool-ai/timeline/ops';
import {
  resolveClip,
  type ResolvedTimelineAsset,
  type TimelineAddGroupInput,
  type TimelineAddMarkerInput,
  type TimelineAddMediaClipInput,
  type TimelineAddShapeClipInput,
  type TimelineAddTextClipInput,
  type TimelineAnimationInput,
  type TimelineBeatGridInput,
  type TimelineBeatMarkerReport,
  type TimelineClipBindingPatch,
  type TimelineClipParamsPatch,
  type TimelineDocument,
  type TimelineEffectInput,
  type TimelineMaskInput,
  type TimelineMatteInput,
  type TimelineMovePatch,
  type TimelineSnapReport,
  type TimelineSnapToBeatsInput,
  type TimelineTimeRemapInput,
  type TimelineTransitionInput,
  type TimelineTrimPatch,
} from './timelineTypes';

const BINDING_FIELDS = [
  'prompt',
  'negativePrompt',
  'provider',
  'model',
  'voice',
  'width',
  'height',
  'strength',
  'numInferenceSteps',
  'seed',
] as const;
const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);
function assertNotTranscribed(
  doc: TimelineDocument,
  clips: readonly TimelineClip[],
  verb: string,
): void {
  const ids = new Set(clips.map((clip) => clip.id));
  for (const line of doc.transcript ?? []) {
    const hit = line.clipIds.find((id) => ids.has(id));
    if (hit !== undefined) {
      throw new Error(
        `Cannot ${verb} clip ${hit}: transcript line "${line.text}" (${line.id}) owns it. Transcript-backed clips can only be restructured on desktop, which re-flows the transcript with them.`,
      );
    }
  }
}
export async function applyDocumentTimelineOp(
  doc: TimelineDocument,
  op: TimelineOp,
  selectedClipIds: readonly string[] = [],
  context: Partial<TimelineOpContext> = {},
): Promise<TimelineOpOutcome> {
  const state: TimelineOpState = {
    ...doc,
    fps: 30,
    width: 1920,
    height: 1080,
    playheadMs: 0,
    selectedClipIds: [...selectedClipIds],
  };
  const outcome = await applyTimelineOp(state, op, {
    newId: createTimeOrderedUuid,
    followLinks: true,
    duplicateLinkedClips: true,
    allowUnknownMediaDuration: true,
    ...context,
  });
  if (outcome.error) {
    throw new Error(outcome.error);
  }
  return outcome;
}
async function edit(
  doc: TimelineDocument,
  op: TimelineOp,
  selected: readonly string[] = [],
  context: Partial<TimelineOpContext> = {},
) {
  const outcome = await applyDocumentTimelineOp(doc, op, selected, context);
  const {
    fps: _fps,
    width: _width,
    height: _height,
    playheadMs: _playhead,
    selectedClipIds: _selected,
    ...next
  } = outcome.state;
  return {
    doc: { ...next, setup: next.setup ?? undefined },
    result: outcome.result,
    changed: outcome.changedClipIds,
  };
}
async function editClip(
  doc: TimelineDocument,
  op: TimelineOp,
  selected: readonly string[] = [],
  context: Partial<TimelineOpContext> = {},
) {
  const outcome = await edit(doc, op, selected, context);
  const result = outcome.result.clip;
  if (!result || typeof result !== 'object' || !('id' in result)) {
    throw new Error('Timeline edit returned no clip.');
  }
  const clip = outcome.doc.clips.find((clip) => clip.id === result.id);
  if (!clip) {
    throw new Error('Edited clip is unavailable.');
  }
  return { doc: outcome.doc, clip };
}
async function editClips(
  doc: TimelineDocument,
  op: TimelineOp,
  selected: readonly string[] = [],
) {
  const outcome = await edit(doc, op, selected);
  const changed = new Set(outcome.changed);
  let clips = outcome.doc.clips.filter((clip) => changed.has(clip.id));
  if (!clips.length && 'target' in op && typeof op.target === 'string') {
    clips = [resolveClip(outcome.doc.clips, op.target, selected)];
  }
  return { doc: outcome.doc, clips };
}
function editParsedClip(
  doc: TimelineDocument,
  name: TimelineOpName,
  args: Record<string, unknown>,
  selected: readonly string[] = [],
) {
  return editClip(doc, timelineOpFromToolArgs(name, args), selected);
}
export async function addTrack(
  doc: TimelineDocument,
  type: TimelineTrack['type'],
  name?: string,
) {
  const outcome = await edit(doc, {
    op: 'add_track',
    type,
    name: name ?? `${type} ${doc.tracks.length + 1}`,
  });
  const track = outcome.doc.tracks.at(-1);
  if (!track) {
    throw new Error('Track was not added.');
  }
  return { doc: outcome.doc, track };
}
export async function addTextClip(
  doc: TimelineDocument,
  input: TimelineAddTextClipInput,
) {
  const text = input.text.trim();
  if (!text) {
    throw new Error('A text clip needs non-empty text.');
  }
  return editClip(doc, {
    op: 'add_text_clip',
    ...input,
    text,
    name: text.slice(0, 40),
    startMs:
      input.startMs === undefined ? undefined : Math.max(0, input.startMs),
    durationMs: Math.max(1, input.durationMs ?? 3000),
    style: input.style,
  });
}
export async function addShapeClip(
  doc: TimelineDocument,
  input: TimelineAddShapeClipInput,
) {
  return editClip(doc, {
    op: 'add_shape_clip',
    ...input,
    name: input.shape.kind,
    startMs:
      input.startMs === undefined ? undefined : Math.max(0, input.startMs),
    durationMs: Math.max(1, input.durationMs ?? 3000),
  });
}
export async function moveClip(
  doc: TimelineDocument,
  target: string,
  patch: TimelineMovePatch,
  selectedClipIds: readonly string[] = [],
) {
  return editClips(doc, { op: 'move_clip', target, ...patch }, selectedClipIds);
}
export async function trimClip(
  doc: TimelineDocument,
  target: string,
  patch: TimelineTrimPatch,
  selectedClipIds: readonly string[] = [],
) {
  if (!Object.values(patch).some((value) => value !== undefined)) {
    throw new Error(
      'Nothing to trim: pass durationMs, inPointMs or outPointMs.',
    );
  }
  if (patch.durationMs !== undefined && patch.durationMs < 1) {
    throw new Error('durationMs must be at least 1ms.');
  }
  return editClips(doc, { op: 'trim_clip', target, ...patch }, selectedClipIds);
}
export async function splitClipAt(
  doc: TimelineDocument,
  target: string,
  atMs: number,
  selectedClipIds: readonly string[] = [],
) {
  const clip = resolveClip(doc.clips, target, selectedClipIds);
  const targets = clip.linkId
    ? doc.clips.filter(
        (member) =>
          member.linkId === clip.linkId &&
          atMs > member.startMs &&
          atMs < member.startMs + member.durationMs,
      )
    : [clip];
  assertNotTranscribed(doc, targets, 'split');
  return editClips(doc, { op: 'split_clip', target, atMs }, selectedClipIds);
}
export async function deleteClip(
  doc: TimelineDocument,
  target: string,
  selectedClipIds: readonly string[] = [],
) {
  const deleted = resolveClip(doc.clips, target, selectedClipIds);
  assertNotTranscribed(doc, [deleted], 'delete');
  const outcome = await edit(
    doc,
    { op: 'delete_clip', target },
    selectedClipIds,
  );
  return { doc: outcome.doc, deleted };
}
export async function duplicateClip(
  doc: TimelineDocument,
  target: string,
  gapMs = 0,
  selectedClipIds: readonly string[] = [],
) {
  return editClips(
    doc,
    { op: 'duplicate_clip', target, gapMs },
    selectedClipIds,
  );
}
export async function setClipParams(
  doc: TimelineDocument,
  target: string,
  patch: TimelineClipParamsPatch,
  selectedClipIds: readonly string[] = [],
) {
  const clip = resolveClip(doc.clips, target, selectedClipIds);
  if (patch.textStyle && clip.mediaType !== 'text') {
    throw new Error(
      `textStyle applies only to text clips; "${clip.name}" is a ${clip.mediaType} clip.`,
    );
  }
  if (patch.shapeStyle && clip.mediaType !== 'shape') {
    throw new Error(
      `shapeStyle applies only to shape clips; "${clip.name}" is a ${clip.mediaType} clip.`,
    );
  }
  const normal = { ...patch };
  if (normal.opacity !== undefined) {
    normal.opacity = clamp(normal.opacity, 0, 1);
  }
  if (normal.speedMultiplier !== undefined) {
    normal.speedMultiplier = clamp(normal.speedMultiplier, 0.1, 8);
  }
  if (normal.fadeInMs !== undefined) {
    normal.fadeInMs = Math.max(0, normal.fadeInMs);
  }
  if (normal.fadeOutMs !== undefined) {
    normal.fadeOutMs = Math.max(0, normal.fadeOutMs);
  }
  if (normal.borderRadius !== undefined) {
    normal.borderRadius = Math.max(0, normal.borderRadius);
  }
  const binding: TimelineClipBindingPatch = {};
  for (const field of BINDING_FIELDS) {
    const value = normal[field];
    if (value !== undefined) {
      Object.assign(binding, { [field]: value });
      delete normal[field];
    }
  }
  let current = doc;
  if (Object.keys(binding).length) {
    current = (await setClipBinding(current, target, binding, selectedClipIds))
      .doc;
  }
  return editClip(
    current,
    { op: 'set_clip_params', target, patch: { ...normal } },
    selectedClipIds,
  );
}
export async function addMarker(
  doc: TimelineDocument,
  input: TimelineAddMarkerInput,
) {
  if (input.timeMs < 0) {
    throw new Error('A marker cannot sit before zero.');
  }
  const outcome = await edit(doc, { op: 'add_marker', ...input });
  const marker = outcome.doc.markers.find(
    (marker) => !doc.markers.some((before) => before.id === marker.id),
  );
  if (!marker) {
    throw new Error('Marker was not added.');
  }
  return { doc: outcome.doc, marker };
}
export async function deleteMarker(doc: TimelineDocument, target: string) {
  const outcome = await edit(doc, { op: 'delete_marker', target });
  const deleted = doc.markers.find(
    (marker) => !outcome.doc.markers.some((after) => after.id === marker.id),
  );
  if (!deleted) {
    throw new Error('Marker was not deleted.');
  }
  return { doc: outcome.doc, deleted };
}
export async function addMediaClip(
  doc: TimelineDocument,
  input: TimelineAddMediaClipInput,
  asset: ResolvedTimelineAsset,
) {
  return editClip(
    doc,
    {
      op: 'add_media_clip',
      ...input,
      startMs:
        input.startMs === undefined ? undefined : Math.max(0, input.startMs),
      durationMs: Math.max(
        1,
        input.durationMs ?? asset.durationMs ?? DEFAULT_MEDIA_CLIP_DURATION_MS,
      ),
    },
    [],
    { resolveAsset: async () => asset },
  );
}
export async function setClipBinding(
  doc: TimelineDocument,
  target: string,
  patch: TimelineClipBindingPatch,
  selectedClipIds: readonly string[] = [],
) {
  if (!BINDING_FIELDS.some((field) => patch[field] !== undefined)) {
    throw new Error(
      'Nothing to set: pass at least one binding field (prompt, provider, model, …).',
    );
  }
  return editClip(
    doc,
    { op: 'set_clip_binding', target, ...patch },
    selectedClipIds,
  );
}
export function animationPresetCatalog() {
  return {
    presets: ANIMATION_PRESETS.map((preset) => ({
      id: preset.id,
      roles: preset.roles,
      defaultDurationMs: preset.defaultDurationMs,
      params: preset.params,
    })),
    custom: CUSTOM_ANIMATION_CONTRACT,
  };
}
export async function animateClip(
  doc: TimelineDocument,
  target: string,
  animations: TimelineAnimationInput[],
  mode: 'add' | 'replace' = 'replace',
  selectedClipIds: readonly string[] = [],
) {
  if (!animations.length) {
    throw new Error(
      'Pass at least one animation, or use ui_timeline_clear_animations.',
    );
  }
  return editParsedClip(
    doc,
    'animate_clip',
    { target, animations, mode },
    selectedClipIds,
  );
}
export async function clearAnimations(
  doc: TimelineDocument,
  target: string,
  role?: AnimationRole,
  selectedClipIds: readonly string[] = [],
) {
  return editClip(
    doc,
    { op: 'clear_animations', target, role },
    selectedClipIds,
  );
}
export async function addGroup(
  doc: TimelineDocument,
  input: TimelineAddGroupInput,
) {
  const name = input.name.trim();
  if (!name) {
    throw new Error('A group needs a name.');
  }
  if (input.durationMs < 1) {
    throw new Error(
      `durationMs must be at least 1ms; got ${input.durationMs}.`,
    );
  }
  const outcome = await editClip(doc, {
    op: 'add_group',
    ...input,
    name,
    startMs: Math.max(0, input.startMs),
  });
  return {
    ...outcome,
    children:
      input.children?.map((target) => resolveClip(doc.clips, target, []).id) ??
      [],
  };
}
export async function setParent(
  doc: TimelineDocument,
  target: string,
  parentId: string | null,
  selectedClipIds: readonly string[] = [],
) {
  return editClip(doc, { op: 'set_parent', target, parentId }, selectedClipIds);
}
export async function setTransition(
  doc: TimelineDocument,
  target: string,
  transition: TimelineTransitionInput | null,
  selectedClipIds: readonly string[] = [],
) {
  return editParsedClip(
    doc,
    'set_transition',
    { target, transition },
    selectedClipIds,
  );
}
export async function setMask(
  doc: TimelineDocument,
  target: string,
  mask: TimelineMaskInput | null,
  selectedClipIds: readonly string[] = [],
) {
  return editParsedClip(doc, 'set_mask', { target, mask }, selectedClipIds);
}
export async function setMatte(
  doc: TimelineDocument,
  target: string,
  matte: TimelineMatteInput | null,
  selectedClipIds: readonly string[] = [],
) {
  return editParsedClip(doc, 'set_matte', { target, matte }, selectedClipIds);
}
export async function setEffects(
  doc: TimelineDocument,
  target: string,
  effects: TimelineEffectInput[],
  selectedClipIds: readonly string[] = [],
) {
  return editParsedClip(
    doc,
    'set_effects',
    { target, effects },
    selectedClipIds,
  );
}
export async function setTimeRemap(
  doc: TimelineDocument,
  target: string,
  timeRemap: TimelineTimeRemapInput | null,
  selectedClipIds: readonly string[] = [],
) {
  return editParsedClip(
    doc,
    'set_time_remap',
    { target, timeRemap },
    selectedClipIds,
  );
}
export async function setMarkersFromBeats(
  doc: TimelineDocument,
  input: TimelineBeatGridInput,
) {
  const outcome = await edit(doc, {
    op: 'set_markers_from_beats',
    onsets_ms: input.onsetsMs,
    bpm: input.bpm,
    offset_ms: input.offsetMs,
    count: input.count,
    label: input.label,
  });
  const result = outcome.result;
  return {
    doc: outcome.doc,
    report: {
      grid: result.grid,
      added: result.added,
      skippedTimesMs: result.skipped_times_ms,
      markers: result.markers,
    } as TimelineBeatMarkerReport,
  };
}
export async function snapToBeats(
  doc: TimelineDocument,
  input: TimelineSnapToBeatsInput,
) {
  const outcome = await edit(doc, {
    op: 'snap_to_beats',
    targets: input.targets,
    onsets_ms: input.onsetsMs,
    bpm: input.bpm,
    offset_ms: input.offsetMs,
    tolerance_ms: input.toleranceMs,
    mode: input.mode,
    action: input.action,
  });
  return {
    doc: outcome.doc,
    report: outcome.result as unknown as TimelineSnapReport,
  };
}
