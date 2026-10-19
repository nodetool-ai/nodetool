// Compressor side-chain sources. The key reaches each device worklet as one
// five-channel input (KEY_CHANNELS): channels 0–3 carry the four SQ-4 track
// outputs (mono) and channel 4 the DR-1 kick (pad 01) alone. Standalone
// devices leave the input silent, so only DR-1's internal pad keys work there.

export const KEY_CHANNELS = 5;

/** WT-1, BL-1 and the SQ-4 master: `fx.comp.sc` index → key channel. */
export const SC_SOURCES = ['OFF', 'KICK', 'TRACK 1', 'TRACK 2', 'TRACK 3', 'TRACK 4'];

/** DR-1 pad and group compressors: its own pads, or the other SQ-4 tracks. */
export const DRUM_SC_SOURCES = ['OFF', ...Array.from({ length: 16 }, (_, i) => `PAD ${String(i + 1).padStart(2, '0')}`), 'TRACK 2', 'TRACK 3', 'TRACK 4'];

/** Key high-pass: 20 Hz is effectively flat; ~120 Hz keys on the kick's click. */
export const SC_HP_DEF = { label: 'KEY HP', min: 20, max: 500, def: 20, curve: 'log' as const, fmt: (v: number) => `${Math.round(v)} Hz` };

/** True when a source needs the SQ-4 key input (not a DR-1 internal pad). */
export const isExternalSource = (sources: readonly string[], index: number) => index > 0 && !sources[index]?.startsWith('PAD');
