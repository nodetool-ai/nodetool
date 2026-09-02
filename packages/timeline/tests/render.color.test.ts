/**
 * The one CSS colour parser both GPU sites read (I7, AS1).
 *
 * The document types every colour as a plain string and the Canvas 2D path
 * hands it to `fillStyle`, which parses the whole CSS grammar. What is asserted
 * here is that the GPU path reads the same strings as the same colours — and,
 * for the shapes it cannot read, that it says so instead of inventing one.
 */
import { describe, expect, it } from "vitest";
import { parseCssColor, parseCssColorOrBlack } from "../src/render/color.js";

/** 0..1 channels rounded to bytes, which is the precision a texture keeps. */
function bytes(color: string): [number, number, number, number] | null {
  const parsed = parseCssColor(color);
  if (!parsed) return null;
  return [
    Math.round(parsed.r * 255),
    Math.round(parsed.g * 255),
    Math.round(parsed.b * 255),
    Math.round(parsed.a * 255)
  ];
}

describe("parseCssColor — hex", () => {
  it("reads three, four, six and eight digits", () => {
    expect(bytes("#f00")).toEqual([255, 0, 0, 255]);
    expect(bytes("#f008")).toEqual([255, 0, 0, 136]);
    expect(bytes("#102030")).toEqual([16, 32, 48, 255]);
    expect(bytes("#10203040")).toEqual([16, 32, 48, 64]);
  });

  it("is case- and whitespace-insensitive", () => {
    expect(bytes("  #FFAA00 ")).toEqual([255, 170, 0, 255]);
  });

  it("refuses a digit count CSS does not have", () => {
    expect(parseCssColor("#12345")).toBeNull();
    expect(parseCssColor("#1234567")).toBeNull();
    expect(parseCssColor("102030")).toBeNull();
  });
});

describe("parseCssColor — named colours", () => {
  it("reads the keywords a fillStyle takes", () => {
    expect(bytes("black")).toEqual([0, 0, 0, 255]);
    expect(bytes("white")).toEqual([255, 255, 255, 255]);
    expect(bytes("REBECCAPURPLE")).toEqual([102, 51, 153, 255]);
    expect(bytes("darkslategrey")).toEqual([47, 79, 79, 255]);
  });

  it("reads `transparent` as zero alpha, not as a colour", () => {
    expect(bytes("transparent")).toEqual([0, 0, 0, 0]);
  });

  it("refuses a word that is not a keyword", () => {
    expect(parseCssColor("blackish")).toBeNull();
    expect(parseCssColor("")).toBeNull();
  });
});

describe("parseCssColor — rgb()", () => {
  it("reads integers, commas and spaces alike", () => {
    expect(bytes("rgb(255, 0, 0)")).toEqual([255, 0, 0, 255]);
    expect(bytes("rgb(0 128 255)")).toEqual([0, 128, 255, 255]);
  });

  it("reads percentages", () => {
    expect(bytes("rgb(100%, 0%, 50%)")).toEqual([255, 0, 128, 255]);
  });

  it("reads alpha as a number, a percentage, or a slash tail", () => {
    expect(bytes("rgba(0, 0, 0, 0.5)")).toEqual([0, 0, 0, 128]);
    expect(bytes("rgba(0, 0, 0, 50%)")).toEqual([0, 0, 0, 128]);
    expect(bytes("rgb(0 0 0 / 50%)")).toEqual([0, 0, 0, 128]);
  });

  it("clamps out-of-range channels the way CSS does", () => {
    expect(bytes("rgb(300, -20, 0)")).toEqual([255, 0, 0, 255]);
  });

  it("refuses a wrong argument count or a non-number", () => {
    expect(parseCssColor("rgb(1, 2)")).toBeNull();
    expect(parseCssColor("rgb(1, 2, 3, 4, 5)")).toBeNull();
    expect(parseCssColor("rgb(a, b, c)")).toBeNull();
    expect(parseCssColor("rgb()")).toBeNull();
  });
});

describe("parseCssColor — hsl()", () => {
  it("reads the primaries", () => {
    expect(bytes("hsl(0, 100%, 50%)")).toEqual([255, 0, 0, 255]);
    expect(bytes("hsl(120, 100%, 50%)")).toEqual([0, 255, 0, 255]);
    expect(bytes("hsl(240 100% 50%)")).toEqual([0, 0, 255, 255]);
  });

  it("reads grey at zero saturation and folds the hue", () => {
    expect(bytes("hsl(0, 0%, 50%)")).toEqual([128, 128, 128, 255]);
    expect(bytes("hsl(480, 100%, 50%)")).toEqual([0, 255, 0, 255]);
  });

  it("reads angle units and alpha", () => {
    expect(bytes("hsl(0.5turn, 100%, 50%)")).toEqual([0, 255, 255, 255]);
    expect(bytes("hsla(0, 100%, 50%, 0.5)")).toEqual([255, 0, 0, 128]);
  });

  it("refuses a hue that is not an angle", () => {
    expect(parseCssColor("hsl(red, 100%, 50%)")).toBeNull();
  });
});

describe("parseCssColorOrBlack", () => {
  it("answers black for a string it cannot read — never a colour it invented", () => {
    // The bug this replaces returned pure green for every unparseable string,
    // so a drop shadow on `black` came out green on the GPU and black on 2D.
    expect(parseCssColorOrBlack("not-a-colour")).toEqual({
      r: 0,
      g: 0,
      b: 0,
      a: 1
    });
  });

  it("agrees with itself across the spellings of one colour", () => {
    const spellings = ["#000", "#000000", "black", "rgb(0,0,0)", "hsl(0,0%,0%)"];
    for (const spelling of spellings) {
      expect(parseCssColorOrBlack(spelling)).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    }
  });
});
