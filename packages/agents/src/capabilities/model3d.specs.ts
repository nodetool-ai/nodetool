/**
 * The `model3d` module's specs — data only, no implementation.
 *
 * Split out for the same reason every other module splits: the registry's
 * eager spec table imports this file and never the implementation, so nothing
 * `model3d.ts` pulls in reaches the entry graph.
 */

import type { JsonSchema } from "@nodetool-ai/runtime";
import type { CapabilitySpec } from "./types.js";

export const DEFAULT_LIMIT = 20;

export const MAX_LIMIT = 100;

/** Operations one `edit_model3d` call may apply. */
export const MAX_OPS = 60;

const MODEL_ID_PROPERTY = {
  type: "string" as const,
  description:
    "The 3D model's asset id, from list_model3ds or create_model3d. An " +
    "`asset://<id>.glb` URI is accepted too."
};

const TARGET_PROPERTY = {
  type: "string" as const,
  description: "The object's uuid or its name (case-insensitive)."
};

const VEC3_PROPERTY = {
  type: "array" as const,
  items: { type: "number" as const },
  minItems: 3,
  maxItems: 3,
  description: "An [x, y, z] triple."
};

export const LIST_MODEL3DS_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "Only models whose name contains this text (case-insensitive)."
    },
    limit: {
      type: "number",
      description: `Max models to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).`
    }
  }
};

export const listModel3dsSpec: CapabilitySpec = {
  name: "list_model3ds",
  description:
    "List the 3D models (.glb/.gltf assets) in the library, newest first, " +
    "with each one's asset id, name, content type and size. The starting " +
    "point for every other 3D capability, which address a model by asset id.",
  inputSchema: LIST_MODEL3DS_SCHEMA,
  category: "read",
  userMessage: () => "Listing 3D models"
};

export const CREATE_MODEL3D_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    name: {
      type: "string",
      description: "File name for the new model, e.g. \"studio.gltf\"."
    },
    ops: {
      type: "array",
      items: { type: "object" },
      description:
        "Optional scene operations to apply to the new document, in the same " +
        "form edit_model3d takes. A scene built in one call."
    }
  },
  required: ["name"]
};

export const createModel3dSpec: CapabilitySpec = {
  name: "create_model3d",
  description:
    "Create a 3D model asset holding an empty glTF scene, optionally " +
    "applying scene operations to it in the same call. Returns the asset id " +
    "to pass to get_model3d and edit_model3d. Use this when there is nothing " +
    "to start from; to change an existing model, edit it in place instead.",
  inputSchema: CREATE_MODEL3D_SCHEMA,
  category: "write",
  userMessage: (params) => `Creating 3D model ${String(params["name"])}`
};

export const GET_MODEL3D_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    model_id: MODEL_ID_PROPERTY
  },
  required: ["model_id"]
};

export const getModel3dSpec: CapabilitySpec = {
  name: "get_model3d",
  description:
    "List every object in a 3D model's scene with its uuid, name, type, " +
    "visibility, transform (position, rotation in degrees, scale) and " +
    "material color, plus the scene's world-space bounds. Call this first to " +
    "see what is in a model and to get the uuids the edit operations take. " +
    "This is the headless twin of ui_3d_list_scene, and needs no open editor.",
  inputSchema: GET_MODEL3D_SCHEMA,
  category: "read",
  userMessage: (params) => `Reading 3D model ${String(params["model_id"])}`
};

export const EDIT_MODEL3D_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    model_id: MODEL_ID_PROPERTY,
    ops: {
      type: "array",
      description: `Operations to apply in order (at most ${MAX_OPS}).`,
      items: {
        type: "object",
        properties: {
          op: {
            type: "string",
            enum: [
              "add_object",
              "delete_object",
              "set_transform",
              "set_visibility",
              "rename_object",
              "set_material_color",
              "select_object"
            ],
            description: "Which operation this entry applies."
          },
          kind: {
            type: "string",
            enum: [
              "box",
              "sphere",
              "plane",
              "cylinder",
              "torus",
              "directionalLight",
              "pointLight"
            ],
            description: "add_object: the primitive to add."
          },
          name: {
            type: "string",
            description:
              "add_object: an optional name (a unique default is assigned " +
              "otherwise). rename_object: the new name."
          },
          target: {
            ...TARGET_PROPERTY,
            description:
              TARGET_PROPERTY.description +
              " Pass null on select_object to clear the selection."
          },
          position: { ...VEC3_PROPERTY, description: "set_transform: [x, y, z] position." },
          rotation: {
            ...VEC3_PROPERTY,
            description: "set_transform: [x, y, z] Euler rotation in degrees."
          },
          scale: { ...VEC3_PROPERTY, description: "set_transform: [x, y, z] scale." },
          visible: {
            type: "boolean",
            description: "set_visibility: whether the object renders."
          },
          color: {
            type: "string",
            description:
              "set_material_color: a CSS hex string like \"#ff8800\". Meshes only."
          }
        },
        required: ["op"]
      }
    }
  },
  required: ["model_id", "ops"]
};

export const editModel3dSpec: CapabilitySpec = {
  name: "edit_model3d",
  description:
    "Edit a 3D model's scene headlessly: add and delete primitives and " +
    "lights, set transforms (rotation in degrees), rename, show and hide, " +
    "recolor a mesh's material, and set the selected object. Operations run " +
    "in order against the stored glTF and the result is saved back to the " +
    "same asset, so the id stays valid and an open editor reloads it. These " +
    "are the ui_3d_* verbs with no editor open. Anything the operations do " +
    "not name — meshes, textures, animations — is kept as it was. Call " +
    "get_model3d for the uuids and validate_model3d afterwards.",
  inputSchema: EDIT_MODEL3D_SCHEMA,
  category: "write",
  userMessage: (params) => {
    const count = Array.isArray(params["ops"]) ? params["ops"].length : 0;
    return `Editing 3D model ${String(params["model_id"])} (${count} ops)`;
  }
};

export const VALIDATE_MODEL3D_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    model_id: MODEL_ID_PROPERTY,
    document: {
      type: "object",
      description:
        "An inline glTF 2.0 JSON document to check instead of a stored one."
    }
  }
};

export const validateModel3dSpec: CapabilitySpec = {
  name: "validate_model3d",
  description:
    "Statically validate a 3D model WITHOUT rendering it: the glTF version, " +
    "node/mesh/accessor/material/buffer references that resolve to nothing, " +
    "a cycle in the node hierarchy, a node carrying both a matrix and TRS " +
    "fields, a buffer view reading past its buffer, a light the document does " +
    "not declare, and an extension this build cannot honor. Warns about an " +
    "empty scene, geometry with no light, and duplicate names that make " +
    "addressing by name ambiguous. Pass `model_id` for a stored model or " +
    "`document` for one you are building.",
  inputSchema: VALIDATE_MODEL3D_SCHEMA,
  category: "read",
  userMessage: (params) =>
    params["model_id"]
      ? `Validating 3D model ${String(params["model_id"])}`
      : "Validating glTF document"
};

/** Every spec this module declares, in declaration order. */
export const model3dSpecs: readonly CapabilitySpec[] = [
  listModel3dsSpec,
  createModel3dSpec,
  getModel3dSpec,
  editModel3dSpec,
  validateModel3dSpec
];
