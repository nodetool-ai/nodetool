// Portable SQ-4 sequencer clip library. JSON documents keep packed pattern
// bytes as base64; the runtime form below exposes Uint8Array instead.

import {
  b64ToBytes,
  bytesPerBar,
  bytesToB64,
  MAX_BARS,
  type MachineId,
} from './protocol';

export const CLIP_ROLES = {
  DR1: [
    'four-on-floor', 'breakbeat', 'half-time', 'electro', 'percussion',
    'hats', 'fill', 'build-up', 'sparse', 'experimental',
  ],
  BL1: [
    'acid', 'sub', 'arpeggio', 'ostinato', 'syncopated', 'sustained',
    'sliding', 'minimal', 'fill', 'transition',
  ],
  WT1: [
    'lead', 'chord', 'pad-pulse', 'arpeggio', 'hook', 'countermelody',
    'bass', 'texture', 'riser', 'transition',
  ],
} as const satisfies Record<MachineId, readonly string[]>;

/** Style families shared by every machine, for cross-track browsing. */
export const CLIP_FAMILIES = [
  'techno', 'house', 'electro', 'breaks', 'acid', 'ambient', 'lo-fi',
  'cinematic', 'experimental',
] as const;

/** Descriptive tags shared by every machine (role and energy are separate). */
export const CLIP_TAGS = [
  'dark', 'bright', 'warm', 'cold', 'sparse', 'dense', 'syncopated',
  'straight', 'triplet-feel', 'driving', 'hypnotic', 'melodic', 'atonal',
  'peak-time', 'build-up', 'breakdown', 'groovy', 'glitchy',
] as const;

export type ClipFamily = (typeof CLIP_FAMILIES)[number];
export type ClipTag = (typeof CLIP_TAGS)[number];
export type ClipRole<M extends MachineId = MachineId> = (typeof CLIP_ROLES)[M][number];
export type ClipEnergy = 1 | 2 | 3 | 4 | 5;

export interface ClipLibraryEntry {
  id: string;
  name: string;
  machine: MachineId;
  bars: number;
  pattern: string;
  family: ClipFamily;
  role: ClipRole;
  energy: ClipEnergy;
  tags: ClipTag[];
  root?: number;
  scale?: string;
  transpose: boolean;
}

export interface ClipLibraryDoc {
  v: 1;
  clips: ClipLibraryEntry[];
}

export interface RuntimeClipLibraryEntry extends Omit<ClipLibraryEntry, 'pattern'> {
  pattern: Uint8Array;
}

export interface RuntimeClipLibrary {
  v: 1;
  clips: RuntimeClipLibraryEntry[];
}

const MACHINES: readonly MachineId[] = ['DR1', 'BL1', 'WT1'];
const DOC_KEYS = ['v', 'clips'] as const;
const ENTRY_KEYS = [
  'id', 'name', 'machine', 'bars', 'pattern', 'family', 'role', 'energy',
  'tags', 'root', 'scale', 'transpose',
] as const;
const REQUIRED_ENTRY_KEYS = ENTRY_KEYS.filter((key) => key !== 'root' && key !== 'scale');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unexpectedKey(value: Record<string, unknown>, allowed: readonly string[]): string | null {
  return Object.keys(value).find((key) => !allowed.includes(key)) ?? null;
}

function isCanonicalBase64(value: string): boolean {
  // Re-encoding catches bad alphabet, padding and non-zero trailing bits.
  return value.length % 4 === 0
    && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
    && bytesToB64(b64ToBytes(value)) === value;
}

/** Returns null for a valid v1 document, otherwise a path-oriented reason. */
export function validateClipLibrary(value: unknown): string | null {
  if (!isRecord(value)) return 'library must be an object';
  const badDocKey = unexpectedKey(value, DOC_KEYS);
  if (badDocKey) return `library: unknown field ${badDocKey}`;
  if (value.v !== 1) return `unknown clip library version ${String(value.v)}`;
  if (!Array.isArray(value.clips)) return 'library: clips must be an array';

  const ids = new Set<string>();
  for (let i = 0; i < value.clips.length; i++) {
    const raw = value.clips[i];
    const at = `clip ${i}`;
    if (!isRecord(raw)) return `${at}: must be an object`;
    const badKey = unexpectedKey(raw, ENTRY_KEYS);
    if (badKey) return `${at}: unknown field ${badKey}`;
    const missing = REQUIRED_ENTRY_KEYS.find((key) => !Object.prototype.hasOwnProperty.call(raw, key));
    if (missing) return `${at}: missing ${missing}`;

    if (typeof raw.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(raw.id)) {
      return `${at}: invalid id`;
    }
    if (ids.has(raw.id)) return `${at}: duplicate id ${raw.id}`;
    ids.add(raw.id);
    if (typeof raw.name !== 'string' || raw.name.trim() === '') return `${at}: invalid name`;
    if (!MACHINES.includes(raw.machine as MachineId)) return `${at}: unknown machine`;
    const machine = raw.machine as MachineId;
    if (!Number.isInteger(raw.bars) || (raw.bars as number) < 1 || (raw.bars as number) > MAX_BARS) {
      return `${at}: bars out of range`;
    }
    if (typeof raw.pattern !== 'string' || !isCanonicalBase64(raw.pattern)) {
      return `${at}: pattern is not canonical base64`;
    }
    const expected = (raw.bars as number) * bytesPerBar(machine);
    const bytes = b64ToBytes(raw.pattern);
    const actual = bytes.length;
    if (actual !== expected) return `${at}: pattern is ${actual} bytes, expected ${expected}`;
    if (machine === 'DR1') {
      const bad = bytes.findIndex((byte) => byte > 2);
      if (bad >= 0) return `${at}: invalid DR1 value at byte ${bad}`;
    } else {
      for (let offset = 0; offset < bytes.length; offset += 3) {
        const flags = bytes[offset];
        const duration = (flags >> 2) & 0x3f;
        if (duration < 1 || duration > 63) return `${at}: invalid note flags at byte ${offset}`;
        if ((bytes[offset + 1] & 0x7f) > 11 || (machine === 'WT1' && bytes[offset + 1] > 11)) {
          return `${at}: invalid note at byte ${offset + 1}`;
        }
        if (bytes[offset + 2] > 2) return `${at}: invalid octave at byte ${offset + 2}`;
      }
    }
    if (!CLIP_FAMILIES.includes(raw.family as ClipFamily)) return `${at}: unknown family`;
    if (!(CLIP_ROLES[machine] as readonly unknown[]).includes(raw.role)) {
      return `${at}: role is not valid for ${machine}`;
    }
    if (!Number.isInteger(raw.energy) || (raw.energy as number) < 1 || (raw.energy as number) > 5) {
      return `${at}: energy out of range`;
    }
    if (!Array.isArray(raw.tags)) return `${at}: tags must be an array`;
    const seenTags = new Set<string>();
    for (const tag of raw.tags) {
      if (typeof tag !== 'string' || !CLIP_TAGS.includes(tag as ClipTag)) return `${at}: unknown tag ${String(tag)}`;
      if (seenTags.has(tag)) return `${at}: duplicate tag ${tag}`;
      seenTags.add(tag);
    }
    if (raw.root !== undefined && (!Number.isInteger(raw.root) || (raw.root as number) < 0 || (raw.root as number) > 11)) {
      return `${at}: root out of range`;
    }
    if (raw.scale !== undefined && (typeof raw.scale !== 'string' || raw.scale.trim() === '')) {
      return `${at}: invalid scale`;
    }
    if (typeof raw.transpose !== 'boolean') return `${at}: transpose must be boolean`;
    if (machine === 'DR1' && raw.root !== undefined) return `${at}: DR1 clips cannot have a root`;
    if (raw.transpose && raw.root === undefined) return `${at}: transpose requires a root`;
    if (raw.root !== undefined && raw.scale === undefined) return `${at}: root requires a scale`;
  }
  return null;
}

/** Validate and decode a serialized library. Throws when the document is invalid. */
export function decodeClipLibrary(value: unknown): RuntimeClipLibrary {
  const error = validateClipLibrary(value);
  if (error) throw new Error(`Invalid clip library: ${error}`);
  const doc = value as unknown as ClipLibraryDoc;
  return {
    v: 1,
    clips: doc.clips.map(({ pattern, ...entry }) => ({ ...entry, pattern: b64ToBytes(pattern) })),
  };
}

/** Encode runtime bytes and validate all metadata before returning JSON data. */
export function encodeClipLibrary(library: RuntimeClipLibrary): ClipLibraryDoc {
  const doc: ClipLibraryDoc = {
    v: 1,
    clips: library.clips.map(({ pattern, ...entry }) => ({ ...entry, pattern: bytesToB64(pattern) })),
  };
  const error = validateClipLibrary(doc);
  if (error) throw new Error(`Invalid clip library: ${error}`);
  return doc;
}
