/**
 * Text legibility: the two failures a document decides on its own.
 *
 * A title too small to read at delivery size, and a title whose colour is too
 * close to what sits behind it, are the motion mistakes a frame preview catches
 * and a structural check used to leave to the agent (F24). Both are warnings
 * (R5): the heuristic is a floor, not a judgement, and the picture still
 * renders.
 *
 * The check refuses to guess. A colour it cannot parse, a gradient fill, a
 * translucent plate, a backdrop it cannot prove is behind the text — each ends
 * the contrast check rather than producing a finding, because a legibility
 * warning nobody can act on is worse than none.
 */
import type {
  ClipTransform,
  TimelineClip,
  TimelineDocument
} from "@nodetool-ai/protocol/api-schemas/timeline.js";
import { resolveClipLayoutsWithDiagnostics } from "@nodetool-ai/timeline/scene";

import { containsBox, frameBoxFor } from "./frame-geometry.js";
import type { TimelineDebugIssue } from "./types.js";

/**
 * Cap height a viewer can read on a phone. 2.5% of frame height is 27px at
 * 1080p — the floor broadcast lower-third practice lands on, and the one the
 * task list names.
 */
const MIN_TEXT_HEIGHT_FRAC = 0.025;

/** WCAG 2.2 AA for large text. Titles are large text; body copy is not here. */
const MIN_CONTRAST_RATIO = 3;

/** The basic CSS colour names and their aliases, which authored styles use. */
const NAMED_COLORS = new Map(Object.entries({
  black: "#000000",
  silver: "#c0c0c0",
  gray: "#808080",
  grey: "#808080",
  white: "#ffffff",
  maroon: "#800000",
  red: "#ff0000",
  purple: "#800080",
  fuchsia: "#ff00ff",
  magenta: "#ff00ff",
  green: "#008000",
  lime: "#00ff00",
  olive: "#808000",
  yellow: "#ffff00",
  navy: "#000080",
  blue: "#0000ff",
  teal: "#008080",
  aqua: "#00ffff",
  cyan: "#00ffff"
}));

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * An opaque sRGB colour, or `null` for anything this check will not reason
 * about — an unknown notation, and any colour carrying alpha, since what shows
 * through a translucent fill is a compositing question and not a document one.
 */
function parseOpaqueColor(input: string | undefined): Rgb | null {
  if (input === undefined) return null;
  const trimmed = input.trim();
  const value = NAMED_COLORS.get(trimmed.toLowerCase()) ?? trimmed;

  const hex = /^#([0-9a-f]{3,8})$/i.exec(value);
  if (hex) {
    const digits = hex[1]!;
    if (digits.length === 3 || digits.length === 4) {
      if (digits.length === 4 && digits[3] !== "f" && digits[3] !== "F") {
        return null;
      }
      const [r, g, b] = [digits[0]!, digits[1]!, digits[2]!].map((d) =>
        parseInt(`${d}${d}`, 16)
      );
      return { r: r!, g: g!, b: b! };
    }
    if (digits.length === 6 || digits.length === 8) {
      if (digits.length === 8 && parseInt(digits.slice(6), 16) !== 255) {
        return null;
      }
      return {
        r: parseInt(digits.slice(0, 2), 16),
        g: parseInt(digits.slice(2, 4), 16),
        b: parseInt(digits.slice(4, 6), 16)
      };
    }
    return null;
  }

  const rgb =
    /^rgba?\(\s*([0-9.]+)\s*[, ]\s*([0-9.]+)\s*[, ]\s*([0-9.]+)\s*(?:[,/]\s*([0-9.]+)\s*)?\)$/i.exec(
      value
    );
  if (!rgb) return null;
  if (rgb[4] !== undefined && Number(rgb[4]) < 1) return null;
  const channels = [rgb[1]!, rgb[2]!, rgb[3]!].map(Number);
  if (channels.some((c) => !Number.isFinite(c) || c < 0 || c > 255)) return null;
  return { r: channels[0]!, g: channels[1]!, b: channels[2]! };
}

/** WCAG relative luminance of an sRGB triple. */
function relativeLuminance({ r, g, b }: Rgb): number {
  const linear = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
function contrastRatio(a: Rgb, b: Rgb): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x
  );
  return (light! + 0.05) / (dark! + 0.05);
}

/** The colour a text clip's glyphs are filled with, or `null` for a gradient. */
function textColor(clip: TimelineClip): string | undefined {
  const style = clip.textStyle;
  if (!style) return undefined;
  const fill = style.fill;
  if (fill) return fill.type === "solid" ? fill.color : undefined;
  return style.color;
}

/**
 * A shape clip that is provably behind the text at every instant the text is
 * on screen, and provably covers it.
 *
 * "Provably" is doing the work. Track z is `1000 - index` (I9), so a higher
 * index draws underneath; the shape must be opaque and solid-filled; its
 * window must contain the text's; and its *resolved* frame-space box — the
 * layout-managed position a `row`/`stack`/`relative` container placed it at,
 * composed through every ancestor transform, the same geometry
 * `showcase.ts`'s collision check reads — must contain the text's box. A
 * literal full-frame rect always qualifies this way (its box contains
 * anything), so this subsumes the old "must be exactly x=0,y=0,w=1,h=1"
 * rule; it additionally recognizes the small pill or plate a flex container
 * places directly behind a title (an `inset: 0` child of the text's own
 * container), which the old rule missed and measured contrast against
 * whatever unrelated full-frame shape happened to sit elsewhere in the
 * scene instead. A shape that only mostly contains the text is not reported
 * — the check would then be naming a plate the title does not actually sit
 * fully on.
 */
// Wider than `containsBox`'s own 0.5px default: a text box is a *character-
// count* estimate (`text.length * fontSizePx * 0.6`, this package has no
// canvas dependency to measure real glyph widths), not a rendered one, and a
// tight pill sized to the real glyph width can end up a couple of px
// narrower than the estimate — see prism's "4 COLOURWAYS" plate, sized to
// 300px against an estimated 302.4px title. A few px of slack absorbs that
// estimation error without accepting a shape that is actually a different
// size from the text's.
const BACKDROP_CONTAINMENT_SLACK_PX = 4;

function backdropShapeColor(
  doc: TimelineDocument,
  text: TimelineClip,
  canvas: { width: number; height: number },
  byId: ReadonlyMap<string, TimelineClip>,
  resolved: ReadonlyMap<string, ClipTransform>,
  sizes: ReadonlyMap<string, { width: number; height: number }>
): string | undefined {
  const trackIndex = new Map(
    doc.tracks
      .filter((track) => track.type !== "audio" && track.visible)
      .map((track) => [track.id, track.index])
  );
  const textIndex = trackIndex.get(text.trackId);
  if (textIndex === undefined) return undefined;
  const textEndMs = text.startMs + text.durationMs;
  const textBox = frameBoxFor(text, canvas, byId, resolved, undefined, false, sizes);
  if (!textBox) return undefined;

  let bestIndex = Number.POSITIVE_INFINITY;
  let bestColor: string | undefined;
  for (const clip of doc.clips) {
    if (clip.mediaType !== "shape" || clip.hidden === true) continue;
    const index = trackIndex.get(clip.trackId);
    if (index === undefined || index <= textIndex || index >= bestIndex) {
      continue;
    }
    if ((clip.opacity ?? 1) < 1 || clip.mask || clip.matte) continue;
    if (clip.startMs > text.startMs) continue;
    if (clip.startMs + clip.durationMs < textEndMs) continue;

    const style = clip.shapeStyle;
    if (!style || style.kind !== "rect") continue;
    const authoredFill = style.fillStyle ?? style.fill;
    const fill =
      typeof authoredFill === "string"
        ? authoredFill
        : authoredFill?.type === "solid"
          ? authoredFill.color
          : undefined;
    if (fill === undefined) continue;

    const shapeBox = frameBoxFor(clip, canvas, byId, resolved, undefined, false, sizes);
    if (!shapeBox || !containsBox(shapeBox, textBox, BACKDROP_CONTAINMENT_SLACK_PX)) continue;

    bestIndex = index;
    bestColor = fill;
  }
  return bestColor;
}

/**
 * Whether a picture clip is drawn under this text for any of its window.
 *
 * "Under" is the same z rule the backdrop check uses — a higher track index
 * composites below — and any video or image clip counts, since a frame of it
 * can be any colour. What it is *not* is a judgement about contrast: nothing
 * in the document says what the picture looks like at that instant.
 */
function pictureUnder(doc: TimelineDocument, text: TimelineClip): boolean {
  const trackIndex = new Map(
    doc.tracks
      .filter((track) => track.type !== "audio" && track.visible)
      .map((track) => [track.id, track.index])
  );
  const textIndex = trackIndex.get(text.trackId);
  if (textIndex === undefined) return false;
  const textEndMs = text.startMs + text.durationMs;
  return doc.clips.some((clip) => {
    if (clip.mediaType !== "video" && clip.mediaType !== "image") return false;
    if (clip.hidden === true) return false;
    const index = trackIndex.get(clip.trackId);
    if (index === undefined || index <= textIndex) return false;
    return clip.startMs < textEndMs && clip.startMs + clip.durationMs > text.startMs;
  });
}

/**
 * Legibility findings for every text clip in the document. `canvas` is the
 * sequence's pixel size — a font size is authored in sequence pixels, so the
 * floor is a fraction of the height and not of anything on the author's
 * screen, and the backdrop check below resolves every clip's box against it.
 */
export function checkLegibility(
  doc: TimelineDocument,
  canvas: { width: number; height: number }
): TimelineDebugIssue[] {
  const issues: TimelineDebugIssue[] = [];
  const byId = new Map(doc.clips.map((clip) => [clip.id, clip]));
  // No `measureText`: this package has no canvas dependency, so text boxes
  // fall back to the same `text.length * fontSizePx * 0.6` estimate
  // `frame-geometry.ts` and the render layout resolver itself use headless.
  const layoutResolved = resolveClipLayoutsWithDiagnostics(doc.clips, canvas);
  const resolved = layoutResolved.transforms;
  const sizes = layoutResolved.sizes;
  const frameHeight = canvas.height;
  for (const clip of doc.clips) {
    const style = clip.textStyle;
    if (clip.mediaType !== "text" || !style || clip.hidden === true) continue;
    const label = clip.name || clip.id;
    const at = { clipId: clip.id, trackId: clip.trackId };

    const minPx = frameHeight * MIN_TEXT_HEIGHT_FRAC;
    if (style.fontSizePx < minPx) {
      issues.push({
        severity: "warning",
        code: "text_illegible",
        message: `Clip "${label}" sets ${Math.round(style.fontSizePx)}px type in a ${frameHeight}px frame — under ${(MIN_TEXT_HEIGHT_FRAC * 100).toFixed(1)}% of frame height (${Math.round(minPx)}px), which is unreadable on a phone.`,
        path: "textStyle.fontSizePx",
        ...at
      });
    }

    // Type drawn straight onto moving picture with nothing behind it is the
    // case the contrast check gives up on — the frame decides it, not the
    // document. Saying nothing made a clean validation read as approval, so
    // the check reports that it could not judge and names the two fixes and
    // the tool that answers it.
    const backed =
      style.background !== undefined ||
      style.stroke !== undefined ||
      backdropShapeColor(doc, clip, canvas, byId, resolved, sizes) !== undefined;
    if (!backed && pictureUnder(doc, clip)) {
      issues.push({
        severity: "warning",
        code: "text_backing_unproven",
        message: `Clip "${label}" draws over picture with no scrim, plate or outline, so nothing here decides whether it is readable — render the frame with preview_timeline_frame and look, or give it textStyle.background or textStyle.stroke.`,
        path: "textStyle",
        ...at
      });
    }

    const foreground = parseOpaqueColor(textColor(clip));
    if (!foreground) continue;
    const plate = style.background?.color;
    const behind = plate ?? backdropShapeColor(doc, clip, canvas, byId, resolved, sizes);
    const background = parseOpaqueColor(behind);
    if (!background) continue;
    const ratio = contrastRatio(foreground, background);
    if (ratio >= MIN_CONTRAST_RATIO) continue;
    issues.push({
      severity: "warning",
      code: "text_illegible",
      message: `Clip "${label}" draws ${textColor(clip)} on ${behind}${plate ? " (its own background plate)" : " (the shape clip behind it)"} — a contrast ratio of ${ratio.toFixed(2)}:1, under the ${MIN_CONTRAST_RATIO}:1 large-text floor.`,
      path: plate ? "textStyle.background.color" : "textStyle.color",
      ...at
    });
  }
  return issues;
}
