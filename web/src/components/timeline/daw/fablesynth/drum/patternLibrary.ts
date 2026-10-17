// DR-1 pattern library. Each genre is authored as two bars — the core groove
// (A) and its variation (B) — in a compact step notation; the other use cases
// (intro, breakdown, build-up, fill, outro, minimal) are arranged from those
// two bars by the fixed rules below, so every genre offers the same set of
// song sections. Pads follow the factory core-slot layout, so a pattern loads
// onto any kit:
//   k 0 KICK  b 1 KICK 2/SUB  s 2 SNARE  c 3 CLAP  r 4 RIM  h 5 CH HAT
//   o 6 OH HAT  y 7 RIDE/SHAKER  t 8 TOM LO  m 9 TOM MD  u 10 TOM HI
//   z 11 CRASH  p 12 PERC 1  q 13 PERC 2  v 14 VOX  g 15 GLITCH
// A bar is "lane:steps lane:steps ..." with 16 steps: '.' rest, 'x' hit,
// 'X' accent.

import type { BrowserItem } from '../shared/presetBrowser';
import { PAD_COUNT } from './params';
import { NPATTERNS, STEPS, patIdx } from './seq';

const LANES: Record<string, number> = { k: 0, b: 1, s: 2, c: 3, r: 4, h: 5, o: 6, y: 7, t: 8, m: 9, u: 10, z: 11, p: 12, q: 13, v: 14, g: 15 };

export const PATTERN_USES = ['main', 'variation', 'intro', 'breakdown', 'build-up', 'fill', 'outro', 'minimal'] as const;
export const PATTERN_FAMILIES = ['techno', 'house', 'electro', 'breaks', 'bass', 'hiphop', 'trap', 'disco-funk', 'latin-afro', 'downtempo', 'pop-rock', 'experimental'] as const;
export type PatternUse = (typeof PATTERN_USES)[number];
export type PatternFamily = (typeof PATTERN_FAMILIES)[number];
/** How the backbeat sits, which decides the fill and build figures. */
type Feel = 'four' | 'break' | 'half';

interface Genre {
  name: string;
  family: PatternFamily;
  bpm: number;
  /** Swing the groove was written for, 0..1 of the DR-1 SWING range. */
  swing: number;
  feel: Feel;
  a: string;
  b: string;
}

// Each genre's A and B bars. Kept to the instruments that define the style;
// accents carry the groove's push.
const GENRES: Genre[] = [
  // ---- techno ----
  { name: 'DETROIT TECHNO', family: 'techno', bpm: 128, swing: 0.1, feel: 'four',
    a: 'k:X...x...X...x... c:....x.......x... h:..x...x...x...x. y:x.x.x.x.x.x.x.x. p:......x.....x...',
    b: 'k:X...x...X...x.x. c:....x.......x... h:..x...x...x.x.x. y:x.x.x.x.x.x.x.x. p:...x..x.....x..x' },
  { name: 'BERLIN TECHNO', family: 'techno', bpm: 132, swing: 0, feel: 'four',
    a: 'k:X...X...X...X... b:..x...x...x...x. h:..x...x...x...x. r:.......x.......x p:x..x..x..x..x...',
    b: 'k:X...X...X...X... b:..x...x...x..xx. h:..x...x...x...xx r:...x...x...x...x p:x..x..x..x..x.x.' },
  { name: 'MINIMAL TECHNO', family: 'techno', bpm: 126, swing: 0.2, feel: 'four',
    a: 'k:X...x...X...x... r:...x......x..... h:..x...x...x...x. p:.....x.......x..',
    b: 'k:X...x...X...x... r:...x.....x...x.. h:..x...x...x..xx. p:.x...x.......x..' },
  { name: 'DUB TECHNO', family: 'techno', bpm: 120, swing: 0.15, feel: 'four',
    a: 'k:X...x...X...x... c:............x... h:..x...x...x...x. o:..........x..... t:.......x........',
    b: 'k:X...x...X...x... c:....x.......x... h:..x...x...x...x. o:..........x...x. q:...x.........x..' },
  { name: 'HARD TECHNO', family: 'techno', bpm: 150, swing: 0, feel: 'four',
    a: 'k:X...X...X...X... b:..X...X...X...X. c:....x.......x... h:xxxxxxxxxxxxxxxx',
    b: 'k:X...X...X...X.x. b:..X...X...X...X. c:....x.......x.xx h:xxxxxxxxxxxxxxxx' },
  { name: 'ACID TECHNO', family: 'techno', bpm: 138, swing: 0.05, feel: 'four',
    a: 'k:X...x...X...x... c:....x.......x... h:x.xxx.xxx.xxx.xx o:..x...x...x...x.',
    b: 'k:X...x...X..xx... c:....x.......x... h:x.xxx.xxx.xxx.xx o:..x...x...x...x. p:...x.....x....x.' },
  { name: 'INDUSTRIAL TECHNO', family: 'techno', bpm: 140, swing: 0, feel: 'four',
    a: 'k:X...x...X...x... s:....X.......X... g:..x.....x.x..... h:x.x.x.x.x.x.x.x. t:.......x.......x',
    b: 'k:X...x..xX...x... s:....X.......X..x g:..x..x..x.x..x.. h:x.x.x.x.x.x.x.x. t:...x...x...x...x' },
  { name: 'HYPNOTIC TECHNO', family: 'techno', bpm: 130, swing: 0.1, feel: 'four',
    a: 'k:X...x...X...x... h:..x...x...x...x. y:xxxxxxxxxxxxxxxx p:x.....x.....x... q:...x.....x.....x',
    b: 'k:X...x...X...x... h:..x...x...x...x. y:xxxxxxxxxxxxxxxx p:x.....x...x..... q:...x.....x...x..' },
  // ---- house ----
  { name: 'CLASSIC HOUSE', family: 'house', bpm: 124, swing: 0.25, feel: 'four',
    a: 'k:X...x...X...x... c:....x.......x... h:..x...x...x...x. o:..x...x...x...x.',
    b: 'k:X...x...X...x... c:....x.......x..x h:x.x.x.x.x.x.x.x. o:..x...x...x...x.' },
  { name: 'DEEP HOUSE', family: 'house', bpm: 122, swing: 0.3, feel: 'four',
    a: 'k:X...x...X...x... c:....x.......x... h:..x...x...x...x. y:x.xxx.xxx.xxx.xx r:.......x.....x..',
    b: 'k:X...x...X...x... c:....x.......x... h:..x...x...x..xx. y:x.xxx.xxx.xxx.xx r:...x...x.....x..' },
  { name: 'TECH HOUSE', family: 'house', bpm: 126, swing: 0.2, feel: 'four',
    a: 'k:X...x...X...x... c:....x.......x... h:..x...x...x...x. y:xxxxxxxxxxxxxxxx p:...x......x.....',
    b: 'k:X...x...X...x.x. c:....x.......x... h:..x...x...x...x. y:xxxxxxxxxxxxxxxx p:...x..x...x..x..' },
  { name: 'JACKIN HOUSE', family: 'house', bpm: 125, swing: 0.35, feel: 'four',
    a: 'k:X...x...X...x... c:....x.......x... h:x.xxx.xxx.xxx.xx o:..x...x...x...x. r:......x.......x.',
    b: 'k:X...x...X..xx... c:....x..x....x... h:x.xxx.xxx.xxx.xx o:..x...x...x...x. r:...x..x.......x.' },
  { name: 'AFRO HOUSE', family: 'house', bpm: 122, swing: 0.2, feel: 'four',
    a: 'k:X...x...X...x... r:..x..x....x..x.. h:..x...x...x...x. p:x..x..x...x.x... q:.......x.......x',
    b: 'k:X...x...X...x... r:..x..x....x..x.x h:..x...x...x...x. p:x..x..x...x.x... q:....x..x....x..x' },
  { name: 'PROGRESSIVE HOUSE', family: 'house', bpm: 124, swing: 0.05, feel: 'four',
    a: 'k:X...x...X...x... c:....x.......x... h:..x...x...x...x. y:x.x.x.x.x.x.x.x. ',
    b: 'k:X...x...X...x... c:....x.......x... h:..x...x...x...x. y:xxxxxxxxxxxxxxxx p:..........x.....' },
  { name: 'LO-FI HOUSE', family: 'house', bpm: 118, swing: 0.4, feel: 'four',
    a: 'k:X...x...X...x... s:....x.......x... h:..x..x..x..x..x. r:.......x........',
    b: 'k:X...x...X..xx... s:....x.......x... h:..x..x..x..xx.x. r:...x...x........' },
  { name: 'NU-DISCO', family: 'house', bpm: 118, swing: 0.15, feel: 'four',
    a: 'k:X...x...X...x... c:....x.......x... h:x.x.x.x.x.x.x.x. o:..x...x...x...x. p:...x.......x....',
    b: 'k:X...x...X...x... c:....x.......x... h:x.x.x.x.x.x.x.x. o:..x...x...x...xx p:...x..x....x....' },
  // ---- electro ----
  { name: '808 ELECTRO', family: 'electro', bpm: 128, swing: 0, feel: 'break',
    a: 'k:X.....x...x..... s:....X.......X... h:x.x.x.x.x.x.x.x. p:..............x.',
    b: 'k:X.....x...x...x. s:....X.......X..x h:x.x.x.x.x.x.x.x. p:..........x...x.' },
  { name: 'ELECTRO FUNK', family: 'electro', bpm: 112, swing: 0.2, feel: 'break',
    a: 'k:X......xx.....x. c:....X.......X... h:x.xxx.xxx.xxx.xx p:...x.....x......',
    b: 'k:X......xx...x.x. c:....X.......X... h:x.xxx.xxx.xxx.xx p:...x.....x..x...' },
  { name: 'DETROIT ELECTRO', family: 'electro', bpm: 132, swing: 0, feel: 'break',
    a: 'k:X..x..x...x..... s:....X.......X... h:xxxxxxxxxxxxxxxx q:......x.......x.',
    b: 'k:X..x..x...x..x.. s:....X.......X... h:xxxxxxxxxxxxxxxx q:...x..x.......x.' },
  { name: 'SYNTHWAVE', family: 'electro', bpm: 104, swing: 0, feel: 'four',
    a: 'k:X.......X....... s:....X.......X... h:x.x.x.x.x.x.x.x. ',
    b: 'k:X.......X.x..... s:....X.......X... h:x.x.x.x.x.x.x.x. u:..............x. m:...............x' },
  // ---- breaks ----
  { name: 'BREAKBEAT', family: 'breaks', bpm: 130, swing: 0.1, feel: 'break',
    a: 'k:X.........x..... s:....X.......X... h:x.x.x.x.x.x.x.x. o:..............x.',
    b: 'k:X.x.......x..x.. s:....X..x.x..X... h:x.x.x.x.x.x.x.x. o:..............x.' },
  { name: 'BIG BEAT', family: 'breaks', bpm: 112, swing: 0.15, feel: 'break',
    a: 'k:X.......x.x..... s:....X.......X... c:....x.......x... h:x.x.x.x.x.x.x.x. ',
    b: 'k:X.......x.x...x. s:....X.......X.x. c:....x.......x... h:x.x.x.x.xxx.x.x. ' },
  { name: 'AMEN BREAK', family: 'breaks', bpm: 136, swing: 0, feel: 'break',
    a: 'k:X.X.......XX.... s:....X..x.x..X..x y:x.x.x.x.x.x.x.x. ',
    b: 'k:X.X.......X..... s:....X..x.x....x. y:x.x.x.x.x.x.x.x. o:..........x.....' },
  { name: 'FUNKY DRUMMER', family: 'breaks', bpm: 100, swing: 0.2, feel: 'break',
    a: 'k:X.X...X...X..x.. s:....X..x.x.xX..x h:xxxxxxxxxxxxxxxx o:.......x........',
    b: 'k:X.X...X...X..x.. s:....X..x.x.xX... h:xxxxxxxxxxxxxxxx o:.......x.....x..' },
  { name: 'NU SKOOL BREAKS', family: 'breaks', bpm: 135, swing: 0, feel: 'break',
    a: 'k:X.........X..x.. s:....X.......X... h:..x...x...x...x. y:x.x.x.x.x.x.x.x. g:.......x........',
    b: 'k:X.x.......X..x.. s:....X.......X.x. h:..x...x...x...x. y:x.x.x.x.x.x.x.x. g:.......x......x.' },
  // ---- bass ----
  { name: 'DRUM AND BASS', family: 'bass', bpm: 174, swing: 0, feel: 'break',
    a: 'k:X.........X..... s:....X.......X... h:x.x.x.x.x.x.x.x. o:..x.............',
    b: 'k:X.........x.x... s:....X.......X..x h:x.x.x.x.x.x.x.x. o:..x.......x.....' },
  { name: 'JUNGLE', family: 'bass', bpm: 165, swing: 0.1, feel: 'break',
    a: 'k:X.X.......X..... s:....X..x.x..X..x y:x.x.x.x.x.x.x.x. r:...x.......x....',
    b: 'k:X.X.......XX.... s:....X..x.x....x. y:x.x.x.x.x.x.x.x. r:...x...x...x....' },
  { name: 'LIQUID DNB', family: 'bass', bpm: 172, swing: 0.1, feel: 'break',
    a: 'k:X.........x..... s:....X.......X... h:x.xxx.xxx.xxx.xx y:x...x...x...x... ',
    b: 'k:X.......x.x..... s:....X.......X... h:x.xxx.xxx.xxx.xx y:x...x...x...x... r:.......x........' },
  { name: 'DUBSTEP', family: 'bass', bpm: 140, swing: 0.1, feel: 'half',
    a: 'k:X............... s:........X....... h:..x...x...x...x. r:..............x.',
    b: 'k:X.....x...x..... s:........X....... h:..x...x...x..xx. r:...x..........x.' },
  { name: 'UK GARAGE', family: 'bass', bpm: 132, swing: 0.45, feel: 'break',
    a: 'k:X......x..x..... s:....X.......X... h:..x...x...x...x. r:...x......x..x..',
    b: 'k:X.....x...x..x.. s:....X.......X... h:..x...x...x...x. r:...x..x...x..x..' },
  { name: 'GRIME', family: 'bass', bpm: 140, swing: 0.1, feel: 'half',
    a: 'k:X.....x...x..... s:........X....... h:x.x.x.x.x.x.x.x. p:...x.......x....',
    b: 'k:X.....x.x....x.. s:........X.....x. h:x.x.x.x.xxx.x.x. p:...x...x...x....' },
  { name: 'FOOTWORK', family: 'bass', bpm: 160, swing: 0, feel: 'half',
    a: 'k:X..x..x...x..x.. c:........X....... h:x.x.x.x.x.x.x.x. r:..x..x..x..x..x.',
    b: 'k:X..x..x..xx..x.x c:........X....x.. h:x.x.x.x.x.x.x.x. r:..x..x..x..x..x.' },
  { name: 'BASSLINE', family: 'bass', bpm: 138, swing: 0.3, feel: 'four',
    a: 'k:X...x...X...x... c:....x.......x... h:..x...x...x...x. r:.......x......x.',
    b: 'k:X...x...X...x... c:....x.......x... h:..x...x...x..xx. r:...x...x......x.' },
  // ---- hip-hop ----
  { name: 'BOOM BAP', family: 'hiphop', bpm: 90, swing: 0.45, feel: 'break',
    a: 'k:X.....x.x....... s:....X.......X... h:x.x.x.x.x.x.x.x. ',
    b: 'k:X.....x.x...x... s:....X.......X..x h:x.x.x.x.x.x.x.x. o:..............x.' },
  { name: 'LO-FI HIP-HOP', family: 'hiphop', bpm: 82, swing: 0.5, feel: 'break',
    a: 'k:X......x..x..... s:....X.......X... h:x.x.x.x.x.x.x.x. r:...........x....',
    b: 'k:X......x.x...... s:....X.......X... h:x.x.x.x.x.xxx.x. r:...x.......x....' },
  { name: 'WEST COAST', family: 'hiphop', bpm: 94, swing: 0.3, feel: 'break',
    a: 'k:X.......x.x..... c:....X.......X... h:x.xxx.xxx.xxx.xx o:..............x.',
    b: 'k:X.....x.x.x..... c:....X.......X... h:x.xxx.xxx.xxx.xx o:......x.......x.' },
  { name: 'TRIP-HOP', family: 'hiphop', bpm: 86, swing: 0.25, feel: 'break',
    a: 'k:X.........X..... s:....X.......X... h:x...x...x...x... r:..x.........x...',
    b: 'k:X.......x.X..... s:....X.......X.x. h:x...x...x...x..x r:..x.....x...x...' },
  // ---- trap ----
  { name: 'TRAP', family: 'trap', bpm: 140, swing: 0, feel: 'half',
    a: 'k:X.........x..... c:........X....... h:x.x.x.x.x.xxx.x. b:X.....x.........',
    b: 'k:X......x..x..... c:........X....... h:x.x.xxxxx.x.xxxx b:X.....x...x.....' },
  { name: 'DRILL', family: 'trap', bpm: 142, swing: 0, feel: 'half',
    a: 'k:X.........x..x.. s:......X.......X. h:x..x..x.x..x..x. b:X.........x.....',
    b: 'k:X......x...x.... s:......X.......X. h:x..x..xxx..x.xx. b:X......x........' },
  { name: 'PHONK', family: 'trap', bpm: 130, swing: 0.1, feel: 'half',
    a: 'k:X.....x...x..... c:........X....... h:x.x.x.x.x.x.x.x. p:x.x.x.x.x.x.x.x. ',
    b: 'k:X.....x.x.x..... c:........X.....x. h:x.x.x.x.x.x.xxxx p:x.x.x.x.x.x.x.x. ' },
  // ---- disco / funk ----
  { name: 'DISCO', family: 'disco-funk', bpm: 120, swing: 0.05, feel: 'four',
    a: 'k:X...x...X...x... s:....X.......X... h:x.x.x.x.x.x.x.x. o:..x...x...x...x.',
    b: 'k:X...x...X...x... s:....X.......X.xx h:x.x.x.x.x.x.x.x. o:..x...x...x...x.' },
  { name: 'FUNK', family: 'disco-funk', bpm: 104, swing: 0.25, feel: 'break',
    a: 'k:X.X.......X..x.. s:....X..x.x..X... h:xxxxxxxxxxxxxxxx ',
    b: 'k:X.X.....x.X..... s:....X..x.x..X.x. h:xxxxxxxxxxxxxx.x o:..............x.' },
  { name: 'MOTOWN', family: 'disco-funk', bpm: 112, swing: 0.15, feel: 'break',
    a: 'k:X...x...X...x... s:....X.......X... c:....x.......x... h:x.x.x.x.x.x.x.x. ',
    b: 'k:X...x...X...x... s:....X.......X... c:....x.......x... h:x.x.x.x.x.x.x.x. y:x.x.x.x.x.x.x.x. ' },
  // ---- latin / afro ----
  { name: 'REGGAETON', family: 'latin-afro', bpm: 95, swing: 0, feel: 'four',
    a: 'k:X...x...X...x... s:...x..x....x..x. h:x.x.x.x.x.x.x.x. ',
    b: 'k:X...x...X...x... s:...x..x....x.xx. h:x.x.x.x.x.x.x.x. p:..............x.' },
  { name: 'DANCEHALL', family: 'latin-afro', bpm: 100, swing: 0.1, feel: 'break',
    a: 'k:X.....x...x..... s:...x..x....x.... r:...x..x....x.... h:..x...x...x...x. ',
    b: 'k:X.....x...x..x.. s:...x..x....x..x. r:...x..x....x.... h:..x...x...x...x. ' },
  { name: 'AFROBEAT', family: 'latin-afro', bpm: 110, swing: 0.2, feel: 'break',
    a: 'k:X.....x...X..... s:....x.......X... h:xxxxxxxxxxxxxxxx p:x..x..x...x.x... q:..x.....x.x.....',
    b: 'k:X.....x...X..x.. s:....x..x....X... h:xxxxxxxxxxxxxxxx p:x..x..x...x.x... q:..x...x...x...x.' },
  { name: 'AMAPIANO', family: 'latin-afro', bpm: 113, swing: 0.3, feel: 'four',
    a: 'k:X...x...X...x... r:...x..x....x..x. y:x.xxx.xxx.xxx.xx p:..........x..x..',
    b: 'k:X...x...X...x... r:...x..x....x..x. y:x.xxx.xxx.xxx.xx p:.......x..x..x.x b:..............x.' },
  { name: 'BAILE FUNK', family: 'latin-afro', bpm: 130, swing: 0, feel: 'break',
    a: 'k:X..x..x...x..x.. c:....X.......X... h:x.x.x.x.x.x.x.x. p:..x.....x.x.....',
    b: 'k:X..x..x..xx..x.. c:....X..x....X... h:x.x.x.x.x.x.x.x. p:..x.....x.x...x.' },
  { name: 'BOSSA NOVA', family: 'latin-afro', bpm: 140, swing: 0, feel: 'break',
    a: 'k:X..x....x..x.... r:x..x..x...x..x.. h:x.x.x.x.x.x.x.x. ',
    b: 'k:X..x....x..x.... r:..x..x...x..x... h:x.x.x.x.x.x.x.x. ' },
  // ---- downtempo ----
  { name: 'DOWNTEMPO', family: 'downtempo', bpm: 95, swing: 0.2, feel: 'break',
    a: 'k:X.........x..... s:....x.......x... h:x...x...x...x... y:..x...x...x...x. ',
    b: 'k:X.......x.x..... s:....x.......x... h:x...x...x...x... y:..x...x...x..xx. ' },
  { name: 'AMBIENT PULSE', family: 'downtempo', bpm: 90, swing: 0, feel: 'half',
    a: 'k:X............... r:........x....... y:x...x...x...x... ',
    b: 'k:X.......x....... r:........x....... y:x...x...x...x.x. p:..............x.' },
  { name: 'CHILLWAVE', family: 'downtempo', bpm: 100, swing: 0.1, feel: 'break',
    a: 'k:X.......x....... c:....X.......X... h:x.x.x.x.x.x.x.x. ',
    b: 'k:X.......x.x..... c:....X.......X... h:x.x.x.x.x.x.x.x. o:..............x.' },
  // ---- pop / rock ----
  { name: 'POP', family: 'pop-rock', bpm: 116, swing: 0, feel: 'break',
    a: 'k:X.......X.x..... s:....X.......X... c:....x.......x... h:x.x.x.x.x.x.x.x. ',
    b: 'k:X.......X.x..... s:....X.......X... c:....x.......x... h:x.x.x.x.x.x.x.x. o:..............x.' },
  { name: 'ROCK', family: 'pop-rock', bpm: 120, swing: 0, feel: 'break',
    a: 'k:X.......X.x..... s:....X.......X... h:x.x.x.x.x.x.x.x. ',
    b: 'k:X.x.....X.x..... s:....X.......X... h:x.x.x.x.x.x.x.x. ' },
  { name: 'MOTORIK', family: 'pop-rock', bpm: 132, swing: 0, feel: 'four',
    a: 'k:X...x.x...x.x... s:....X.......X... h:x.x.x.x.x.x.x.x. ',
    b: 'k:X...x.x...x.x... s:....X.......X... h:x.x.x.x.x.x.x.x. o:..............x.' },
  { name: 'POST-PUNK', family: 'pop-rock', bpm: 140, swing: 0, feel: 'four',
    a: 'k:X...X...X...X... s:....X.......X... h:x.x.x.x.x.x.x.x. ',
    b: 'k:X...X...X...X... s:....X.......X... h:x.x.x.x.x.x.x.x. t:............x.x. ' },
  { name: 'NEW WAVE', family: 'pop-rock', bpm: 126, swing: 0, feel: 'four',
    a: 'k:X...x...X...x... s:....X.......X... h:xxxxxxxxxxxxxxxx ',
    b: 'k:X...x...X...x... s:....X.......X... h:xxxxxxxxxxxxxxxx c:............x... ' },
  // ---- experimental ----
  { name: 'IDM', family: 'experimental', bpm: 118, swing: 0, feel: 'break',
    a: 'k:X..x.....x..x... s:....X.......X.x. g:..x..x.x...x...x h:x.x.x.x.x.x.x.x. ',
    b: 'k:X..x...x.x...... s:....X..x....X... g:.x..x..x..x.x..x h:x.x.xxx.x.x.x.xx ' },
  { name: 'GLITCH HOP', family: 'experimental', bpm: 105, swing: 0.2, feel: 'break',
    a: 'k:X.....x...x..... s:....X.......X... g:..xx......x..x.. h:x.x.x.x.x.x.x.x. ',
    b: 'k:X.....x...x...x. s:....X.......X... g:..xx..x...xx.x.x h:x.x.x.x.x.xxx.x. ' },
  { name: 'BROKEN BEAT', family: 'experimental', bpm: 120, swing: 0.3, feel: 'break',
    a: 'k:X.....x.......x. s:....X.......X... h:x.xxx.xxx.xxx.xx r:..x.....x..x....',
    b: 'k:X.....x...x...x. s:....X..x....X... h:x.xxx.xxx.xxx.xx r:..x.....x..x..x.' },
  { name: 'HYPERPOP', family: 'experimental', bpm: 160, swing: 0, feel: 'half',
    a: 'k:X.....x.x....... c:........X....... h:xxxxxxxxxxxxxxxx g:...x.......x....',
    b: 'k:X.....x.x...x... c:........X...x... h:xxxxxxxxxxxxxxxx g:...x...x...x.x.x' },
];

type Bar = Uint8Array; // PAD_COUNT × STEPS, value 0 / 1 / 2

function parseBar(spec: string): Bar {
  const bar = new Uint8Array(PAD_COUNT * STEPS);
  for (const token of spec.trim().split(/\s+/)) {
    const [lane, steps] = token.split(':');
    const p = LANES[lane];
    if (p === undefined || !steps || steps.length !== STEPS) throw new Error(`pattern lane "${token}"`);
    for (let s = 0; s < STEPS; s++) bar[p * STEPS + s] = steps[s] === 'X' ? 2 : steps[s] === 'x' ? 1 : 0;
  }
  return bar;
}

const lane = (bar: Bar, p: number) => bar.subarray(p * STEPS, (p + 1) * STEPS);
const copy = (bar: Bar) => bar.slice();
const lanesOf = (keys: string) => [...keys].map(k => LANES[k]);
/** Removes the given lanes. */
const without = (bar: Bar, keys: string) => { const b = copy(bar); for (const p of lanesOf(keys)) lane(b, p).fill(0); return b; };
/** Keeps only the given lanes. */
const only = (bar: Bar, keys: string) => { const b = new Uint8Array(bar.length); for (const p of lanesOf(keys)) lane(b, p).set(lane(bar, p)); return b; };
/** Keeps every other hit of a lane, starting with the first. */
const thin = (bar: Bar, key: string) => { const b = copy(bar), l = lane(b, LANES[key]); let n = 0; for (let s = 0; s < STEPS; s++) if (l[s] && n++ % 2) l[s] = 0; return b; };
const set = (bar: Bar, key: string, steps: number[], v = 1) => { const b = copy(bar); for (const s of steps) lane(b, LANES[key])[s] = v; return b; };
/** The backbeat lane the genre uses (snare, clap or rim). */
const backbeat = (bar: Bar) => (['s', 'c', 'r'] as const).find(k => lane(bar, LANES[k]).some(Boolean)) ?? 's';

/** A one-beat (or two-beat for half-time) fill over the end of the bar. */
function withFill(bar: Bar, feel: Feel): Bar {
  const from = feel === 'half' ? 8 : 12;
  let b = copy(bar);
  for (const k of 'sctmuk') lane(b, LANES[k]).fill(0, from + (k === 'k' ? 2 : 0));
  if (feel === 'four') b = set(set(set(b, 'u', [12, 13]), 'm', [14]), 't', [15], 2);
  else if (feel === 'break') b = set(set(set(b, 's', [12, 13, 15]), 'u', [14]), 't', [15], 2);
  else b = set(set(set(set(b, 's', [8, 10, 11]), 'u', [12, 13]), 'm', [14]), 't', [15], 2);
  return b;
}

/** Four bars of rising snare density over the kick and hats. */
function buildBars(a: Bar): Bar[] {
  const base = only(a, 'kbhy');
  const bb = backbeat(a);
  const roll = (every: number, accent: boolean) => Array.from({ length: STEPS / every }, (_, i) => i * every)
    .reduce((b, s) => set(b, bb, [s], accent && s % 4 === 0 ? 2 : 1), base);
  return [roll(4, false), roll(2, false), roll(1, false), set(roll(1, true), 'k', [12, 13, 14, 15], 0)];
}

interface Section { use: PatternUse; bars: Bar[]; note: string }

function sections(g: Genre): Section[] {
  const a = parseBar(g.a), b = parseBar(g.b);
  const crash = (bar: Bar) => set(bar, 'z', [0], 2);
  return [
    { use: 'main', bars: [a, a, a, b], note: 'Core groove, variation on bar 4' },
    { use: 'variation', bars: [b, a, b, crash(b)], note: 'B groove leading, crash into the next phrase' },
    { use: 'intro', bars: [only(a, 'kh'), only(a, 'khy'), only(a, 'khyrp'), without(a, 'o')], note: 'Kick and hats first, the backbeat enters on bar 4' },
    { use: 'breakdown', bars: [thin(without(a, 'kbsct'), 'h'), without(a, 'kbsct'), thin(without(b, 'kbsct'), 'h'), without(b, 'kbct')], note: 'No kick; hats and percussion carry the bars' },
    { use: 'build-up', bars: buildBars(a), note: 'Backbeat roll from quarters to sixteenths, kick drops out on the last beat' },
    { use: 'fill', bars: [a, b, a, withFill(b, g.feel)], note: 'Groove with a tom fill into the next phrase' },
    { use: 'outro', bars: [b, without(a, 'o'), only(a, 'khr'), only(a, 'k')], note: 'Layers leave one by one, kick alone at the end' },
    { use: 'minimal', bars: [only(a, 'kbhcr')], note: 'One bar: kick, hats and backbeat only' },
  ];
}

export interface PatternEntry extends BrowserItem {
  role: PatternUse;
  genre: string;
  family: PatternFamily;
  bpm: number;
  swing: number;
  note: string;
  /** NPATTERNS bars of DR-1 pattern bytes; unused slots stay empty. */
  patterns: Uint8Array;
  chain: number[];
}

const label = (use: PatternUse) => use === 'build-up' ? 'BUILD-UP' : use.toUpperCase();

function build(): PatternEntry[] {
  const out: PatternEntry[] = [];
  for (const g of GENRES) for (const s of sections(g)) {
    const patterns = new Uint8Array(NPATTERNS * PAD_COUNT * STEPS);
    s.bars.forEach((bar, i) => patterns.set(bar, patIdx(i, 0, 0)));
    out.push({
      value: `p${out.length}`,
      name: `${g.name} · ${label(s.use)}`,
      user: false, role: s.use, tags: [g.family],
      genre: g.name, family: g.family, bpm: g.bpm, swing: g.swing, note: s.note,
      patterns, chain: s.bars.map((_, i) => i),
    });
  }
  return out;
}

export const PATTERN_LIBRARY: PatternEntry[] = build();
export const PATTERN_GENRE_COUNT = GENRES.length;
