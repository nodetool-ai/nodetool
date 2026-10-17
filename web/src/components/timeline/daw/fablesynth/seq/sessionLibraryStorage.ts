// localStorage persistence for the user session library. Mirrors
// clipLibraryStorage: reject-don't-migrate on read, silent on quota.

import {
  decodeSessionLibrary,
  encodeSessionLibrary,
  type SessionLibraryEntry,
} from './sessionLibrary';

export interface SessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const SESSIONS_KEY = 'fablesynth:sq4:sessions:v1';

const normalizedName = (name: string) => name.trim().toLocaleLowerCase('en-US');

/**
 * Read the saved sessions, newest first. Unlike the clip library a corrupt
 * document cannot be fixed by the user from inside the app, and losing the
 * whole list to one bad entry is worse than showing none — so a parse failure
 * yields an empty library rather than throwing into the render.
 */
export function readSessions(storage: SessionStorage): SessionLibraryEntry[] {
  try {
    const raw = storage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    return decodeSessionLibrary(JSON.parse(raw)).sessions.sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

export function writeSessions(storage: SessionStorage, sessions: readonly SessionLibraryEntry[]): void {
  const names = new Set<string>();
  for (const entry of sessions) {
    const name = normalizedName(entry.name);
    if (names.has(name)) throw new Error(`Duplicate session name: ${entry.name}`);
    names.add(name);
  }
  try {
    storage.setItem(SESSIONS_KEY, JSON.stringify(encodeSessionLibrary(sessions)));
  } catch {
    /* quota / private mode */
  }
}

export function uniqueSessionName(base: string, sessions: readonly SessionLibraryEntry[], skipId?: string): string {
  const names = new Set(sessions.filter((s) => s.id !== skipId).map((s) => normalizedName(s.name)));
  const clean = base.trim() || 'UNTITLED SESSION';
  if (!names.has(normalizedName(clean))) return clean;
  for (let suffix = 2; ; suffix++) {
    const candidate = `${clean} ${suffix}`;
    if (!names.has(normalizedName(candidate))) return candidate;
  }
}

/** Crypto-free id: the library is small and local, collisions only need to be unlikely. */
export const newSessionId = (now: number, rand = Math.random): string => (
  `s${now.toString(36)}${Math.floor(rand() * 1e6).toString(36)}`
);
