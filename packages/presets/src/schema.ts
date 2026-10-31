import { z } from "zod";

export const fragmentSchema = z.union([
  z.string(),
  z.strictObject({
    prefix: z.string().optional(),
    suffix: z.string().optional(),
    replace: z.string().optional()
  })
]);
export const presetModeSchema = z.enum(["video", "image_to_video", "reference_to_video", "image", "image_edit", "video_edit"]);
export const presetSchema = z.strictObject({
  id: z.string().regex(/^(camera|look|effect|studio)\.[a-z0-9-]+$/),
  version: z.literal(1),
  kind: z.enum(["camera", "look", "effect", "studio"]),
  name: z.string().min(1),
  description: z.string().min(1),
  tags: z.array(z.string()).default([]),
  slot: z.enum(["move", "rig", "speed", "look", "effect"]).optional(),
  modes: z.array(presetModeSchema).min(1),
  inputs: z.array(z.enum(["text", "image", "video"])).default(["text"]),
  stackable: z.boolean().default(false),
  conflicts: z.array(z.string()).default([]),
  aliases: z.array(z.string()).default([]),
  prompt: z.record(z.string(), fragmentSchema).refine(
    (fragments) => Object.hasOwn(fragments, "default"),
    { message: "A default prompt fragment is required" }
  ),
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  families: z.array(z.string()).optional(),
  preview: z.strictObject({ url: z.url(), poster: z.url(), run: z.string() }).optional(),
  workflow: z.string().optional(),
  author: z.string().optional()
});
export type Preset = z.infer<typeof presetSchema>;
export type PresetMode = z.infer<typeof presetModeSchema>;
export type Fragment = z.infer<typeof fragmentSchema>;

// JSON Schema cannot express a refinement on a record, so encode its required key.
export const presetJsonSchema = z.toJSONSchema(presetSchema, { io: "input" });
const promptProperties = presetJsonSchema.properties?.prompt;
if (promptProperties && typeof promptProperties === "object") {
  promptProperties.required = ["default"];
}
