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
  "spotLight",
  "figure",
  "camera"
] as const;

const FIGURE_BODIES = ["male", "female", "child"] as const;
const FIGURE_POSES = ["stand", "sit", "walk", "run", "lie"] as const;

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

const figureFields = {
  body: z
    .enum(FIGURE_BODIES)
    .optional()
    .describe("Figure body: male (about 1.8 m), female (about 1.65 m) or child (about 1.2 m)."),
  pose: z.enum(FIGURE_POSES).optional().describe("Figure pose preset."),
  height: z.number().optional().describe("Figure standing height in meters."),
  color: z.string().optional().describe("Figure color as a CSS hex string."),
  entityId: z
    .string()
    .nullable()
    .optional()
    .describe("The cast entity the figure stands in for. Null clears it."),
  label: z
    .string()
    .nullable()
    .optional()
    .describe("A label for the figure, such as a character name. Null clears it.")
};

const cameraFields = {
  fovDeg: z.number().optional().describe("Camera vertical field of view in degrees, 1 to 179."),
  lookAt: vec3.optional().describe("An [x, y, z] point the camera is turned to face."),
  aspectRatio: z.number().optional(),
  znear: z.number().optional(),
  zfar: z.number().optional()
};

const given = (fields: Record<string, unknown>): string[] =>
  Object.keys(fields).filter((key) => fields[key] !== undefined);

FrontendToolRegistry.register({
  name: "ui_3d_add_object",
  description:
    "Add an object to the 3D editor scene and select it. `kind` is one of box, sphere, plane, cylinder, torus, cone, empty (a group), directionalLight, pointLight, spotLight, figure, camera. Optionally provide a name; otherwise a unique default name is assigned. `position` places it. A figure is a jointed mannequin standing on y = 0 and facing +Z; it takes body, pose, height, color, entityId and label. A camera looks down its own -Z; it takes fovDeg and lookAt. A timeline clip in scene camera mode picks a camera by this name.",
  parameters: z.object({
    kind: z.enum(PRIMITIVE_KINDS),
    name: z.string().optional(),
    position: vec3.optional(),
    ...figureFields,
    ...cameraFields
  }),
  async execute({ kind, name, position, body, pose, height, color, entityId, label, ...camera }) {
    const figure = { body, pose, height, color, entityId, label };
    if (kind !== "figure" && given(figure).length > 0) {
      throw new Error(`${given(figure).join(", ")} applies to kind "figure" only.`);
    }
    if (kind !== "camera" && given(camera).length > 0) {
      throw new Error(`${given(camera).join(", ")} applies to kind "camera" only.`);
    }
    const node = getModel3DToolHandler().addPrimitive(kind, name, {
      position,
      figure: kind === "figure" ? figure : undefined,
      camera: kind === "camera" ? camera : undefined
    });
    return { ok: true, object: node };
  }
});

FrontendToolRegistry.register({
  name: "ui_3d_set_figure",
  description:
    "Change a figure in the 3D editor: its body (male, female, child), pose (stand, sit, walk, run, lie), height in meters, color, entityId or label. Omitted fields stay as they are. A new body takes that body's default height unless height is given. Move and turn the figure with ui_3d_set_transform.",
  parameters: z.object({ target: targetParam, ...figureFields }),
  async execute({ target, ...patch }) {
    if (given(patch).length === 0) {
      throw new Error("ui_3d_set_figure needs at least one of body, pose, height, color, entityId or label.");
    }
    return { ok: true, object: getModel3DToolHandler().setFigure(target, patch) };
  }
});

FrontendToolRegistry.register({
  name: "ui_3d_set_camera",
  description:
    "Change a camera object in the 3D editor: move it with position, turn it to face a point with lookAt, and set its lens with fovDeg (vertical field of view in degrees), aspectRatio, znear and zfar. Omitted fields stay as they are. This edits a camera saved in the scene, not the viewport's own view.",
  parameters: z.object({ target: targetParam, position: vec3.optional(), ...cameraFields }),
  async execute({ target, ...patch }) {
    if (given(patch).length === 0) {
      throw new Error("ui_3d_set_camera needs at least one of position, lookAt, fovDeg, aspectRatio, znear or zfar.");
    }
    return { ok: true, object: getModel3DToolHandler().setCamera(target, patch) };
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
    "Set the base color of a mesh's material, or of a whole figure, in the 3D editor. `color` is a CSS hex string like \"#ff8800\". Only applies to figures and to mesh objects with a colored material.",
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
