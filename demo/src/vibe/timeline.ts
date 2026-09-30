import { BEAT, SECTION, bars, beats } from "./theme";

/**
 * Frames where a generated asset lands. The HUD counter and the scenes read
 * the same list, so the count always matches what is on screen.
 */
export const SPRITE_CELLS_AT = Array.from({ length: 8 }, (_, i) => bars(SECTION.sprites) + beats(1) + i * (BEAT / 2));
export const PROPS = ["crawler", "mushroom", "beacon", "brazier", "lift", "thorns"] as const;
export const PROP_AT = PROPS.map((_, i) => bars(SECTION.props) + i * Math.round(BEAT * (4 / 6)));
export const LAYERS = ["sky", "far", "mid", "vines"] as const;
export const LAYER_AT = [
  bars(SECTION.backgrounds) + beats(2),
  bars(SECTION.backgrounds + 1),
  bars(SECTION.backgrounds + 1) + beats(1),
  bars(SECTION.backgrounds + 1) + beats(2),
];
export const MUSIC_AT = bars(SECTION.music) + beats(3);
export const SFX = ["jump", "stomp", "chime", "bounce", "hurt", "land", "checkpoint", "victory"] as const;
export const SFX_AT = SFX.map((_, i) => bars(SECTION.sfx) + i * BEAT);

/** One entry per asset: the hero sheet counts once, when its last cell lands. */
export const ASSET_EVENTS: number[] = [
  SPRITE_CELLS_AT[SPRITE_CELLS_AT.length - 1],
  ...PROP_AT,
  ...LAYER_AT,
  MUSIC_AT,
  ...SFX_AT,
].sort((a, b) => a - b);

export const assetsAt = (frame: number): number => ASSET_EVENTS.filter((f) => f <= frame).length;
