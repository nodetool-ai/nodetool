/**
 * @jest-environment node
 *
 * Golden parity test: every operation in `colorMath` must reproduce chroma-js's
 * output for a grid of sample colors, so chroma could be replaced without any
 * visible color change. The expected values in `colorMath.golden.json` were
 * captured from chroma-js 3.x and are frozen here as the contract — the test
 * imports only `colorMath`, with no chroma dependency.
 *
 * Tolerance: RGB channels (0..255) may differ by at most 1, absorbing
 * floating-point rounding at the channel boundary.
 */
import fs from "node:fs";
import path from "node:path";
import {
  parse,
  darken,
  brighten,
  saturate,
  desaturate,
  mix,
  luminance,
  setHslSaturationMultiplier,
  toHex,
  rgba,
  alpha,
  type Color
} from "../colorMath";

type Rgb = [number, number, number];
interface Golden {
  parseHex: Record<string, Rgb>;
  parseOther: Record<string, Rgb>;
  darken: Record<string, Rgb>;
  brighten: Record<string, Rgb>;
  desaturate: Record<string, Rgb>;
  saturate: Record<string, Rgb>;
  chainDesatDarken: Record<string, Rgb>;
  chainDesatBrighten: Record<string, Rgb>;
  mix: Record<string, Rgb>;
  setHslSat: Record<string, Rgb>;
  luminance: Record<string, number>;
  alphaRgba: Record<string, [number, number, number, number]>;
  toHexOpaque: Record<string, string>;
  toHexTranslucent: Record<string, string>;
}

const golden: Golden = JSON.parse(
  fs.readFileSync(path.join(__dirname, "colorMath.golden.json"), "utf8")
);

const SAMPLE_HEXES = Object.keys(golden.parseHex);
const AMOUNTS = [0.1, 0.25, 0.3, 0.4, 1, 1.4, 2];
const TOLERANCE = 1;

function colorRgb(c: Color): Rgb {
  const [r, g, b] = rgba(c);
  return [r, g, b];
}

function expectRgbClose(actual: Rgb, expected: Rgb, context: string): void {
  for (let i = 0; i < 3; i++) {
    const diff = Math.abs(actual[i] - expected[i]);
    if (diff > TOLERANCE) {
      throw new Error(
        `${context}: channel ${i} differs by ${diff} ` +
          `(colorMath=${actual.join(",")} chroma=${expected.join(",")})`
      );
    }
    expect(diff).toBeLessThanOrEqual(TOLERANCE);
  }
}

describe("colorMath parity with chroma-js (frozen golden values)", () => {
  it("parse matches chroma rgb for hex inputs", () => {
    for (const hex of SAMPLE_HEXES) {
      expectRgbClose(colorRgb(parse(hex)), golden.parseHex[hex], `parse(${hex})`);
    }
  });

  it("parse matches chroma for rgb() and named colors", () => {
    for (const [input, expected] of Object.entries(golden.parseOther)) {
      expectRgbClose(colorRgb(parse(input)), expected, `parse(${input})`);
    }
  });

  it("darken matches chroma for every sample × amount", () => {
    for (const hex of SAMPLE_HEXES) {
      for (const n of AMOUNTS) {
        expectRgbClose(
          colorRgb(darken(parse(hex), n)),
          golden.darken[`${hex}|${n}`],
          `darken(${hex}, ${n})`
        );
      }
    }
  });

  it("brighten matches chroma for every sample × amount", () => {
    for (const hex of SAMPLE_HEXES) {
      for (const n of AMOUNTS) {
        expectRgbClose(
          colorRgb(brighten(parse(hex), n)),
          golden.brighten[`${hex}|${n}`],
          `brighten(${hex}, ${n})`
        );
      }
    }
  });

  it("desaturate matches chroma for every sample × amount", () => {
    for (const hex of SAMPLE_HEXES) {
      for (const n of AMOUNTS) {
        expectRgbClose(
          colorRgb(desaturate(parse(hex), n)),
          golden.desaturate[`${hex}|${n}`],
          `desaturate(${hex}, ${n})`
        );
      }
    }
  });

  it("saturate matches chroma for every sample × amount", () => {
    for (const hex of SAMPLE_HEXES) {
      for (const n of AMOUNTS) {
        expectRgbClose(
          colorRgb(saturate(parse(hex), n)),
          golden.saturate[`${hex}|${n}`],
          `saturate(${hex}, ${n})`
        );
      }
    }
  });

  it("chained desaturate→darken matches chroma (GroupNode body tint)", () => {
    for (const hex of SAMPLE_HEXES) {
      expectRgbClose(
        colorRgb(darken(desaturate(parse(hex), 1.4), 0.3)),
        golden.chainDesatDarken[hex],
        `chain(${hex})`
      );
    }
  });

  it("chained desaturate→brighten matches chroma (GroupNode label bg)", () => {
    for (const hex of SAMPLE_HEXES) {
      expectRgbClose(
        colorRgb(brighten(desaturate(parse(hex), 0.4), 0.25)),
        golden.chainDesatBrighten[hex],
        `chain(${hex})`
      );
    }
  });

  it("mix (rgb mode) matches chroma for sample pairs × t", () => {
    const ts = [0, 0.25, 0.35, 0.5, 0.65, 1];
    for (let i = 0; i < SAMPLE_HEXES.length; i++) {
      const a = SAMPLE_HEXES[i];
      const b = SAMPLE_HEXES[(i + 1) % SAMPLE_HEXES.length];
      for (const t of ts) {
        expectRgbClose(
          colorRgb(mix(parse(a), parse(b), t)),
          golden.mix[`${a}|${b}|${t}`],
          `mix(${a}, ${b}, ${t})`
        );
      }
    }
  });

  it("setHslSaturationMultiplier matches chroma for sample × factor", () => {
    for (const hex of SAMPLE_HEXES) {
      for (const factor of [0.5, 0.8, 1.25, 1.5, 2]) {
        expectRgbClose(
          colorRgb(setHslSaturationMultiplier(parse(hex), factor)),
          golden.setHslSat[`${hex}|${factor}`],
          `setHslSaturationMultiplier(${hex}, ${factor})`
        );
      }
    }
  });

  it("luminance matches chroma within a small epsilon", () => {
    for (const hex of SAMPLE_HEXES) {
      expect(Math.abs(luminance(parse(hex)) - golden.luminance[hex])).toBeLessThan(
        1e-6
      );
    }
  });

  it("rgba / alpha matches chroma rgba tuple", () => {
    for (const hex of SAMPLE_HEXES) {
      for (const a of [0, 0.25, 0.5, 1]) {
        const mine = rgba(alpha(parse(hex), a));
        const theirs = golden.alphaRgba[`${hex}|${a}`];
        expectRgbClose(
          [mine[0], mine[1], mine[2]],
          [theirs[0], theirs[1], theirs[2]],
          `rgba(${hex}, ${a})`
        );
        expect(mine[3]).toBeCloseTo(theirs[3], 5);
      }
    }
  });

  it("toHex auto-alpha matches chroma .hex()", () => {
    for (const hex of SAMPLE_HEXES) {
      expect(toHex(parse(hex))).toBe(golden.toHexOpaque[hex]);
      expect(toHex(alpha(parse(hex), 0.5))).toBe(golden.toHexTranslucent[hex]);
    }
  });
});
