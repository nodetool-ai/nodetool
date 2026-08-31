/**
 * Skills router — tRPC.
 *
 * DB-backed agent skills. Replaces filesystem SKILL.md files. Name and
 * description are columns, content is markdown.
 *
 * Procedures:
 *   list    (query)    — SkillListItem[]
 *   get     (query)    — SkillResponse
 *   create  (mutation) — SkillResponse
 *   update  (mutation) — SkillResponse (CAS via baseUpdatedAt)
 *   delete  (mutation) — { ok: true }
 */

import { z } from "zod";
import { loadSystemSkills } from "@nodetool-ai/agents";
import { Skill } from "@nodetool-ai/models";
import {
  createSkillInput,
  patchSkillInput,
  skillListItem,
  skillResponse
} from "@nodetool-ai/protocol/api-schemas/skills.js";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";

/**
 * `includeSystem` merges the skills that ship with NodeTool into the list. They
 * are read off disk, carry no row, and are named `system:<name>` so a caller
 * cannot mistake one for something it can rename or delete. Off by default, so
 * the skills panel keeps listing only what its context menu can act on.
 */
const listInput = z.object({ includeSystem: z.boolean().optional() });

const idInput = z.object({ id: z.string() });

const updateInput = patchSkillInput.and(
  z.object({
    id: z.string(),
    baseUpdatedAt: z.string()
  })
);

const okOutput = z.object({ ok: z.literal(true) });

function toListItem(skill: Skill) {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    updatedAt: skill.updated_at,
    system: false
  };
}

/** The prefix a shipped skill's id carries, since it has no row of its own. */
export const SYSTEM_SKILL_ID_PREFIX = "system:";

/**
 * The shipped skills, minus any whose name a user row already holds — that row
 * shadows the shipped one everywhere else (`load_skill`, the chat catalog), so
 * listing both would offer the same `/name` twice.
 */
function systemListItems(taken: ReadonlySet<string>) {
  return loadSystemSkills()
    .filter((skill) => !taken.has(skill.name.toLowerCase()))
    .map((skill) => ({
      id: `${SYSTEM_SKILL_ID_PREFIX}${skill.name}`,
      name: skill.name,
      description: skill.description,
      updatedAt: "",
      system: true
    }));
}

function isUniqueConstraintViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? error.code : undefined;
  const message = "message" in error ? error.message : undefined;
  const detail = "detail" in error ? error.detail : undefined;
  if (code === "23505" || code === "SQLITE_CONSTRAINT_UNIQUE") {
    return true;
  }
  const text = `${String(message ?? "")} ${String(detail ?? "")}`;
  return (
    text.includes("UNIQUE constraint failed") ||
    text.includes("duplicate key value") ||
    text.includes("idx_skills_user_name_unique")
  );
}

function throwNameConflict(): never {
  throwApiError(
    ApiErrorCode.ALREADY_EXISTS,
    "A skill with that name already exists"
  );
}

async function loadOwned(
  ctxUserId: string | null,
  id: string
): Promise<Skill> {
  if (!ctxUserId) throwApiError(ApiErrorCode.UNAUTHORIZED, "Unauthorized");
  const skill = await Skill.findById(id);
  if (!skill || skill.user_id !== ctxUserId) {
    throwApiError(ApiErrorCode.NOT_FOUND, "Skill not found");
  }
  return skill;
}

export const skillsRouter = router({
  list: protectedProcedure
    .input(listInput)
    .output(z.array(skillListItem))
    .query(async ({ ctx, input }) => {
      const items = (await Skill.listByUser(ctx.userId)).map(toListItem);
      if (!input.includeSystem) {
        return items;
      }
      const taken = new Set(items.map((item) => item.name.toLowerCase()));
      return [...items, ...systemListItems(taken)];
    }),

  get: protectedProcedure
    .input(idInput)
    .output(skillResponse)
    .query(async ({ ctx, input }) => {
      const skill = await loadOwned(ctx.userId, input.id);
      return skillResponse.parse(skill.toResponse());
    }),

  create: protectedProcedure
    .input(createSkillInput)
    .output(skillResponse)
    .mutation(async ({ ctx, input }) => {
      if (input.id) {
        const existing = await Skill.findById(input.id);
        if (existing) {
          if (existing.user_id !== ctx.userId) {
            throwApiError(ApiErrorCode.NOT_FOUND, "Skill not found");
          }
          return skillResponse.parse(existing.toResponse());
        }
      }
      // Enforce unique name per user
      const duplicate = await Skill.findByName(ctx.userId, input.name);
      if (duplicate) {
        throwApiError(
          ApiErrorCode.ALREADY_EXISTS,
          `Skill with name "${input.name}" already exists`
        );
      }
      const skill = new Skill({
        id: input.id,
        user_id: ctx.userId,
        name: input.name,
        description: input.description ?? "",
        content: input.content
      });
      try {
        await skill.save();
      } catch (error) {
        if (isUniqueConstraintViolation(error)) throwNameConflict();
        throw error;
      }
      return skillResponse.parse(skill.toResponse());
    }),

  update: protectedProcedure
    .input(updateInput)
    .output(skillResponse)
    .mutation(async ({ ctx, input }) => {
      const skill = await loadOwned(ctx.userId, input.id);

      const expectedUpdatedAt = input.baseUpdatedAt;
      if (skill.updated_at !== input.baseUpdatedAt) {
        throwApiError(
          ApiErrorCode.ALREADY_EXISTS,
          "Skill was modified since last read (optimistic concurrency conflict)"
        );
      }

      if (input.name !== undefined && input.name !== skill.name) {
        const duplicate = await Skill.findByName(ctx.userId, input.name);
        if (duplicate && duplicate.id !== input.id) {
          throwApiError(
            ApiErrorCode.ALREADY_EXISTS,
            `Skill with name "${input.name}" already exists`
          );
        }
      }

      const fields: Parameters<typeof Skill.updateFieldsIfUnchanged>[2] = {};
      if (input.name !== undefined) fields.name = input.name;
      if (input.description !== undefined) fields.description = input.description;
      if (input.content !== undefined) fields.content = input.content;

      let updated: Skill | null;
      try {
        updated = await Skill.updateFieldsIfUnchanged(
          input.id,
          expectedUpdatedAt,
          fields
        );
      } catch (error) {
        if (isUniqueConstraintViolation(error)) throwNameConflict();
        throw error;
      }
      if (!updated) {
        throwApiError(
          ApiErrorCode.ALREADY_EXISTS,
          "Skill was modified since last read (optimistic concurrency conflict)"
        );
      }
      return skillResponse.parse(updated.toResponse());
    }),

  delete: protectedProcedure
    .input(idInput)
    .output(okOutput)
    .mutation(async ({ ctx, input }) => {
      await loadOwned(ctx.userId, input.id);
      await Skill.deleteOwned(ctx.userId, input.id);
      return { ok: true as const };
    })
});
