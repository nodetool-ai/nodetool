/**
 * The `skills` capability module — the user's own instruction documents.
 *
 * A skill is a name, a one-line description of when it applies, and a Markdown
 * body. The catalog of names and descriptions is rendered into every chat
 * turn's prompt (`skill-prompt.ts`), so discovery costs nothing; `load_skill`
 * is how the body reaches the model, and the other three are authoring.
 *
 * `@nodetool-ai/models` is imported inside each implementation, so loading this
 * module never opens a database.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { Skill as SkillRow } from "@nodetool-ai/models";
import type { CapabilityExport, CapabilityModule } from "./types.js";
import {
  listSkillsSpec,
  loadSkillSpec,
  createSkillSpec,
  updateSkillSpec,
  deleteSkillSpec
} from "./skills.specs.js";
import { isString } from "../utils/type-guards.js";

function requireUser(
  context: ProcessingContext
): { userId: string } | { error: string } {
  const userId = context.userId;
  if (!userId) return { error: "No user context; cannot access skills." };
  return { userId };
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Normalize a name the model may have typed with its leading slash. */
function skillName(value: unknown): string {
  return isString(value) ? value.trim().replace(/^\//, "").toLowerCase() : "";
}

async function findSkill(userId: string, name: string) {
  const { Skill } = await import("@nodetool-ai/models");
  return Skill.findByName(userId, name);
}

// ---------------------------------------------------------------------------
// list_skills
// ---------------------------------------------------------------------------

const listSkills: CapabilityExport = {
  spec: listSkillsSpec,
  impl: async (run, params) => {
    const scope = requireUser(run.context);
    if ("error" in scope) return { success: false, error: scope.error };
    try {
      const { Skill } = await import("@nodetool-ai/models");
      const rows = await Skill.listByUser(scope.userId);
      const query = isString(params.query)
        ? params.query.trim().toLowerCase()
        : "";
      const skills = rows
        .filter(
          (row) =>
            !query ||
            `${row.name} ${row.description}`.toLowerCase().includes(query)
        )
        .map((row) => ({
          name: row.name,
          description: row.description,
          updated_at: row.updated_at
        }));
      return { success: true, count: skills.length, skills };
    } catch (e) {
      return { success: false, error: errorMessage(e) };
    }
  }
};

// ---------------------------------------------------------------------------
// load_skill
// ---------------------------------------------------------------------------

const loadSkill: CapabilityExport = {
  spec: loadSkillSpec,
  impl: async (run, params) => {
    const scope = requireUser(run.context);
    if ("error" in scope) return { success: false, error: scope.error };
    const name = skillName(params.name);
    if (!name) return { success: false, error: "name is required" };
    try {
      const skill = await findSkill(scope.userId, name);
      if (!skill) {
        return {
          success: false,
          error: `No skill named "${name}". Call list_skills to see what exists.`
        };
      }
      return {
        success: true,
        name: skill.name,
        description: skill.description,
        instructions: skill.content
      };
    } catch (e) {
      return { success: false, error: errorMessage(e) };
    }
  }
};

// ---------------------------------------------------------------------------
// create_skill
// ---------------------------------------------------------------------------

const createSkill: CapabilityExport = {
  spec: createSkillSpec,
  impl: async (run, params) => {
    const scope = requireUser(run.context);
    if ("error" in scope) return { success: false, error: scope.error };
    const name = skillName(params.name);
    const description = isString(params.description)
      ? params.description.trim()
      : "";
    const content = isString(params.content) ? params.content : "";
    if (!name || !description || !content.trim()) {
      return {
        success: false,
        error: "name, description and content are all required"
      };
    }
    try {
      if (await findSkill(scope.userId, name)) {
        return {
          success: false,
          error: `A skill named "${name}" already exists. Use update_skill to change it.`
        };
      }
      const { Skill } = await import("@nodetool-ai/models");
      const skill = await Skill.create<SkillRow>({
        user_id: scope.userId,
        name,
        description,
        content
      });
      return { success: true, name: skill.name, skill_id: skill.id };
    } catch (e) {
      return { success: false, error: errorMessage(e) };
    }
  }
};

// ---------------------------------------------------------------------------
// update_skill
// ---------------------------------------------------------------------------

const updateSkill: CapabilityExport = {
  spec: updateSkillSpec,
  impl: async (run, params) => {
    const scope = requireUser(run.context);
    if ("error" in scope) return { success: false, error: scope.error };
    const name = skillName(params.name);
    if (!name) return { success: false, error: "name is required" };
    try {
      const skill = await findSkill(scope.userId, name);
      if (!skill) return { success: false, error: `No skill named "${name}"` };

      const newName = skillName(params.new_name);
      if (newName && newName !== name) {
        if (await findSkill(scope.userId, newName)) {
          return {
            success: false,
            error: `A skill named "${newName}" already exists.`
          };
        }
        skill.name = newName;
      }
      if (isString(params.description)) {
        skill.description = params.description.trim();
      }
      if (isString(params.content)) skill.content = params.content;
      await skill.save();
      return { success: true, name: skill.name, skill_id: skill.id };
    } catch (e) {
      return { success: false, error: errorMessage(e) };
    }
  }
};

// ---------------------------------------------------------------------------
// delete_skill
// ---------------------------------------------------------------------------

const deleteSkill: CapabilityExport = {
  spec: deleteSkillSpec,
  impl: async (run, params) => {
    const scope = requireUser(run.context);
    if ("error" in scope) return { success: false, error: scope.error };
    const name = skillName(params.name);
    if (!name) return { success: false, error: "name is required" };
    try {
      const skill = await findSkill(scope.userId, name);
      if (!skill) return { success: false, error: `No skill named "${name}"` };
      await skill.delete();
      return { success: true, name };
    } catch (e) {
      return { success: false, error: errorMessage(e) };
    }
  }
};

/** Every skills capability, in declaration order. */
export const SKILLS_CAPABILITIES: readonly CapabilityExport[] = [
  listSkills,
  loadSkill,
  createSkill,
  updateSkill,
  deleteSkill
];

export const module: CapabilityModule = {
  module: "skills",
  exports: SKILLS_CAPABILITIES
};

export { listSkills, loadSkill, createSkill, updateSkill, deleteSkill };
