// Browser metadata for the BL-1 factory patches: one role and up to three
// character tags each, keyed by patch name. Kept apart from patches.ts so the
// sound data stays untouched. Characters match the WT-1 vocabulary. User
// patches carry no tags and appear under the USER filter.

export const PATCH_ROLES = ['acid', 'sub', 'groove', 'reese', 'growl', 'pluck'] as const;
export const PATCH_CHARACTERS = ['warm', 'dark', 'bright', 'glassy', 'airy', 'gritty', 'moving', 'wide'] as const;

export type PatchRole = (typeof PATCH_ROLES)[number];
export type PatchCharacter = (typeof PATCH_CHARACTERS)[number];

export interface PatchTags {
  role: PatchRole;
  tags: PatchCharacter[];
}

const T: Record<string, [PatchRole, string]> = {
  'ACID LINE': ['acid', 'gritty bright'],
  'RUBBER SUB': ['sub', 'warm gritty'],
  'NEON SQUELCH': ['acid', 'bright wide moving'],
  'DEEP DUB': ['sub', 'dark warm'],
  'WAREHOUSE': ['acid', 'gritty bright'],
  'ROUNDHOUSE': ['groove', 'warm'],
  'METAL PULSE': ['groove', 'glassy gritty moving'],
  'TAPE BASS': ['groove', 'warm'],
  'REESE MONO': ['reese', 'dark wide gritty'],
  'PLUCKED WIRE': ['pluck', 'bright'],
  'DARK CURRENT': ['growl', 'dark gritty moving'],
  'CLEAN SUB': ['sub', 'warm'],
  'SOFT HORIZON': ['sub', 'warm airy wide'],
  'HOUSE ORGAN': ['groove', 'warm'],
  'DUSTY FELT': ['groove', 'warm dark'],
  'CINEMA SUB': ['sub', 'dark wide'],
  'SUB STAB': ['pluck', 'dark'],
  '808 GLIDE': ['sub', 'dark'],
  'GROWL WIDE': ['growl', 'gritty wide moving'],
  'UPRIGHT FELT': ['groove', 'warm dark'],
  'STEPPER ROOT': ['sub', 'dark warm'],
  'TECHNO SUB': ['sub', 'dark'],
};

export function factoryPatchTags(name: string): PatchTags | null {
  const t = T[name];
  return t ? { role: t[0], tags: (t[1] ? t[1].split(' ') : []) as PatchCharacter[] } : null;
}
