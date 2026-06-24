import { z } from "zod";
import { FrontendToolRegistry } from "../frontendTools";
import { getModel3DToolHandler } from "../../../components/model_editor/model3DToolBridge";

/**
 * Frontend tools that let the agent drive the live 3D model editor scene.
 *
 * They delegate to the handler the open {@link Model3DEditor} registers on the
 * {@link model3DToolBridge}. When no editor is open, `getModel3DToolHandler`
 * throws a descriptive error which the tool layer surfaces back to the agent.
 */

const PRIMITIVE_KINDS = [
  "box",
  "sphere",
  "plane",
  "cylinder",
  "torus",
  "directionalLight",
  "pointLight"
] as const;

const vec3 = z.tuple([z.number(), z.number(), z.number()]);
const targetParam = z
  .string()
  .describe("The object's uuid or its name (case-insensitive).");

FrontendToolRegistry.register({
  name: "ui_3d_list_scene",
  description:
    "List every object in the open 3D model editor scene with its uuid, name, type, visibility and transform (position, rotation in degrees, scale). Call this first to discover what's in the scene and to get the uuids/names other 3D tools need.",
  parameters: z.object({}),
  async execute() {
    const nodes = getModel3DToolHandler().listScene();
    return { ok: true, count: nodes.length, objects: nodes };
  }
});

FrontendToolRegistry.register({
  name: "ui_3d_add_object",
  description:
    "Add a primitive object to the 3D editor scene and select it. `kind` is one of box, sphere, plane, cylinder, torus, directionalLight, pointLight. Optionally provide a name; otherwise a unique default name is assigned.",
  parameters: z.object({
    kind: z.enum(PRIMITIVE_KINDS),
    name: z.string().optional()
  }),
  async execute({ kind, name }) {
    const node = getModel3DToolHandler().addPrimitive(kind, name);
    return { ok: true, object: node };
  }
});

FrontendToolRegistry.register({
  name: "ui_3d_select_object",
  description:
    "Select an object in the 3D editor (driving the transform gizmo and Properties panel). Pass null/empty to clear the selection.",
  parameters: z.object({
    target: targetParam.nullable().optional()
  }),
  async execute({ target }) {
    const node = getModel3DToolHandler().selectObject(target ?? null);
    return { ok: true, selected: node };
  }
});

FrontendToolRegistry.register({
  name: "ui_3d_delete_object",
  description: "Delete an object (and its children) from the 3D editor scene.",
  parameters: z.object({ target: targetParam }),
  async execute({ target }) {
    const node = getModel3DToolHandler().deleteObject(target);
    return { ok: true, deleted: node };
  }
});

FrontendToolRegistry.register({
  name: "ui_3d_set_transform",
  description:
    "Set the position, rotation and/or scale of an object in the 3D editor. Each field is an [x, y, z] array; omit a field to leave it unchanged. Rotation is in degrees.",
  parameters: z.object({
    target: targetParam,
    position: vec3.optional(),
    rotation: vec3.optional(),
    scale: vec3.optional()
  }),
  async execute({ target, position, rotation, scale }) {
    const node = getModel3DToolHandler().setTransform(target, {
      position,
      rotation,
      scale
    });
    return { ok: true, object: node };
  }
});

FrontendToolRegistry.register({
  name: "ui_3d_set_visibility",
  description: "Show or hide an object in the 3D editor scene.",
  parameters: z.object({
    target: targetParam,
    visible: z.boolean()
  }),
  async execute({ target, visible }) {
    const node = getModel3DToolHandler().setVisibility(target, visible);
    return { ok: true, object: node };
  }
});

FrontendToolRegistry.register({
  name: "ui_3d_rename_object",
  description: "Rename an object in the 3D editor scene.",
  parameters: z.object({
    target: targetParam,
    name: z.string()
  }),
  async execute({ target, name }) {
    const node = getModel3DToolHandler().renameObject(target, name);
    return { ok: true, object: node };
  }
});

FrontendToolRegistry.register({
  name: "ui_3d_set_material_color",
  description:
    "Set the base color of a mesh's material in the 3D editor. `color` is a CSS hex string like \"#ff8800\". Only applies to mesh objects with a colored material.",
  parameters: z.object({
    target: targetParam,
    color: z.string()
  }),
  async execute({ target, color }) {
    const node = getModel3DToolHandler().setMaterialColor(target, color);
    return { ok: true, object: node };
  }
});

FrontendToolRegistry.register({
  name: "ui_3d_frame_scene",
  description:
    "Frame the camera to fit the whole 3D editor scene in view (same as the Frame scene toolbar button).",
  parameters: z.object({}),
  async execute() {
    getModel3DToolHandler().frameScene();
    return { ok: true };
  }
});
