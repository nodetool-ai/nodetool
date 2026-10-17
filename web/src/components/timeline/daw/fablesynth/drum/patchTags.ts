// Browser metadata for the DR-1 factory pad patches: one drum-voice role and up
// to three character tags each, keyed by patch name. Kept apart from patches.ts
// so the sound data stays untouched. User patches carry no tags and appear
// under USER.

export const PATCH_ROLES = ['kick', 'snare', 'clap', 'hat', 'tom', 'perc', 'cymbal', 'fx'] as const;
export const PATCH_CHARACTERS = ['warm', 'dark', 'bright', 'gritty', 'punchy', 'tight', 'metallic', 'long'] as const;

export type PatchRole = (typeof PATCH_ROLES)[number];
export type PatchCharacter = (typeof PATCH_CHARACTERS)[number];

export interface PatchTags {
  role: PatchRole;
  tags: PatchCharacter[];
}

const T: Record<string, [PatchRole, string]> = {
  'BD DEEP': ['kick', 'warm dark'],
  'BD PUNCH': ['kick', 'punchy tight'],
  'BD SUB': ['kick', 'dark long'],
  'BD 808': ['kick', 'warm long'],
  'SD CRACK': ['snare', 'bright punchy'],
  'SD 808': ['snare', 'warm'],
  'SD RIM': ['perc', 'tight bright'],
  'CP 808': ['clap', 'warm'],
  'HH 808': ['hat', 'bright'],
  'HH TIGHT': ['hat', 'tight bright'],
  'OH 808': ['hat', 'metallic long'],
  'CY 808': ['cymbal', 'metallic long'],
  'TM LO': ['tom', 'dark punchy'],
  'TM MID': ['tom', 'warm punchy'],
  'TM HI': ['tom', 'bright punchy'],
  'PC TINE': ['perc', 'metallic bright'],
  'PC BELL': ['perc', 'metallic long'],
  'PC CYMBAL': ['cymbal', 'metallic'],
  'PC VOX': ['fx', 'warm'],
  'PC GLITCH': ['fx', 'gritty'],
  'HX BD UZU': ['kick', 'punchy'],
  'HX BD 808': ['kick', 'warm long'],
  'HX SD UZU': ['snare', 'punchy'],
  'HX CP CROSS': ['clap', 'bright'],
  'HX RIM': ['perc', 'tight'],
  'HX HH': ['hat', 'tight'],
  'HX OH': ['hat', 'long'],
  'HX RD': ['cymbal', 'metallic'],
  'HX LT': ['tom', 'dark'],
  'HX MT': ['tom', 'warm'],
  'HX HT': ['tom', 'bright'],
  'HX CR': ['cymbal', 'bright long'],
  'HX CB': ['perc', 'metallic'],
  'HX SH': ['perc', 'bright tight'],
  'HX TB': ['perc', 'bright'],
  'HX MOD': ['fx', 'gritty'],
};

export function factoryPatchTags(name: string): PatchTags | null {
  const t = T[name];
  return t ? { role: t[0], tags: (t[1] ? t[1].split(' ') : []) as PatchCharacter[] } : null;
}
