/**
 * Timeline merge adapter
 *
 * Teaches the generic per-unit merge engine about a timeline sequence:
 * `tracks[]`, `clips[]`, `markers[]` and `transcript[]` by id are the merge
 * units; fps/width/height and `scriptEnabled` are last-write-wins scalars.
 *
 * After the unit merge a clip whose `trackId` names a track the draft deleted
 * is dangling: it is dropped and listed as a conflict rather than saved in a
 * state the renderer cannot draw.
 *
 * {@link adoptGeneratedClipField} is the second pass a server route's own
 * write needs: the engine merges a clip atomically, so a matte or a baked
 * curve generated onto a clip the user renamed meanwhile is refused whole.
 */
import type { DocumentOp } from "@nodetool-ai/protocol";
import type {
  DocumentMergeAdapter,
  MergeConflict,
  MergeResult
} from "../documentMerge";
import { mergeByUnits, structuralEqual } from "../documentMerge";

/** The slice of the store's document state the engine merges. */
export interface TimelineMergeDoc {
  tracks: unknown[];
  clips: unknown[];
  markers: unknown[];
  transcript: unknown[];
  scriptEnabled: boolean;
  fps: number;
  width: number;
  height: number;
}

interface ClipLike {
  id: string;
  trackId: string;
  name?: string;
}

const asClip = (clip: unknown): ClipLike => clip as ClipLike;

const collectionOf = <T>(
  kind: string,
  field: keyof TimelineMergeDoc,
  idOf: (unit: T) => string,
  labelOf?: (unit: T) => string
) => ({
  kind,
  read: (doc: TimelineMergeDoc) => doc[field] as unknown[],
  write: (doc: TimelineMergeDoc, units: unknown[]): TimelineMergeDoc =>
    ({ ...doc, [field]: units }) as TimelineMergeDoc,
  unitId: idOf as (unit: unknown) => string,
  unitLabel: (labelOf ?? ((unit: T) => String(idOf(unit)))) as (
    unit: unknown
  ) => string
});

type TimelineUnitKind = "track" | "clip" | "marker" | "transcript";

const ALL_UNIT_KINDS: readonly TimelineUnitKind[] = [
  "track",
  "clip",
  "marker",
  "transcript"
];

/** Id keys whose value names a unit of a fixed kind, whatever the verb is. */
const KEYED_UNIT_KINDS: Record<string, TimelineUnitKind> = {
  clip_id: "clip",
  clipId: "clip",
  track_id: "track",
  trackId: "track",
  marker_id: "marker"
};

/** Id keys whose value names a unit of the op's own kind. */
const OWN_KIND_KEYS = ["id", "target"] as const;

/**
 * Which collection an op's own `id`/`target` addresses, read off its verb.
 * Null when the verb names none of them, which is the only case that has to
 * fall back to "every kind".
 */
function opUnitKind(tool: string): TimelineUnitKind | null {
  const name = tool.replace(/^ui_timeline_/, "");
  if (name.includes("track")) return "track";
  if (name.includes("marker")) return "marker";
  if (name.includes("transcript")) return "transcript";
  if (name.includes("clip")) return "clip";
  return null;
}

/** Every string an op input holds under `key`, one value or a list. */
function idsUnder(input: Record<string, unknown>, key: string): string[] {
  const value = input[key];
  if (typeof value === "string" && value.length > 0) return [value];
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === "string" && item.length > 0
  );
}

/**
 * Which units one external op touched. Only the explicit id keys — a string
 * under `provider` or `overrides` is not a clip id.
 *
 * An op that names no id creates something rather than editing something, so
 * it touches only its own kind (`add_track` cannot contest a clip). The
 * capability stamps the created id back into the op input before broadcasting
 * it, so in practice even an add attributes to one unit.
 */
export const timelineUnitsTouchedByOp = (
  op: DocumentOp
): { kind: string; unitId?: string }[] => {
  const input = (op.input ?? {}) as Record<string, unknown>;
  const ownKind = opUnitKind(op.tool);
  const hits: { kind: string; unitId?: string }[] = [];

  for (const [key, kind] of Object.entries(KEYED_UNIT_KINDS)) {
    for (const unitId of idsUnder(input, key)) hits.push({ kind, unitId });
  }
  for (const key of OWN_KIND_KEYS) {
    for (const unitId of idsUnder(input, key)) {
      for (const kind of ownKind ? [ownKind] : ALL_UNIT_KINDS) {
        hits.push({ kind, unitId });
      }
    }
  }
  if (hits.length > 0) return hits;

  // No id at all: the whole kind is in play, but no other kind is.
  return (ownKind ? [ownKind] : ALL_UNIT_KINDS).map((kind) => ({ kind }));
};

const timelineMergeAdapter: DocumentMergeAdapter<TimelineMergeDoc> = {
  collections: [
    collectionOf("track", "tracks", (t) => (t as { id: string }).id),
    collectionOf(
      "clip",
      "clips",
      (c) => (c as { id: string }).id,
      (c) => (c as { name?: string }).name || (c as { id: string }).id
    ),
    collectionOf("marker", "markers", (m) => (m as { id: string }).id),
    collectionOf("transcript", "transcript", (l) => (l as { id: string }).id)
  ],
  scalars: [
    {
      name: "fps",
      read: (doc) => doc.fps,
      write: (doc, v) => ({ ...doc, fps: v as number })
    },
    {
      name: "width",
      read: (doc) => doc.width,
      write: (doc, v) => ({ ...doc, width: v as number })
    },
    {
      name: "height",
      read: (doc) => doc.height,
      write: (doc, v) => ({ ...doc, height: v as number })
    },
    {
      name: "scriptEnabled",
      read: (doc) => doc.scriptEnabled,
      write: (doc, v) => ({ ...doc, scriptEnabled: Boolean(v) })
    }
  ],
  unitsTouchedByOp: timelineUnitsTouchedByOp
};

/**
 * Merge one external sequence write into the dirty draft, then drop clips
 * whose track no longer exists in the merged result.
 */
export function mergeTimelineDocuments(
  base: TimelineMergeDoc,
  draft: TimelineMergeDoc,
  server: TimelineMergeDoc,
  ops?: DocumentOp[]
): MergeResult<TimelineMergeDoc> {
  const result = mergeByUnits(base, draft, server, timelineMergeAdapter, {
    ops
  });

  const trackIds = new Set(
    result.doc.tracks.map((t) => asClip(t as unknown).id || (t as { id: string }).id)
  );
  const clips = result.doc.clips.map(asClip);
  const dangling = clips.filter((clip) => !trackIds.has(clip.trackId));
  if (dangling.length === 0) return result;

  const dropped = new Set(dangling.map((clip) => clip.id));
  const conflicts: MergeConflict[] = [
    ...result.conflicts.filter(
      (conflict) =>
        !(
          conflict.unit.kind === "clip" &&
          dropped.has(conflict.unit.id) &&
          conflict.reason === "deleted"
        )
    ),
    ...dangling.map((clip): MergeConflict => ({
      unit: { kind: "clip", id: clip.id, label: clip.name || clip.id },
      external: null,
      draft: clip,
      reason: "dangling"
    }))
  ];
  return {
    doc: {
      ...result.doc,
      clips: clips.filter((c) => !dropped.has(c.id))
    },
    nextBase: result.nextBase,
    conflicts
  };
}

// ── Field-scoped adoption of one generated clip field ──────────────────────

/** The conflict-banner key for one open sequence. */
export const timelineConflictKey = (sequenceId: string): string =>
  `timelinesequence:${sequenceId}`;

/**
 * One field a server route generates onto a clip: the `generatedMatte` an
 * isolate run cuts, or the single animation an audio bake owns (`bakedFrom`
 * kind + driven property).
 */
export interface GeneratedClipField<TClip> {
  /** What the field holds on one clip; `undefined` when it holds nothing. */
  valueOf(clip: TClip): unknown;
  /** `target` with the value `source` carries in this field written onto it. */
  overlay(target: TClip, source: TClip): TClip;
}

export interface GeneratedFieldAdoption {
  doc: TimelineMergeDoc;
  nextBase: TimelineMergeDoc;
  /** Every refusal still to surface: the merge's, minus the ones adopted. */
  conflicts: MergeConflict[];
  /** The generated values the draft refused. A subset of `conflicts`. */
  pending: MergeConflict[];
}

/** The clip shape this pass needs: an id, and a name for the banner label. */
interface AdoptableClip {
  id: string;
  name?: string;
}

const clipsById = <TClip extends AdoptableClip>(
  doc: TimelineMergeDoc
): Map<string, TClip> =>
  new Map((doc.clips as TClip[]).map((clip) => [clip.id, clip]));

/**
 * Merge the field a server route generated separately from the rest of the
 * clip it sits on.
 *
 * The unit merge is atomic: a clip the user renamed while the route ran
 * differs from base on the draft side and differs from base on the server
 * side (its new matte, its new curve), so the draft wins whole and the
 * generated value comes back as a conflict — dropped, in the version of this
 * that had no second pass, leaving the inspector spinning on a placeholder
 * the next autosave then wrote over the finished result.
 *
 * So for each clip the route wrote:
 *
 *  - the draft left this field as the base had it → the two sides edited
 *    different parts of one clip, which is not a contest: keep the draft's
 *    clip and overlay the server's value, drop the conflict, and roll this
 *    clip's next base to the server's copy, which is what it now holds;
 *  - the draft changed this field too (cleared the matte, edited the baked
 *    curve) → a genuine contest. The draft stands, the server's clip is
 *    returned in `pending` for the banner to offer, and the next base keeps
 *    the base it had so the offer stays reachable (`MergeResult.nextBase`).
 *
 * A clip the route did not actually change in this field is left exactly as
 * the unit merge resolved it.
 */
export function adoptGeneratedClipField<TClip extends AdoptableClip>(
  merged: MergeResult<TimelineMergeDoc>,
  sides: {
    base: TimelineMergeDoc;
    draft: TimelineMergeDoc;
    server: TimelineMergeDoc;
  },
  clipIds: readonly string[],
  field: GeneratedClipField<TClip>
): GeneratedFieldAdoption {
  const baseClips = clipsById<TClip>(sides.base);
  const draftClips = clipsById<TClip>(sides.draft);
  const serverClips = clipsById<TClip>(sides.server);
  const mergedClips = merged.doc.clips as TClip[];

  /** Clip id → the clip that replaces the merged one. */
  const adopted = new Map<string, TClip>();
  /** Clip id → the clip that replaces the merged next base. */
  const rebased = new Map<string, TClip>();
  const resolved = new Set<string>();
  const pending: MergeConflict[] = [];

  for (const clipId of new Set(clipIds)) {
    const serverClip = serverClips.get(clipId);
    const draftClip = draftClips.get(clipId);
    const baseClip = baseClips.get(clipId);
    // Nothing to adopt: the route wrote no clip by this id, the draft deleted
    // it (the deletion stands), or it was created after the document was sent.
    if (!serverClip || !draftClip || !baseClip) continue;

    const generated = field.valueOf(serverClip);
    // The route did not move this field, so there is no generated value to
    // hand over and no reason to disturb what the unit merge decided.
    if (structuralEqual(field.valueOf(baseClip), generated)) continue;

    const target =
      mergedClips.find((clip) => clip.id === clipId) ?? draftClip;

    if (structuralEqual(field.valueOf(draftClip), field.valueOf(baseClip))) {
      adopted.set(clipId, field.overlay(target, serverClip));
      rebased.set(clipId, serverClip);
      resolved.add(clipId);
      continue;
    }

    rebased.set(clipId, baseClip);
    pending.push(
      merged.conflicts.find(
        (conflict) =>
          conflict.unit.kind === "clip" && conflict.unit.id === clipId
      ) ?? {
        unit: {
          kind: "clip",
          id: clipId,
          label: draftClip.name || clipId
        },
        external: serverClip,
        draft: target,
        reason: "edited"
      }
    );
  }

  const conflicts = merged.conflicts.filter(
    (conflict) =>
      !(conflict.unit.kind === "clip" && resolved.has(conflict.unit.id))
  );
  for (const conflict of pending) {
    if (!conflicts.includes(conflict)) conflicts.push(conflict);
  }

  return {
    doc:
      adopted.size === 0
        ? merged.doc
        : {
            ...merged.doc,
            clips: mergedClips.map((clip) => adopted.get(clip.id) ?? clip)
          },
    nextBase:
      rebased.size === 0
        ? merged.nextBase
        : {
            ...merged.nextBase,
            clips: (merged.nextBase.clips as TClip[]).map(
              (clip) => rebased.get(clip.id) ?? clip
            )
          },
    conflicts,
    pending
  };
}
