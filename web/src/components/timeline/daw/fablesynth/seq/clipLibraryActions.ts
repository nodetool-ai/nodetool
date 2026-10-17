// Pure clip-library browsing and load helpers. UI/store layers own selection,
// persistence and the live device update; this module keeps filtering,
// transposition and the immutable SessionDoc edit deterministic and testable.

import type {
  ClipEnergy, ClipFamily, ClipLibraryEntry, ClipRole, ClipTag, RuntimeClipLibraryEntry,
} from './clipLibrary';
import {
  b64ToBytes,
  bytesToB64,
  NOTE_STRIDE,
  type MachineId,
  type SessionDoc,
} from './protocol';

export interface ClipLibraryFilter {
  machine?: MachineId;
  query?: string;
  families?: readonly ClipFamily[];
  roles?: readonly ClipRole[];
  energies?: readonly ClipEnergy[];
  tags?: readonly ClipTag[];
  /** Selected tags narrow by default; `any` gives a looser discovery mode. */
  tagMatch?: 'all' | 'any';
}

/**
 * Keep browser actions scoped to the current filtered result. A remembered ID
 * may outlive a filter change, but it must never make a hidden clip actionable.
 */
export function resolveVisibleClipSelection<T extends { id: string }>(
  visible: readonly T[],
  selectedId: string,
): T | undefined {
  return visible.find((entry) => entry.id === selectedId) ?? visible[0];
}

/** Faceted, case-insensitive filtering that preserves the curated library order. */
export function filterClipLibrary<T extends ClipLibraryEntry | RuntimeClipLibraryEntry>(
  entries: readonly T[],
  filter: ClipLibraryFilter = {},
): T[] {
  const needle = filter.query?.trim().toLocaleLowerCase() ?? '';
  return entries.filter((entry) => {
    if (filter.machine && entry.machine !== filter.machine) return false;
    if (filter.families?.length && !filter.families.includes(entry.family)) return false;
    if (filter.roles?.length && !filter.roles.includes(entry.role)) return false;
    if (filter.energies?.length && !filter.energies.includes(entry.energy)) return false;
    if (filter.tags?.length) {
      const matches = (tag: ClipTag) => entry.tags.includes(tag);
      if (filter.tagMatch === 'any' ? !filter.tags.some(matches) : !filter.tags.every(matches)) return false;
    }
    if (needle) {
      const haystack = [
        entry.name, entry.id, entry.machine, entry.family, entry.role,
        entry.scale ?? '', ...entry.tags,
      ].join(' ').toLocaleLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

/** Shortest signed pitch-class movement. The tritone resolves upward. */
export function rootTransposeSemitones(sourceRoot: number, targetRoot: number): number {
  if (!Number.isInteger(sourceRoot) || sourceRoot < 0 || sourceRoot > 11
      || !Number.isInteger(targetRoot) || targetRoot < 0 || targetRoot > 11) {
    throw new RangeError('clip roots must be pitch classes from 0 to 11');
  }
  const up = (targetRoot - sourceRoot + 12) % 12;
  return up > 6 ? up - 12 : up;
}

function foldToLaneRange(semitone: number): number {
  // SQ note clips encode three signed octaves: -12..23. Fold by octaves at
  // either boundary so the pitch class survives without jumping two octaves.
  if (semitone > 23) semitone -= Math.ceil((semitone - 23) / 12) * 12;
  if (semitone < -12) semitone += Math.ceil((-12 - semitone) / 12) * 12;
  return semitone;
}

/**
 * Transpose packed BL-1/WT-1 note bytes while preserving flags and rests.
 * Active notes octave-fold into the format's representable -12..23 range.
 */
export function transposeNotePattern(pattern: Uint8Array, semitones: number): Uint8Array {
  if (!Number.isInteger(semitones)) throw new RangeError('transpose must be an integer number of semitones');
  if (pattern.length % NOTE_STRIDE !== 0) throw new RangeError('note pattern has an invalid byte length');
  const out = pattern.slice();
  for (let offset = 0; offset < out.length; offset += NOTE_STRIDE) {
    if ((out[offset] & 1) === 0) continue;
    const slide = out[offset + 1] & 0x80;
    const absolute = (out[offset + 1] & 0x7f) + 12 * (out[offset + 2] - 1);
    const encoded = foldToLaneRange(absolute + semitones) + 12;
    out[offset + 1] = slide | (encoded % 12);
    out[offset + 2] = Math.floor(encoded / 12);
  }
  return out;
}

export interface PrepareLibraryClipOptions {
  /** Pitch class to retarget a transposable melodic clip to. */
  targetRoot?: number;
  /** Direct browser transpose; ignored for drums and non-transposable clips. */
  semitones?: number;
}

export interface PreparedLibraryClip {
  name: string;
  bars: number;
  bytes: Uint8Array;
  pattern: string;
  transposedBy: number;
}

/** Decode a library entry and optionally transpose it for immediate loading. */
export function prepareLibraryClip(
  entry: ClipLibraryEntry | RuntimeClipLibraryEntry,
  options: PrepareLibraryClipOptions = {},
): PreparedLibraryClip {
  let bytes = typeof entry.pattern === 'string' ? b64ToBytes(entry.pattern) : entry.pattern.slice();
  let transposedBy = 0;
  if (options.semitones !== undefined && !Number.isInteger(options.semitones)) {
    throw new RangeError('transpose must be an integer number of semitones');
  }
  if (options.targetRoot !== undefined) {
    if (!Number.isInteger(options.targetRoot) || options.targetRoot < 0 || options.targetRoot > 11) {
      throw new RangeError('target root must be a pitch class from 0 to 11');
    }
    if (entry.machine !== 'DR1' && entry.transpose && entry.root !== undefined) {
      transposedBy = rootTransposeSemitones(entry.root, options.targetRoot);
    }
  } else if (entry.machine !== 'DR1' && entry.transpose) {
    transposedBy = options.semitones ?? 0;
  }
  if (transposedBy !== 0) bytes = transposeNotePattern(bytes, transposedBy);
  return { name: entry.name, bars: entry.bars, bytes, pattern: bytesToB64(bytes), transposedBy };
}

export interface LoadedLibraryClip extends PreparedLibraryClip {
  session: SessionDoc;
}

/**
 * Replace or create exactly one session cell. Track/patch data and every other
 * scene stay untouched; callers may send `bytes` through updateClip for a
 * phase-preserving live hot-swap.
 */
export function loadLibraryClipIntoSession(
  session: SessionDoc,
  sceneIndex: number,
  trackIndex: number,
  entry: ClipLibraryEntry | RuntimeClipLibraryEntry,
  options: PrepareLibraryClipOptions = {},
): LoadedLibraryClip {
  const track = session.tracks[trackIndex];
  const scene = session.scenes[sceneIndex];
  if (!track) throw new RangeError(`track ${trackIndex} does not exist`);
  if (!scene) throw new RangeError(`scene ${sceneIndex} does not exist`);
  if (track.machine !== entry.machine) {
    throw new Error(`clip ${entry.id} is for ${entry.machine}, not ${track.machine}`);
  }

  const prepared = prepareLibraryClip(entry, options);
  const clips = scene.clips.slice();
  clips[trackIndex] = {
    name: prepared.name,
    bars: prepared.bars,
    pattern: prepared.pattern,
  };
  const pass = scene.pass?.filter((index) => index !== trackIndex);
  const nextScene = { ...scene, clips, ...(pass?.length ? { pass } : { pass: undefined }) };
  const scenes = session.scenes.slice();
  scenes[sceneIndex] = nextScene;

  return {
    ...prepared,
    session: { ...session, scenes },
  };
}
