import { z } from "zod";
import { presetJsonSchema, presetSchema } from "./schema.js";

const slugSchema = z.string().regex(/^[a-z0-9-]+$/);

/**
 * Where a studio opens. Each target is an existing surface, so a studio adds no
 * engine: the Create view in one mode, the Effects gallery, the Lipsync studio,
 * a shipped starter skill, a guided flow, or a shipped example mini app.
 */
export const studioTargetSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("create"), mode: z.enum(["image", "video"]) }),
  z.strictObject({ type: z.literal("effects") }),
  z.strictObject({ type: z.literal("lipsync") }),
  z.strictObject({ type: z.literal("skill"), skill: slugSchema }),
  z.strictObject({ type: z.literal("flow"), flow: slugSchema }),
  z.strictObject({ type: z.literal("app"), app: slugSchema })
]);

/** An outcome-named entry that opens a target with presets preselected. */
export const studioSchema = z.strictObject({
  id: z.string().regex(/^studio\.[a-z0-9-]+$/),
  version: z.literal(1),
  kind: z.literal("studio"),
  name: z.string().min(1),
  description: z.string().min(1),
  tags: z.array(z.string()).default([]),
  target: studioTargetSchema,
  /** Presets the target opens with. Only `create` and `effects` take any. */
  preset_ids: z.array(z.string()).default([]),
  author: z.string().optional()
});
export type Studio = z.infer<typeof studioSchema>;
export type StudioTarget = z.infer<typeof studioTargetSchema>;

/** One row of `preset-catalog.json`: a generation preset or a studio. */
export const catalogEntrySchema = z.discriminatedUnion("kind", [presetSchema, studioSchema]);
export type CatalogEntry = z.infer<typeof catalogEntrySchema>;
export const catalogKindSchema = z.enum(["camera", "look", "effect", "studio"]);
export type CatalogKind = z.infer<typeof catalogKindSchema>;

const { $schema, ...presetDefinition } = presetJsonSchema;
const { $schema: _studioSchema, ...studioDefinition } = z.toJSONSchema(studioSchema, { io: "input" });
/** The checked-in `preset.schema.json`: one row of the catalogue. */
export const catalogEntryJsonSchema = { $schema, oneOf: [presetDefinition, studioDefinition] };
