/**
 * @nodetool-ai/protocol – Script ↔ storyboard link
 *
 * The two pre-production documents stay separate: the script owns words and
 * voice, the storyboard owns visuals and motion. What connects them is a set of
 * keys on the board — {@link Screenplay.script_id} and each shot's
 * {@link Shot.script_line_ids} — and the pure mappings in this module:
 *
 *   - {@link extractScriptFromScreenplay}: board → script document.
 *   - {@link deriveShotScaffold}: script → the linkage half of a board.
 *   - {@link validateScriptLink}: the invariants both directions must hold.
 *   - {@link shotDialogueDrifted} / {@link orphanedLineIds}: derived, never
 *     stored, like `needsVoicing` in `@nodetool-ai/timeline`.
 *
 * Protocol, because it maps between two protocol document shapes and must stay
 * dependency-free — the web editors, the agent tools, and the evals all read
 * these same answers.
 */

import { entitiesForShot, type Entity, type Screenplay, type Shot } from "./creative.js";
import type {
  ScriptDocumentSchema,
  ScriptLine,
  ScriptSection,
  Speaker
} from "./api-schemas/scripts.js";

/** Cast id of the voice that reads narration, minted by the extractor. */
export const NARRATOR_SPEAKER_ID = "speaker_narrator";

/** Display name of the narrator speaker. */
export const NARRATOR_SPEAKER_NAME = "Narrator";

/** Text of the linked lines as one block, the form a snapshot is stored in. */
export const joinLineTexts = (texts: string[]): string => texts.join("\n");

// ---------------------------------------------------------------------------
// Extract: screenplay → script document
// ---------------------------------------------------------------------------

/** What {@link extractScriptFromScreenplay} produces. */
export interface ExtractedScript {
  document: ScriptDocumentSchema;
  /** Ordered line ids per shot, ready to stamp onto `script_line_ids`. */
  lineIdsByShotId: Record<string, string[]>;
}

const dialogueLineId = (shotId: string): string => `line_${shotId}_dialogue`;
const narrationLineId = (shotId: string): string => `line_${shotId}_narration`;

const speakerIdForEntity = (entityId: string): string => `speaker_${entityId}`;

const nonEmpty = (value: string | undefined): string | undefined => {
  const text = value?.trim();
  return text ? text : undefined;
};

/**
 * The character entity that speaks a shot's dialogue: the first character in
 * the board's own {@link entitiesForShot} selection, so an extracted script
 * casts a shot exactly the way a render seasons it.
 */
function speakingEntity(shot: Shot, entities: Entity[]): Entity | undefined {
  return entitiesForShot(shot, entities).find(
    (entity) => entity.kind === "character"
  );
}

/**
 * A character's cast entry. `voice_id` seeds the voice selection; provider and
 * model stay empty for the cast panel (or Studio's curated lineup) to fill,
 * because the board never records which TTS provider a voice id belongs to.
 */
function speakerForEntity(entity: Entity): Speaker {
  const voiceId = nonEmpty(entity.voice_id ?? undefined);
  return {
    id: speakerIdForEntity(entity.id),
    name: entity.name,
    voice: voiceId ? { provider: "", model: "", voice: voiceId } : null
  };
}

function emptyLine(id: string, speakerId: string | null, text: string): ScriptLine {
  return { id, speakerId, text, takes: [] };
}

/**
 * Project a screenplay's words into a script document, deterministically and
 * without a model call: one section for the board, one line per shot dialogue
 * and one per shot narration, in `index` order.
 *
 * The returned `lineIdsByShotId` is what the caller stamps onto the shots in
 * the same save, so extraction and linking are one transaction.
 */
export function extractScriptFromScreenplay(
  screenplay: Screenplay,
  entities: Entity[]
): ExtractedScript {
  const shots = [...screenplay.shots].sort((a, b) => a.index - b.index);
  const lines: ScriptLine[] = [];
  const lineIdsByShotId: Record<string, string[]> = {};
  const cast: Speaker[] = [];
  const castIds = new Set<string>();

  const addSpeaker = (speaker: Speaker): void => {
    if (castIds.has(speaker.id)) {
      return;
    }
    castIds.add(speaker.id);
    cast.push(speaker);
  };

  for (const shot of shots) {
    const shotLineIds: string[] = [];
    const dialogue = nonEmpty(shot.dialogue);
    if (dialogue) {
      const entity = speakingEntity(shot, entities);
      if (entity) {
        addSpeaker(speakerForEntity(entity));
      }
      const id = dialogueLineId(shot.id);
      lines.push(
        emptyLine(id, entity ? speakerIdForEntity(entity.id) : null, dialogue)
      );
      shotLineIds.push(id);
    }
    const narration = nonEmpty(shot.narration);
    if (narration) {
      addSpeaker({
        id: NARRATOR_SPEAKER_ID,
        name: NARRATOR_SPEAKER_NAME,
        voice: null
      });
      const id = narrationLineId(shot.id);
      lines.push(emptyLine(id, NARRATOR_SPEAKER_ID, narration));
      shotLineIds.push(id);
    }
    if (shotLineIds.length > 0) {
      lineIdsByShotId[shot.id] = shotLineIds;
    }
  }

  const section: ScriptSection = {
    id: `section_${screenplay.id}`,
    title: screenplay.title,
    lines
  };
  return { document: { cast, sections: [section] }, lineIdsByShotId };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Why a link is broken. One code per rule in the design's invariant list. */
export type ScriptLinkIssueCode =
  | "duplicate_line_reference"
  | "unknown_line_reference"
  | "missing_script"
  | "unlinked_board_reference";

/** One finding. `severity` decides whether a save is refused or annotated. */
export interface ScriptLinkIssue {
  severity: "error" | "warning";
  code: ScriptLinkIssueCode;
  message: string;
  shotId?: string;
  lineId?: string;
}

export interface ScriptLinkValidation {
  errors: ScriptLinkIssue[];
  warnings: ScriptLinkIssue[];
}

/** Just the part of a script document the link rules read. */
export interface ScriptLinkDocument {
  sections: ScriptSection[];
}

/** Every line of a script in reading order. */
export const linkedScriptLines = (
  script: ScriptLinkDocument
): ScriptLine[] => script.sections.flatMap((section) => section.lines);

/**
 * Check a board against the script it links, per design §1.3. A missing script
 * (deleted, or not loadable) is a warning — the board still works, only the
 * link affordances go dead — while a reference that cannot be satisfied is an
 * error naming the shot that carries it.
 */
export function validateScriptLink(
  screenplay: Screenplay,
  scriptDoc: ScriptLinkDocument | null | undefined
): ScriptLinkValidation {
  const errors: ScriptLinkIssue[] = [];
  const warnings: ScriptLinkIssue[] = [];
  const linked = !!nonEmpty(screenplay.script_id ?? undefined);
  const knownLineIds = scriptDoc
    ? new Set(linkedScriptLines(scriptDoc).map((line) => line.id))
    : null;
  const ownerByLineId = new Map<string, string>();

  for (const shot of screenplay.shots) {
    const lineIds = shot.script_line_ids ?? [];
    if (lineIds.length > 0 && !linked) {
      errors.push({
        severity: "error",
        code: "unlinked_board_reference",
        shotId: shot.id,
        message: `Shot ${shot.id} references script lines, but the board has no \`script_id\`.`
      });
    }
    for (const lineId of lineIds) {
      const owner = ownerByLineId.get(lineId);
      if (owner === undefined) {
        ownerByLineId.set(lineId, shot.id);
      } else {
        errors.push({
          severity: "error",
          code: "duplicate_line_reference",
          shotId: shot.id,
          lineId,
          message: `Line ${lineId} is referenced by shot ${owner} and shot ${shot.id}; a line belongs to one shot.`
        });
      }
      if (knownLineIds && !knownLineIds.has(lineId)) {
        errors.push({
          severity: "error",
          code: "unknown_line_reference",
          shotId: shot.id,
          lineId,
          message: `Shot ${shot.id} references line ${lineId}, which the linked script does not have.`
        });
      }
    }
  }

  if (linked && !scriptDoc) {
    warnings.push({
      severity: "warning",
      code: "missing_script",
      message: `Linked script ${screenplay.script_id} was not found; the board keeps its text but link actions are unavailable.`
    });
  }
  return { errors, warnings };
}

// ---------------------------------------------------------------------------
// Derive: script → shot scaffold
// ---------------------------------------------------------------------------

/**
 * The linkage half of a shot: which lines it covers, in what order, and the
 * text projected from them. Shot *content* — action, camera, motion, slug,
 * entities — is the Director agent's job.
 */
export interface ShotScaffold {
  index: number;
  script_line_ids: string[];
  /** Joined text of the covered lines spoken by a cast member. */
  dialogue?: string;
  /** Joined text of the covered narrator lines. */
  narration?: string;
}

export interface DeriveShotScaffoldOptions {
  /** Lines one shot may cover. Default 1; a shot never spans two sections. */
  maxLinesPerShot?: number;
}

/** Just the part of a script {@link deriveShotScaffold} reads. */
export interface ScaffoldScript {
  id: string;
  cast: Speaker[];
  sections: ScriptSection[];
}

/**
 * A line reads as narration when nothing casts it or its speaker is the
 * narrator — the inverse of what {@link extractScriptFromScreenplay} writes, so
 * a board extracted from a script and derived back projects the same fields.
 */
function isNarrationLine(line: ScriptLine, cast: Speaker[]): boolean {
  if (!line.speakerId) {
    return true;
  }
  if (line.speakerId === NARRATOR_SPEAKER_ID) {
    return true;
  }
  const speaker = cast.find((entry) => entry.id === line.speakerId);
  return speaker?.name.trim().toLowerCase() === NARRATOR_SPEAKER_NAME.toLowerCase();
}

/**
 * Chunk a script's lines into shots: reading order, at most
 * `maxLinesPerShot` per shot, never crossing a section boundary. Lines with no
 * text are skipped — there is nothing for a shot to cover.
 */
export function deriveShotScaffold(
  script: ScaffoldScript,
  options: DeriveShotScaffoldOptions = {}
): ShotScaffold[] {
  const perShot = Math.max(1, Math.floor(options.maxLinesPerShot ?? 1));
  const scaffolds: ShotScaffold[] = [];

  for (const section of script.sections) {
    const lines = section.lines.filter((line) => !!nonEmpty(line.text));
    for (let start = 0; start < lines.length; start += perShot) {
      const group = lines.slice(start, start + perShot);
      const dialogue = group
        .filter((line) => !isNarrationLine(line, script.cast))
        .map((line) => line.text.trim());
      const narration = group
        .filter((line) => isNarrationLine(line, script.cast))
        .map((line) => line.text.trim());
      scaffolds.push({
        index: scaffolds.length,
        script_line_ids: group.map((line) => line.id),
        ...(dialogue.length > 0 ? { dialogue: joinLineTexts(dialogue) } : {}),
        ...(narration.length > 0 ? { narration: joinLineTexts(narration) } : {})
      });
    }
  }
  return scaffolds;
}

// ---------------------------------------------------------------------------
// Drift
// ---------------------------------------------------------------------------

/**
 * Whether the linked lines now read differently from what was last projected
 * into the shot. A line the map does not carry contributes nothing, so a
 * deleted line drifts the shot it belonged to.
 */
export function shotDialogueDrifted(
  shot: Shot,
  linesById: Map<string, ScriptLine>
): boolean {
  const lineIds = shot.script_line_ids ?? [];
  if (lineIds.length === 0) {
    return false;
  }
  const live = joinLineTexts(
    lineIds
      .map((id) => linesById.get(id)?.text)
      .filter((text): text is string => text !== undefined)
  );
  return live !== (shot.script_text_snapshot ?? "");
}

/**
 * Lines of the linked script that no shot covers, in reading order. Empty for
 * an unlinked board: without a `script_id` there is nothing to be orphaned
 * from.
 */
export function orphanedLineIds(
  screenplay: Screenplay,
  scriptDoc: ScriptLinkDocument
): string[] {
  if (!nonEmpty(screenplay.script_id ?? undefined)) {
    return [];
  }
  const covered = new Set(
    screenplay.shots.flatMap((shot) => shot.script_line_ids ?? [])
  );
  return linkedScriptLines(scriptDoc)
    .map((line) => line.id)
    .filter((id) => !covered.has(id));
}
