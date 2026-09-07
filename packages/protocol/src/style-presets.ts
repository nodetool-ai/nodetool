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
 * `thumbnail` is the `package://` path the tile art is served from. Each file
 * ships under `packages/base-nodes/nodetool/assets/nodetool-base/styles/`, and
 * every sample renders the same street corner so the grid compares styles
 * rather than subjects. A tile whose thumbnail does not resolve falls back to a
 * typographic sample, so a new preset works before its art is drawn.
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

/**
 * The six shipped game style presets (game-prd § 5.6).
 *
 * Separate from {@link STYLE_PRESETS} because they answer a different
 * question: a storyboard style describes a lens and a grade, a game style
 * describes a pixel grid. The Game flow's Look step renders these, the seeder
 * writes them as library `style` entities from the same list, and every prompt
 * the game graph builds carries the descriptor verbatim.
 *
 * Every descriptor ends with {@link GAME_STYLE_DESCRIPTOR_TAIL}: a sprite that
 * comes back on a painted backdrop cannot be composited, and text baked into a
 * tile sheet cannot be removed.
 */
export const GAME_STYLE_DESCRIPTOR_TAIL =
  "transparent background for sprites, flat lighting, no text, no watermark";

const gameStyle = (
  id: string,
  name: string,
  gist: string
): StylePreset => ({
  id,
  name,
  descriptor: `${gist}, ${GAME_STYLE_DESCRIPTOR_TAIL}`,
  thumbnail: `package://nodetool-base/styles/game-${id}.png`
});

export const GAME_STYLE_PRESETS: readonly StylePreset[] = [
  gameStyle(
    "pixel-16bit",
    "16-bit console",
    "16-bit console pixel art on a 32px cell, four-shade ramps per material, solid black outlines, warm palette of rust orange, moss green and slate blue, no anti-aliasing, no dithering"
  ),
  gameStyle(
    "pixel-8bit",
    "8-bit",
    "8-bit pixel art on a 16px cell, three colours per sprite, hard black outlines, primary palette of red, blue and cream on black, chunky one-pixel detail, no dithering, no anti-aliasing"
  ),
  gameStyle(
    "pixel-handheld",
    "Handheld pastel",
    "Handheld pixel art on a 32px cell, four-tone pastel ramp of pale green, cream, sage and deep olive, soft grey-green outlines rather than black, no anti-aliasing"
  ),
  gameStyle(
    "pixel-1bit",
    "1-bit",
    "1-bit pixel art in two colours only, off-white on near-black, shading carried entirely by ordered dither patterns, thick single-colour outlines, no midtones"
  ),
  gameStyle(
    "pixel-modern",
    "Chunky modern pixel",
    "Modern pixel art on a 32px cell, wide saturated palette, outlines coloured from the material rather than black, a cool rim light along the top edge, subtle dithering in the shadow ramp only"
  ),
  gameStyle(
    "painted-2d",
    "Painted 2D",
    "Hand-painted 2D game art in gouache, visible brush texture, soft edges, saturated mid-tones with muted shadows, no pixel grid and no outline"
  )
];

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
