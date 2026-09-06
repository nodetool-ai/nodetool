/**
 * shotDraft
 *
 * The Edit Shot dialog's draft: every field of the § 7.7.2 table row plus the
 * header row, held as flat strings while the creator types and turned back
 * into one `updateShot` patch on Save (PRD D11).
 *
 * Pure and side-effect free, so the save contract — which fields move, which
 * are dropped when cleared, when a linked shot pins its own duration — is
 * decided in one testable place rather than inside the dialog's callbacks.
 */

import type { Scene, Shot, ShotDurationSource } from "@nodetool-ai/protocol";

/** The dialog's editable state. Every value is a string so an empty field and
 * an unset field are the same thing to the form. */
export interface ShotDraft {
  /** Header row: the shot's own label. */
  slug: string;
  /** Header row: the scene the shot sits in; `null` is the implicit header. */
  sceneId: string | null;
  /** Header row: the scene's lighting note, pasted into every still prompt. */
  lighting: string;
  /** Description → `action`. */
  action: string;
  /** Dialogue → `dialogue`. */
  dialogue: string;
  /** ERT → `duration_seconds`, as typed. */
  durationSeconds: string;
  /** ERT → `duration_source`. */
  durationSource: ShotDurationSource | undefined;
  /** Size → `camera.framing`. */
  framing: string;
  /** Perspective → `camera.angle`. */
  angle: string;
  /** Movement → `camera.movement`. */
  movement: string;
  /** Equipment → `camera.equipment`. */
  equipment: string;
  /** Focal length → `camera.lens`. */
  lens: string;
  /** Notes → `notes`. */
  notes: string;
}

/** The draft a freshly opened dialog starts from. */
export const draftFromShot = (shot: Shot, scene: Scene | null): ShotDraft => ({
  slug: shot.slug ?? "",
  sceneId: shot.scene_id ?? null,
  lighting: scene?.lighting ?? "",
  action: shot.action ?? "",
  dialogue: shot.dialogue ?? "",
  durationSeconds:
    shot.duration_seconds != null ? String(shot.duration_seconds) : "",
  durationSource: shot.duration_source,
  framing: shot.camera?.framing ?? "",
  angle: shot.camera?.angle ?? "",
  movement: shot.camera?.movement ?? "",
  equipment: shot.camera?.equipment ?? "",
  lens: shot.camera?.lens ?? "",
  notes: shot.notes ?? ""
});

/** Whether the creator has changed anything since the dialog opened. */
export const isDraftDirty = (draft: ShotDraft, original: ShotDraft): boolean =>
  (Object.keys(original) as (keyof ShotDraft)[]).some(
    (key) => draft[key] !== original[key]
  );

/** The header row's two fields; everything else belongs to the shot itself. */
const HEADER_KEYS: readonly (keyof ShotDraft)[] = ["sceneId", "lighting"];

/**
 * Whether the § 7.7.2 fields changed. `shotPatchFromDraft` builds a fresh
 * `camera` object every time, so a store write with an unchanged draft would
 * still read as a change and leave a phantom undo step behind `Regenerate`.
 */
export const hasShotFieldChanges = (
  draft: ShotDraft,
  original: ShotDraft
): boolean =>
  (Object.keys(original) as (keyof ShotDraft)[]).some(
    (key) => !HEADER_KEYS.includes(key) && draft[key] !== original[key]
  );

/** A typed length, or null when the field is empty or not a positive number. */
export const parseDuration = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return null;
  }
  const seconds = Number(trimmed);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
};

/** An empty select or text field means "unset", not "the empty string". */
const orUndefined = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
};

/**
 * The draft after the ERT cell is typed into.
 *
 * On a board whose script owns the words (PRD D9) a typed length pins the shot
 * to it, and clearing the cell hands timing back to the takes — the same pair
 * of writes the docked inspector made, kept together so the chip and the cell
 * cannot disagree.
 */
export const withDuration = (
  draft: ShotDraft,
  durationSeconds: string,
  linksLines: boolean
): ShotDraft => {
  if (!linksLines) {
    return { ...draft, durationSeconds };
  }
  return {
    ...draft,
    durationSeconds,
    durationSource: parseDuration(durationSeconds) != null ? "manual" : "audio"
  };
};

/**
 * The draft after the `from takes` / `pinned` chip is clicked. Unpinning leaves
 * the typed value in place but stops it being read: `effectiveShotDuration`
 * takes an `audio` shot's length from the takes under it, so the takes'
 * duration comes back and the creator's number is still there to pin again.
 */
export const withDurationSourceToggled = (draft: ShotDraft): ShotDraft => ({
  ...draft,
  durationSource: draft.durationSource === "manual" ? "audio" : "manual"
});

/**
 * The one patch Save writes.
 *
 * `camera` is replaced wholesale rather than merged: the four direction
 * selects and equipment are the whole of `CameraDirection`, so a field cleared
 * here must not survive in the stored object. A camera with nothing left in it
 * is dropped entirely.
 */
export const shotPatchFromDraft = (draft: ShotDraft): Partial<Shot> => {
  const camera = {
    framing: orUndefined(draft.framing),
    angle: orUndefined(draft.angle),
    movement: orUndefined(draft.movement),
    equipment: orUndefined(draft.equipment),
    lens: orUndefined(draft.lens)
  };
  const hasCamera = Object.values(camera).some((v) => v !== undefined);
  const seconds = parseDuration(draft.durationSeconds);

  return {
    slug: orUndefined(draft.slug),
    action: draft.action.trim(),
    dialogue: orUndefined(draft.dialogue),
    notes: orUndefined(draft.notes),
    duration_seconds: seconds ?? undefined,
    duration_source: draft.durationSource,
    camera: hasCamera ? camera : undefined
  };
};

/** The shot as Save leaves it, for a `Regenerate` that renders saved values. */
export const savedShot = (shot: Shot, patch: Partial<Shot>): Shot => ({
  ...shot,
  ...patch
});
