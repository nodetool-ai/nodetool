/**
 * `games` router — what the Game creation flow reads before it spends anything
 * (game-prd § 6.1, § 5.6).
 *
 *   templates    (query)    — GameTemplateSummary[] (the shipped manifests)
 *   stylePresets (mutation) — GameStylePresetEntity[] (seeds, then lists)
 *
 * `templates` is the browser's door to the same manifests the
 * `list_game_templates` capability serves an agent: the design step reads slot
 * counts and pixel sizes off them, and the graph builder is a pure function of
 * one. Read-only, no side effect.
 *
 * `stylePresets` is a mutation because it writes on first call — the look step
 * applies a style by entity id, so the row has to exist before the graph can
 * reference it. Idempotent, so the step can call it every time it opens.
 */

import { z } from "zod";
import { listTemplates } from "@nodetool-ai/godot-templates";
import { gameSlotSpec, GAME_STYLE_PRESETS } from "@nodetool-ai/protocol";
import { seedStylePresets } from "../../lib/style-presets.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";

/** One shipped template, as the design step needs it. */
const gameTemplateSummary = z.object({
  /** Manifest template id: `platformer`, `topdown`, `shmup`. */
  id: z.string(),
  /** Godot minor the template targets, e.g. `4.3`. */
  godot: z.string(),
  /**
   * Every asset slot the template declares, verbatim from its manifest. Typed
   * with the manifest's own schema, not `unknown`: the browser rebuilds a
   * `GameAssetManifest` out of one of these rows, so the slot shape has to
   * survive the wire type.
   */
  slots: z.array(gameSlotSpec),
  /** Project-relative files the agent edits after export. */
  hooks: z.array(z.string())
});

/** One seeded game preset, as the look step needs it: an id to apply, art to show. */
const gameStylePresetEntity = z.object({
  /** The library entity id the graph's inline style entity is built from. */
  entityId: z.string(),
  presetId: z.string(),
  name: z.string(),
  descriptor: z.string(),
  /** `package://` path of the tile art. */
  thumbnail: z.string()
});

export const gamesRouter = router({
  templates: protectedProcedure
    .output(z.array(gameTemplateSummary))
    .query(() =>
      listTemplates().map((template) => ({
        id: template.id,
        godot: template.manifest.godot,
        slots: template.manifest.slots,
        hooks: template.manifest.hooks
      }))
    ),

  stylePresets: protectedProcedure
    .output(z.array(gameStylePresetEntity))
    .mutation(async ({ ctx }) => {
      const assets = await seedStylePresets(ctx.userId, GAME_STYLE_PRESETS);
      return GAME_STYLE_PRESETS.map((preset, index) => ({
        entityId: assets[index].id,
        presetId: preset.id,
        name: preset.name,
        descriptor: preset.descriptor,
        thumbnail: preset.thumbnail
      }));
    })
});
