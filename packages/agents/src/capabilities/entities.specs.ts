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

export const CREATE_ENTITY_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    asset_id: {
      type: "string",
      description:
        "The image asset to tag as the entity's reference — generate or save " +
        "it first (e.g. with generate_image), then tag it here."
    },
    kind: KIND_PROPERTY,
    name: {
      type: "string",
      description:
        "Display name. Shot text referencing this name pulls the descriptor in."
    },
    descriptor: {
      type: "string",
      description:
        "The canonical visual description pasted into every prompt that uses " +
        "this entity — keep it specific enough to hold one look across shots."
    },
    description: {
      type: "string",
      description: "Longer free-form notes. Not injected into prompts."
    },
    voice_id: {
      type: ["string", "null"],
      description: "Character voice id for TTS, when kind is character."
    },
    tags: {
      type: "array",
      items: { type: "string" },
      description: "Optional labels for filtering the library."
    },
    lora: {
      type: ["object", "null"],
      description:
        "Optional trained LoRA ref ({url?, asset_id?, scale?}) for a character " +
        "or style."
    },
    palette: {
      type: ["array", "null"],
      description:
        "Style palette as name+hex swatches ({name?, hex}), when kind is style."
    }
  },
  required: ["asset_id", "kind", "name", "descriptor"]
};

export const createEntitySpec: CapabilitySpec = {
  name: "create_entity",
  description:
    "Add an image asset to the ingredients library as an entity (character, " +
    "location, style, or prop). The asset keeps its bytes; this writes the " +
    "entity marker onto it, exactly what the browser's Save Entity does. The " +
    "asset must be yours and must be an image, and must not already be an " +
    "entity — update_entity retags one.",
  inputSchema: CREATE_ENTITY_SCHEMA,
  category: "write",
  userMessage: (params) =>
    `Creating ${String(params["kind"] ?? "")} entity ${String(params["name"] ?? "")}`.trim()
};

export const UPDATE_ENTITY_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    entity_id: {
      type: "string",
      description: "The entity's id (its asset id), from list_entities."
    },
    kind: {
      ...KIND_PROPERTY,
      description: "New kind. Only the kinds change; pass to reclassify."
    },
    name: { type: "string", description: "New display name." },
    descriptor: { type: "string", description: "New canonical visual descriptor." },
    description: {
      type: "string",
      description: "New longer notes. Not injected into prompts."
    },
    voice_id: {
      type: ["string", "null"],
      description: "New character voice id, or null to clear it."
    },
    tags: {
      type: ["array", "null"],
      description: "Replacement labels, or null to clear them."
    },
    lora: {
      type: ["object", "null"],
      description: "Replacement LoRA ref, or null to clear it."
    },
    palette: {
      type: ["array", "null"],
      description: "Replacement style palette, or null to clear it."
    }
  },
  required: ["entity_id"]
};

export const updateEntitySpec: CapabilitySpec = {
  name: "update_entity",
  description:
    "Change an existing entity's fields — kind, name, descriptor, notes, " +
    "voice, tags, LoRA, or palette. Only the fields you pass change; the " +
    "reference image stays whatever asset carries the entity.",
  inputSchema: UPDATE_ENTITY_SCHEMA,
  category: "write",
  userMessage: (params) => `Updating entity ${String(params["entity_id"])}`
};

/** Every spec this module declares, in declaration order. */
export const entitiesSpecs: readonly CapabilitySpec[] = [
  listEntitiesSpec,
  getEntitySpec,
  applyEntitiesSpec,
  createEntitySpec,
  updateEntitySpec
];
