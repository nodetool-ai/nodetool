/**
 * Link-aware, pure timeline edits.
 *
 * Every function takes a `TimelineDocument` and returns a new one — no React, no
 * Zustand, no ids minted outside the engine — so the invariants below can be
 * tested directly. The screen's agent handler is a thin wrapper that feeds these
 * into `documentStore.edit()`.
 *
 * The invariants exist because a timeline is not a list of independent rows:
 *
 * - **`linkId`** ties a video clip to the audio extracted from it. They must
 *   move, trim, split, and duplicate as one, or the cut goes out of sync and
 *   nothing on screen says why. Web's *agent* handlers take a `patchClip`
 *   shortcut that desyncs them; the logic here follows web's `TimelineStore`
 *   (`moveClip`, `trimClipStart`/`End`, `splitClipsLinkAware`, `deleteClip`,
 *   `duplicateSelected`) instead, which is the code the desktop UI actually
 *   runs.
 * - **Staleness**: changing a generation input (prompt, provider, model, or any
 *   other binding field) marks an already-generated clip `stale`. Otherwise the
 *   clip reads "generated" while showing an asset that no longer matches its
 *   prompt.
 * - **Transcript integrity**: `transcript[].clipIds` points at clips. Web
 *   re-flows the transcript on every structural edit (795 lines of it); mobile
 *   refuses the edit instead, naming the line. A clear refusal beats a dangling
 *   reference the user cannot see.
 * - **Protocol schema**: only fields present in `timelineDocument`
 *   (`packages/protocol/src/api-schemas/timeline.ts`) survive a PATCH. Notably
 *   `aspectRatio` and `resolution` are *not* in that schema, so nothing here
 *   writes them — they would be stripped on save.
 *
 * `splitClip` and `trimClip` come from the engine rather than being hand-rolled:
 * they partition animations by role, rebase clip-local caption words, map
 * timeline deltas through `sourceRate`, and clear the fades/transitions that an
 * interior cut invalidates.
 */

import {
  ANIMATION_PRESETS,
  CUSTOM_ANIMATION_CONTRACT,
  CUSTOM_ANIMATION_PRESET_ID,
  DEFAULT_BEAT_TOLERANCE_MS,
  DEFAULT_MEDIA_CLIP_DURATION_MS,
  DEFAULT_SHAPE_FILL_COLOR,
  DEFAULT_SHAPE_STROKE_COLOR,
  DEFAULT_SHAPE_STROKE_WIDTH_PX,
  DEFAULT_TEXT_CLIP_COLOR,
  DEFAULT_TEXT_CLIP_DURATION_MS,
  DEFAULT_TEXT_CLIP_FONT_SIZE_PX,
  beatCountToCover,
  buildBeatGrid,
  createTimeOrderedUuid,
  groupDescendantIds,
  isGroupClip,
  makeClip,
  makeMarker,
  makeTrack,
  mediaTypeForContentType,
  moveGroup,
  normalizeCustomCurves,
  resolveCustomMask,
  snapClipsToGrid,
  splitClip as engineSplitClip,
  trackTypeForMediaType,
  trimClip as engineTrimClip,
  trimGroup,
  ungroup,
  type AnimationRole,
  type BlendMode,
  type ClipAnimation,
  type ClipEffect,
  type ClipMask,
  type ClipMatte,
  type ClipShapeStyle,
  type ClipTextStyle,
  type ClipTimeRemap,
  type ClipTransition,
  type SnapAction,
  type SnapBoundaryMode,
  type TimelineClip,
  type TimelineTrack,
} from '@nodetool-ai/timeline';

import {
  resolveClip,
  resolveTrack,
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

/** Tracks a text or shape clip may be drawn on. */
const AUTHORED_TRACK_TYPES: readonly TimelineTrack['type'][] = [
  'video',
  'overlay',
];

/** The binding fields whose change invalidates an existing render. */
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

/** Every member of the clip's link group, including the clip itself. */
function linkGroup(
  clips: readonly TimelineClip[],
  clip: TimelineClip
): TimelineClip[] {
  if (clip.linkId === undefined) {
    return [clip];
  }
  return clips.filter((other) => other.linkId === clip.linkId);
}

/**
 * Refuse a structural edit to a clip the transcript owns. `clipIds` is a plain
 * reference list with no repair path on mobile, so breaking it would leave the
 * transcript pointing at clips that no longer exist.
 */
function assertNotTranscribed(
  doc: TimelineDocument,
  clips: readonly TimelineClip[],
  verb: string
): void {
  const ids = new Set(clips.map((clip) => clip.id));
  for (const line of doc.transcript ?? []) {
    const hit = line.clipIds.find((clipId) => ids.has(clipId));
    if (hit !== undefined) {
      throw new Error(
        `Cannot ${verb} clip ${hit}: transcript line "${line.text}" (${line.id}) ` +
          'owns it. Transcript-backed clips can only be restructured on desktop, ' +
          'which re-flows the transcript with them.'
      );
    }
  }
}

/** Drop keys whose value is undefined, so a PATCH cannot carry empty slots. */
function pruned<T extends object>(value: T): T {
  const out = { ...value } as Record<string, unknown>;
  for (const key of Object.keys(out)) {
    if (out[key] === undefined) {
      delete out[key];
    }
  }
  return out as T;
}

/** End of the last clip on a track, or 0 when it is empty. */
function trackEndMs(clips: readonly TimelineClip[], trackId: string): number {
  return clips
    .filter((clip) => clip.trackId === trackId)
    .reduce((end, clip) => Math.max(end, clip.startMs + clip.durationMs), 0);
}

/**
 * Unlink survivors of a link group that has dropped below two members, so no
 * clip keeps a `linkId` nothing else shares.
 */
function unlinkOrphans(
  clips: readonly TimelineClip[],
  affected: ReadonlySet<string>
): TimelineClip[] {
  if (affected.size === 0) {
    return [...clips];
  }
  const counts = new Map<string, number>();
  for (const clip of clips) {
    if (clip.linkId !== undefined && affected.has(clip.linkId)) {
      counts.set(clip.linkId, (counts.get(clip.linkId) ?? 0) + 1);
    }
  }
  return clips.map((clip) => {
    if (
      clip.linkId !== undefined &&
      affected.has(clip.linkId) &&
      (counts.get(clip.linkId) ?? 0) < 2
    ) {
      const next = { ...clip };
      delete next.linkId;
      return next;
    }
    return clip;
  });
}

const withClips = (
  doc: TimelineDocument,
  clips: TimelineClip[]
): TimelineDocument => ({ ...doc, clips });

// ── Tracks ──────────────────────────────────────────────────────────────────

export function addTrack(
  doc: TimelineDocument,
  type: TimelineTrack['type'],
  name?: string
) {
  const track = makeTrack({
    type,
    name: name ?? `${type} ${doc.tracks.length + 1}`,
    index: doc.tracks.length,
  });
  return { doc: { ...doc, tracks: [...doc.tracks, track] }, track };
}

/**
 * Resolve the target track for an authored (text/shape) clip, creating an
 * overlay track when the sequence has none. Mirrors web's throw: text and
 * shapes are drawn, so an audio or subtitle track cannot hold them.
 */
function authoredTrack(
  doc: TimelineDocument,
  trackId: string | undefined,
  fallbackName: string
) {
  if (trackId !== undefined) {
    const track = resolveTrack(doc.tracks, trackId);
    if (!AUTHORED_TRACK_TYPES.includes(track.type)) {
      throw new Error(
        `Text and shape clips require a video or overlay track; "${track.name}" is ${track.type}.`
      );
    }
    return { doc, trackId: track.id };
  }
  const overlay = doc.tracks.find((track) => track.type === 'overlay');
  if (overlay) {
    return { doc, trackId: overlay.id };
  }
  const created = addTrack(doc, 'overlay', fallbackName);
  return { doc: created.doc, trackId: created.track.id };
}

// ── Authored clips ──────────────────────────────────────────────────────────

function textStyleWithDefaults(input: TimelineAddTextClipInput): ClipTextStyle {
  return {
    text: input.text,
    fontSizePx: input.style?.fontSizePx ?? DEFAULT_TEXT_CLIP_FONT_SIZE_PX,
    color: input.style?.color ?? DEFAULT_TEXT_CLIP_COLOR,
    fontFamily: input.style?.fontFamily,
    fontWeight: input.style?.fontWeight,
    align: input.style?.align,
    maxWidthFrac: input.style?.maxWidthFrac,
  };
}

/**
 * Fill in a visible colour. An omitted fill on a rectangle (or stroke on a line)
 * would render nothing, which reads to the user as a failed edit.
 */
export function shapeStyleWithDefaults(shape: ClipShapeStyle): ClipShapeStyle {
  return {
    ...shape,
    ...(shape.kind === 'line'
      ? {
          stroke: shape.stroke ?? DEFAULT_SHAPE_STROKE_COLOR,
          strokeWidthPx: shape.strokeWidthPx ?? DEFAULT_SHAPE_STROKE_WIDTH_PX,
        }
      : { fill: shape.fill ?? DEFAULT_SHAPE_FILL_COLOR }),
  };
}

export function addTextClip(
  doc: TimelineDocument,
  input: TimelineAddTextClipInput
) {
  const text = input.text.trim();
  if (text.length === 0) {
    throw new Error('A text clip needs non-empty text.');
  }
  const target = authoredTrack(doc, input.trackId, 'Text');
  const clip = makeClip({
    trackId: target.trackId,
    name: text.slice(0, 40),
    startMs: Math.max(0, input.startMs ?? trackEndMs(doc.clips, target.trackId)),
    durationMs: Math.max(
      1,
      input.durationMs ?? DEFAULT_TEXT_CLIP_DURATION_MS
    ),
    mediaType: 'text',
    sourceType: 'imported',
    status: 'generated',
    textStyle: textStyleWithDefaults({ ...input, text }),
  });
  return {
    doc: withClips(target.doc, [...target.doc.clips, pruned(clip)]),
    clip,
  };
}

export function addShapeClip(
  doc: TimelineDocument,
  input: TimelineAddShapeClipInput
) {
  const target = authoredTrack(doc, input.trackId, 'Shapes');
  const clip = makeClip({
    trackId: target.trackId,
    name: input.shape.kind,
    startMs: Math.max(0, input.startMs ?? trackEndMs(doc.clips, target.trackId)),
    durationMs: Math.max(
      1,
      input.durationMs ?? DEFAULT_TEXT_CLIP_DURATION_MS
    ),
    mediaType: 'shape',
    sourceType: 'imported',
    status: 'generated',
    shapeStyle: shapeStyleWithDefaults(input.shape),
  });
  return {
    doc: withClips(target.doc, [...target.doc.clips, pruned(clip)]),
    clip,
  };
}

// ── Move ────────────────────────────────────────────────────────────────────

/**
 * Move a clip, and every link sibling with it, by one shared delta. Siblings
 * keep their own `trackId` — extracted audio stays on the audio track.
 *
 * The delta is clamped once for the whole group so a move against t=0 preserves
 * the group's internal spacing instead of piling members onto zero. That can
 * land the primary later than requested; the returned clips say where it went.
 */
export function moveClip(
  doc: TimelineDocument,
  target: string,
  patch: TimelineMovePatch,
  selectedClipIds: readonly string[] = []
) {
  const clip = resolveClip(doc.clips, target, selectedClipIds);
  const toTrackId =
    patch.trackId === undefined
      ? undefined
      : resolveTrack(doc.tracks, patch.trackId).id;

  // A group carries its children, not a link sibling: `moveGroup` walks
  // `parentId` transitively so nested groups travel too. Children keep their
  // own track, so `trackId` moves the group clip alone.
  if (isGroupClip(clip)) {
    const delta =
      (patch.startMs === undefined ? clip.startMs : Math.max(0, patch.startMs)) -
      clip.startMs;
    const movedIds = groupDescendantIds(doc.clips, clip.id);
    movedIds.add(clip.id);
    const clips = moveGroup(doc.clips, clip.id, delta).map((member) =>
      member.id === clip.id && toTrackId !== undefined
        ? { ...member, trackId: toTrackId }
        : member
    );
    return {
      doc: withClips(doc, clips),
      clips: clips.filter((member) => movedIds.has(member.id)),
    };
  }

  const requested =
    patch.startMs === undefined ? clip.startMs : Math.max(0, patch.startMs);
  const group = linkGroup(doc.clips, clip);
  const minStartMs = group.reduce(
    (min, member) => Math.min(min, member.startMs),
    clip.startMs
  );
  const delta = Math.max(requested - clip.startMs, -minStartMs);

  const groupIds = new Set(group.map((member) => member.id));
  const moved: TimelineClip[] = [];
  const clips = doc.clips.map((member) => {
    if (!groupIds.has(member.id)) {
      return member;
    }
    const next: TimelineClip = {
      ...member,
      startMs: member.startMs + delta,
      trackId: member.id === clip.id ? (toTrackId ?? member.trackId) : member.trackId,
    };
    moved.push(next);
    return next;
  });

  return { doc: withClips(doc, clips), clips: moved };
}

// ── Trim ────────────────────────────────────────────────────────────────────

/**
 * Trim a clip's timeline length and/or its source window.
 *
 * `durationMs` is applied as an end-edge delta through the engine, and the same
 * delta is applied to every link sibling. All-or-nothing: the primary and every
 * sibling are computed first, and the whole edit is abandoned if any is invalid,
 * so a link can never end up half-trimmed.
 *
 * `inPointMs`/`outPointMs` address the clip's own source media, which siblings
 * do not share, so they apply to the primary only.
 */
export function trimClip(
  doc: TimelineDocument,
  target: string,
  patch: TimelineTrimPatch,
  selectedClipIds: readonly string[] = []
) {
  const clip = resolveClip(doc.clips, target, selectedClipIds);

  // A group has no media of its own: `inPointMs`/`outPointMs` mean nothing on
  // it, and a length change has to pull its children inside the new window.
  if (isGroupClip(clip)) {
    if (patch.inPointMs !== undefined || patch.outPointMs !== undefined) {
      throw new Error(
        `"${clip.name}" is a group and has no source media, so inPointMs/outPointMs cannot be set. Trim its children instead.`
      );
    }
    if (patch.durationMs === undefined) {
      throw new Error('Nothing to trim: pass durationMs.');
    }
    if (patch.durationMs < 1) {
      throw new Error(
        `durationMs must be at least 1ms; got ${patch.durationMs}.`
      );
    }
    const affected = groupDescendantIds(doc.clips, clip.id);
    affected.add(clip.id);
    const before = new Map(doc.clips.map((member) => [member.id, member]));
    const clips = trimGroup(
      doc.clips,
      clip.id,
      'end',
      patch.durationMs - clip.durationMs
    );
    return {
      doc: withClips(doc, clips),
      clips: clips.filter(
        (member) =>
          affected.has(member.id) && before.get(member.id) !== member
      ),
    };
  }

  const next = new Map<string, TimelineClip>();

  if (patch.durationMs !== undefined) {
    if (patch.durationMs < 1) {
      throw new Error(
        `durationMs must be at least 1ms; got ${patch.durationMs}.`
      );
    }
    const delta = patch.durationMs - clip.durationMs;
    for (const member of linkGroup(doc.clips, clip)) {
      // Any invalid member throws out of the whole call, leaving `doc` untouched.
      next.set(member.id, engineTrimClip(member, 'end', delta));
    }
  }

  if (patch.inPointMs !== undefined || patch.outPointMs !== undefined) {
    const base = next.get(clip.id) ?? clip;
    const inPointMs = patch.inPointMs ?? base.inPointMs ?? 0;
    const outPointMs =
      patch.outPointMs ?? base.outPointMs ?? inPointMs + base.durationMs;
    if (inPointMs < 0) {
      throw new Error(`inPointMs cannot be negative; got ${inPointMs}.`);
    }
    if (outPointMs <= inPointMs) {
      throw new Error(
        `outPointMs (${outPointMs}) must be greater than inPointMs (${inPointMs}).`
      );
    }
    next.set(clip.id, { ...base, inPointMs, outPointMs });
  }

  if (next.size === 0) {
    throw new Error(
      'Nothing to trim: pass durationMs, inPointMs, or outPointMs.'
    );
  }

  const clips = doc.clips.map((member) => next.get(member.id) ?? member);
  return { doc: withClips(doc, clips), clips: [...next.values()] };
}

// ── Split ───────────────────────────────────────────────────────────────────

/**
 * Split a clip at an absolute timeline time, together with every link sibling
 * that spans that time.
 *
 * Each side of the cut gets **one fresh `linkId` shared by all its halves** — the
 * left halves share one, the right halves another. Leaving the original id on all
 * four would produce a single 4-member group in which nothing is paired.
 */
export function splitClipAt(
  doc: TimelineDocument,
  target: string,
  atMs: number,
  selectedClipIds: readonly string[] = []
) {
  const clip = resolveClip(doc.clips, target, selectedClipIds);
  const clipEndMs = clip.startMs + clip.durationMs;
  if (atMs <= clip.startMs || atMs >= clipEndMs) {
    throw new Error(
      `Split time ${atMs}ms is outside clip "${clip.name}" (${clip.startMs}–${clipEndMs}ms).`
    );
  }

  const spans = (member: TimelineClip): boolean =>
    atMs > member.startMs && atMs < member.startMs + member.durationMs;
  // A sibling that does not span the cut (rare — links stay time-aligned) is
  // left alone and joins neither new group.
  const toSplit = linkGroup(doc.clips, clip).filter(spans);
  assertNotTranscribed(doc, toSplit, 'split');

  const leftLinkId = clip.linkId === undefined ? undefined : createTimeOrderedUuid();
  const rightLinkId = clip.linkId === undefined ? undefined : createTimeOrderedUuid();
  const splitIds = new Set(toSplit.map((member) => member.id));

  const halves: TimelineClip[] = [];
  const clips: TimelineClip[] = [];
  for (const member of doc.clips) {
    if (!splitIds.has(member.id)) {
      clips.push(member);
      continue;
    }
    const [left, right] = engineSplitClip(member, atMs);
    if (leftLinkId !== undefined && rightLinkId !== undefined) {
      left.linkId = leftLinkId;
      right.linkId = rightLinkId;
    } else {
      delete left.linkId;
      delete right.linkId;
    }
    halves.push(left, right);
    clips.push(pruned(left), pruned(right));
  }

  return { doc: withClips(doc, clips), clips: halves };
}

// ── Delete ──────────────────────────────────────────────────────────────────

/**
 * Remove one clip. A link group left with a single member is unlinked, so no
 * clip keeps a `linkId` that pairs it with nothing.
 */
export function deleteClip(
  doc: TimelineDocument,
  target: string,
  selectedClipIds: readonly string[] = []
) {
  const clip = resolveClip(doc.clips, target, selectedClipIds);
  assertNotTranscribed(doc, [clip], 'delete');

  // Deleting a group deletes the parent, not the picture: `ungroup` releases
  // its direct children where they stand rather than leaving them pointing at
  // a clip that is gone.
  const released = isGroupClip(clip) ? ungroup(doc.clips, clip.id) : doc.clips;

  const affected = new Set(clip.linkId === undefined ? [] : [clip.linkId]);
  const remaining = released.filter((member) => member.id !== clip.id);
  return {
    doc: withClips(doc, unlinkOrphans(remaining, affected)),
    deleted: clip,
  };
}

// ── Duplicate ───────────────────────────────────────────────────────────────

/**
 * Duplicate a clip — or its whole link group, so the copies stay in sync rather
 * than producing a lone half whose sibling is somewhere else.
 *
 * A fully-duplicated group gets a fresh shared `linkId` (its own group, not a
 * member of the source's); an unlinked clip's copy has none. Every member shifts
 * by the *primary's* offset so the group's internal alignment survives.
 *
 * Derived state is reset: the copy is a `draft` with no asset, no
 * `lastGeneratedHash`, and no version history — it has never been generated.
 */
export function duplicateClip(
  doc: TimelineDocument,
  target: string,
  gapMs = 0,
  selectedClipIds: readonly string[] = []
) {
  const clip = resolveClip(doc.clips, target, selectedClipIds);
  const group = linkGroup(doc.clips, clip);
  const offsetMs = clip.durationMs + gapMs;
  const freshLinkId = group.length >= 2 ? createTimeOrderedUuid() : undefined;

  const copies = group.map((member) => {
    const copy = makeClip({
      ...member,
      id: createTimeOrderedUuid(),
      startMs: member.startMs + offsetMs,
      status: 'draft',
      locked: false,
      currentAssetId: undefined,
      lastGeneratedHash: undefined,
      linkId: freshLinkId,
      // Fresh animation ids so the two clips are edited independently.
      animations: member.animations?.map((animation) => ({
        ...animation,
        id: createTimeOrderedUuid(),
      })),
      versions: [],
    });
    return pruned(copy);
  });

  return {
    doc: withClips(doc, [...doc.clips, ...copies]),
    clips: copies,
  };
}

// ── Params + binding ────────────────────────────────────────────────────────

/**
 * Patch a clip's render/audio params and generation binding.
 *
 * Only the fields present in the patch are written, so an omitted key never
 * wipes an existing prompt or model. Touching any binding field marks a clip
 * that has a render (`lastGeneratedHash` or `currentAssetId`) as `stale` — the
 * asset on screen no longer matches the settings that produced it.
 */
export function setClipParams(
  doc: TimelineDocument,
  target: string,
  patch: TimelineClipParamsPatch,
  selectedClipIds: readonly string[] = []
) {
  const clip = resolveClip(doc.clips, target, selectedClipIds);
  const next: TimelineClip = { ...clip };

  if (patch.name !== undefined) {
    next.name = patch.name;
  }
  if (patch.opacity !== undefined) {
    next.opacity = clamp(patch.opacity, 0, 1);
  }
  if (patch.speedMultiplier !== undefined) {
    next.speedMultiplier = clamp(patch.speedMultiplier, 0.1, 8);
  }
  if (patch.volumeDb !== undefined) {
    next.volumeDb = patch.volumeDb;
  }
  if (patch.fadeInMs !== undefined) {
    next.fadeInMs = Math.max(0, patch.fadeInMs);
  }
  if (patch.fadeOutMs !== undefined) {
    next.fadeOutMs = Math.max(0, patch.fadeOutMs);
  }
  if (patch.blendMode !== undefined) {
    next.blendMode = patch.blendMode as BlendMode;
  }
  if (patch.borderRadius !== undefined) {
    next.borderRadius = Math.max(0, patch.borderRadius);
  }
  if (patch.hidden !== undefined) {
    next.hidden = patch.hidden;
  }
  if (patch.muted !== undefined) {
    next.muted = patch.muted;
  }
  if (patch.locked !== undefined) {
    next.locked = patch.locked;
  }
  if (patch.textStyle !== undefined) {
    if (clip.mediaType !== 'text') {
      throw new Error(
        `textStyle applies only to text clips; "${clip.name}" is a ${clip.mediaType} clip.`
      );
    }
    next.textStyle = patch.textStyle;
  }
  if (patch.shapeStyle !== undefined) {
    if (clip.mediaType !== 'shape') {
      throw new Error(
        `shapeStyle applies only to shape clips; "${clip.name}" is a ${clip.mediaType} clip.`
      );
    }
    next.shapeStyle = shapeStyleWithDefaults(patch.shapeStyle);
  }

  let bindingChanged = false;
  for (const field of BINDING_FIELDS) {
    const value = patch[field];
    if (value === undefined) {
      continue;
    }
    if (clip.sourceType !== 'generated') {
      throw new Error(
        `Clip "${clip.name}" is imported and has no generation binding, so ${field} cannot be set.`
      );
    }
    // Each field is assigned individually because the patch and the clip share
    // names but not types (the clip's are narrowed).
    Object.assign(next, { [field]: value });
    bindingChanged = true;
  }
  if (bindingChanged && (clip.lastGeneratedHash || clip.currentAssetId)) {
    next.status = 'stale';
  }

  const clips = doc.clips.map((member) =>
    member.id === clip.id ? pruned(next) : member
  );
  return { doc: withClips(doc, clips), clip: next };
}

// ── Markers ─────────────────────────────────────────────────────────────────

export function addMarker(
  doc: TimelineDocument,
  input: TimelineAddMarkerInput
) {
  if (input.timeMs < 0) {
    throw new Error(`A marker cannot sit before zero; got ${input.timeMs}ms.`);
  }
  const marker = makeMarker({
    timeMs: input.timeMs,
    label: input.label ?? '',
    color: input.color,
    note: input.note,
  });
  return {
    doc: {
      ...doc,
      markers: [...doc.markers, pruned(marker)],
    },
    marker,
  };
}

/** Resolve a marker by id or case-insensitive label, then remove it. */
export function deleteMarker(
  doc: TimelineDocument,
  target: string
) {
  const lowered = target.toLowerCase();
  const marker =
    doc.markers.find((entry) => entry.id === target) ??
    doc.markers.find((entry) => entry.label.toLowerCase() === lowered);
  if (marker === undefined) {
    const known = doc.markers
      .map((entry) => `${entry.id} ("${entry.label}")`)
      .join(', ');
    throw new Error(
      `No marker matches "${target}". Use a marker id or its label. ` +
        (known.length > 0
          ? `Markers: ${known}.`
          : 'This sequence has no markers yet.')
    );
  }
  return {
    doc: {
      ...doc,
      markers: doc.markers.filter((entry) => entry.id !== marker.id),
    },
    deleted: marker,
  };
}

// ── Media clips ─────────────────────────────────────────────────────────────

/** Resolve a track of `type`, creating one when the sequence has none. */
function findOrCreateTrack(
  doc: TimelineDocument,
  type: TimelineTrack['type']
): { doc: TimelineDocument; trackId: string } {
  const existing = doc.tracks.find((track) => track.type === type);
  if (existing) {
    return { doc, trackId: existing.id };
  }
  const created = addTrack(doc, type);
  return { doc: created.doc, trackId: created.track.id };
}

/**
 * Place an asset the caller has already resolved.
 *
 * The lookup is the screen's (`assets.get` over tRPC) so this stays pure and
 * synchronous like every other edit here; what reaches it is the content type
 * and duration the library knows.
 */
export function addMediaClip(
  doc: TimelineDocument,
  input: TimelineAddMediaClipInput,
  asset: ResolvedTimelineAsset
) {
  const mediaType = mediaTypeForContentType(asset.contentType);
  if (mediaType === null) {
    throw new Error(
      `Asset "${asset.name}" is ${asset.contentType}, which is not video, image, or audio and cannot go on a timeline.`
    );
  }
  const target =
    input.trackId === undefined
      ? findOrCreateTrack(doc, trackTypeForMediaType(mediaType))
      : { doc, trackId: resolveTrack(doc.tracks, input.trackId).id };

  const clip = makeClip({
    trackId: target.trackId,
    name: input.name ?? asset.name,
    startMs: Math.max(
      0,
      input.startMs ?? trackEndMs(target.doc.clips, target.trackId)
    ),
    durationMs: Math.max(
      1,
      input.durationMs ?? asset.durationMs ?? DEFAULT_MEDIA_CLIP_DURATION_MS
    ),
    mediaType,
    sourceType: 'imported',
    status: 'generated',
    currentAssetId: asset.id,
    thumbnailAssetId: asset.thumbnailAssetId,
  });
  return {
    doc: withClips(target.doc, [...target.doc.clips, pruned(clip)]),
    clip,
  };
}

// ── Generation binding ──────────────────────────────────────────────────────

/**
 * Edit a generated clip's binding on its own, without the render/audio params
 * `setClipParams` also carries. Same staleness rule: a clip that has a render
 * becomes `stale`, because its asset no longer matches its settings.
 */
export function setClipBinding(
  doc: TimelineDocument,
  target: string,
  patch: TimelineClipBindingPatch,
  selectedClipIds: readonly string[] = []
) {
  const clip = resolveClip(doc.clips, target, selectedClipIds);
  if (clip.sourceType !== 'generated') {
    throw new Error(
      `"${clip.name}" is not a generated clip, so it has no generation binding to edit.`
    );
  }
  const next: TimelineClip = { ...clip };
  let changed = false;
  for (const field of BINDING_FIELDS) {
    const value = patch[field];
    if (value === undefined) {
      continue;
    }
    // Assigned one by one: the patch and the clip share names but not types.
    Object.assign(next, { [field]: value });
    changed = true;
  }
  if (!changed) {
    throw new Error(
      'Nothing to set: pass at least one binding field (prompt, provider, model, …).'
    );
  }
  if (clip.lastGeneratedHash || clip.currentAssetId) {
    next.status = 'stale';
  }
  const clips = doc.clips.map((member) =>
    member.id === clip.id ? pruned(next) : member
  );
  return { doc: withClips(doc, clips), clip: next };
}

// ── Animations ──────────────────────────────────────────────────────────────

/** The preset catalog plus the `custom` contract, for the list tool. */
export function animationPresetCatalog() {
  return {
    presets: ANIMATION_PRESETS.map((preset) => ({
      id: preset.id,
      roles: preset.roles,
      defaultDurationMs: preset.defaultDurationMs,
      defaultEasing: preset.defaultEasing,
      params: preset.params,
      describe: preset.describe,
    })),
    custom: CUSTOM_ANIMATION_CONTRACT,
    properties: CUSTOM_ANIMATION_CONTRACT.properties,
  };
}

/**
 * Build one animation from a tool input.
 *
 * `preset: "custom"` takes `curves` only. Baking `code` into curves needs a
 * host-side JavaScript sandbox, which this surface does not have — refusing it
 * by name beats storing an animation whose curves were never produced.
 */
function buildAnimation(
  clip: TimelineClip,
  input: TimelineAnimationInput
): ClipAnimation {
  if (input.preset === CUSTOM_ANIMATION_PRESET_ID) {
    const code = typeof input.code === 'string' ? input.code.trim() : '';
    if (code !== '') {
      throw new Error(
        'This surface cannot bake `code` into curves: it has no animation baker. ' +
          'Pass `curves` instead, or run the headless `edit_timeline` tool, which bakes it.'
      );
    }
    if (input.curves === undefined) {
      throw new Error(
        'A "custom" animation needs `curves` (keyframes: [{property, keyframes:[{t, value}]}]).'
      );
    }
    const normalized = normalizeCustomCurves(input.curves);
    if (!normalized.ok) {
      throw new Error(normalized.error);
    }
    const mask = resolveCustomMask(normalized.curves, input.mask);
    if (!mask.ok) {
      throw new Error(mask.error);
    }
    const animation: ClipAnimation = {
      id: createTimeOrderedUuid(),
      role: input.role,
      preset: CUSTOM_ANIMATION_PRESET_ID,
      // Curves are normalized 0..1 over the window, so a custom animation with
      // no duration of its own spans the clip and nothing is cropped.
      durationMs: input.durationMs ?? clip.durationMs,
      delayMs: input.delayMs,
      easing: input.easing,
      params: input.params,
      stagger: input.stagger,
      custom: {
        curves: normalized.curves,
        mask: mask.mask,
      },
    };
    return pruned(animation);
  }

  const preset = ANIMATION_PRESETS.find((entry) => entry.id === input.preset);
  if (!preset) {
    const ids = ANIMATION_PRESETS.map((entry) => entry.id).join(', ');
    throw new Error(
      `Unknown animation preset "${input.preset}". Valid presets: ${ids}, ${CUSTOM_ANIMATION_PRESET_ID}.`
    );
  }
  if (!preset.roles.includes(input.role)) {
    throw new Error(
      `Preset "${input.preset}" does not support role "${input.role}". Valid roles for "${input.preset}": ${preset.roles.join(', ')}.`
    );
  }
  return pruned({
    id: createTimeOrderedUuid(),
    role: input.role,
    preset: input.preset,
    durationMs: input.durationMs ?? preset.defaultDurationMs,
    delayMs: input.delayMs,
    easing: input.easing,
    params: input.params,
    stagger: input.stagger,
  });
}

export function animateClip(
  doc: TimelineDocument,
  target: string,
  animations: TimelineAnimationInput[],
  mode: 'add' | 'replace' = 'replace',
  selectedClipIds: readonly string[] = []
) {
  if (animations.length === 0) {
    throw new Error(
      'Pass at least one animation, or use ui_timeline_clear_animations.'
    );
  }
  const clip = resolveClip(doc.clips, target, selectedClipIds);
  // Every animation is built before anything is written: a half-applied list
  // would leave the clip with motion the caller cannot see it has.
  const built = animations.map((input) => buildAnimation(clip, input));
  const next: TimelineClip = {
    ...clip,
    animations: mode === 'add' ? [...(clip.animations ?? []), ...built] : built,
  };
  return {
    doc: withClips(
      doc,
      doc.clips.map((member) => (member.id === clip.id ? next : member))
    ),
    clip: next,
  };
}

export function clearAnimations(
  doc: TimelineDocument,
  target: string,
  role?: AnimationRole,
  selectedClipIds: readonly string[] = []
) {
  const clip = resolveClip(doc.clips, target, selectedClipIds);
  const next: TimelineClip = {
    ...clip,
    animations:
      role === undefined
        ? []
        : (clip.animations ?? []).filter(
            (animation) => animation.role !== role
          ),
  };
  return {
    doc: withClips(
      doc,
      doc.clips.map((member) => (member.id === clip.id ? next : member))
    ),
    clip: next,
  };
}

// ── Groups ──────────────────────────────────────────────────────────────────

export function addGroup(doc: TimelineDocument, input: TimelineAddGroupInput) {
  const name = input.name.trim();
  if (name.length === 0) {
    throw new Error('A group needs a name.');
  }
  if (input.durationMs < 1) {
    throw new Error(
      `durationMs must be at least 1ms; got ${input.durationMs}.`
    );
  }
  // Resolve every child first: a half-applied group leaves the caller with an
  // empty group and no idea which of its clips moved.
  const children = (input.children ?? []).map((ref) =>
    resolveClip(doc.clips, ref, [])
  );
  const target =
    input.trackId === undefined
      ? findOrCreateTrack(doc, 'overlay')
      : { doc, trackId: resolveTrack(doc.tracks, input.trackId).id };

  const group = makeClip({
    trackId: target.trackId,
    name,
    startMs: Math.max(0, input.startMs),
    durationMs: input.durationMs,
    mediaType: 'group',
    sourceType: 'imported',
    status: 'generated',
  });
  const childIds = new Set(children.map((child) => child.id));
  const clips = target.doc.clips.map((member) =>
    childIds.has(member.id) ? { ...member, parentId: group.id } : member
  );
  return {
    doc: withClips(target.doc, [...clips, pruned(group)]),
    clip: group,
    children: [...childIds],
  };
}

export function setParent(
  doc: TimelineDocument,
  target: string,
  parentId: string | null,
  selectedClipIds: readonly string[] = []
) {
  const clip = resolveClip(doc.clips, target, selectedClipIds);
  if (parentId === null) {
    const released = { ...clip };
    delete released.parentId;
    return {
      doc: withClips(
        doc,
        doc.clips.map((member) => (member.id === clip.id ? released : member))
      ),
      clip: released,
    };
  }

  const parent = resolveClip(doc.clips, parentId, selectedClipIds);
  if (!isGroupClip(parent)) {
    throw new Error(
      `"${parent.name}" is a ${parent.mediaType} clip, not a group — parent to a clip created with ui_timeline_add_group.`
    );
  }
  // A cycle renders unparented and warns, so refusing it here is the only
  // place it can still be fixed.
  if (parent.id === clip.id || groupDescendantIds(doc.clips, clip.id).has(parent.id)) {
    throw new Error(
      `"${parent.name}" is inside "${clip.name}" — parenting them would make a cycle.`
    );
  }
  const next: TimelineClip = { ...clip, parentId: parent.id };
  return {
    doc: withClips(
      doc,
      doc.clips.map((member) => (member.id === clip.id ? next : member))
    ),
    clip: next,
  };
}

// ── Transition, mask, matte, effects, time remap ────────────────────────────

/**
 * Write one field of a clip, or delete it when the value is null.
 *
 * Every one of these tools takes the same shape — a value or `null` to clear —
 * so they share the write rather than repeating the map five times.
 */
function patchClipField(
  doc: TimelineDocument,
  clip: TimelineClip,
  field: 'transitionIn' | 'mask' | 'matte' | 'effects' | 'timeRemap',
  value: unknown
) {
  const next: TimelineClip = { ...clip };
  if (value === undefined) {
    delete next[field];
  } else {
    Object.assign(next, { [field]: value });
  }
  return {
    doc: withClips(
      doc,
      doc.clips.map((member) => (member.id === clip.id ? next : member))
    ),
    clip: next,
  };
}

/** Transition types this build draws. Mirrors `KNOWN_TRANSITION_TYPE_LIST`. */
const TRANSITION_TYPES = [
  'crossfade',
  'dipToColor',
  'wipe',
  'push',
  'slide',
  'zoom',
] as const;

/**
 * The union member the named type takes. The input is one flat object because
 * that is what a tool call can express, so a `color` sent with a `push` would
 * otherwise be stored and then stripped on the next save.
 */
function buildTransition(input: TimelineTransitionInput): ClipTransition {
  const { durationMs, easing } = input;
  const direction = input.direction ?? 'left';
  switch (input.type) {
    case 'dipToColor':
      return {
        type: 'dipToColor',
        durationMs,
        easing,
        color: input.color ?? '#000000',
      };
    case 'wipe':
      return {
        type: 'wipe',
        durationMs,
        easing,
        direction,
        softness: input.softness,
      };
    case 'push':
    case 'slide':
      return { type: input.type, durationMs, easing, direction };
    case 'crossfade':
    case 'zoom':
      return { type: input.type, durationMs, easing };
    default:
      throw new Error(
        `Unknown transition type "${input.type}". Valid types: ${TRANSITION_TYPES.join(', ')}.`
      );
  }
}

export function setTransition(
  doc: TimelineDocument,
  target: string,
  transition: TimelineTransitionInput | null,
  selectedClipIds: readonly string[] = []
) {
  const clip = resolveClip(doc.clips, target, selectedClipIds);
  return patchClipField(
    doc,
    clip,
    'transitionIn',
    transition === null ? undefined : pruned(buildTransition(transition))
  );
}

/** Mask kinds the compositor rasterizes. Mirrors `MASK_KINDS`. */
const MASK_KINDS = ['rect', 'ellipse', 'path'] as const;

export function setMask(
  doc: TimelineDocument,
  target: string,
  mask: TimelineMaskInput | null,
  selectedClipIds: readonly string[] = []
) {
  const clip = resolveClip(doc.clips, target, selectedClipIds);
  if (mask === null) {
    return patchClipField(doc, clip, 'mask', undefined);
  }
  if (!(MASK_KINDS as readonly string[]).includes(mask.kind)) {
    throw new Error(
      `Unknown mask kind "${mask.kind}". Valid kinds: ${MASK_KINDS.join(', ')}.`
    );
  }
  // A kind's own fields only: a `width` stored on a path mask is a
  // `field_stripped` warning for a field that never meant anything.
  const built: ClipMask =
    mask.kind === 'path'
      ? {
          kind: 'path',
          d: mask.d ?? '',
          featherPx: mask.featherPx,
          invert: mask.invert,
        }
      : {
          kind: mask.kind,
          x: mask.x,
          y: mask.y,
          width: mask.width,
          height: mask.height,
          featherPx: mask.featherPx,
          invert: mask.invert,
        };
  if (built.kind === 'path' && built.d === '') {
    throw new Error('A "path" mask needs `d`: SVG path data in 0..1 space.');
  }
  return patchClipField(doc, clip, 'mask', pruned(built));
}

export function setMatte(
  doc: TimelineDocument,
  target: string,
  matte: TimelineMatteInput | null,
  selectedClipIds: readonly string[] = []
) {
  const clip = resolveClip(doc.clips, target, selectedClipIds);
  if (matte === null) {
    return patchClipField(doc, clip, 'matte', undefined);
  }
  const source = resolveClip(doc.clips, matte.source, selectedClipIds);
  if (source.id === clip.id) {
    throw new Error(
      `"${clip.name}" cannot be its own matte source — name another clip.`
    );
  }
  if (matte.mode !== 'alpha' && matte.mode !== 'luma') {
    throw new Error(
      `Unknown matte mode "${matte.mode}". Valid modes: alpha, luma.`
    );
  }
  const built: ClipMatte = {
    sourceClipId: source.id,
    mode: matte.mode,
    invert: matte.invert,
  };
  return patchClipField(doc, clip, 'matte', pruned(built));
}

/** Effect types this build applies. Mirrors `KNOWN_CLIP_EFFECT_TYPE_LIST`. */
const EFFECT_TYPES = [
  'color',
  'blur',
  'glow',
  'dropShadow',
  'vignette',
  'sharpen',
  'chromaKey',
  'curves',
  'levels',
  'liftGammaGain',
] as const;

const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const str = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;
const points = (
  value: unknown
): { x: number; y: number }[] | undefined =>
  Array.isArray(value)
    ? value.map((point) => {
        const record = point as { x?: unknown; y?: unknown };
        return { x: num(record?.x) ?? 0, y: num(record?.y) ?? 0 };
      })
    : undefined;
const triple = (value: unknown): [number, number, number] | undefined =>
  Array.isArray(value) && value.length === 3
    ? [num(value[0]) ?? 0, num(value[1]) ?? 0, num(value[2]) ?? 0]
    : undefined;

/**
 * The stored effect, narrowed to the fields its type reads, with each knob's
 * neutral value as the default — an effect named with nothing else set is
 * harmless rather than refused.
 */
function buildEffect(input: TimelineEffectInput, index: number): ClipEffect {
  const base = { id: `fx-${index + 1}`, enabled: true };
  switch (input.type) {
    case 'color':
      return {
        ...base,
        type: 'color',
        brightness: num(input.brightness),
        contrast: num(input.contrast),
        saturation: num(input.saturation),
        hue: num(input.hue),
        temperature: num(input.temperature),
        tint: num(input.tint),
        shadows: num(input.shadows),
        highlights: num(input.highlights),
      };
    case 'blur':
      return { ...base, type: 'blur', radius: num(input.radius) ?? 0 };
    case 'glow':
      return {
        ...base,
        type: 'glow',
        radius: num(input.radius) ?? 8,
        intensity: num(input.intensity) ?? 1,
        color: str(input.color),
      };
    case 'dropShadow':
      return {
        ...base,
        type: 'dropShadow',
        offsetX: num(input.offsetX) ?? 0,
        offsetY: num(input.offsetY) ?? 0,
        blur: num(input.blur) ?? num(input.radius) ?? 8,
        color: str(input.color) ?? '#000000',
        opacity: num(input.opacity),
      };
    case 'vignette':
      return {
        ...base,
        type: 'vignette',
        amount: num(input.amount) ?? 0.5,
        softness: num(input.softness) ?? 0.5,
      };
    case 'sharpen':
      return {
        ...base,
        type: 'sharpen',
        amount: num(input.amount) ?? 1,
        radius: num(input.radius),
      };
    case 'chromaKey':
      return {
        ...base,
        type: 'chromaKey',
        color: str(input.color) ?? '#00ff00',
        tolerance: num(input.tolerance) ?? 0.1,
        softness: num(input.softness) ?? 0.05,
        spill: num(input.spill),
      };
    case 'curves':
      return {
        ...base,
        type: 'curves',
        master: points(input.master) ?? [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
        r: points(input.r),
        g: points(input.g),
        b: points(input.b),
      };
    case 'levels':
      return {
        ...base,
        type: 'levels',
        inBlack: num(input.inBlack) ?? 0,
        inWhite: num(input.inWhite) ?? 1,
        gamma: num(input.gamma) ?? 1,
        outBlack: num(input.outBlack) ?? 0,
        outWhite: num(input.outWhite) ?? 1,
      };
    case 'liftGammaGain':
      return {
        ...base,
        type: 'liftGammaGain',
        lift: triple(input.lift) ?? [0, 0, 0],
        gamma: triple(input.gammaRgb) ?? [1, 1, 1],
        gain: triple(input.gain) ?? [1, 1, 1],
      };
    default:
      throw new Error(
        `Unknown effect type "${input.type}". Valid types: ${EFFECT_TYPES.join(', ')}.`
      );
  }
}

/** Replaces the whole chain: an empty list clears it. */
export function setEffects(
  doc: TimelineDocument,
  target: string,
  effects: TimelineEffectInput[],
  selectedClipIds: readonly string[] = []
) {
  const clip = resolveClip(doc.clips, target, selectedClipIds);
  const chain = effects.map((input, index) => pruned(buildEffect(input, index)));
  return patchClipField(
    doc,
    clip,
    'effects',
    chain.length === 0 ? undefined : chain
  );
}

/**
 * The stored remap, refusing the curves the sampler cannot read: it reads
 * keyframes in array order and never sorts, so a list that does not ascend
 * samples wrong instead of failing.
 */
function buildTimeRemap(input: TimelineTimeRemapInput): ClipTimeRemap {
  const kfs = input.keyframes ?? [];
  if (kfs.length < 2) {
    throw new Error(
      'timeRemap needs at least two keyframes — one is a freeze frame, not a curve.'
    );
  }
  const first = kfs[0]!;
  const last = kfs[kfs.length - 1]!;
  if (first.t !== 0 || last.t !== 1) {
    throw new Error(
      `timeRemap must span the clip: the first keyframe's t must be 0 and the last 1 (got ${first.t} and ${last.t}).`
    );
  }
  for (let i = 1; i < kfs.length; i++) {
    if (kfs[i]!.t <= kfs[i - 1]!.t) {
      throw new Error(
        `timeRemap keyframes must ascend in t — keyframe ${i} is at ${kfs[i]!.t}, after ${kfs[i - 1]!.t}.`
      );
    }
    if (kfs[i]!.sourceMs < 0) {
      throw new Error(
        `timeRemap sourceMs cannot be negative — keyframe ${i} is at ${kfs[i]!.sourceMs}.`
      );
    }
  }
  return {
    keyframes: kfs.map(({ t, sourceMs, easing }) =>
      easing === undefined ? { t, sourceMs } : { t, sourceMs, easing }
    ),
  };
}

export function setTimeRemap(
  doc: TimelineDocument,
  target: string,
  timeRemap: TimelineTimeRemapInput | null,
  selectedClipIds: readonly string[] = []
) {
  const clip = resolveClip(doc.clips, target, selectedClipIds);
  return patchClipField(
    doc,
    clip,
    'timeRemap',
    timeRemap === null ? undefined : buildTimeRemap(timeRemap)
  );
}

// ── Beats ───────────────────────────────────────────────────────────────────

/**
 * Lay a marker on every beat of a grid. Markers already on the sequence are
 * kept and a beat that already carries one is skipped, so re-running the same
 * grid changes nothing.
 */
export function setMarkersFromBeats(
  doc: TimelineDocument,
  input: TimelineBeatGridInput
): { doc: TimelineDocument; report: TimelineBeatMarkerReport } {
  const grid = buildBeatGrid({
    onsetsMs: input.onsetsMs,
    bpm: input.bpm,
    offsetMs: input.offsetMs,
    count: input.count,
  });
  const stem = (input.label ?? 'Beat').trim() || 'Beat';
  const taken = new Set(doc.markers.map((marker) => marker.timeMs));
  const added: TimelineDocument['markers'] = [];
  const skippedTimesMs: number[] = [];
  grid.forEach((timeMs, index) => {
    if (taken.has(timeMs)) {
      skippedTimesMs.push(timeMs);
      return;
    }
    taken.add(timeMs);
    added.push(
      pruned(makeMarker({ timeMs, label: `${stem} ${index + 1}` }))
    );
  });
  const markers = [...doc.markers, ...added];
  return {
    doc: { ...doc, markers },
    report: {
      grid: { count: grid.length, firstMs: grid[0], lastMs: grid[grid.length - 1] },
      added,
      skippedTimesMs,
      markers: markers.length,
    },
  };
}

/**
 * Put clip boundaries on a beat grid. A boundary further than the tolerance
 * from every beat is left where it is and reported with the reason, so the
 * caller reads the per-clip result rather than assuming everything moved.
 */
export function snapToBeats(
  doc: TimelineDocument,
  input: TimelineSnapToBeatsInput
): { doc: TimelineDocument; report: TimelineSnapReport } {
  const named =
    input.targets === undefined || input.targets === 'all'
      ? undefined
      : input.targets;

  const targeted: TimelineClip[] = [];
  const missing: string[] = [];
  if (named === undefined) {
    targeted.push(...doc.clips);
  } else {
    for (const ref of named) {
      try {
        targeted.push(resolveClip(doc.clips, ref, []));
      } catch {
        // A name nothing matched is a skip like any other: the caller has to
        // see it in the same list, not infer it from a shorter one.
        missing.push(ref);
      }
    }
  }

  const offsetMs = input.offsetMs ?? 0;
  // A tempo grid has to reach the last boundary being snapped, so its length
  // comes from the targets rather than from the caller.
  const reachMs = targeted.reduce(
    (end, clip) => Math.max(end, clip.startMs + clip.durationMs),
    0
  );
  const grid = buildBeatGrid({
    onsetsMs: input.onsetsMs,
    bpm: input.bpm,
    offsetMs: input.offsetMs,
    count:
      input.bpm === undefined
        ? undefined
        : beatCountToCover(input.bpm, offsetMs, reachMs),
  });

  const options: {
    toleranceMs?: number;
    mode?: SnapBoundaryMode;
    action?: SnapAction;
  } = {};
  if (input.toleranceMs !== undefined) {
    options.toleranceMs = input.toleranceMs;
  }
  if (input.mode !== undefined) {
    options.mode = input.mode;
  }
  if (input.action !== undefined) {
    options.action = input.action;
  }

  const result = snapClipsToGrid(
    targeted.map((clip) => ({
      id: clip.id,
      startMs: clip.startMs,
      durationMs: clip.durationMs,
    })),
    grid,
    options
  );

  const moved = new Map(
    result.clips
      .filter((entry) => entry.snapped)
      .map((entry) => [entry.clipId, entry.after])
  );
  const clips = doc.clips.map((clip) => {
    const after = moved.get(clip.id);
    return after
      ? { ...clip, startMs: after.startMs, durationMs: after.durationMs }
      : clip;
  });

  const byId = new Map(targeted.map((clip) => [clip.id, clip]));
  const reported: TimelineSnapReport['clips'] = result.clips.map((entry) => ({
    ...entry,
    clipName: byId.get(entry.clipId)?.name ?? null,
  }));
  for (const ref of missing) {
    reported.push({
      clipId: ref,
      clipName: null,
      snapped: false,
      before: { startMs: 0, endMs: 0, durationMs: 0 },
      after: { startMs: 0, endMs: 0, durationMs: 0 },
      delta: { startMs: 0, endMs: 0 },
      reason: `no clip matches "${ref}"`,
    });
  }

  return {
    doc: withClips(doc, clips),
    report: {
      grid: { count: grid.length, firstMs: grid[0], lastMs: grid[grid.length - 1] },
      toleranceMs: result.toleranceMs ?? DEFAULT_BEAT_TOLERANCE_MS,
      mode: result.mode,
      action: result.action,
      snapped: result.snapped,
      skipped: result.skipped + missing.length,
      clips: reported,
    },
  };
}
