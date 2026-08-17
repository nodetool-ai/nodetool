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
  DEFAULT_SHAPE_FILL_COLOR,
  DEFAULT_SHAPE_STROKE_COLOR,
  DEFAULT_SHAPE_STROKE_WIDTH_PX,
  DEFAULT_TEXT_CLIP_COLOR,
  DEFAULT_TEXT_CLIP_DURATION_MS,
  DEFAULT_TEXT_CLIP_FONT_SIZE_PX,
  createTimeOrderedUuid,
  makeClip,
  makeMarker,
  makeTrack,
  splitClip as engineSplitClip,
  trimClip as engineTrimClip,
  type BlendMode,
  type ClipShapeStyle,
  type ClipTextStyle,
  type TimelineClip,
  type TimelineTrack,
} from '@nodetool-ai/timeline';

import {
  resolveClip,
  resolveTrack,
  type TimelineAddMarkerInput,
  type TimelineAddShapeClipInput,
  type TimelineAddTextClipInput,
  type TimelineClipParamsPatch,
  type TimelineDocument,
  type TimelineMovePatch,
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

  const affected = new Set(clip.linkId === undefined ? [] : [clip.linkId]);
  const remaining = doc.clips.filter((member) => member.id !== clip.id);
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
