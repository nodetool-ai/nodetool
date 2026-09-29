/**
 * Timing and palette for the Vibe Race cut. Every section starts on a bar, so
 * the synthesized track (scripts/vibe-track.ts) and the picture share one grid.
 */
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const FPS = 60;
export const BPM = 180;
/** 180 BPM at 60 fps is exactly 20 frames per beat. */
export const BEAT = (FPS * 60) / BPM;
export const BAR = BEAT * 4;

/** Section starts, in bars. */
export const SECTION = {
  lights: 0,
  drop: 2,
  sprites: 3,
  props: 6,
  backgrounds: 7,
  parallax: 9,
  music: 11,
  sfx: 14,
  build: 16,
  run: 18,
  finish: 22,
  endCard: 24,
  end: 27,
} as const;

export const DURATION = SECTION.end * BAR;

/** The game's music plays from this point, past its quiet intro. */
export const MUSIC_OFFSET_S = 6;

export const bars = (n: number): number => Math.round(n * BAR);
export const beats = (n: number): number => Math.round(n * BEAT);

export const COLOR = {
  ink: "#05070c",
  panel: "#0b1119",
  line: "#1c2735",
  text: "#e9eef5",
  dim: "#7d8a9c",
  ember: "#ff8a2a",
  flame: "#ffd166",
  teal: "#3fe0d0",
  violet: "#a78bfa",
  red: "#ff3b3b",
  green: "#3dff8a",
} as const;

export const FONT = {
  display: "Inter, 'Helvetica Neue', Arial, sans-serif",
  hud: "VibeBebas, 'Bebas Neue', Impact, sans-serif",
  mono: "'SF Mono', Menlo, Monaco, monospace",
} as const;

/** Gear shown on the HUD, by section. */
export const GEARS: Array<[number, string]> = [
  [SECTION.lights, "N"],
  [SECTION.drop, "1"],
  [SECTION.sprites, "2"],
  [SECTION.props, "3"],
  [SECTION.backgrounds, "4"],
  [SECTION.parallax, "5"],
  [SECTION.music, "4"],
  [SECTION.sfx, "5"],
  [SECTION.build, "6"],
  [SECTION.run, "7"],
  [SECTION.finish, "N"],
];
