// User session library: named SessionDocs kept in localStorage, and the
// single-session `.json` interchange format the JUCE build's Load/Save chooser
// already reads (juce/source/seq/SessionCodec.cpp emits the same schema).

import { embedSessionPatches } from './sessionExport';
import { validateSession, type SessionDoc } from './protocol';

export interface SessionLibraryEntry {
  id: string;
  name: string;
  /** Epoch ms; display only — ordering is by this, newest first. */
  savedAt: number;
  session: SessionDoc;
}

export interface SessionLibraryDoc {
  v: 1;
  sessions: SessionLibraryEntry[];
}

const ENTRY_KEYS = ['id', 'name', 'savedAt', 'session'] as const;

/** Reject-don't-migrate, matching decodeClipLibrary. */
export function decodeSessionLibrary(doc: unknown): SessionLibraryDoc {
  if (!doc || typeof doc !== 'object') throw new Error('session library: not an object');
  const { v, sessions } = doc as SessionLibraryDoc;
  if (v !== 1) throw new Error(`session library: unknown version ${String(v)}`);
  if (!Array.isArray(sessions)) throw new Error('session library: sessions is not an array');
  return {
    v: 1,
    sessions: sessions.map((entry, i) => {
      if (!entry || typeof entry !== 'object') throw new Error(`session ${i}: not an object`);
      for (const key of Object.keys(entry)) {
        if (!(ENTRY_KEYS as readonly string[]).includes(key)) throw new Error(`session ${i}: unknown key ${key}`);
      }
      if (typeof entry.id !== 'string' || !entry.id) throw new Error(`session ${i}: missing id`);
      if (typeof entry.name !== 'string' || !entry.name) throw new Error(`session ${i}: missing name`);
      if (typeof entry.savedAt !== 'number') throw new Error(`session ${i}: missing savedAt`);
      const invalid = validateSession(entry.session);
      if (invalid) throw new Error(`session ${i} (${entry.name}): ${invalid}`);
      return { id: entry.id, name: entry.name, savedAt: entry.savedAt, session: entry.session };
    }),
  };
}

export const encodeSessionLibrary = (sessions: readonly SessionLibraryEntry[]): SessionLibraryDoc => ({
  v: 1,
  sessions: sessions.map((entry) => ({ ...entry })),
});

/**
 * A session as a standalone file. Patches are embedded so the file does not
 * depend on an identical factory bank — the same choice JUCE's
 * currentSessionJson() makes.
 */
export const exportSessionJson = (session: SessionDoc, name?: string): string => (
  `${JSON.stringify(embedSessionPatches(name ? { ...session, name } : session), null, 2)}\n`
);

/** Parse a session file. Returns the doc, or a human-readable reason. */
export function importSessionJson(text: string): { session: SessionDoc } | { error: string } {
  let doc: SessionDoc;
  try {
    doc = JSON.parse(text) as SessionDoc;
  } catch {
    return { error: 'not valid JSON' };
  }
  const invalid = validateSession(doc);
  return invalid ? { error: invalid } : { session: doc };
}

/** `NEON TALE` → `neon-tale.json`. */
export function sessionFileName(name: string): string {
  const slug = name.trim().toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug || 'session'}.json`;
}
