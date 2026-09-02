/**
 * The `compositions` module's specs — data only, no implementation.
 *
 * Same split the entities module keeps: the registry's eager spec table imports
 * this file and never `compositions.ts`, so the models package stays out of the
 * entry graph.
 */

import type { JsonSchema } from "@nodetool-ai/runtime";
import type { CapabilitySpec } from "./types.js";

export const DEFAULT_LIMIT = 100;
export const MAX_LIMIT = 500;

export const LIST_COMPOSITIONS_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    source: {
      type: "string",
      enum: ["shipped", "user"],
      description:
        'Only the templates NodeTool ships ("shipped") or only the ones this ' +
        'user saved ("user"). Omit for both.'
    },
    query: {
      type: "string",
      description:
        "Only compositions whose name or description contains this text " +
        "(case-insensitive)."
    },
    limit: {
      type: "number",
      description: `Max compositions to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).`
    }
  }
};

export const listCompositionsSpec: CapabilitySpec = {
  name: "list_compositions",
  description:
    "List the timeline compositions available to this user: the templates " +
    "NodeTool ships (title card, lower third, caption bar, callout, CTA end " +
    "card, logo sting) and the ones saved from a timeline. Each row carries " +
    "the id, name, description, parameter names and whether it is shipped or " +
    "the user's. Insert one with the edit_timeline op insert_composition.",
  inputSchema: LIST_COMPOSITIONS_SCHEMA,
  category: "read",
  userMessage: () => "Listing compositions"
};

export const GET_COMPOSITION_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    composition_id: {
      type: "string",
      description:
        "The composition's id — a shipped slug, or the asset id of a saved one."
    }
  },
  required: ["composition_id"]
};

export const getCompositionSpec: CapabilitySpec = {
  name: "get_composition",
  description:
    "Read one composition in full: its group clip, its child clips with times " +
    "relative to the group start, and every parameter with its type, default " +
    "and the JSON pointer it writes into. Read this before overriding a " +
    "parameter — the names and types are the template's, not a convention.",
  inputSchema: GET_COMPOSITION_SCHEMA,
  category: "read",
  userMessage: (params) =>
    `Reading composition ${String(params["composition_id"])}`
};

export const SAVE_COMPOSITION_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    timeline_id: {
      type: "string",
      description: "The timeline the group lives on."
    },
    group_target: {
      type: "string",
      description:
        "The group clip to turn into a template, by clip id or name. It must " +
        "be a clip made with the add_group op."
    },
    name: { type: "string", description: "Name for the saved composition." },
    description: {
      type: "string",
      description: "What the template is for, one line."
    },
    params: {
      type: "object",
      description:
        'The values that vary, as {"<name>": {type, default, path, ' +
        'description?}}. `type` is one of string, number, color, boolean; ' +
        '`path` is a JSON pointer into the children array, e.g. ' +
        '"/1/textStyle/text" for the text of the second child. A path that ' +
        "addresses nothing is refused rather than saved."
    }
  },
  required: ["timeline_id", "group_target", "name", "params"]
};

export const saveCompositionSpec: CapabilitySpec = {
  name: "save_composition",
  description:
    "Save a group on a timeline as a reusable composition. The group and every " +
    "clip parented to it are copied into a template with child times rebased " +
    "to the group start, and stored as a JSON asset in the user's library. " +
    "Declare in `params` which values vary; everything else is fixed by the " +
    "template.",
  inputSchema: SAVE_COMPOSITION_SCHEMA,
  category: "write",
  userMessage: (params) => `Saving composition "${String(params["name"])}"`
};

export const DELETE_COMPOSITION_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    composition_id: {
      type: "string",
      description: "The saved composition's id, from list_compositions."
    }
  },
  required: ["composition_id"]
};

export const deleteCompositionSpec: CapabilitySpec = {
  name: "delete_composition",
  description:
    "Delete a saved composition. Clips already instantiated from it keep " +
    "working — they are ordinary clips — they just lose the template behind " +
    "their compositionId. A shipped composition cannot be deleted.",
  inputSchema: DELETE_COMPOSITION_SCHEMA,
  category: "write",
  userMessage: (params) =>
    `Deleting composition ${String(params["composition_id"])}`
};

/** Every spec this module declares, in declaration order. */
export const compositionsSpecs: readonly CapabilitySpec[] = [
  listCompositionsSpec,
  getCompositionSpec,
  saveCompositionSpec,
  deleteCompositionSpec
];
