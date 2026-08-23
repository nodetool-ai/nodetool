/**
 * The `entities` module's specs — data only, no implementation.
 *
 * The registry's eager spec table imports this file and never `entities.ts`,
 * so the models package the implementation reads stays out of the entry graph.
 */

import type { JsonSchema } from "@nodetool-ai/runtime";
import type { CapabilitySpec } from "./types.js";

export const DEFAULT_LIMIT = 100;

export const MAX_LIMIT = 500;

const KIND_PROPERTY = {
  type: "string" as const,
  enum: ["character", "location", "style", "prop"],
  description: "The kind of entity."
};

export const LIST_ENTITIES_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    kind: {
      ...KIND_PROPERTY,
      description: "Only entities of this kind. Omit for all of them."
    },
    query: {
      type: "string",
      description:
        "Only entities whose name or descriptor contains this text " +
        "(case-insensitive)."
    },
    limit: {
      type: "number",
      description: `Max entities to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).`
    }
  }
};

export const listEntitiesSpec: CapabilitySpec = {
  name: "list_entities",
  description:
    "List the reusable production entities (characters, locations, styles, " +
    "props) in the ingredients library, with each one's id, name, kind and " +
    "descriptor. Entities are what hold a character or a look steady across " +
    "shots; pass their ids to apply_entities, or their names into prompt text.",
  inputSchema: LIST_ENTITIES_SCHEMA,
  category: "read",
  userMessage: (params) =>
    params["kind"]
      ? `Listing ${String(params["kind"])} entities`
      : "Listing entities"
};

export const GET_ENTITY_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    entity_id: {
      type: "string",
      description: "The entity's id (its asset id), from list_entities."
    }
  },
  required: ["entity_id"]
};

export const getEntitySpec: CapabilitySpec = {
  name: "get_entity",
  description:
    "Read one entity in full: its kind, name, descriptor, longer " +
    "description, tags, reference images, and the kind-specific fields " +
    "(a character's voice, a style's palette, a trained LoRA).",
  inputSchema: GET_ENTITY_SCHEMA,
  category: "read",
  userMessage: (params) => `Reading entity ${String(params["entity_id"])}`
};

export const APPLY_ENTITIES_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    text: {
      type: "string",
      description: "The base prompt to season. Empty text applies every entity."
    },
    entity_ids: {
      type: "array",
      items: { type: "string" },
      description:
        "Apply exactly these entities. Without ids, entities whose name " +
        "appears in the text apply."
    }
  },
  required: ["text"]
};

export const applyEntitiesSpec: CapabilitySpec = {
  name: "apply_entities",
  description:
    "Paste entity descriptors into a prompt for cross-shot consistency, and " +
    "return the augmented prompt plus the asset ids of the entities' " +
    "reference images to pass to an image model. Pass `entity_ids` to apply a " +
    "specific selection; without them, entities whose name appears in the " +
    "text apply (all of them when the text is empty). Same rule the browser's " +
    "ui_entity_apply and the ApplyEntities node use.",
  inputSchema: APPLY_ENTITIES_SCHEMA,
  category: "read",
  userMessage: () => "Applying entities to a prompt"
};

/** Every spec this module declares, in declaration order. */
export const entitiesSpecs: readonly CapabilitySpec[] = [
  listEntitiesSpec,
  getEntitySpec,
  applyEntitiesSpec
];
