import { z } from "zod";

// ── Skill response ────────────────────────────────────────────────
// Mirrors `SkillInfo` produced by skills-api.ts :: handleSkillsRequest.
// `description` and `instructions` may be null if the source file lacks
// frontmatter or body content.
export const skillInfo = z.object({
  name: z.string(),
  description: z.string().nullable(),
  path: z.string(),
  instructions: z.string().nullable()
});
export type SkillInfo = z.infer<typeof skillInfo>;

export const listOutput = z.object({
  count: z.number(),
  skills: z.array(skillInfo)
});
export type ListOutput = z.infer<typeof listOutput>;
