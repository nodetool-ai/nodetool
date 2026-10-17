// Browser metadata for the DR-1 factory kits: one style role and up to three
// character tags each, keyed by kit name. Kept apart from kits.ts so the sound
// data stays untouched. User kits carry no tags and appear under USER.

export const KIT_ROLES = ['techno', 'house', 'electro', 'hiphop', 'dub', 'lofi', 'experimental'] as const;
export const KIT_CHARACTERS = ['warm', 'dark', 'bright', 'gritty', 'punchy', 'tight', 'roomy', 'metallic'] as const;

export type KitRole = (typeof KIT_ROLES)[number];
export type KitCharacter = (typeof KIT_CHARACTERS)[number];

export interface KitTags {
  role: KitRole;
  tags: KitCharacter[];
}

const T: Record<string, [KitRole, string]> = {
  'TR-VOID': ['techno', 'dark tight'],
  'ROOM ONE': ['house', 'roomy warm'],
  'BITCRUSH': ['experimental', 'gritty bright'],
  '808 CLASSIC': ['electro', 'warm punchy'],
  'DEEP DUB': ['dub', 'dark roomy warm'],
  'DUST HOUSE': ['house', 'gritty warm'],
  'WAREHOUSE': ['techno', 'gritty punchy dark'],
  'METAL WORK': ['experimental', 'metallic bright'],
  'TAPE KIT': ['lofi', 'warm gritty roomy'],
  'MINIMAL': ['techno', 'tight dark'],
  'BROKEN TOYS': ['experimental', 'gritty bright metallic'],
  'LIVE ROOM': ['hiphop', 'roomy warm'],
  'UZU': ['house', 'punchy bright'],
  '808+UZU HYBRID': ['electro', 'punchy warm'],
  'NEON GRID': ['electro', 'bright punchy tight'],
  'ACID CAVE': ['techno', 'dark gritty roomy'],
  'BOOM BAP': ['hiphop', 'warm punchy gritty'],
  'PIRATE RADIO': ['house', 'gritty warm'],
  'CC0 IMPACT': ['techno', 'punchy'],
  'CC0 BOUNCE': ['house', 'punchy bright'],
  'CC0 WAREHOUSE': ['techno', 'dark gritty'],
  'CC0 DEEP HOUSE': ['house', 'warm dark'],
  'CC0 BASS RUSH': ['electro', 'punchy dark'],
};

export function factoryKitTags(name: string): KitTags | null {
  const t = T[name];
  return t ? { role: t[0], tags: (t[1] ? t[1].split(' ') : []) as KitCharacter[] } : null;
}
