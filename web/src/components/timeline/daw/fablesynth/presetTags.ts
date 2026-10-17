// Browser metadata for the factory presets: one role and up to three character
// tags each, keyed by preset name. Kept apart from presets.ts so the sound data
// stays untouched. User presets carry no tags and appear under the USER role.

export const PRESET_ROLES = ['bass', 'lead', 'pad', 'keys', 'pluck', 'fx'] as const;
export const PRESET_CHARACTERS = ['warm', 'dark', 'bright', 'glassy', 'airy', 'gritty', 'moving', 'wide'] as const;

export type PresetRole = (typeof PRESET_ROLES)[number];
export type PresetCharacter = (typeof PRESET_CHARACTERS)[number];

export interface PresetTags {
  role: PresetRole;
  tags: PresetCharacter[];
}

const T: Record<string, [PresetRole, string]> = {
  'INIT': ['keys', ''],
  'VELVET PAD': ['pad', 'warm airy'],
  'ACID LINE': ['bass', 'gritty bright'],
  'CRYSTAL PLUCK': ['pluck', 'glassy bright'],
  'HYPER SAW': ['lead', 'bright wide'],
  'VOWEL TALK': ['lead', 'moving gritty'],
  'CATHEDRAL BELL': ['keys', 'glassy airy'],
  'NEURO WOBBLE': ['bass', 'gritty moving'],
  'REESE BASS': ['bass', 'dark wide'],
  'POWER FIFTHS': ['lead', 'bright gritty'],
  'GROWL BASS': ['bass', 'gritty dark'],
  'FUTURE CHORD': ['keys', 'bright wide'],
  'SCREECH LEAD': ['lead', 'bright gritty'],
  'DONK STAB': ['pluck', 'bright'],
  'HOUSE PLUCK': ['pluck', 'warm'],
  'TRAP BELL': ['pluck', 'glassy'],
  '8-BIT LEAD': ['lead', 'bright'],
  'DARK DRONE': ['pad', 'dark moving'],
  'WUB BASS': ['bass', 'gritty moving'],
  'GLIDE LEAD': ['lead', 'warm'],
  'MELLOW RHODES': ['keys', 'warm'],
  'DYNO EPIANO': ['keys', 'bright'],
  'DRAWBAR ORGAN': ['keys', 'warm'],
  'ROCK ORGAN': ['keys', 'gritty'],
  'ANALOG STRINGS': ['pad', 'warm wide'],
  'CINEMA STRINGS': ['pad', 'dark wide'],
  'BRASS SECTION': ['lead', 'bright'],
  'SOFT BRASS': ['pad', 'warm'],
  'NYLON PLUCK': ['pluck', 'warm'],
  'KALIMBA PLUCK': ['pluck', 'glassy warm'],
  'CELTIC HARP': ['pluck', 'airy glassy'],
  'HARPSI COMB': ['pluck', 'bright'],
  'GHOST CHOIR': ['pad', 'airy dark'],
  'DATA STREAM': ['fx', 'moving glassy'],
  'OCEAN AIR': ['pad', 'airy moving'],
  'TWIN SKY': ['pad', 'wide airy'],
  'TAPE KEYS': ['keys', 'warm'],
  'TALKBOX BASS': ['bass', 'moving gritty'],
  'AURORA RISER': ['fx', 'bright moving'],
  'GAMELAN POT': ['pluck', 'glassy'],
  'PUMP PAD': ['pad', 'moving'],
  'MINI LEAD': ['lead', 'warm'],
  'JUNO DREAM': ['pad', 'warm wide'],
  'JUMP BRASS': ['keys', 'bright'],
  'BLADE BRASS': ['lead', 'dark wide'],
  'FANTA BELLS': ['pluck', 'glassy bright'],
  'TAURUS PEDAL': ['bass', 'warm dark'],
  'WAVE DANCER': ['pad', 'moving bright'],
  'FUNKY WORM': ['lead', 'warm'],
  'LATELY BASS': ['bass', 'warm'],
  'PROPHET STAB': ['keys', 'bright'],
  'FOG LIGHT': ['pad', 'dark airy'],
  'GLASS RIBBON': ['lead', 'glassy airy'],
  'NORTH WIRE': ['lead', 'dark'],
  'TEMPLE BREATH': ['pad', 'airy dark'],
  'MELODICA': ['lead', 'warm'],
  'DUB SKANK': ['keys', 'dark warm'],
  'BLEEP TECH': ['pluck', 'bright'],
  'CINEMA LEAD': ['lead', 'wide warm'],
  'DEEP TICK': ['pluck', 'dark'],
  'ROOM KNOCK': ['pluck', 'dark warm'],
  'CELLAR BLIP': ['pluck', 'dark'],
  'GLASS MORPH': ['pad', 'glassy moving'],
  'RAVE HOOVER': ['lead', 'gritty wide'],
  'BOOM 808': ['bass', 'dark'],
  'GATE PAD': ['pad', 'moving'],
  'LASER ZAP': ['fx', 'bright'],
  'GLITCH SHUFFLE': ['fx', 'gritty moving'],
  'NOTCH SWEEP': ['fx', 'moving'],
};

export function factoryPresetTags(name: string): PresetTags | null {
  const t = T[name];
  return t ? { role: t[0], tags: (t[1] ? t[1].split(' ') : []) as PresetCharacter[] } : null;
}
