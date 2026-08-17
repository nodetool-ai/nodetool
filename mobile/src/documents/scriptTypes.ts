/**
 * The agent-facing script contract on mobile.
 *
 * Ported from web's `scriptAgentBridge`, trimmed to what a phone should do:
 * text, structure, and cast. Voicing (TTS), subtitle export, and timeline
 * assembly are deliberately absent — voicing is N paid provider calls whose
 * progress a phone screen cannot supervise, which is the same line the
 * storyboard surface already draws around generation.
 *
 * Everything crossing the bridge is a plain serializable value, so the tool
 * layer never touches a Zustand handle.
 */

/**
 * The script document body — the wire shape of `scriptDocument` in
 * `@nodetool-ai/protocol/api-schemas/scripts`. Declared structurally because
 * that schema module is zod and is not re-exported from the package root, and
 * mobile has no zod. Same rationale as `storyboardTypes.ts`.
 */

/** A provider/model/voice selection. Mobile reads these through, never writes them. */
export interface VoiceBinding {
  provider: string;
  model: string;
  voice: string;
  settings?: Record<string, unknown>;
}

/** One word of a take's timing track. */
export interface ScriptTakeWord {
  word: string;
  startMs: number;
  endMs: number;
}

/**
 * One voiced rendering of a line: an audio asset plus the text and voice it was
 * voiced from. Those two snapshots are what make staleness derivable, so nothing
 * on this surface may drop them.
 */
export interface ScriptTake {
  id: string;
  assetId: string;
  durationMs: number;
  words: ScriptTakeWord[];
  textSnapshot: string;
  voiceSnapshot: VoiceBinding | null;
  createdAt: string;
  favorite?: boolean;
  costCredits?: number;
}

export interface ScriptSpeaker {
  id: string;
  name: string;
  color?: string;
  voice?: VoiceBinding | null;
}

export interface ScriptLine {
  id: string;
  speakerId?: string | null;
  text: string;
  direction?: string;
  pauseAfterMs?: number;
  voiceOverride?: VoiceBinding | null;
  takes: ScriptTake[];
  currentTakeId?: string | null;
}

export interface ScriptSection {
  id: string;
  title?: string;
  lines: ScriptLine[];
}

export interface ScriptDocument {
  cast: ScriptSpeaker[];
  sections: ScriptSection[];
}

// ── Agent-facing projections ────────────────────────────────────────────────

/** Whether a line's audio is missing, current, or behind its text. */
export type ScriptLineStatus = 'draft' | 'voiced' | 'stale';

/** Serializable view of one line the agent reads and edits. */
export interface ScriptLineNode {
  id: string;
  /** 0-based position across the whole document, counting every section. */
  index: number;
  sectionId: string;
  speakerId: string | null;
  speakerName: string | null;
  text: string;
  direction?: string;
  pauseAfterMs?: number;
  status: ScriptLineStatus;
  /** How many takes are recorded on the line. */
  takeCount: number;
}

/** Serializable view of a cast member. */
export interface ScriptSpeakerNode {
  id: string;
  name: string;
  color?: string;
  /** Whether a TTS voice is bound. Bindings are set on desktop, not here. */
  hasVoice: boolean;
}

/** Serializable view of a section: its own fields plus the lines it holds. */
export interface ScriptSectionNode {
  id: string;
  title?: string;
  lineIds: string[];
}

/** Snapshot of the open script the agent reads before deciding what to change. */
export interface ScriptSnapshot {
  scriptId: string;
  title: string;
  cast: ScriptSpeakerNode[];
  sections: ScriptSectionNode[];
  lines: ScriptLineNode[];
  selectedLineId: string | null;
}

/** Fields the agent can supply when adding a line. */
export interface ScriptAddLineInput {
  text: string;
  speakerId?: string;
  direction?: string;
  /** Section to add into; the last section when omitted. */
  sectionId?: string;
  /** 0-based position within that section; appended when omitted. */
  index?: number;
}

/** Fields the agent can patch on an existing line. */
export interface ScriptLinePatch {
  direction?: string;
  pauseAfterMs?: number;
}

/**
 * Operations the mounted ScriptEditorScreen exposes to the tool layer.
 *
 * Lines are addressed by id, 0-based document index as a string, or
 * `"selected"`. Speakers and sections by id or 0-based index as a string.
 */
export interface ScriptAgentHandler {
  getSnapshot: () => ScriptSnapshot;
  addSpeaker: (name: string, color?: string) => ScriptSpeakerNode;
  renameSpeaker: (target: string, name: string) => ScriptSpeakerNode;
  /** Removes the cast member and clears `speakerId` on every line that used it. */
  removeSpeaker: (target: string) => ScriptSpeakerNode;
  addSection: (title?: string, index?: number) => ScriptSectionNode;
  setSectionTitle: (target: string, title: string) => ScriptSectionNode;
  /** Removes the section and every line inside it. */
  removeSection: (target: string) => ScriptSectionNode;
  addLine: (input: ScriptAddLineInput) => ScriptLineNode;
  setLineText: (target: string, text: string) => ScriptLineNode;
  setLineSpeaker: (target: string, speakerId: string | null) => ScriptLineNode;
  patchLine: (target: string, patch: ScriptLinePatch) => ScriptLineNode;
  removeLine: (target: string) => ScriptLineNode;
  moveLine: (target: string, toIndex: number) => ScriptLineNode;
  selectLine: (target: string | null) => ScriptLineNode | null;
  /** Persist the script. Resolves with the server's new `updatedAt`. */
  save: () => Promise<{ ok: true; updatedAt: string | null }>;
}

// ── Derivations ─────────────────────────────────────────────────────────────

/**
 * Derive a line's voicing status. Not stored: the take carries the text it was
 * voiced from, so comparing the two is always right, while a stored flag drifts.
 *
 * Web also compares the take's voice snapshot against the line's effective
 * voice. Mobile cannot change a voice binding, so text is the only thing that
 * can go stale here.
 */
export function lineStatus(line: ScriptLine): ScriptLineStatus {
  const current = line.takes.find((take) => take.id === line.currentTakeId);
  if (!current) {
    return 'draft';
  }
  return current.textSnapshot === line.text ? 'voiced' : 'stale';
}

/** Project a stored line into the agent's view of it. */
export function lineToNode(
  line: ScriptLine,
  sectionId: string,
  index: number,
  cast: readonly ScriptSpeaker[]
): ScriptLineNode {
  const speaker = cast.find((member) => member.id === line.speakerId);
  return {
    id: line.id,
    index,
    sectionId,
    speakerId: line.speakerId ?? null,
    speakerName: speaker?.name ?? null,
    text: line.text,
    direction: line.direction,
    pauseAfterMs: line.pauseAfterMs,
    status: lineStatus(line),
    takeCount: line.takes.length,
  };
}

export function speakerToNode(speaker: ScriptSpeaker): ScriptSpeakerNode {
  return {
    id: speaker.id,
    name: speaker.name,
    color: speaker.color,
    hasVoice: speaker.voice !== null && speaker.voice !== undefined,
  };
}

export function sectionToNode(section: ScriptSection): ScriptSectionNode {
  return {
    id: section.id,
    title: section.title,
    lineIds: section.lines.map((line) => line.id),
  };
}

/** One line with everywhere it lives, so a caller can both read and splice it. */
interface FlatScriptLine {
  line: ScriptLine;
  sectionId: string;
  /** Position of the owning section in `doc.sections`. */
  sectionIndex: number;
  /** Position of the line within its section. */
  lineIndex: number;
  /** 0-based position across the whole document. */
  index: number;
}

/** Every line in document order, with its section and document index. */
export function flattenLines(doc: ScriptDocument): FlatScriptLine[] {
  const flat: FlatScriptLine[] = [];
  doc.sections.forEach((section, sectionIndex) => {
    section.lines.forEach((line, lineIndex) => {
      flat.push({
        line,
        sectionId: section.id,
        sectionIndex,
        lineIndex,
        index: flat.length,
      });
    });
  });
  return flat;
}

/**
 * Resolve an agent-supplied line address.
 *
 * Accepts a line id, a 0-based document index written as a string, or
 * `"selected"`. Throws naming the valid ids, because that message is the agent's
 * only way to recover from a bad guess.
 */
export function resolveLine(
  doc: ScriptDocument,
  target: string,
  selectedLineId: string | null
): FlatScriptLine {
  const flat = flattenLines(doc);
  const wanted = target === 'selected' ? selectedLineId : target;
  if (wanted === null || wanted === '') {
    throw new Error(
      'No line is selected. Pass a line id or a 0-based index instead of "selected".'
    );
  }

  const byId = flat.find((entry) => entry.line.id === wanted);
  if (byId) {
    return byId;
  }

  if (/^\d+$/.test(wanted)) {
    const byIndex = flat[Number(wanted)];
    if (byIndex) {
      return byIndex;
    }
  }

  const ids = flat.map((entry) => entry.line.id).join(', ');
  throw new Error(
    `No line matches "${target}". Use a line id, a 0-based index below ${flat.length}, or "selected". ` +
      (ids.length > 0 ? `Line ids: ${ids}.` : 'This script has no lines yet.')
  );
}

/** Resolve a speaker address (id or 0-based index) to a position in the cast. */
export function resolveSpeakerIndex(
  cast: readonly ScriptSpeaker[],
  target: string
): number {
  const byId = cast.findIndex((speaker) => speaker.id === target);
  if (byId >= 0) {
    return byId;
  }

  if (/^\d+$/.test(target) && Number(target) < cast.length) {
    return Number(target);
  }

  const ids = cast.map((speaker) => speaker.id).join(', ');
  throw new Error(
    `No cast member matches "${target}". Use a speaker id or a 0-based index below ${cast.length}. ` +
      (ids.length > 0 ? `Speaker ids: ${ids}.` : 'This script has no cast yet.')
  );
}

/** Resolve a section address (id or 0-based index) to a position in the script. */
export function resolveSectionIndex(
  sections: readonly ScriptSection[],
  target: string
): number {
  const byId = sections.findIndex((section) => section.id === target);
  if (byId >= 0) {
    return byId;
  }

  if (/^\d+$/.test(target) && Number(target) < sections.length) {
    return Number(target);
  }

  const ids = sections.map((section) => section.id).join(', ');
  throw new Error(
    `No section matches "${target}". Use a section id or a 0-based index below ${sections.length}. ` +
      (ids.length > 0 ? `Section ids: ${ids}.` : 'This script has no sections yet.')
  );
}

// ── Edits ───────────────────────────────────────────────────────────────────

/** What `applyLinePatch` can change. `speakerId: null` clears the speaker. */
export interface ScriptLineFields {
  text?: string;
  speakerId?: string | null;
  direction?: string;
  pauseAfterMs?: number;
}

/**
 * Apply a patch to one line, carrying `takes` and `currentTakeId` across
 * untouched.
 *
 * Every line edit on this surface goes through here. Takes are the line's
 * derived-audio history and `lineStatus` compares against their `textSnapshot`,
 * so dropping them on a text edit would both lose recorded audio and turn a
 * stale line back into a draft.
 */
export function applyLinePatch(
  line: ScriptLine,
  patch: ScriptLineFields
): ScriptLine {
  return {
    ...line,
    text: patch.text ?? line.text,
    speakerId: 'speakerId' in patch ? patch.speakerId : line.speakerId,
    direction: patch.direction ?? line.direction,
    pauseAfterMs: patch.pauseAfterMs ?? line.pauseAfterMs,
  };
}

/** Replace one line in place, addressed by the flattened entry that found it. */
export function replaceLine(
  doc: ScriptDocument,
  at: FlatScriptLine,
  next: ScriptLine
): ScriptDocument {
  return {
    ...doc,
    sections: doc.sections.map((section, sectionIndex) =>
      sectionIndex === at.sectionIndex
        ? {
            ...section,
            lines: section.lines.map((line, lineIndex) =>
              lineIndex === at.lineIndex ? next : line
            ),
          }
        : section
    ),
  };
}

/**
 * Drop a cast member and clear every line that pointed at it.
 *
 * Nothing in the schema enforces that `speakerId` names a real cast member, so
 * leaving the references behind would give lines a speaker the UI cannot draw
 * and the agent cannot resolve.
 */
export function withoutSpeaker(
  doc: ScriptDocument,
  speakerId: string
): ScriptDocument {
  return {
    cast: doc.cast.filter((speaker) => speaker.id !== speakerId),
    sections: doc.sections.map((section) => ({
      ...section,
      lines: section.lines.map((line) =>
        line.speakerId === speakerId ? { ...line, speakerId: null } : line
      ),
    })),
  };
}

/** Short ids, unique enough within one document. */
const newId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const newLineId = (): string => newId('line');
export const newSectionId = (): string => newId('section');
export const newSpeakerId = (): string => newId('speaker');

/** An empty line, ready to type into. */
export function emptyLine(text = '', speakerId?: string | null): ScriptLine {
  return {
    id: newLineId(),
    speakerId: speakerId ?? null,
    text,
    takes: [],
    currentTakeId: null,
  };
}

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);
