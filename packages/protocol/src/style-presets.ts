/**
 * The twelve shipped art-style presets (PRD § 7.3, § 7.7.9).
 *
 * Each preset becomes one read-only system entity of kind `style` in every
 * user's library. `descriptor` is the payload: it is pasted verbatim into every
 * shot prompt the style applies to (§ 7.7.5), so it names palette, light, lens
 * and surface rather than a mood. The name is what the tile says; the model
 * never sees it.
 *
 * The list lives in protocol because two sides read it: the server seeds rows
 * from it, and the setup flow's style step renders tiles from the same order.
 *
 * `thumbnail` is the `package://` path the tile art is served from. The art is
 * not shipped yet — a tile whose thumbnail does not resolve falls back to a
 * typographic sample, so the step works with or without the files.
 */

import { z } from "zod";

/** One shipped style: what the tile shows and what the prompt gets. */
export interface StylePreset {
  /** Stable slug. Part of the seeded entity's row id, so it never changes. */
  id: string;
  /** Tile label. */
  name: string;
  /** Pasted verbatim into every prompt the style applies to. */
  descriptor: string;
  /** `package://` path of the tile art. */
  thumbnail: string;
}

export const STYLE_PRESETS: readonly StylePreset[] = [
  {
    id: "comic",
    name: "Comic",
    descriptor:
      "Bold black ink outlines over flat cel colour, Ben-Day halftone dots in the mid-tones, primary reds and cyans on newsprint cream, hard-edged cast shadows, no gradients.",
    thumbnail: "package://nodetool-base/styles/comic.jpg"
  },
  {
    id: "cinematic",
    name: "Cinematic",
    descriptor:
      "Anamorphic 40mm at T2, amber key against teal shadows, shallow focus with oval bokeh and a horizontal blue flare, fine 35mm grain, blacks lifted slightly off zero.",
    thumbnail: "package://nodetool-base/styles/cinematic.jpg"
  },
  {
    id: "soft-pencil",
    name: "Soft Pencil",
    descriptor:
      "2B graphite on toothy paper, soft directional hatching smudged into the mid-tones, highlights lifted with a kneaded eraser, one pale colour wash, edges left unfinished.",
    thumbnail: "package://nodetool-base/styles/soft-pencil.jpg"
  },
  {
    id: "animation-3d",
    name: "Animation 3D",
    descriptor:
      "Stylised 3D render with rounded, slightly oversized forms, matte clay-like materials, soft global illumination and subsurface scattering in the skin, shallow ambient occlusion, saturated daylight palette.",
    thumbnail: "package://nodetool-base/styles/animation-3d.jpg"
  },
  {
    id: "watercolor-paint",
    name: "Watercolor Paint",
    descriptor:
      "Wet-on-wet watercolour blooming into cold-press paper grain, transparent layered washes of granulating ultramarine and burnt sienna, bare paper left as the highlight, pigment bleeding past the drawn edge.",
    thumbnail: "package://nodetool-base/styles/watercolor-paint.jpg"
  },
  {
    id: "photo-commercial",
    name: "Photo / Commercial",
    descriptor:
      "Studio photography on an 85mm at f/8, large softbox key with a white bounce fill, seamless sweep background, crisp specular highlights, neutral colour balance, no grain.",
    thumbnail: "package://nodetool-base/styles/photo-commercial.jpg"
  },
  {
    id: "charcoal-sketch",
    name: "Charcoal Sketch",
    descriptor:
      "Compressed charcoal on grey laid paper, broad smudged tonal blocks, velvety blacks against chalk-white highlights, fast gestural contour lines, visible dust and fingerprints.",
    thumbnail: "package://nodetool-base/styles/charcoal-sketch.jpg"
  },
  {
    id: "dark-anime",
    name: "Dark Anime",
    descriptor:
      "Anime cel with hard two-tone shadow shapes, desaturated indigo and rust palette, strong rim light against a night key, dense cross-hatching in the darks, painted background plates.",
    thumbnail: "package://nodetool-base/styles/dark-anime.jpg"
  },
  {
    id: "flat-vector",
    name: "Flat / Vector",
    descriptor:
      "Flat vector shapes with no outlines, a five-colour palette, geometric silhouettes, one offset flat shadow per form, generous negative space, edges crisp at any scale.",
    thumbnail: "package://nodetool-base/styles/flat-vector.jpg"
  },
  {
    id: "noir",
    name: "Noir",
    descriptor:
      "High-contrast black and white, one hard key throwing venetian-blind slats across the frame, crushed shadows, wet reflective asphalt, low camera angles, heavy silver-halide grain.",
    thumbnail: "package://nodetool-base/styles/noir.jpg"
  },
  {
    id: "stick-figure",
    name: "Stick Figure",
    descriptor:
      "Single-weight black marker on plain white, stick-figure bodies with circle heads, props drawn in three or four strokes, hand-lettered labels, no shading and no perspective.",
    thumbnail: "package://nodetool-base/styles/stick-figure.jpg"
  },
  {
    id: "graphic-novel",
    name: "Graphic Novel",
    descriptor:
      "Brush-inked line of varying weight, heavy spotted blacks, screentone texture through the mid-tones, muted slate-and-ochre duotone wash, low-key dramatic panel lighting.",
    thumbnail: "package://nodetool-base/styles/graphic-novel.jpg"
  }
];

/** Metadata key an entity marker lives under on its asset. */
export const ENTITY_METADATA_KEY = "nodetool_entity";

/**
 * The marker fields a shipped preset carries beyond an ordinary entity's.
 * `system` is what makes the row read-only; `preset_id` is what makes seeding
 * recognisable and, with the row id, idempotent.
 */
export interface SystemEntityMarkerFields {
  system: true;
  preset_id: string;
  /** `package://` path of the shipped thumbnail. */
  thumbnail: string;
}

/** The entity marker a seeded style preset's asset carries. */
export function stylePresetMarker(
  preset: StylePreset
): SystemEntityMarkerFields & {
  kind: "style";
  name: string;
  descriptor: string;
} {
  return {
    kind: "style",
    name: preset.name,
    descriptor: preset.descriptor,
    system: true,
    preset_id: preset.id,
    thumbnail: preset.thumbnail
  };
}

/** The one field a read-only check cares about, parsed out of stored JSON. */
const systemMarker = z.object({ system: z.literal(true) });

/**
 * Whether an asset's metadata marks it as a shipped system entity.
 *
 * Every write surface asks this before touching an asset: a preset's descriptor
 * never changes under a user (§ 7.7.9), and a user who wants their own version
 * gets a copy through `Add your own style` instead.
 */
export function isSystemEntityMetadata(
  metadata: Record<string, unknown> | null | undefined
): boolean {
  return systemMarker.safeParse(metadata?.[ENTITY_METADATA_KEY]).success;
}
