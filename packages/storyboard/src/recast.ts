/**
 * Recast a storyboard onto a new cast.
 *
 * A director approves one board. A batch then wants the same board with a
 * different product, a different actor, a different location — and wants to pay
 * only for the frames that actually changed. `recastStoryboard` is that
 * mapping: it substitutes entities, rewrites the names they are referred to by,
 * and clears the takes whose prompt moved (design §3.1).
 *
 * Pure. The node, the agent capability and the editor call this same function,
 * so a recast made headlessly matches one made in the UI.
 */

import {
  entitiesForShot,
  injectEntities,
  keyframePrompt,
  clipPrompt,
  directClipPrompt,
  sceneForShot,
  sha256Hex,
  shotRenderMode
} from "@nodetool-ai/protocol";
import type { Entity, Screenplay, Shot } from "@nodetool-ai/protocol";
import type { StoryboardDocument } from "./document.js";

/** One incoming cast member, and the board entity it stands in for. */
export interface RecastCastEntry {
  entity: Entity;
  /** Board entity id or name. Absent means "infer from kind" (below). */
  replaces?: string;
}

export interface RecastInput {
  /** The template, as it is now. */
  document: StoryboardDocument;
  /**
   * The template board's row id, stamped as `templateId` on the copy. A
   * {@link StoryboardDocument} carries no id of its own, so the caller passes
   * the row's.
   */
  sourceId?: string | null;
  /** Entities on the source board, resolved. */
  boardEntities: Entity[];
  /** Incoming cast. Each replaces the board entity it targets. */
  cast: RecastCastEntry[];
  /** The copy a previous run made for this mapping, when reusing. */
  existing?: StoryboardDocument;
}

export interface RecastResult {
  /** New or re-derived copy, lineage stamped. */
  document: StoryboardDocument;
  substitutions: Array<{ from: Entity; to: Entity }>;
  /** Entities appended to the cast because they replaced nothing. */
  appended: Entity[];
  /** Shots whose rendered prompt changed and lost their takes. */
  invalidatedShotIds: string[];
  /** Shots whose prompt is unchanged and kept keyframe/clip versions. */
  keptShotIds: string[];
  /** Shots the template no longer has; their takes on `existing` are gone. */
  droppedShotIds: string[];
  recastKey: string;
}

const trimmed = (value: string | undefined | null): string =>
  (value ?? "").trim();

const lower = (value: string | undefined | null): string =>
  trimmed(value).toLowerCase();

// ---------------------------------------------------------------------------
// Targeting
// ---------------------------------------------------------------------------

/**
 * Which board entity each cast entry stands in for.
 *
 * Two passes, so the answer does not depend on the order the cast arrives in:
 * every explicit `replaces` claims its target first, then a kind with exactly
 * one unclaimed board entity and exactly one un-targeted cast entry pairs up.
 * Anything else — two candidates, none, or two applicants for one seat — is an
 * append, and renames nothing.
 */
function resolveTargets(
  boardEntities: readonly Entity[],
  cast: readonly RecastCastEntry[]
): { substitutions: Array<{ from: Entity; to: Entity }>; appended: Entity[] } {
  const claimed = new Set<string>();
  const targetOf = new Map<RecastCastEntry, Entity>();

  for (const entry of cast) {
    const wanted = trimmed(entry.replaces);
    if (!wanted) continue;
    const match =
      boardEntities.find((e) => e.id === wanted) ??
      boardEntities.find((e) => lower(e.name) === wanted.toLowerCase());
    if (!match || claimed.has(match.id)) continue;
    claimed.add(match.id);
    targetOf.set(entry, match);
  }

  const implicit = cast.filter(
    (entry) => !targetOf.has(entry) && !trimmed(entry.replaces)
  );
  const kinds = new Set(implicit.map((entry) => entry.entity.kind));
  for (const kind of kinds) {
    const seats = boardEntities.filter(
      (e) => e.kind === kind && !claimed.has(e.id)
    );
    const applicants = implicit.filter((entry) => entry.entity.kind === kind);
    if (seats.length !== 1 || applicants.length !== 1) continue;
    claimed.add(seats[0].id);
    targetOf.set(applicants[0], seats[0]);
  }

  const substitutions: Array<{ from: Entity; to: Entity }> = [];
  const appended: Entity[] = [];
  for (const entry of cast) {
    const target = targetOf.get(entry);
    if (target) {
      substitutions.push({ from: target, to: entry.entity });
    } else {
      appended.push(entry.entity);
    }
  }
  return { substitutions, appended };
}

/**
 * The mapping, canonically: `<source>><dest>` per substitution, `+<dest>` per
 * append, sorted and joined. Input order does not matter, role assignment does,
 * so A→X,B→Y and A→Y,B→X are two keys and therefore two copies.
 */
export function recastKeyFor(
  substitutions: ReadonlyArray<{ from: Entity; to: Entity }>,
  appended: readonly Entity[]
): string {
  return [
    ...substitutions.map((s) => `${s.from.id}>${s.to.id}`),
    ...appended.map((e) => `+${e.id}`)
  ]
    .sort()
    .join(",");
}

// ---------------------------------------------------------------------------
// Renaming
// ---------------------------------------------------------------------------

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A whole-word, case-insensitive replacer for every renamed entity at once.
 *
 * One pass with alternation, longest name first, so a chain (A→B, B→C) cannot
 * carry A all the way to C. The boundaries are lookarounds rather than `\b`:
 * `\b` is defined against ASCII word characters, so it neither holds for a name
 * that ends in an accent nor stops "Nova" from matching inside "Novak" when the
 * name itself ends in punctuation. Null when nothing is renamed.
 */
function buildRenamer(
  renames: ReadonlyMap<string, string>
): ((text: string) => string) | null {
  const names = [...renames.keys()].sort((a, b) => b.length - a.length);
  if (names.length === 0) return null;
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}_])(${names.map(escapeRegExp).join("|")})(?![\\p{L}\\p{N}_])`,
    "giu"
  );
  return (text: string) =>
    text.replace(pattern, (match) => renames.get(match.toLowerCase()) ?? match);
}

const renameField = (
  value: string | undefined,
  rename: ((text: string) => string) | null
): string | undefined =>
  value === undefined || rename === null ? value : rename(value);

const remapIds = (
  ids: readonly string[] | undefined,
  idMap: ReadonlyMap<string, string>,
  append: readonly string[] = []
): string[] | undefined => {
  if (ids === undefined) return undefined;
  const out: string[] = [];
  for (const id of [...ids, ...append]) {
    const mapped = idMap.get(id) ?? id;
    if (!out.includes(mapped)) out.push(mapped);
  }
  return out;
};

/** The template shot as it reads for the new cast: names rewritten, ids remapped. */
function deriveShot(
  shot: Shot,
  rename: ((text: string) => string) | null,
  idMap: ReadonlyMap<string, string>
): Shot {
  const next: Shot = {
    ...shot,
    action: renameField(shot.action, rename) ?? shot.action
  };
  const slug = renameField(shot.slug, rename);
  if (slug !== undefined) next.slug = slug;
  const motion = renameField(shot.motion, rename);
  if (motion !== undefined) next.motion = motion;
  const dialogue = renameField(shot.dialogue, rename);
  if (dialogue !== undefined) next.dialogue = dialogue;
  const narration = renameField(shot.narration, rename);
  if (narration !== undefined) next.narration = narration;
  const entityIds = remapIds(shot.entity_ids, idMap);
  if (entityIds !== undefined) next.entity_ids = entityIds;
  if (shot.location_id) {
    next.location_id = idMap.get(shot.location_id) ?? shot.location_id;
  }
  return next;
}

function deriveScreenplay(
  screenplay: Screenplay | null,
  shots: Shot[],
  rename: ((text: string) => string) | null,
  idMap: ReadonlyMap<string, string>,
  appendedIds: readonly string[]
): Screenplay | null {
  if (!screenplay) return null;
  const next: Screenplay = {
    ...screenplay,
    shots,
    title: renameField(screenplay.title, rename) ?? screenplay.title
  };
  const narration = renameField(screenplay.narration, rename);
  if (narration !== undefined) next.narration = narration;
  const logline = renameField(screenplay.logline, rename);
  if (logline !== undefined) next.logline = logline;
  const entityIds = remapIds(screenplay.entity_ids, idMap, appendedIds);
  if (entityIds !== undefined) next.entity_ids = entityIds;
  return next;
}

// ---------------------------------------------------------------------------
// Invalidation
// ---------------------------------------------------------------------------

/** The two prompts a shot renders from, hashed with the cast seasoned in. */
interface ShotPromptHashes {
  keyframe: string;
  clip: string;
}

const injectedPrompt = (
  prompt: string,
  shot: Shot,
  entities: readonly Entity[]
): string => {
  const applied = entitiesForShot(shot, [...entities]);
  return injectEntities(
    prompt,
    applied,
    applied.map((e) => e.id)
  ).prompt;
};

/**
 * What this shot would render from, on this board, with this cast.
 *
 * The composition is the render path's own (`keyframePrompt`, `clipPrompt`,
 * `directClipPrompt`) plus `injectEntities`, and the digest is `sha256Hex` —
 * the function that writes `RenderInputs.prompt_hash`. Recast compares two of
 * these against each other, never against a stored record: a descriptor is part
 * of what a model sees, and the stored hash does not cover it.
 */
function promptHashes(
  shot: Shot,
  doc: StoryboardDocument,
  entities: readonly Entity[]
): ShotPromptHashes {
  const context = {
    scene: sceneForShot(shot, doc.screenplay?.scenes),
    style: doc.style
  };
  return {
    keyframe: sha256Hex(
      injectedPrompt(keyframePrompt(shot, context), shot, entities)
    ),
    clip: sha256Hex(
      injectedPrompt(
        shotRenderMode(shot) === "direct"
          ? directClipPrompt(shot, context)
          : clipPrompt(shot),
        shot,
        entities
      )
    )
  };
}

/** The status a shot with these takes sits at. */
const statusFor = (shot: Shot): Shot["status"] => {
  if (shot.clip) return "rendered";
  if (shot.keyframe) return "keyframe_ready";
  return "planned";
};

/**
 * Carry the takes a shot is entitled to keep, and say whether any were dropped.
 *
 * `keyframe` moving takes the clip with it — a keyframe-mode clip animates the
 * still that no longer exists, and both prompts are built from `action`. `clip`
 * moving on its own (a `motion` edit) leaves the still alone.
 */
function applyInvalidation(
  shot: Shot,
  before: ShotPromptHashes,
  after: ShotPromptHashes
): { shot: Shot; invalidated: boolean } {
  const keyframeMoved = before.keyframe !== after.keyframe;
  const clipMoved = keyframeMoved || before.clip !== after.clip;
  if (!keyframeMoved && !clipMoved) {
    return { shot, invalidated: false };
  }
  const next: Shot = { ...shot };
  if (keyframeMoved) {
    delete next.keyframe;
    delete next.keyframe_versions;
  }
  if (clipMoved) {
    delete next.clip;
    delete next.clip_versions;
    delete next.covered_by;
  }
  next.status = statusFor(next);
  return { shot: next, invalidated: true };
}

/** The render state one shot carries: what a reused copy hands to its successor. */
const takesOf = (shot: Shot): Partial<Shot> => ({
  keyframe: shot.keyframe,
  keyframe_versions: shot.keyframe_versions,
  clip: shot.clip,
  clip_versions: shot.clip_versions,
  covered_by: shot.covered_by,
  status: shot.status
});

/** Apply `takes` to `shot`, dropping the keys the donor did not have. */
function withTakes(shot: Shot, takes: Partial<Shot>): Shot {
  const next: Shot = { ...shot };
  for (const key of [
    "keyframe",
    "keyframe_versions",
    "clip",
    "clip_versions",
    "covered_by"
  ] as const) {
    const value = takes[key];
    if (value === undefined || value === null) {
      delete next[key];
    } else {
      Object.assign(next, { [key]: value });
    }
  }
  next.status = takes.status ?? statusFor(next);
  return next;
}

// ---------------------------------------------------------------------------
// Recast
// ---------------------------------------------------------------------------

/**
 * Derive a copy of `document` for a new cast.
 *
 * With `existing` set the derivation still runs from the *current* template and
 * the *current* cast — there is no shortcut keyed on a fingerprint. The copy is
 * then merged onto the previous one by shot id, and the prompt-hash rule
 * decides which of the carried takes survive.
 *
 * One case is out of reach: a destination entity whose *descriptor* changed
 * between two reuses, under the same id and the same name, is not detected on
 * the reused copy. The comparison for a carried shot is against the prompt that
 * produced the takes it carries, and the previous run's descriptor is not among
 * this function's inputs. A fresh recast (no `existing`) does see it, because
 * there the comparison is against the template's own entities.
 */
export function recastStoryboard(input: RecastInput): RecastResult {
  const { document, boardEntities, cast, existing } = input;
  const { substitutions, appended } = resolveTargets(boardEntities, cast);

  const idMap = new Map(substitutions.map((s) => [s.from.id, s.to.id]));
  const renames = new Map<string, string>();
  for (const { from, to } of substitutions) {
    const oldName = trimmed(from.name);
    const newName = trimmed(to.name);
    if (oldName && newName && oldName.toLowerCase() !== newName.toLowerCase()) {
      renames.set(oldName.toLowerCase(), newName);
    }
  }
  const rename = buildRenamer(renames);

  const appendedIds = appended.map((e) => e.id);
  const entityIds = remapIds(document.entityIds ?? [], idMap, appendedIds) ?? [];
  const castEntities: Entity[] = [
    ...boardEntities.map((e) => {
      const replacement = substitutions.find((s) => s.from.id === e.id);
      return replacement ? replacement.to : e;
    }),
    ...appended
  ];

  const derived = document.shots.map((shot) => deriveShot(shot, rename, idMap));
  const copy: StoryboardDocument = {
    ...document,
    shots: derived,
    entityIds,
    screenplay: deriveScreenplay(
      document.screenplay,
      derived,
      rename,
      idMap,
      appendedIds
    ),
    templateId: input.sourceId ?? document.templateId ?? null,
    recastKey: recastKeyFor(substitutions, appended)
  };
  // The approved cut belongs to the board it was assembled for; a copy earns
  // its own. The row's `timeline_id` is a column, but a document that carried
  // one through passthrough must not take it along.
  delete (copy as { timeline_id?: unknown }).timeline_id;

  const existingDoc = existing ?? document;
  const existingById = new Map(
    (existing?.shots ?? []).map((shot) => [shot.id, shot])
  );
  const invalidatedShotIds: string[] = [];
  const keptShotIds: string[] = [];

  copy.shots = copy.shots.map((shot, index) => {
    const template = document.shots[index];
    const previous = existingById.get(shot.id);
    // What produced the takes this shot carries: the previous copy when there
    // is one, else the template the copy inherited them from.
    const carried = previous ? withTakes(shot, takesOf(previous)) : shot;
    const before = previous
      ? promptHashes(previous, existingDoc, castEntities)
      : promptHashes(template, document, boardEntities);
    const after = promptHashes(carried, copy, castEntities);
    const { shot: settled, invalidated } = applyInvalidation(
      carried,
      before,
      after
    );
    (invalidated ? invalidatedShotIds : keptShotIds).push(settled.id);
    return settled;
  });
  if (copy.screenplay) {
    copy.screenplay = { ...copy.screenplay, shots: copy.shots };
  }

  const liveIds = new Set(copy.shots.map((shot) => shot.id));
  const droppedShotIds = (existing?.shots ?? [])
    .map((shot) => shot.id)
    .filter((id) => !liveIds.has(id));

  return {
    document: copy,
    substitutions,
    appended,
    invalidatedShotIds,
    keptShotIds,
    droppedShotIds,
    recastKey: copy.recastKey ?? ""
  };
}
