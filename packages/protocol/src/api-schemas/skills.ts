import { z } from "zod";
import { isValidSkillDescription, isValidSkillName } from "../skill-document.js";

// ── API shapes ───────────────────────────────────────────────────────────────

export const skillResponse = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  content: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type SkillResponse = z.infer<typeof skillResponse>;

export const skillListItem = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  updatedAt: z.string()
});
export type SkillListItem = z.infer<typeof skillListItem>;

export const createSkillInput = z.object({
  id: z.string().optional(),
  name: z
    .string()
    .min(1)
    .max(64)
    .refine((v) => isValidSkillName(v), {
      message:
        "Invalid skill name: must be 1-64 chars, lowercase a-z0-9- only, no reserved terms"
    }),
  description: z
    .string()
    .min(1, "Skill description must not be empty")
    .max(1024)
    .refine((v) => isValidSkillDescription(v), {
      message: "Invalid skill description: must not contain XML tags"
    })
    .default("Custom skill"),
  content: z
    .string()
    .refine((v) => v.trim().length > 0, "Skill content must not be empty")
});
export type CreateSkillInput = z.infer<typeof createSkillInput>;

export const patchSkillInput = z
  .object({
    name: z
      .string()
      .min(1)
      .max(64)
      .refine((v) => isValidSkillName(v), {
        message:
          "Invalid skill name: must be 1-64 chars, lowercase a-z0-9- only, no reserved terms"
      })
      .optional(),
    description: z
      .string()
      .max(1024)
      .refine((v) => isValidSkillDescription(v), {
        message: "Invalid skill description: must not contain XML tags"
      })
      .optional(),
    content: z
      .string()
      .refine((v) => v.trim().length > 0, "Skill content must not be empty")
      .optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });
export type PatchSkillInput = z.infer<typeof patchSkillInput>;
