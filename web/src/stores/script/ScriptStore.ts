/**
 * ScriptStore
 *
 * Singleton Zustand store for the Script workspace surface. Like the
 * storyboard (and unlike the timeline's per-editor document store), every open
 * script lives in one `scripts` map keyed by ref id, so a script's cast + lines
 * survive tab switches without a provider wrapper.
 *
 * A script inverts the timeline transcript's ownership: text is the source of
 * truth, audio is derived. Each line is voiced into one or more takes (audio
 * assets with word timings); the current take is what "send to timeline" and
 * play-through use.
 *
 * Usage:
 *   const script = useScript(scriptId);            // reactive script view
 *   useScriptStore.getState().addLine(scriptId);   // mutate
 */

import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

// ── Types ────────────────────────────────────────────────────────────────────

export interface VoiceBinding {
  provider: string;
  model: string;
  voice: string;
  settings?: Record<string, unknown>;
}

export interface ScriptCaptionWord {
  word: string;
  startMs: number;
  endMs: number;
}

export interface ScriptTake {
  id: string;
  assetId: string;
  durationMs: number;
  words: ScriptCaptionWord[];
  textSnapshot: string;
  voiceSnapshot: VoiceBinding | null;
  createdAt: string;
  favorite?: boolean;
  costCredits?: number;
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

export interface ScriptSpeaker {
  id: string;
  name: string;
  color?: string;
  voice?: VoiceBinding | null;
}

export interface ScriptDraft {
  id: string;
  title: string;
  cast: ScriptSpeaker[];
  sections: ScriptSection[];
  /** Persisted timeline sequence this script was assembled into, if any. */
  timelineId: string | null;
  /** Epoch ms of the last mutation; drives the sidebar's recency sort. */
  updatedAt: number;
}

/**
 * Autosave lifecycle for one script, surfaced in the editor toolbar so the
 * silent server sync becomes visible:
 * - `saved`    — the store matches the server copy (also the idle state).
 * - `unsaved`  — edits landed and are waiting out the autosave debounce.
 * - `saving`   — a save is in flight.
 * - `error`    — the last save failed and will be retried.
 * - `reloaded` — a concurrent edit won a CAS conflict; the server copy replaced
 *   the local one.
 */
export type ScriptSaveStatus =
  | "saved"
  | "unsaved"
  | "saving"
  | "error"
  | "reloaded";

interface ScriptStoreState {
  scripts: Record<string, ScriptDraft>;
  /** Server `updated_at` token per script — the CAS base for the next save. */
  serverRevisions: Record<string, string>;
  /** Autosave status per script, driven by useScriptServerSync. */
  saveStatus: Record<string, ScriptSaveStatus>;
  /** Line ids currently generating a take — transient, not persisted. */
  voicingLineIds: Record<string, true>;

  setServerRevision: (scriptId: string, revision: string | null) => void;
  setSaveStatus: (scriptId: string, status: ScriptSaveStatus) => void;
  ensureScript: (id: string) => void;
  loadScript: (
    id: string,
    script: Omit<ScriptDraft, "id" | "updatedAt">
  ) => void;
  removeScript: (id: string) => void;
  getScript: (id: string) => ScriptDraft | undefined;

  setTitle: (scriptId: string, title: string) => void;
  setTimelineLink: (scriptId: string, timelineId: string | null) => void;

  // Cast
  addSpeaker: (scriptId: string, speaker: ScriptSpeaker) => void;
  updateSpeaker: (
    scriptId: string,
    speakerId: string,
    patch: Partial<Omit<ScriptSpeaker, "id">>
  ) => void;
  removeSpeaker: (scriptId: string, speakerId: string) => void;

  // Sections
  addSection: (scriptId: string, section?: Partial<ScriptSection>) => string;
  setSectionTitle: (
    scriptId: string,
    sectionId: string,
    title: string
  ) => void;
  removeSection: (scriptId: string, sectionId: string) => void;

  // Lines
  addLine: (scriptId: string, sectionId?: string) => string;
  insertLine: (scriptId: string, sectionId: string, index: number) => string;
  /**
   * Copy `lineId` (text, speaker, direction, pause, voice override) into a
   * fresh, unvoiced line placed directly after it in the same section. Takes
   * are intentionally dropped — a duplicate starts as a draft. Returns the new
   * line id, or null when the line is not found.
   */
  duplicateLine: (scriptId: string, lineId: string) => string | null;
  patchLine: (
    scriptId: string,
    lineId: string,
    patch: Partial<Omit<ScriptLine, "id" | "takes">>
  ) => void;
  removeLine: (scriptId: string, lineId: string) => void;
  reorderLines: (
    scriptId: string,
    sectionId: string,
    orderedLineIds: string[]
  ) => void;
  /**
   * Move `lineId` (from any section) so it lands directly before
   * `beforeLineId` in `targetSectionId`; a null `beforeLineId` appends to the
   * end. Positioning by neighbour id rather than a numeric index keeps the drop
   * stable regardless of the shift caused by removing the line first.
   */
  moveLine: (
    scriptId: string,
    lineId: string,
    targetSectionId: string,
    beforeLineId: string | null
  ) => void;

  // Takes
  appendTake: (scriptId: string, lineId: string, take: ScriptTake) => void;
  setCurrentTake: (
    scriptId: string,
    lineId: string,
    takeId: string | null
  ) => void;
  toggleTakeFavorite: (
    scriptId: string,
    lineId: string,
    takeId: string
  ) => void;
  removeTake: (scriptId: string, lineId: string, takeId: string) => void;

  // Transient voicing status
  setVoicing: (lineId: string, voicing: boolean) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

let counter = 0;
const uid = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}_${(counter++).toString(36)}`;

export const emptyScript = (id: string): ScriptDraft => ({
  id,
  title: "",
  cast: [],
  sections: [],
  timelineId: null,
  updatedAt: Date.now()
});

/**
 * Apply `mutate` to the script with `scriptId`. Returns the SAME state when the
 * script is absent or `mutate` returns `null`, so no-op edits don't churn
 * subscribers. Stamps `updatedAt` on every real mutation.
 */
const withScript = (
  state: ScriptStoreState,
  scriptId: string,
  mutate: (script: ScriptDraft) => ScriptDraft | null
): Partial<ScriptStoreState> | ScriptStoreState => {
  const script = state.scripts[scriptId];
  if (!script) return state;
  const next = mutate(script);
  if (!next || next === script) return state;
  return {
    scripts: {
      ...state.scripts,
      [scriptId]: { ...next, updatedAt: Date.now() }
    }
  };
};

/** Map every line in the script, returning the same script on a no-op. */
const mapLine = (
  script: ScriptDraft,
  lineId: string,
  fn: (line: ScriptLine) => ScriptLine
): ScriptDraft => {
  let changed = false;
  const sections = script.sections.map((section) => {
    let sectionChanged = false;
    const lines = section.lines.map((line) => {
      if (line.id !== lineId) return line;
      const next = fn(line);
      if (next !== line) sectionChanged = true;
      return next;
    });
    if (!sectionChanged) return section;
    changed = true;
    return { ...section, lines };
  });
  return changed ? { ...script, sections } : script;
};

// ── Store ────────────────────────────────────────────────────────────────────

export const useScriptStore = create<ScriptStoreState>((set, get) => ({
  scripts: {},
  serverRevisions: {},
  saveStatus: {},
  voicingLineIds: {},

  setServerRevision: (scriptId, revision) =>
    set((state) => {
      const serverRevisions = { ...state.serverRevisions };
      if (revision === null) delete serverRevisions[scriptId];
      else serverRevisions[scriptId] = revision;
      return { serverRevisions };
    }),

  setSaveStatus: (scriptId, status) =>
    set((state) =>
      state.saveStatus[scriptId] === status
        ? state
        : { saveStatus: { ...state.saveStatus, [scriptId]: status } }
    ),

  ensureScript: (id) =>
    set((state) =>
      state.scripts[id]
        ? state
        : { scripts: { ...state.scripts, [id]: emptyScript(id) } }
    ),

  loadScript: (id, script) =>
    set((state) => ({
      scripts: {
        ...state.scripts,
        [id]: { ...emptyScript(id), ...script, id, updatedAt: Date.now() }
      }
    })),

  removeScript: (id) =>
    set((state) => {
      if (!state.scripts[id]) return state;
      const scripts = { ...state.scripts };
      delete scripts[id];
      const serverRevisions = { ...state.serverRevisions };
      delete serverRevisions[id];
      const saveStatus = { ...state.saveStatus };
      delete saveStatus[id];
      return { scripts, serverRevisions, saveStatus };
    }),

  getScript: (id) => get().scripts[id],

  setTitle: (scriptId, title) =>
    set((state) =>
      withScript(state, scriptId, (s) =>
        s.title === title ? s : { ...s, title }
      )
    ),

  setTimelineLink: (scriptId, timelineId) =>
    set((state) =>
      withScript(state, scriptId, (s) =>
        s.timelineId === timelineId ? s : { ...s, timelineId }
      )
    ),

  addSpeaker: (scriptId, speaker) =>
    set((state) =>
      withScript(state, scriptId, (s) => ({
        ...s,
        cast: [...s.cast, speaker]
      }))
    ),

  updateSpeaker: (scriptId, speakerId, patch) =>
    set((state) =>
      withScript(state, scriptId, (s) => {
        const cast = s.cast.map((sp) =>
          sp.id === speakerId ? { ...sp, ...patch } : sp
        );
        return { ...s, cast };
      })
    ),

  removeSpeaker: (scriptId, speakerId) =>
    set((state) =>
      withScript(state, scriptId, (s) => {
        const cast = s.cast.filter((sp) => sp.id !== speakerId);
        if (cast.length === s.cast.length) return s;
        // Unassign the removed speaker from every line.
        const sections = s.sections.map((section) => ({
          ...section,
          lines: section.lines.map((line) =>
            line.speakerId === speakerId
              ? { ...line, speakerId: null }
              : line
          )
        }));
        return { ...s, cast, sections };
      })
    ),

  addSection: (scriptId, section) => {
    const id = section?.id ?? uid("sec");
    set((state) =>
      withScript(state, scriptId, (s) => ({
        ...s,
        sections: [
          ...s.sections,
          { id, title: section?.title, lines: section?.lines ?? [] }
        ]
      }))
    );
    return id;
  },

  setSectionTitle: (scriptId, sectionId, title) =>
    set((state) =>
      withScript(state, scriptId, (s) => ({
        ...s,
        sections: s.sections.map((section) =>
          section.id === sectionId ? { ...section, title } : section
        )
      }))
    ),

  removeSection: (scriptId, sectionId) =>
    set((state) =>
      withScript(state, scriptId, (s) => {
        const sections = s.sections.filter((sec) => sec.id !== sectionId);
        return sections.length === s.sections.length
          ? s
          : { ...s, sections };
      })
    ),

  addLine: (scriptId, sectionId) => {
    const lineId = uid("line");
    const newLine: ScriptLine = { id: lineId, text: "", takes: [] };
    set((state) =>
      withScript(state, scriptId, (s) => {
        // No target section (or none exist yet): append to the last section,
        // creating one when the script is empty.
        let sections = s.sections;
        if (sections.length === 0) {
          sections = [{ id: uid("sec"), lines: [newLine] }];
          return { ...s, sections };
        }
        const targetId = sectionId ?? sections[sections.length - 1].id;
        return {
          ...s,
          sections: sections.map((section) =>
            section.id === targetId
              ? { ...section, lines: [...section.lines, newLine] }
              : section
          )
        };
      })
    );
    return lineId;
  },

  insertLine: (scriptId, sectionId, index) => {
    const lineId = uid("line");
    const newLine: ScriptLine = { id: lineId, text: "", takes: [] };
    set((state) =>
      withScript(state, scriptId, (s) => ({
        ...s,
        sections: s.sections.map((section) => {
          if (section.id !== sectionId) return section;
          const lines = [...section.lines];
          const at = Math.max(0, Math.min(index, lines.length));
          lines.splice(at, 0, newLine);
          return { ...section, lines };
        })
      }))
    );
    return lineId;
  },

  duplicateLine: (scriptId, lineId) => {
    const newId = uid("line");
    let created = false;
    set((state) =>
      withScript(state, scriptId, (s) => {
        let done = false;
        const sections = s.sections.map((section) => {
          if (done) return section;
          const idx = section.lines.findIndex((l) => l.id === lineId);
          if (idx < 0) return section;
          const src = section.lines[idx];
          const clone: ScriptLine = {
            id: newId,
            text: src.text,
            speakerId: src.speakerId ?? null,
            direction: src.direction,
            pauseAfterMs: src.pauseAfterMs,
            voiceOverride: src.voiceOverride,
            takes: [],
            currentTakeId: null
          };
          const lines = [...section.lines];
          lines.splice(idx + 1, 0, clone);
          done = true;
          created = true;
          return { ...section, lines };
        });
        return done ? { ...s, sections } : s;
      })
    );
    return created ? newId : null;
  },

  patchLine: (scriptId, lineId, patch) =>
    set((state) =>
      withScript(state, scriptId, (s) =>
        mapLine(s, lineId, (line) => {
          const keys = Object.keys(patch) as Array<keyof typeof patch>;
          const unchanged = keys.every((k) => Object.is(line[k], patch[k]));
          return unchanged ? line : { ...line, ...patch };
        })
      )
    ),

  removeLine: (scriptId, lineId) =>
    set((state) =>
      withScript(state, scriptId, (s) => {
        let changed = false;
        const sections = s.sections.map((section) => {
          const lines = section.lines.filter((l) => l.id !== lineId);
          if (lines.length !== section.lines.length) changed = true;
          return lines.length === section.lines.length
            ? section
            : { ...section, lines };
        });
        return changed ? { ...s, sections } : s;
      })
    ),

  reorderLines: (scriptId, sectionId, orderedLineIds) =>
    set((state) =>
      withScript(state, scriptId, (s) => ({
        ...s,
        sections: s.sections.map((section) => {
          if (section.id !== sectionId) return section;
          const byId = new Map(section.lines.map((l) => [l.id, l]));
          const lines = orderedLineIds
            .map((id) => byId.get(id))
            .filter((l): l is ScriptLine => !!l);
          // Keep any lines the order list forgot (defensive).
          for (const line of section.lines)
            if (!orderedLineIds.includes(line.id)) lines.push(line);
          return { ...section, lines };
        })
      }))
    ),

  moveLine: (scriptId, lineId, targetSectionId, beforeLineId) =>
    set((state) =>
      withScript(state, scriptId, (s) => {
        if (lineId === beforeLineId) return s;
        let moved: ScriptLine | undefined;
        const stripped = s.sections.map((section) => {
          const idx = section.lines.findIndex((l) => l.id === lineId);
          if (idx < 0) return section;
          moved = section.lines[idx];
          return {
            ...section,
            lines: section.lines.filter((l) => l.id !== lineId)
          };
        });
        if (!moved) return s;
        const line = moved;
        let inserted = false;
        const sections = stripped.map((section) => {
          if (section.id !== targetSectionId) return section;
          const lines = [...section.lines];
          const at =
            beforeLineId == null
              ? lines.length
              : (() => {
                  const i = lines.findIndex((l) => l.id === beforeLineId);
                  return i < 0 ? lines.length : i;
                })();
          lines.splice(at, 0, line);
          inserted = true;
          return { ...section, lines };
        });
        return inserted ? { ...s, sections } : s;
      })
    ),

  appendTake: (scriptId, lineId, take) =>
    set((state) =>
      withScript(state, scriptId, (s) =>
        mapLine(s, lineId, (line) => ({
          ...line,
          takes: [...line.takes, take],
          currentTakeId: take.id
        }))
      )
    ),

  setCurrentTake: (scriptId, lineId, takeId) =>
    set((state) =>
      withScript(state, scriptId, (s) =>
        mapLine(s, lineId, (line) =>
          line.currentTakeId === takeId
            ? line
            : { ...line, currentTakeId: takeId }
        )
      )
    ),

  toggleTakeFavorite: (scriptId, lineId, takeId) =>
    set((state) =>
      withScript(state, scriptId, (s) =>
        mapLine(s, lineId, (line) => ({
          ...line,
          takes: line.takes.map((t) =>
            t.id === takeId ? { ...t, favorite: !t.favorite } : t
          )
        }))
      )
    ),

  removeTake: (scriptId, lineId, takeId) =>
    set((state) =>
      withScript(state, scriptId, (s) =>
        mapLine(s, lineId, (line) => {
          const takes = line.takes.filter((t) => t.id !== takeId);
          if (takes.length === line.takes.length) return line;
          const currentTakeId =
            line.currentTakeId === takeId
              ? (takes[takes.length - 1]?.id ?? null)
              : line.currentTakeId;
          return { ...line, takes, currentTakeId };
        })
      )
    ),

  setVoicing: (lineId, voicing) =>
    set((state) => {
      const voicingLineIds = { ...state.voicingLineIds };
      if (voicing) voicingLineIds[lineId] = true;
      else delete voicingLineIds[lineId];
      return { voicingLineIds };
    })
}));

// ── Selector hooks ───────────────────────────────────────────────────────────

const EMPTY_CAST: ScriptSpeaker[] = [];
const EMPTY_SECTIONS: ScriptSection[] = [];

/** Reactive multi-value view of a script (shallow-compared). */
export const useScript = (
  id: string
): {
  title: string;
  cast: ScriptSpeaker[];
  sections: ScriptSection[];
  timelineId: string | null;
} =>
  useScriptStore(
    useShallow((state) => {
      const s = state.scripts[id];
      return {
        title: s?.title ?? "",
        cast: s?.cast ?? EMPTY_CAST,
        sections: s?.sections ?? EMPTY_SECTIONS,
        timelineId: s?.timelineId ?? null
      };
    })
  );

/** Reactive transient voicing flag for a line. */
export const useLineVoicing = (lineId: string): boolean =>
  useScriptStore((state) => !!state.voicingLineIds[lineId]);

/**
 * Reactive autosave status for a script. Defaults to `saved` (idle) before the
 * first save cycle so the indicator starts calm rather than alarming.
 */
export const useScriptSaveStatus = (scriptId: string): ScriptSaveStatus =>
  useScriptStore((state) => state.saveStatus[scriptId] ?? "saved");

/**
 * Line status derived from its current take vs. the current text/voice.
 * `draft` — no takes; `voiced` — current take matches; `stale` — text or voice
 * changed since the take was made.
 */
export type LineStatus = "draft" | "voiced" | "stale";

export const lineStatus = (
  line: ScriptLine,
  effectiveVoice: VoiceBinding | null
): LineStatus => {
  const take = line.takes.find((t) => t.id === line.currentTakeId);
  if (!take) return "draft";
  const textMatches = take.textSnapshot === line.text;
  const voiceMatches =
    JSON.stringify(take.voiceSnapshot) === JSON.stringify(effectiveVoice);
  return textMatches && voiceMatches ? "voiced" : "stale";
};

/** The voice a line will be sung with: its override, else its speaker's. */
export const effectiveVoice = (
  line: ScriptLine,
  cast: ScriptSpeaker[]
): VoiceBinding | null => {
  if (line.voiceOverride !== undefined && line.voiceOverride !== null)
    return line.voiceOverride;
  const speaker = cast.find((s) => s.id === line.speakerId);
  return speaker?.voice ?? null;
};
