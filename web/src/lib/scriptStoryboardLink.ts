/**
 * scriptStoryboardLink — the web side of the script ↔ storyboard link.
 *
 * The mappings themselves live in `@nodetool-ai/protocol/script-link`
 * (`extractScriptFromScreenplay`, `deriveShotScaffold`, `validateScriptLink`).
 * This module adapts them to the two web stores: a board keeps `screenplay` and
 * `shots` apart, so a screenplay handed to the protocol must carry the live
 * shots, and a `ScriptDraft` must be read as a script document.
 *
 * Nothing here touches the network — the hooks and the deletion downgrade own
 * that.
 */

import {
  extractScriptFromScreenplay,
  deriveShotScaffold,
  joinLineTexts,
  shotDialogueDrifted,
  validateScriptLink,
  NARRATOR_SPEAKER_ID,
  NARRATOR_SPEAKER_NAME,
  type Entity,
  type ExtractedScript,
  type Screenplay,
  type ScriptLinkDocument,
  type ScriptLinkValidation,
  type Shot
} from "@nodetool-ai/protocol";
import type { scripts } from "@nodetool-ai/protocol/api-schemas";
import type { StoryboardBoard } from "../stores/storyboard/StoryboardStore";
import type { ScriptDraft } from "../stores/script/ScriptStore";

/**
 * The board's screenplay carrying the shots the editor actually holds. The
 * store mutates `shots` and leaves `screenplay.shots` as the Director wrote it,
 * so every link read must go through here.
 */
export const liveScreenplay = (board: StoryboardBoard): Screenplay | null =>
  board.screenplay ? { ...board.screenplay, shots: board.shots } : null;

/** The script this board's words come from, or null when it is unlinked. */
export const linkedScriptId = (
  board: StoryboardBoard | undefined
): string | null => {
  const id = board?.screenplay?.script_id;
  return id ? id : null;
};

/** A stored script read as the document the link rules validate against. */
export const scriptLinkDocument = (script: ScriptDraft): ScriptLinkDocument => ({
  sections: script.sections.map((section) => ({
    id: section.id,
    title: section.title,
    lines: section.lines.map((line) => ({
      id: line.id,
      speakerId: line.speakerId ?? null,
      text: line.text,
      takes: []
    }))
  }))
});

/** Run the design's link invariants against a board and its linked script. */
export const boardLinkIssues = (
  board: StoryboardBoard,
  script: ScriptLinkDocument | null
): ScriptLinkValidation => {
  const screenplay = liveScreenplay(board);
  if (!screenplay) {
    return { errors: [], warnings: [] };
  }
  return validateScriptLink(screenplay, script);
};

/** One sentence per issue, for a banner or a thrown tool error. */
export const linkIssueMessages = (
  validation: ScriptLinkValidation
): string[] => [
  ...validation.errors.map((issue) => issue.message),
  ...validation.warnings.map((issue) => issue.message)
];

/** Extract a script document from a board, plus the shot → lines map. */
export const extractScriptFromBoard = (
  board: StoryboardBoard,
  entities: Entity[]
): ExtractedScript => {
  const screenplay = liveScreenplay(board);
  if (!screenplay) {
    throw new Error(
      "This storyboard has no screenplay yet — direct it before extracting a script."
    );
  }
  const hasWords = screenplay.shots.some(
    (shot) => shot.dialogue?.trim() || shot.narration?.trim()
  );
  if (!hasWords) {
    throw new Error(
      "No shot carries dialogue or narration — there is nothing to extract."
    );
  }
  return extractScriptFromScreenplay(screenplay, entities);
};

/**
 * Stamp the link onto a board's shots: the lines each covers and the text as
 * projected, so drift is comparable afterwards.
 */
export const linkedShots = (
  shots: Shot[],
  lineIdsByShotId: Record<string, string[]>,
  textByLineId: Map<string, string>
): Shot[] =>
  shots.map((shot) => {
    const lineIds = lineIdsByShotId[shot.id];
    if (!lineIds || lineIds.length === 0) {
      return shot;
    }
    return {
      ...shot,
      script_line_ids: lineIds,
      script_text_snapshot: joinLineTexts(
        lineIds.map((id) => textByLineId.get(id) ?? "")
      ),
      duration_source: shot.duration_source ?? "audio"
    };
  });

// ── Re-projection: script text → shot text ───────────────────────────────────
//
// The opposite direction from `extractScriptFromBoard`: once a script exists,
// its lines own the words (design §2.5). Re-project recomputes a shot's
// `dialogue`/`narration` *and* its `script_text_snapshot` from the lines it
// links, so the writer's edit reaches the board instead of being overwritten
// by it.

/** The script side of a re-projection: every line by id, plus the cast. */
export interface ScriptProjectionSource {
  linesById: Map<string, scripts.ScriptLine>;
  cast: scripts.Speaker[];
}

/** Read a script document as the source a re-projection reads lines from. */
export const projectionSource = (
  document: scripts.ScriptDocumentSchema
): ScriptProjectionSource => ({
  linesById: new Map(
    document.sections.flatMap((section) =>
      section.lines.map((line) => [line.id, line] as const)
    )
  ),
  cast: document.cast
});

/** The same source read from the live editor draft rather than the server copy. */
export const draftProjectionSource = (
  draft: ScriptDraft
): ScriptProjectionSource => ({
  linesById: new Map(
    draft.sections.flatMap((section) =>
      section.lines.map((line) => [line.id, line] as const)
    )
  ),
  cast: draft.cast
});

/**
 * A line reads as narration when nothing casts it or its speaker is the
 * narrator — the same rule `deriveShotScaffold` applies, kept here because
 * the protocol does not export it.
 */
const isNarration = (
  line: scripts.ScriptLine,
  cast: scripts.Speaker[]
): boolean => {
  if (!line.speakerId || line.speakerId === NARRATOR_SPEAKER_ID) {
    return true;
  }
  const speaker = cast.find((entry) => entry.id === line.speakerId);
  return (
    speaker?.name.trim().toLowerCase() === NARRATOR_SPEAKER_NAME.toLowerCase()
  );
};

/** Ids of the shots whose linked lines now read differently from the snapshot. */
export const driftedShotIds = (
  shots: Shot[],
  linesById: Map<string, scripts.ScriptLine>
): string[] =>
  shots
    .filter((shot) => shotDialogueDrifted(shot, linesById))
    .map((shot) => shot.id);

/**
 * One shot re-projected from the script: dialogue and narration re-read from
 * the lines it links, and the snapshot they were read from. A line the source
 * does not carry contributes nothing, exactly as drift measures it. Returns
 * the SAME shot when it links no lines or nothing changed, so a re-projection
 * that has nothing to do writes nothing.
 */
export const reprojectShot = (
  shot: Shot,
  source: ScriptProjectionSource
): Shot => {
  const lineIds = shot.script_line_ids ?? [];
  if (lineIds.length === 0) {
    return shot;
  }
  const lines = lineIds
    .map((id) => source.linesById.get(id))
    .filter((line): line is scripts.ScriptLine => line !== undefined);
  const dialogue = joinLineTexts(
    lines.filter((line) => !isNarration(line, source.cast)).map((l) => l.text)
  );
  const narration = joinLineTexts(
    lines.filter((line) => isNarration(line, source.cast)).map((l) => l.text)
  );
  const snapshot = joinLineTexts(lines.map((line) => line.text));
  const next: Shot = { ...shot, script_text_snapshot: snapshot };
  if (dialogue) {
    next.dialogue = dialogue;
  } else {
    delete next.dialogue;
  }
  if (narration) {
    next.narration = narration;
  } else {
    delete next.narration;
  }
  const unchanged =
    next.script_text_snapshot === shot.script_text_snapshot &&
    next.dialogue === shot.dialogue &&
    next.narration === shot.narration;
  return unchanged ? shot : next;
};

/**
 * Every drifted shot re-projected. `shotIds`, when given, names the shots to
 * pass over instead — an explicit re-projection of a shot whose words were
 * edited on the board rather than in the script. Returns the SAME array when
 * no shot changed.
 */
export const reprojectedShots = (
  shots: Shot[],
  source: ScriptProjectionSource,
  shotIds?: string[]
): Shot[] => {
  const only = new Set(shotIds ?? driftedShotIds(shots, source.linesById));
  let changed = false;
  const next = shots.map((shot) => {
    if (!only.has(shot.id)) {
      return shot;
    }
    const projected = reprojectShot(shot, source);
    if (projected !== shot) {
      changed = true;
    }
    return projected;
  });
  return changed ? next : shots;
};

/** Every line of an extracted document, by id, for snapshot stamping. */
export const lineTextsById = (
  document: scripts.ScriptDocumentSchema
): Map<string, string> =>
  new Map(
    document.sections.flatMap((section) =>
      section.lines.map((line) => [line.id, line.text] as const)
    )
  );

/**
 * Drop the link from a board's shots while keeping the words. The projected
 * dialogue and narration are ordinary shot text once the script is gone.
 */
export const unlinkedShots = (shots: Shot[]): Shot[] => {
  const isLinked = (shot: Shot): boolean =>
    shot.script_line_ids !== undefined ||
    shot.script_text_snapshot !== undefined ||
    shot.duration_source !== undefined;
  if (!shots.some(isLinked)) {
    return shots;
  }
  return shots.map((shot) => {
    if (!isLinked(shot)) {
      return shot;
    }
    const {
      script_line_ids: _lineIds,
      script_text_snapshot: _snapshot,
      duration_source: _source,
      ...rest
    } = shot;
    return rest;
  });
};

/** The same board's screenplay with its script reference dropped. */
export const unlinkedScreenplay = (
  screenplay: Screenplay | null
): Screenplay | null => {
  if (!screenplay || screenplay.script_id == null) {
    return screenplay;
  }
  const { script_id: _scriptId, ...rest } = screenplay;
  return rest;
};

/**
 * Re-extraction keeps what the script has recorded: a line that maps to the
 * same shot keeps its takes and performance notes, only its text is re-read
 * from the board. Lines whose shot is gone drop with it.
 */
export const mergeExtractedScript = (
  existing: scripts.ScriptDocumentSchema,
  extracted: scripts.ScriptDocumentSchema
): scripts.ScriptDocumentSchema => {
  const existingLines = new Map(
    existing.sections.flatMap((section) =>
      section.lines.map((line) => [line.id, line] as const)
    )
  );
  const existingSpeakers = new Map(existing.cast.map((s) => [s.id, s]));
  return {
    cast: extracted.cast.map((speaker) => {
      const prior = existingSpeakers.get(speaker.id);
      return prior?.voice ? { ...speaker, voice: prior.voice } : speaker;
    }),
    sections: extracted.sections.map((section) => ({
      ...section,
      lines: section.lines.map((line) => {
        const prior = existingLines.get(line.id);
        if (!prior) {
          return line;
        }
        return {
          ...line,
          direction: prior.direction,
          pauseAfterMs: prior.pauseAfterMs,
          voiceOverride: prior.voiceOverride ?? null,
          takes: prior.takes,
          currentTakeId: prior.currentTakeId ?? null
        };
      })
    }))
  };
};

/**
 * The deterministic half of derive: one shot per scaffold entry, linkage and
 * projected text pinned, `action` seeded from the words. Shot content — camera,
 * motion, slug — is the Director's job (headless tool, a parallel change).
 */
export const scaffoldShots = (
  script: ScriptDraft,
  generateId: () => string
): Shot[] => {
  const document = scriptLinkDocument(script);
  const textById = new Map(
    document.sections.flatMap((section) =>
      section.lines.map((line) => [line.id, line.text] as const)
    )
  );
  const scaffolds = deriveShotScaffold({
    id: script.id,
    cast: script.cast.map((speaker) => ({
      id: speaker.id,
      name: speaker.name,
      voice: speaker.voice ?? null
    })),
    sections: document.sections
  });
  return scaffolds.map((scaffold) => ({
    type: "shot" as const,
    id: generateId(),
    index: scaffold.index,
    action: scaffold.dialogue ?? scaffold.narration ?? "",
    status: "planned" as const,
    dialogue: scaffold.dialogue,
    narration: scaffold.narration,
    script_line_ids: scaffold.script_line_ids,
    script_text_snapshot: joinLineTexts(
      scaffold.script_line_ids.map((id) => textById.get(id) ?? "")
    ),
    duration_source: "audio" as const
  }));
};
