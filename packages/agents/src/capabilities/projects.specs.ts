/**
 * The `projects` module's specs — data only, no implementation.
 *
 * Split out so a belt can be assembled synchronously: the registry's eager
 * spec table imports this file, never `projects.ts`. `projects.ts` imports
 * these back and attaches each to its implementation, so there is one spec
 * object behind both halves.
 */

import type { CapabilitySpec } from "./types.js";
import type { JsonSchema } from "@nodetool-ai/runtime";

/** Projects one `list_projects` or `search_projects` call may return. */
export const MAX_PROJECTS_PER_CALL = 100;

export const LIST_PROJECTS_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    limit: {
      type: "number",
      description: `Max projects to return (default 50, max ${MAX_PROJECTS_PER_CALL}).`
    },
    archived: {
      type: "boolean",
      description:
        "List archived projects instead of active ones (default false)."
    }
  }
};

export const SEARCH_PROJECTS_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description:
        "Words to match against the project name and kind. Every word must " +
        "appear, case-insensitive."
    },
    limit: {
      type: "number",
      description: `Max projects to return (default 20, max ${MAX_PROJECTS_PER_CALL}).`
    },
    include_archived: {
      type: "boolean",
      description: "Also match archived projects (default true)."
    }
  },
  required: ["query"]
};

export const UPDATE_PROJECT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    project_id: { type: "string", description: "Project id." },
    name: {
      type: "string",
      description: "New name, 1 to 200 characters."
    },
    kind: {
      type: "string",
      description:
        'New free-text kind, such as "spot", "trailer" or "report". Max 64 ' +
        "characters. The Personal project's kind cannot change."
    },
    archived: {
      type: "boolean",
      description:
        "true archives the project, false restores it. Archiving hides it " +
        "from the project selector and deletes nothing."
    }
  },
  required: ["project_id"]
};

export const DELETE_PROJECT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    project_id: { type: "string", description: "Project id." }
  },
  required: ["project_id"]
};

export const CREATE_PROJECT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "Project name, 1 to 200 characters." },
    kind: {
      type: "string",
      description:
        'Optional free-text kind, such as "spot", "trailer" or "report". ' +
        "Max 64 characters."
    }
  },
  required: ["name"]
};

/** Item types `move_to_project` accepts. */
export const MOVABLE_PROJECT_ITEM_TYPES = [
  "asset",
  "entity",
  "storyboard",
  "script",
  "timeline",
  "sketch",
  "application",
  "jsscript"
] as const;

export const MOVE_TO_PROJECT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    project_id: {
      type: "string",
      description: "Destination project id (use list_projects to find one)."
    },
    type: {
      type: "string",
      enum: [...MOVABLE_PROJECT_ITEM_TYPES],
      description:
        "What to move. asset is any library asset, entity is a character, " +
        "location, style or prop asset, and the rest are document types."
    },
    id: { type: "string", description: "Id of the asset or document." }
  },
  required: ["project_id", "type", "id"]
};

export const listProjectsSpec: CapabilitySpec = {
  name: "list_projects",
  description:
    "List the caller's projects, most recently updated first: id, name, " +
    "kind, whether it is the Personal project, archive time and timestamps. " +
    "A project groups documents that carry its id. Pass archived=true to " +
    "list archived projects.",
  inputSchema: LIST_PROJECTS_SCHEMA,
  category: "read",
  userMessage: () => "Listing projects"
};

export const searchProjectsSpec: CapabilitySpec = {
  name: "search_projects",
  description:
    "Find the caller's projects by name or kind. Every word of the query " +
    "must appear, case-insensitive. Archived projects match unless " +
    "include_archived=false. Use it when the user names a project but not " +
    "its id.",
  inputSchema: SEARCH_PROJECTS_SCHEMA,
  category: "read",
  userMessage: (params) => `Searching projects for "${String(params["query"])}"`
};

export const updateProjectSpec: CapabilitySpec = {
  name: "update_project",
  description:
    "Edit a project you own: rename it, change its kind, or archive and " +
    "restore it. Pass at least one of name, kind or archived. A project you " +
    "do not own is reported as missing.",
  inputSchema: UPDATE_PROJECT_SCHEMA,
  category: "write",
  userMessage: (params) => `Updating project ${String(params["project_id"])}`
};

export const deleteProjectSpec: CapabilitySpec = {
  name: "delete_project",
  description:
    "Permanently delete a project you own, with every document, " +
    "conversation, asset record and job in it. This cannot be undone. The " +
    "result's folder field says what happened to the project folder: a " +
    "folder NodeTool created is trashed (moved to the OS trash), moved_aside " +
    "(moved to .trash in the projects folder) or removed (cloud storage), " +
    "and a folder the user brought is kept with every file except " +
    ".nodetool/. Tell the user where the folder is. Confirm with the user " +
    "first, and prefer update_project with archived=true when they only " +
    "want it out of sight. The Personal project and the project this " +
    "conversation belongs to cannot be deleted.",
  inputSchema: DELETE_PROJECT_SCHEMA,
  category: "write",
  userMessage: (params) => `Deleting project ${String(params["project_id"])}`
};

export const createProjectSpec: CapabilitySpec = {
  name: "create_project",
  description:
    "Create a project you own, with its project folder. Returns the new " +
    "project. Use move_to_project to put assets and documents in it.",
  inputSchema: CREATE_PROJECT_SCHEMA,
  category: "write",
  userMessage: (params) => `Creating project "${String(params["name"])}"`
};

export const moveToProjectSpec: CapabilitySpec = {
  name: "move_to_project",
  description:
    "Move one asset, entity or document into another project you own. A " +
    "file in the old project folder moves to the new folder. A document " +
    "or entity that other documents reference cannot move. Workflows and " +
    "games cannot move with this tool.",
  inputSchema: MOVE_TO_PROJECT_SCHEMA,
  category: "write",
  userMessage: (params) =>
    `Moving ${String(params["type"])} ${String(params["id"])} to project ${String(params["project_id"])}`
};

export const GET_PROJECT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    project_id: { type: "string", description: "Project id." }
  },
  required: ["project_id"]
};

export const SUMMARIZE_PROJECTS_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    limit: {
      type: "number",
      description: `Max projects to return (default 20, max ${MAX_PROJECTS_PER_CALL}).`
    }
  }
};

export const getProjectSpec: CapabilitySpec = {
  name: "get_project",
  description:
    "Read one project you own with what it holds: its storyboards, scripts, " +
    "timelines, sketches, workflows, apps and JS scripts with each one's " +
    "status and spend, its entities, and its spend by category. Spend is in " +
    "USD and is a lower bound when unpriced_count is above zero or partial " +
    "is true. A project you do not own is reported as missing.",
  inputSchema: GET_PROJECT_SCHEMA,
  category: "read",
  userMessage: (params) => `Reading project ${String(params["project_id"])}`
};

export const summarizeProjectsSpec: CapabilitySpec = {
  name: "summarize_projects",
  description:
    "Roll up each active project you own, most recently updated first: its " +
    "document count by type, entity count and total spend. Use get_project " +
    "for one project's documents.",
  inputSchema: SUMMARIZE_PROJECTS_SCHEMA,
  category: "read",
  userMessage: () => "Summarizing projects"
};

/** Every spec this module declares, in declaration order. */
export const projectsSpecs: readonly CapabilitySpec[] = [
  listProjectsSpec,
  searchProjectsSpec,
  getProjectSpec,
  summarizeProjectsSpec,
  createProjectSpec,
  updateProjectSpec,
  moveToProjectSpec,
  deleteProjectSpec
];
