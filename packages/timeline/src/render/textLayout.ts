/**
 * textLayout — the wrap, the grapheme split and the stagger-unit enumeration
 * shared by the text rasterizer and the stagger compiler.
 *
 * The compiler times a stagger against a unit COUNT and the rasterizer walks a
 * unit LIST. If the two disagree, the last units of a title animate at the
 * wrong moment or never at all, so both come from this module.
 *
 * Word and character counts are independent of where the lines break — a wrap
 * regroups words but never adds or removes one, and a break consumes exactly
 * the separator a space would have occupied — so those two are counted with no
 * measurement at all. Line counts are not: they need the same measured wrap the
 * draw uses, which is what {@link MeasureTextWidth} carries into the count.
 *
 * Pure: written against a width function, never a canvas context.
 */

import type { ClipTextStyle } from "../types.js";
import { countStaggerUnits } from "../animation/compile.js";
import type { StaggerUnit } from "../animation/types.js";

/**
 * Advance width of `text` set in `font` (a CSS `font` shorthand). The host
 * supplies one backed by the same 2D context kind its rasterizer draws
 * through, so the count wraps exactly where the draw does.
 */
export type MeasureTextWidth = (text: string, font: string) => number;

/**
 * The canvas the scene model resolves a frame against: the sequence's pixel
 * size, plus an optional measurer. Without one, `"line"` staggers fall back to
 * counting explicit line breaks — a soft-wrapped title then reports fewer
 * units than the rasterizer draws, and the extra lines animate with the last
 * counted one (see {@link layoutStaggerUnits}).
 */
export interface RenderCanvas {
  width: number;
  height: number;
  measureText?: MeasureTextWidth;
}

/** The `ctx.font` shorthand a text style renders with. */
export function textFontSpec(style: ClipTextStyle): string {
  const fontSize = Math.max(1, style.fontSizePx);
  const family = style.fontFamily ?? "Inter, Arial, sans-serif";
  return `${style.fontWeight ?? 400} ${fontSize}px ${family}`;
}

/** The px the text wraps within, from `maxWidthFrac` of the canvas. */
export function textMaxWidthPx(
  style: ClipTextStyle,
  canvasWidth: number
): number {
  return canvasWidth * Math.min(1, Math.max(0.05, style.maxWidthFrac ?? 0.8));
}

export interface WrappedLine {
  text: string;
  words: string[];
}

/**
 * Greedy word-wrap by measured candidate width — the one wrap rule for every
 * draw and count path, so a staggered title breaks lines exactly like its
 * un-staggered self.
 */
export function wrapTextLines(
  text: string,
  maxWidth: number,
  measure: (text: string) => number
): WrappedLine[] {
  const lines: WrappedLine[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = "";
    let lineWords: string[] = [];
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && measure(candidate) > maxWidth) {
        lines.push({ text: line, words: lineWords });
        line = word;
        lineWords = [word];
      } else {
        line = candidate;
        lineWords.push(word);
      }
    }
    lines.push({ text: line, words: lineWords });
  }
  return lines;
}

/**
 * `Intl.Segmenter` is the only correct grapheme splitter — an emoji built from
 * several code points (a ZWJ family, a flag) is one cluster, as is a letter
 * followed by combining marks. Resolved once: constructing a segmenter is not
 * cheap and the rasterizer runs per frame.
 */
const graphemeSegmenter =
  typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

/**
 * Split `text` into grapheme clusters. On a runtime with no `Intl.Segmenter`
 * this falls back to code points, which splits a ZWJ sequence into its parts —
 * the count is then higher than the glyphs drawn, which is a timing artifact
 * rather than a broken frame, because the count and the draw both fall back.
 */
export function segmentGraphemes(text: string): string[] {
  if (graphemeSegmenter) {
    const out: string[] = [];
    for (const { segment } of graphemeSegmenter.segment(text)) out.push(segment);
    return out;
  }
  return Array.from(text);
}

/**
 * How many units `unit` splits a text style into — the number the compiler
 * times the stagger span against.
 *
 * `"character"` counts one unit per grapheme of every word plus one per gap
 * between words, whether that gap is drawn as a space or eaten by a line
 * break. That is what makes the count wrap-independent while still matching
 * the draw: whitespace is timed and draws nothing.
 */
export function countTextStaggerUnits(
  style: ClipTextStyle,
  canvas: RenderCanvas,
  unit: StaggerUnit
): number {
  const text = style.text;
  if (unit === "word") return countStaggerUnits(text);
  if (unit === "character") {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return 0;
    let count = words.length - 1; // one separator per gap
    for (const word of words) count += segmentGraphemes(word).length;
    return count;
  }
  return wrapTextLines(
    text,
    textMaxWidthPx(style, canvas.width),
    measurerFor(style, canvas)
  ).length;
}

/**
 * A width function for `style`, or one that reports zero when the canvas
 * carries no measurer — under which nothing ever exceeds the wrap width, so
 * `wrapTextLines` returns one line per authored paragraph.
 */
function measurerFor(
  style: ClipTextStyle,
  canvas: RenderCanvas
): (text: string) => number {
  const measure = canvas.measureText;
  if (!measure) return () => 0;
  const font = textFontSpec(style);
  return (text) => measure(text, font);
}

/**
 * One unit of a staggered text draw, in the raster's own pixel space.
 * `text` is empty for a whitespace unit: it takes an index (so the units after
 * it are timed correctly) and draws nothing.
 */
export interface TextStaggerUnit {
  text: string;
  /** Left edge in canvas px. */
  x: number;
  /** Advance width in canvas px. */
  width: number;
  /** Vertical center of the unit's line (textBaseline "middle"). */
  y: number;
  /** Line box height in canvas px — the unit's vertical extent. */
  height: number;
}

/**
 * Lay `style.text` out into the units `unit` names, in the order the stagger
 * times them. The list length equals {@link countTextStaggerUnits} for the
 * same style, canvas and unit whenever both see the same measurer.
 *
 * Character units are positioned from cumulative `measureText` prefixes rather
 * than per-glyph widths, so a glyph sits where the shaped word would have put
 * it. Drawing them one at a time still drops kerning between the pair, the
 * same trade the per-word draw already makes.
 */
export function layoutStaggerUnits(
  measure: (text: string) => number,
  style: ClipTextStyle,
  width: number,
  height: number,
  unit: StaggerUnit
): TextStaggerUnit[] {
  const fontSize = Math.max(1, style.fontSizePx);
  const align = style.align ?? "center";
  const maxWidth = textMaxWidthPx(style, width);
  const lines = wrapTextLines(style.text, maxWidth, measure);
  const spaceWidth = measure(" ");
  const lineHeight = fontSize * 1.2;
  const firstY = height / 2 - ((lines.length - 1) * lineHeight) / 2;
  const out: TextStaggerUnit[] = [];

  lines.forEach((line, lineIndex) => {
    const widths = line.words.map((word) => measure(word));
    const lineWidth =
      widths.reduce((sum, w) => sum + w, 0) +
      spaceWidth * Math.max(0, line.words.length - 1);
    const lineX =
      align === "left"
        ? (width - maxWidth) / 2
        : align === "right"
          ? (width + maxWidth) / 2 - lineWidth
          : (width - lineWidth) / 2;
    const y = firstY + lineIndex * lineHeight;

    if (unit === "line") {
      out.push({
        text: line.text,
        x: lineX,
        width: lineWidth,
        y,
        height: lineHeight
      });
      return;
    }
    // The break that starts this line ate the space that would have separated
    // it from the previous one, so it takes that separator's index. Counting
    // it here rather than at the end of the previous line is what keeps a
    // blank line (an empty paragraph) from inventing a unit.
    if (unit === "character" && line.words.length > 0 && out.length > 0) {
      out.push({ text: "", x: lineX, width: 0, y, height: lineHeight });
    }

    let x = lineX;
    line.words.forEach((word, wordIndex) => {
      if (unit === "word") {
        out.push({
          text: word,
          x,
          width: widths[wordIndex],
          y,
          height: lineHeight
        });
      } else {
        let prefixWidth = 0;
        let prefix = "";
        for (const grapheme of segmentGraphemes(word)) {
          prefix += grapheme;
          const nextWidth = measure(prefix);
          out.push({
            text: grapheme,
            x: x + prefixWidth,
            width: nextWidth - prefixWidth,
            y,
            height: lineHeight
          });
          prefixWidth = nextWidth;
        }
        // The space between two words on one line is a unit too: timed, and
        // drawn as nothing.
        if (wordIndex < line.words.length - 1) {
          out.push({ text: "", x: x + widths[wordIndex], width: spaceWidth, y, height: lineHeight });
        }
      }
      x += widths[wordIndex] + spaceWidth;
    });
  });
  return out;
}
