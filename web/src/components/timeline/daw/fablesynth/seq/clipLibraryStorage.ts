import {
  decodeClipLibrary,
  encodeClipLibrary,
  type RuntimeClipLibraryEntry,
} from './clipLibrary';

export type ClipSource = 'FACTORY' | 'USER' | 'IMPORTED';

export interface SourcedClip extends RuntimeClipLibraryEntry {
  source: ClipSource;
}

export interface ClipStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const USER_CLIPS_KEY = 'fablesynth:sq4:user-clips:v1';
export const IMPORTED_CLIPS_KEY = 'fablesynth:sq4:imported-clips:v1';

const normalizedName = (name: string) => name.trim().toLocaleLowerCase('en-US');

function withoutSource({ source: _source, ...entry }: SourcedClip): RuntimeClipLibraryEntry {
  return entry;
}

function decodeStored(storage: ClipStorage, key: string, source: Exclude<ClipSource, 'FACTORY'>): SourcedClip[] {
  const raw = storage.getItem(key);
  if (!raw) return [];
  return decodeClipLibrary(JSON.parse(raw)).clips.map((entry) => ({ ...entry, source }));
}

/** Reject ID and display-name collisions across every source. */
export function assertUniqueClips(clips: readonly SourcedClip[]): void {
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const clip of clips) {
    if (ids.has(clip.id)) throw new Error(`Duplicate clip id: ${clip.id}`);
    ids.add(clip.id);
    const name = normalizedName(clip.name);
    if (names.has(name)) throw new Error(`Duplicate clip name: ${clip.name}`);
    names.add(name);
  }
}

export function sourceFactoryClips(clips: readonly RuntimeClipLibraryEntry[]): SourcedClip[] {
  const sourced = clips.map((entry) => ({ ...entry, source: 'FACTORY' as const }));
  assertUniqueClips(sourced);
  return sourced;
}

/** Read both persistent collections. Invalid/colliding data is rejected, never partially loaded. */
export function readPersistentClips(storage: ClipStorage, factory: readonly SourcedClip[] = []): {
  users: SourcedClip[];
  imported: SourcedClip[];
} {
  const users = decodeStored(storage, USER_CLIPS_KEY, 'USER');
  const imported = decodeStored(storage, IMPORTED_CLIPS_KEY, 'IMPORTED');
  assertUniqueClips([...factory, ...users, ...imported]);
  return { users, imported };
}

export function writePersistentClips(
  storage: ClipStorage,
  source: Exclude<ClipSource, 'FACTORY'>,
  clips: readonly SourcedClip[],
): void {
  if (clips.some((clip) => clip.source !== source)) throw new Error(`Cannot store a non-${source} clip in ${source}`);
  assertUniqueClips(clips);
  const doc = encodeClipLibrary({ v: 1, clips: clips.map(withoutSource) });
  storage.setItem(source === 'USER' ? USER_CLIPS_KEY : IMPORTED_CLIPS_KEY, JSON.stringify(doc));
}

/** Parse a portable .sqclip document and reject any collision with the current library. */
export function importSqclip(text: string, existing: readonly SourcedClip[]): SourcedClip[] {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('Invalid .sqclip JSON'); }
  const clips = decodeClipLibrary(value).clips.map((entry) => ({ ...entry, source: 'IMPORTED' as const }));
  if (!clips.length) throw new Error('A .sqclip file must contain at least one clip');
  assertUniqueClips([...existing, ...clips]);
  return clips;
}

/** Export one or more clips without the local source marker. */
export function exportSqclip(clips: readonly SourcedClip[]): string {
  if (!clips.length) throw new Error('Select at least one clip to export');
  assertUniqueClips(clips);
  return `${JSON.stringify(encodeClipLibrary({ v: 1, clips: clips.map(withoutSource) }), null, 2)}\n`;
}

export function uniqueClipName(base: string, clips: readonly SourcedClip[]): string {
  const names = new Set(clips.map((clip) => normalizedName(clip.name)));
  const clean = base.trim() || 'UNTITLED CLIP';
  if (!names.has(normalizedName(clean))) return clean;
  for (let suffix = 2; ; suffix++) {
    const candidate = `${clean} ${suffix}`;
    if (!names.has(normalizedName(candidate))) return candidate;
  }
}
