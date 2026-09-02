/**
 * CSS colour strings to normalized channels, for the hosts that cannot hand a
 * string to a canvas.
 *
 * Every colour on the document is typed `string`, and the Canvas 2D path
 * assigns it to `fillStyle`, which parses the whole CSS colour grammar. The
 * GPU path has to parse it itself, and parsing only six-digit hex is what made
 * a `dropShadow` on `black` render green and a dip to `white` draw nothing.
 * Both GPU sites read this parser so the two hosts agree on what a colour is.
 */

/** Channels in 0..1, alpha included. */
export interface ParsedColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * The CSS Color Level 4 named colours, as packed `0xrrggbb`. `transparent` is
 * not here because it carries an alpha the packing cannot hold.
 */
const NAMED_COLORS: Record<string, number> = {
  aliceblue: 0xf0f8ff,
  antiquewhite: 0xfaebd7,
  aqua: 0x00ffff,
  aquamarine: 0x7fffd4,
  azure: 0xf0ffff,
  beige: 0xf5f5dc,
  bisque: 0xffe4c4,
  black: 0x000000,
  blanchedalmond: 0xffebcd,
  blue: 0x0000ff,
  blueviolet: 0x8a2be2,
  brown: 0xa52a2a,
  burlywood: 0xdeb887,
  cadetblue: 0x5f9ea0,
  chartreuse: 0x7fff00,
  chocolate: 0xd2691e,
  coral: 0xff7f50,
  cornflowerblue: 0x6495ed,
  cornsilk: 0xfff8dc,
  crimson: 0xdc143c,
  cyan: 0x00ffff,
  darkblue: 0x00008b,
  darkcyan: 0x008b8b,
  darkgoldenrod: 0xb8860b,
  darkgray: 0xa9a9a9,
  darkgreen: 0x006400,
  darkgrey: 0xa9a9a9,
  darkkhaki: 0xbdb76b,
  darkmagenta: 0x8b008b,
  darkolivegreen: 0x556b2f,
  darkorange: 0xff8c00,
  darkorchid: 0x9932cc,
  darkred: 0x8b0000,
  darksalmon: 0xe9967a,
  darkseagreen: 0x8fbc8f,
  darkslateblue: 0x483d8b,
  darkslategray: 0x2f4f4f,
  darkslategrey: 0x2f4f4f,
  darkturquoise: 0x00ced1,
  darkviolet: 0x9400d3,
  deeppink: 0xff1493,
  deepskyblue: 0x00bfff,
  dimgray: 0x696969,
  dimgrey: 0x696969,
  dodgerblue: 0x1e90ff,
  firebrick: 0xb22222,
  floralwhite: 0xfffaf0,
  forestgreen: 0x228b22,
  fuchsia: 0xff00ff,
  gainsboro: 0xdcdcdc,
  ghostwhite: 0xf8f8ff,
  gold: 0xffd700,
  goldenrod: 0xdaa520,
  gray: 0x808080,
  green: 0x008000,
  greenyellow: 0xadff2f,
  grey: 0x808080,
  honeydew: 0xf0fff0,
  hotpink: 0xff69b4,
  indianred: 0xcd5c5c,
  indigo: 0x4b0082,
  ivory: 0xfffff0,
  khaki: 0xf0e68c,
  lavender: 0xe6e6fa,
  lavenderblush: 0xfff0f5,
  lawngreen: 0x7cfc00,
  lemonchiffon: 0xfffacd,
  lightblue: 0xadd8e6,
  lightcoral: 0xf08080,
  lightcyan: 0xe0ffff,
  lightgoldenrodyellow: 0xfafad2,
  lightgray: 0xd3d3d3,
  lightgreen: 0x90ee90,
  lightgrey: 0xd3d3d3,
  lightpink: 0xffb6c1,
  lightsalmon: 0xffa07a,
  lightseagreen: 0x20b2aa,
  lightskyblue: 0x87cefa,
  lightslategray: 0x778899,
  lightslategrey: 0x778899,
  lightsteelblue: 0xb0c4de,
  lightyellow: 0xffffe0,
  lime: 0x00ff00,
  limegreen: 0x32cd32,
  linen: 0xfaf0e6,
  magenta: 0xff00ff,
  maroon: 0x800000,
  mediumaquamarine: 0x66cdaa,
  mediumblue: 0x0000cd,
  mediumorchid: 0xba55d3,
  mediumpurple: 0x9370db,
  mediumseagreen: 0x3cb371,
  mediumslateblue: 0x7b68ee,
  mediumspringgreen: 0x00fa9a,
  mediumturquoise: 0x48d1cc,
  mediumvioletred: 0xc71585,
  midnightblue: 0x191970,
  mintcream: 0xf5fffa,
  mistyrose: 0xffe4e1,
  moccasin: 0xffe4b5,
  navajowhite: 0xffdead,
  navy: 0x000080,
  oldlace: 0xfdf5e6,
  olive: 0x808000,
  olivedrab: 0x6b8e23,
  orange: 0xffa500,
  orangered: 0xff4500,
  orchid: 0xda70d6,
  palegoldenrod: 0xeee8aa,
  palegreen: 0x98fb98,
  paleturquoise: 0xafeeee,
  palevioletred: 0xdb7093,
  papayawhip: 0xffefd5,
  peachpuff: 0xffdab9,
  peru: 0xcd853f,
  pink: 0xffc0cb,
  plum: 0xdda0dd,
  powderblue: 0xb0e0e6,
  purple: 0x800080,
  rebeccapurple: 0x663399,
  red: 0xff0000,
  rosybrown: 0xbc8f8f,
  royalblue: 0x4169e1,
  saddlebrown: 0x8b4513,
  salmon: 0xfa8072,
  sandybrown: 0xf4a460,
  seagreen: 0x2e8b57,
  seashell: 0xfff5ee,
  sienna: 0xa0522d,
  silver: 0xc0c0c0,
  skyblue: 0x87ceeb,
  slateblue: 0x6a5acd,
  slategray: 0x708090,
  slategrey: 0x708090,
  snow: 0xfffafa,
  springgreen: 0x00ff7f,
  steelblue: 0x4682b4,
  tan: 0xd2b48c,
  teal: 0x008080,
  thistle: 0xd8bfd8,
  tomato: 0xff6347,
  turquoise: 0x40e0d0,
  violet: 0xee82ee,
  wheat: 0xf5deb3,
  white: 0xffffff,
  whitesmoke: 0xf5f5f5,
  yellow: 0xffff00,
  yellowgreen: 0x9acd32
};

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** A `<number>` or `<percentage>`, normalized against `full`. */
function component(token: string, full: number): number | null {
  const text = token.trim();
  if (text === "") return null;
  const percent = text.endsWith("%");
  const value = Number(percent ? text.slice(0, -1) : text);
  if (!Number.isFinite(value)) return null;
  return clamp01(percent ? value / 100 : value / full);
}

/** A hue in CSS angle units, folded to 0..360. */
function hue(token: string): number | null {
  const text = token.trim().toLowerCase();
  const match = /^([+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?)(deg|grad|rad|turn)?$/.exec(
    text
  );
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const degrees =
    match[2] === "grad"
      ? value * 0.9
      : match[2] === "rad"
        ? (value * 180) / Math.PI
        : match[2] === "turn"
          ? value * 360
          : value;
  return ((degrees % 360) + 360) % 360;
}

function fromHex(text: string): ParsedColor | null {
  const match = /^#([0-9a-f]{3,8})$/i.exec(text);
  if (!match) return null;
  const digits = match[1]!;
  if (digits.length !== 3 && digits.length !== 4 && digits.length !== 6 && digits.length !== 8) {
    return null;
  }
  const size = digits.length <= 4 ? 1 : 2;
  const at = (index: number): number => {
    const slice = digits.slice(index * size, index * size + size);
    return Number.parseInt(size === 1 ? slice + slice : slice, 16) / 255;
  };
  const count = digits.length / size;
  return { r: at(0), g: at(1), b: at(2), a: count === 4 ? at(3) : 1 };
}

/**
 * The argument list of `name(...)`, split on commas or whitespace with an
 * optional `/ alpha` tail — CSS accepts both the legacy comma form and the
 * modern space form, and a canvas takes either.
 */
function args(text: string, name: string): string[] | null {
  const match = new RegExp(`^${name}a?\\(([^()]*)\\)$`, "i").exec(text);
  if (!match) return null;
  const body = match[1]!.trim();
  if (body === "") return null;
  const [head, ...rest] = body.split("/");
  if (rest.length > 1) return null;
  const parts = head!.trim().split(/[\s,]+/).filter((p) => p !== "");
  if (rest.length === 1) {
    const alpha = rest[0]!.trim();
    if (alpha === "") return null;
    parts.push(alpha);
  }
  return parts;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const sector = Math.floor(h / 60) % 6;
  const table: [number, number, number][] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x]
  ];
  const [r, g, b] = table[sector]!;
  return [r + m, g + m, b + m];
}

/**
 * Parse a CSS colour into 0..1 channels, or null when the string is not one
 * this parser knows. A caller that must draw something decides its own
 * fallback; it never guesses a colour here.
 */
export function parseCssColor(input: string): ParsedColor | null {
  const text = input.trim().toLowerCase();
  if (text === "") return null;
  if (text === "transparent") return { r: 0, g: 0, b: 0, a: 0 };

  const named = NAMED_COLORS[text];
  if (named !== undefined) {
    return {
      r: ((named >> 16) & 0xff) / 255,
      g: ((named >> 8) & 0xff) / 255,
      b: (named & 0xff) / 255,
      a: 1
    };
  }

  const hex = fromHex(text);
  if (hex) return hex;

  const rgb = args(text, "rgb");
  if (rgb) {
    if (rgb.length !== 3 && rgb.length !== 4) return null;
    const r = component(rgb[0]!, 255);
    const g = component(rgb[1]!, 255);
    const b = component(rgb[2]!, 255);
    const a = rgb.length === 4 ? component(rgb[3]!, 1) : 1;
    if (r === null || g === null || b === null || a === null) return null;
    return { r, g, b, a };
  }

  const hsl = args(text, "hsl");
  if (hsl) {
    if (hsl.length !== 3 && hsl.length !== 4) return null;
    const h = hue(hsl[0]!);
    const s = component(hsl[1]!, 1);
    const l = component(hsl[2]!, 1);
    const a = hsl.length === 4 ? component(hsl[3]!, 1) : 1;
    if (h === null || s === null || l === null || a === null) return null;
    const [r, g, b] = hslToRgb(h, s, l);
    return { r, g, b, a };
  }

  return null;
}

/** {@link parseCssColor}, falling back to opaque black on an unknown string. */
export function parseCssColorOrBlack(input: string): ParsedColor {
  return parseCssColor(input) ?? { r: 0, g: 0, b: 0, a: 1 };
}
