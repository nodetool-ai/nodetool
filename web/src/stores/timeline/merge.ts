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
 */
import type { DocumentOp } from "@nodetool-ai/protocol";
import type {
  DocumentMergeAdapter,
  MergeConflict,
  MergeResult
} from "../documentMerge";
import { mergeByUnits } from "../documentMerge";

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

export const timelineMergeAdapter: DocumentMergeAdapter<TimelineMergeDoc> = {
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
