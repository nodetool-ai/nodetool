import { z } from "zod";

export const gameAuthoringTarget = z.strictObject({ sceneId: z.string().min(1), entityId: z.string().min(1) });
export const gameAuthoringOverride = gameAuthoringTarget.extend({
  path: z.array(z.string().min(1).refine((part) => !["__proto__", "constructor", "prototype"].includes(part))).min(1).max(16).refine((path) => path[0] !== "id", "Entity identity cannot be overridden"),
  value: z.json(), remove: z.boolean().optional()
});
const boundedJsonRecord = z.record(z.string(), z.json()).refine((value) => JSON.stringify(value).length <= 8_000_000, "Authoring data exceeds its serialized size limit");
export const gameAuthoringProgram = z.strictObject({ source: z.string().min(1).max(200_000), inputs: boundedJsonRecord, seed: z.number().int().min(0).max(0xffffffff) });
export const gameAuthoringConflict = gameAuthoringTarget.extend({ code: z.string().min(1), message: z.string().min(1) });
export const gameAuthoringCandidate = z.strictObject({ replace_existing: z.boolean().default(false), base_updated_at: z.string().min(1), base_digest: z.string().regex(/^[a-f0-9]{64}$/), program: gameAuthoringProgram, digest: z.string().regex(/^[a-f0-9]{64}$/) });
export type GameAuthoringProgram = z.infer<typeof gameAuthoringProgram>;
export const gameAuthoringParameter = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("number"), default: z.number().finite(), min: z.number().finite().optional(), max: z.number().finite().optional() }),
  z.strictObject({ type: z.literal("boolean"), default: z.boolean() }),
  z.strictObject({ type: z.literal("string"), default: z.string() }),
  z.strictObject({ type: z.literal("enum"), default: z.string(), values: z.array(z.string()).min(1) }),
  z.strictObject({ type: z.literal("vector2"), default: z.tuple([z.number().finite(), z.number().finite()]) }),
  z.strictObject({ type: z.literal("vector3"), default: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]) })
]).superRefine((parameter, context) => {
  if (parameter.type === "number" && ((parameter.min !== undefined && parameter.default < parameter.min) || (parameter.max !== undefined && parameter.default > parameter.max) || (parameter.min !== undefined && parameter.max !== undefined && parameter.min > parameter.max))) { context.addIssue({ code: "custom", message: "Parameter default and bounds must agree" }); }
  if (parameter.type === "enum" && (!parameter.values.includes(parameter.default) || new Set(parameter.values).size !== parameter.values.length)) { context.addIssue({ code: "custom", message: "Enum default must belong to unique values" }); }
});
export const gameAuthoring = z.strictObject({
  version: z.literal(1),
  program: gameAuthoringProgram,
  baseline: boundedJsonRecord,
  parameters: z.record(z.string(), gameAuthoringParameter).default({}),
  prefabs: boundedJsonRecord.default({}),
  instances: z.array(gameAuthoringTarget.extend({ prefabId: z.string().min(1) })).max(50_000).default([]),
  overrides: z.array(gameAuthoringOverride).max(50_000).default([]),
  suppressions: z.array(gameAuthoringTarget).max(50_000).default([]),
  detached: z.array(gameAuthoringTarget).max(50_000).default([])
}).refine((value) => JSON.stringify(value).length <= 16_000_000, "Authoring metadata exceeds its serialized size limit");
export type GameAuthoring = z.infer<typeof gameAuthoring>;
export type GameAuthoringOverride = z.infer<typeof gameAuthoringOverride>;
export type GameAuthoringTarget = z.infer<typeof gameAuthoringTarget>;
