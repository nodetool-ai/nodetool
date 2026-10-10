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
  "cone",
  "empty",
  "directionalLight",
  "pointLight",
  "spotLight"
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
    "Add a primitive object to the 3D editor scene and select it. `kind` is one of box, sphere, plane, cylinder, torus, cone, empty (a group), directionalLight, pointLight, spotLight. Optionally provide a name; otherwise a unique default name is assigned.",
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
    // An empty patch would record an undo step and mark the file unsaved
    // without changing anything.
    if (!position && !rotation && !scale) {
      throw new Error("ui_3d_set_transform needs at least one of position, rotation or scale.");
    }
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
  name: "ui_3d_get_object",
  description:
    "Read one object in the 3D editor in full: its transform, parent and children, every material slot (color, emissive, metalness, roughness, opacity), its light settings, and the geometry parameters of shapes added from the Add menu (angles in degrees). Call this before ui_3d_set_material, ui_3d_set_light or ui_3d_set_geometry to see the current values.",
  parameters: z.object({ target: targetParam }),
  async execute({ target }) {
    return { ok: true, object: getModel3DToolHandler().getObject(target) };
  }
});

FrontendToolRegistry.register({
  name: "ui_3d_duplicate_object",
  description:
    "Duplicate an object with its children in the 3D editor. The copy gets its own geometry and materials, the next free name (\"Crate 3\" after \"Crate 2\"), sits next to the original, and is selected.",
  parameters: z.object({ target: targetParam }),
  async execute({ target }) {
    return { ok: true, object: getModel3DToolHandler().duplicateObject(target) };
  }
});

FrontendToolRegistry.register({
  name: "ui_3d_set_parent",
  description:
    "Move an object under another object in the 3D editor, so it follows that object's transform. Pass parent null to move it back to the scene root. The object keeps its place in the world. Use an empty group (ui_3d_add_object kind \"empty\") to organize objects.",
  parameters: z.object({
    target: targetParam,
    parent: targetParam.nullable()
  }),
  async execute({ target, parent }) {
    return { ok: true, object: getModel3DToolHandler().setParent(target, parent) };
  }
});

const unit = z.number().min(0).max(1);

FrontendToolRegistry.register({
  name: "ui_3d_set_material",
  description:
    "Change a mesh's material in the 3D editor. Set any of color and emissive (CSS hex such as \"#ff8800\"), emissive_intensity (0 or more), metalness, roughness and opacity (each 0 to 1). Omitted fields stay as they are. `slot` picks one material of a multi-material mesh; without it every slot changes. Lowering opacity below 1 turns on transparency.",
  parameters: z.object({
    target: targetParam,
    slot: z.number().int().min(0).optional(),
    color: z.string().optional(),
    emissive: z.string().optional(),
    emissive_intensity: z.number().min(0).optional(),
    metalness: unit.optional(),
    roughness: unit.optional(),
    opacity: unit.optional()
  }),
  async execute({ target, emissive_intensity, ...patch }) {
    const object = getModel3DToolHandler().setMaterial(target, {
      ...patch,
      emissiveIntensity: emissive_intensity
    });
    return { ok: true, object };
  }
});

FrontendToolRegistry.register({
  name: "ui_3d_set_light",
  description:
    "Change a light in the 3D editor. Every light has color (CSS hex) and intensity. Point and spot lights also have distance (range, 0 for unlimited) and decay. Spot lights also have angle (cone half-angle in degrees, 1 to 90) and penumbra (0 to 1, soft edge). Omitted fields stay as they are. Aim directional and spot lights with ui_3d_set_transform rotation: they shine down their local -Z axis.",
  parameters: z.object({
    target: targetParam,
    color: z.string().optional(),
    intensity: z.number().min(0).optional(),
    distance: z.number().min(0).optional(),
    decay: z.number().min(0).optional(),
    angle: z.number().min(1).max(90).optional(),
    penumbra: unit.optional()
  }),
  async execute({ target, ...patch }) {
    return { ok: true, object: getModel3DToolHandler().setLight(target, patch) };
  }
});

FrontendToolRegistry.register({
  name: "ui_3d_set_geometry",
  description:
    "Resize or reshape a shape added from the 3D editor's Add menu by rebuilding its geometry. `params` maps parameter names to numbers, with angles in degrees. Box: width, height, depth, widthSegments, heightSegments, depthSegments. Sphere: radius, widthSegments, heightSegments, phiStart, phiLength, thetaStart, thetaLength. Plane: width, height, widthSegments, heightSegments. Cylinder: radiusTop, radiusBottom, height, radialSegments, heightSegments, thetaStart, thetaLength. Cone: radius, height, radialSegments, heightSegments, thetaStart, thetaLength. Torus: radius, tube, radialSegments, tubularSegments, arc. Imported meshes have no parameters; scale them with ui_3d_set_transform instead.",
  parameters: z.object({
    target: targetParam,
    params: z.record(z.string(), z.number())
  }),
  async execute({ target, params }) {
    return { ok: true, object: getModel3DToolHandler().setGeometry(target, params) };
  }
});

FrontendToolRegistry.register({
  name: "ui_3d_undo",
  description:
    "Undo the last edit in the 3D editor, whether you or the user made it. Returns the label of the step undone (null when there was nothing to undo) and the labels of the next undo and redo steps.",
  parameters: z.object({}),
  async execute() {
    return { ok: true, ...getModel3DToolHandler().undo() };
  }
});

FrontendToolRegistry.register({
  name: "ui_3d_redo",
  description:
    "Redo the last undone edit in the 3D editor. Returns the label of the step redone (null when there was nothing to redo) and the labels of the next undo and redo steps.",
  parameters: z.object({}),
  async execute() {
    return { ok: true, ...getModel3DToolHandler().redo() };
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

FrontendToolRegistry.register({
  name: "ui_3d_capture_view",
  description:
    "Capture a screenshot of the current 3D editor viewport (what the camera sees) and return it as an image you can visually inspect. Use it to verify a change looks right, judge composition/colors, or understand a model you didn't build. Tip: call ui_3d_frame_scene first to fit everything in view.",
  parameters: z.object({}),
  async execute() {
    const dataUrl = getModel3DToolHandler().captureView();
    const commaIndex = dataUrl.indexOf(",");
    const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
    return {
      ok: true,
      note: "Rendered view of the 3D editor viewport (PNG).",
      // The server persists this as a temp image asset and hands the model a
      // handle; the model calls view_image to actually see it.
      image_content: { data: base64, mimeType: "image/png" }
    };
  }
});
