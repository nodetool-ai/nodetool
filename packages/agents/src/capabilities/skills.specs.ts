/**
 * The `skills` module's specs — data only, no implementation.
 *
 * Skills are the user's own instruction documents, stored per user in the
 * database. The catalog (name + description) is rendered into the system
 * prompt, so a turn already knows what exists; these capabilities are how an
 * agent reads one in full and how it authors them.
 */

import type { CapabilitySpec } from "./types.js";
import { isString } from "../utils/type-guards.js";

const NAME_DESCRIPTION =
  "Skill name — a lowercase slug (a-z, 0-9, hyphen), as listed in the skill " +
  "catalog and as typed by the user with a leading slash (`/my-skill`).";

export const listSkillsSpec: CapabilitySpec = {
  name: "list_skills",
  description:
    "List the user's skills — name and description each, without the " +
    "instructions. Use it to find a skill worth loading; call `load_skill` " +
    "to read one in full before following it.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Optional text filter matched against name and description."
      }
    },
    required: []
  },
  category: "read",
  userMessage: () => "Listing skills"
};

export const loadSkillSpec: CapabilitySpec = {
  name: "load_skill",
  description:
    "Load one skill's full instructions by name. Do this before acting on a " +
    "skill the catalog only summarizes — the description says when a skill " +
    "applies, the instructions say what to do.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: NAME_DESCRIPTION }
    },
    required: ["name"]
  },
  category: "read",
  userMessage: (params) =>
    isString(params.name) ? `Loading skill /${params.name}` : "Loading skill"
};

export const createSkillSpec: CapabilitySpec = {
  name: "create_skill",
  description:
    "Create a skill for the user: a named, described set of instructions the " +
    "agent can load later. Write the description as *when to use this* — it " +
    "is the only part always in context. Names must be unique per user.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: NAME_DESCRIPTION },
      description: {
        type: "string",
        description:
          "One line saying when this skill applies. Max 1024 characters, no " +
          "markup."
      },
      content: {
        type: "string",
        description: "The instructions themselves, as Markdown."
      }
    },
    required: ["name", "description", "content"]
  },
  category: "write",
  userMessage: (params) =>
    isString(params.name) ? `Creating skill /${params.name}` : "Creating skill"
};

export const updateSkillSpec: CapabilitySpec = {
  name: "update_skill",
  description:
    "Update an existing skill by name. Only the fields you pass change; pass " +
    "`new_name` to rename it.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: NAME_DESCRIPTION },
      new_name: { type: "string", description: "New name for the skill." },
      description: { type: "string", description: "New description." },
      content: { type: "string", description: "New Markdown instructions." }
    },
    required: ["name"]
  },
  category: "write",
  userMessage: (params) =>
    isString(params.name) ? `Updating skill /${params.name}` : "Updating skill"
};

export const deleteSkillSpec: CapabilitySpec = {
  name: "delete_skill",
  description:
    "Delete one of the user's skills by name. This is permanent — ask first " +
    "unless the user asked for the deletion.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: NAME_DESCRIPTION }
    },
    required: ["name"]
  },
  category: "write",
  userMessage: (params) =>
    isString(params.name) ? `Deleting skill /${params.name}` : "Deleting skill"
};

/** Every spec this module declares, in declaration order. */
export const skillsSpecs: readonly CapabilitySpec[] = [
  listSkillsSpec,
  loadSkillSpec,
  createSkillSpec,
  updateSkillSpec,
  deleteSkillSpec
];
