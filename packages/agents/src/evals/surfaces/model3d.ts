/**
 * Headless bridge for the 3D model editor tool-loop eval.
 *
 * The real frontend tools (`web/src/lib/tools/builtin/model3d.ts`) delegate to
 * a `Model3DToolHandler` the live `Model3DEditor` registers on
 * `model3DToolBridge` — it mutates a Three.js scene graph and (for
 * `ui_3d_capture_view`) renders a WebGL frame. None of that can run under
 * Node. This bridge reimplements the *effects* of the non-rendering tools
 * against a plain in-memory scene graph, so a model can drive the same
 * `ui_3d_*` tool surface headlessly.
 *
 * What it does NOT fork is the tool *contract*: names, descriptions, and Zod
 * parameter shapes are copied verbatim from the builtin file — the single
 * source of truth the browser tools also expose. `ui_3d_capture_view` is
 * intentionally excluded: it requires a real WebGL render and has no
 * meaningful headless equivalent.
 */

import { z } from "zod";
import { parseWithTypeCoercion } from "@nodetool-ai/runtime";
import type { HeadlessTool } from "../tool-loop-bridge.js";
import type {
  HeadlessSurfaceBridge,
  ToolLoopEvalCase,
  ToolLoopStatePredicate
} from "../tool-loop-eval.js";

export type Model3DPrimitiveKind =
  | "box"
  | "sphere"
  | "plane"
  | "cylinder"
  | "torus"
  | "directionalLight"
  | "pointLight";

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

export interface Model3DBridgeInitialState {
  objects?: { name: string; kind: Model3DPrimitiveKind }[];
}

export interface Model3DBridgeFinalState {
  selectedUuid: string | null;
  objects: {
    uuid: string;
    name: string;
    type: string;
    visible: boolean;
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    materialColor?: string;
  }[];
}

/** Internal scene node. Rotation is in degrees, matching the Properties panel. */
interface SceneNode {
  uuid: string;
  name: string;
  type: string;
  visible: boolean;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  parentUuid: string | null;
  materialColor?: string;
}

/** three.js object type for a given primitive kind. */
function kindToType(kind: Model3DPrimitiveKind): string {
  switch (kind) {
    case "directionalLight":
      return "DirectionalLight";
    case "pointLight":
      return "PointLight";
    default:
      return "Mesh";
  }
}

/** Title-case default name for a kind, e.g. "box" -> "Box". */
function defaultKindLabel(kind: Model3DPrimitiveKind): string {
  const labels: Record<Model3DPrimitiveKind, string> = {
    box: "Box",
    sphere: "Sphere",
    plane: "Plane",
    cylinder: "Cylinder",
    torus: "Torus",
    directionalLight: "Directional Light",
    pointLight: "Point Light"
  };
  return labels[kind];
}

function tool(
  name: string,
  description: string,
  parameters: z.ZodTypeAny,
  impl: (args: Record<string, unknown>) => Promise<unknown>
): HeadlessTool {
  return {
    name,
    description,
    parameters,
    execute: (args) => {
      const parsed = parseWithTypeCoercion(parameters, args ?? {}) as Record<
        string,
        unknown
      >;
      return impl(parsed);
    }
  };
}

/**
 * Build an in-memory 3D-scene bridge whose tools share the `ui_3d_*` contract
 * but run headlessly against a plain scene-graph array (no Three.js).
 */
export function createModel3DToolBridge(
  initial: Model3DBridgeInitialState = {}
): HeadlessSurfaceBridge<Model3DBridgeFinalState> {
  const nodes: SceneNode[] = [];
  let selectedUuid: string | null = null;
  let uuidSeq = 0;

  const nextUuid = () => `obj_${++uuidSeq}`;

  const findByUuid = (uuid: string): SceneNode | undefined =>
    nodes.find((n) => n.uuid === uuid);

  const resolveTarget = (idOrName: string): SceneNode => {
    const byUuid = findByUuid(idOrName);
    if (byUuid) return byUuid;
    const lower = idOrName.toLowerCase();
    const byName = nodes.find((n) => n.name.toLowerCase() === lower);
    if (byName) return byName;
    throw new Error(`No object found matching "${idOrName}".`);
  };

  const uniqueName = (kind: Model3DPrimitiveKind): string => {
    const base = defaultKindLabel(kind);
    if (!nodes.some((n) => n.name === base)) return base;
    let i = 2;
    while (nodes.some((n) => n.name === `${base} ${i}`)) i += 1;
    return `${base} ${i}`;
  };

  const descendantsOf = (uuid: string): SceneNode[] => {
    const result: SceneNode[] = [];
    const stack = [uuid];
    while (stack.length > 0) {
      const parent = stack.pop()!;
      for (const n of nodes) {
        if (n.parentUuid === parent) {
          result.push(n);
          stack.push(n.uuid);
        }
      }
    }
    return result;
  };

  const serialize = (n: SceneNode): SceneNode => ({ ...n });

  // Seed initial objects.
  for (const obj of initial.objects ?? []) {
    const uuid = nextUuid();
    nodes.push({
      uuid,
      name: obj.name,
      type: kindToType(obj.kind),
      visible: true,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      parentUuid: null
    });
  }

  const tools: HeadlessTool[] = [
    tool(
      "ui_3d_list_scene",
      "List every object in the open 3D model editor scene with its uuid, name, type, visibility and transform (position, rotation in degrees, scale). Call this first to discover what's in the scene and to get the uuids/names other 3D tools need.",
      z.object({}),
      async () => {
        const objects = nodes.map(serialize);
        return { ok: true, count: objects.length, objects };
      }
    ),

    tool(
      "ui_3d_add_object",
      "Add a primitive object to the 3D editor scene and select it. `kind` is one of box, sphere, plane, cylinder, torus, directionalLight, pointLight. Optionally provide a name; otherwise a unique default name is assigned.",
      z.object({
        kind: z.enum(PRIMITIVE_KINDS),
        name: z.string().optional()
      }),
      async ({ kind, name }) => {
        const k = kind as Model3DPrimitiveKind;
        const uuid = nextUuid();
        const node: SceneNode = {
          uuid,
          name: (name as string | undefined) || uniqueName(k),
          type: kindToType(k),
          visible: true,
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          parentUuid: null
        };
        nodes.push(node);
        selectedUuid = uuid;
        return { ok: true, object: serialize(node) };
      }
    ),

    tool(
      "ui_3d_select_object",
      "Select an object in the 3D editor (driving the transform gizmo and Properties panel). Pass null/empty to clear the selection.",
      z.object({ target: targetParam.nullable().optional() }),
      async ({ target }) => {
        const t = target as string | null | undefined;
        if (!t) {
          selectedUuid = null;
          return { ok: true, selected: null };
        }
        const node = resolveTarget(t);
        selectedUuid = node.uuid;
        return { ok: true, selected: serialize(node) };
      }
    ),

    tool(
      "ui_3d_delete_object",
      "Delete an object (and its children) from the 3D editor scene.",
      z.object({ target: targetParam }),
      async ({ target }) => {
        const node = resolveTarget(target as string);
        const toRemove = new Set([node.uuid, ...descendantsOf(node.uuid).map((d) => d.uuid)]);
        for (let i = nodes.length - 1; i >= 0; i -= 1) {
          if (toRemove.has(nodes[i].uuid)) nodes.splice(i, 1);
        }
        if (selectedUuid && toRemove.has(selectedUuid)) selectedUuid = null;
        return { ok: true, deleted: serialize(node) };
      }
    ),

    tool(
      "ui_3d_set_transform",
      "Set the position, rotation and/or scale of an object in the 3D editor. Each field is an [x, y, z] array; omit a field to leave it unchanged. Rotation is in degrees.",
      z.object({
        target: targetParam,
        position: vec3.optional(),
        rotation: vec3.optional(),
        scale: vec3.optional()
      }),
      async ({ target, position, rotation, scale }) => {
        const node = resolveTarget(target as string);
        if (position) node.position = position as [number, number, number];
        if (rotation) node.rotation = rotation as [number, number, number];
        if (scale) node.scale = scale as [number, number, number];
        return { ok: true, object: serialize(node) };
      }
    ),

    tool(
      "ui_3d_set_visibility",
      "Show or hide an object in the 3D editor scene.",
      z.object({ target: targetParam, visible: z.boolean() }),
      async ({ target, visible }) => {
        const node = resolveTarget(target as string);
        node.visible = visible as boolean;
        return { ok: true, object: serialize(node) };
      }
    ),

    tool(
      "ui_3d_rename_object",
      "Rename an object in the 3D editor scene.",
      z.object({ target: targetParam, name: z.string() }),
      async ({ target, name }) => {
        const node = resolveTarget(target as string);
        node.name = name as string;
        return { ok: true, object: serialize(node) };
      }
    ),

    tool(
      "ui_3d_set_material_color",
      'Set the base color of a mesh\'s material in the 3D editor. `color` is a CSS hex string like "#ff8800". Only applies to mesh objects with a colored material.',
      z.object({ target: targetParam, color: z.string() }),
      async ({ target, color }) => {
        const node = resolveTarget(target as string);
        if (node.type !== "Mesh") {
          throw new Error(
            `"${node.name}" is a ${node.type}, not a mesh — only mesh objects have a colored material.`
          );
        }
        node.materialColor = color as string;
        return { ok: true, object: serialize(node) };
      }
    ),

    tool(
      "ui_3d_frame_scene",
      "Frame the camera to fit the whole 3D editor scene in view (same as the Frame scene toolbar button).",
      z.object({}),
      async () => {
        return { ok: true };
      }
    )
  ];

  return {
    tools,
    finalState: (): Model3DBridgeFinalState => ({
      selectedUuid,
      objects: nodes.map((n) => ({
        uuid: n.uuid,
        name: n.name,
        type: n.type,
        visible: n.visible,
        position: n.position,
        rotation: n.rotation,
        scale: n.scale,
        ...(n.materialColor !== undefined
          ? { materialColor: n.materialColor }
          : {})
      }))
    })
  };
}

/** Count objects of a given three.js `type` in the final scene. */
function countByType(state: Model3DBridgeFinalState, type: string): number {
  return state.objects.filter((o) => o.type === type).length;
}

const MODEL3D_SYSTEM_PROMPT = `You are an assistant driving a 3D model editor through UI tools.

Use the ui_3d_* tools to inspect and modify the scene:
- Call ui_3d_list_scene first to see what's already there and get uuids/names.
- Add primitives with ui_3d_add_object (box, sphere, plane, cylinder, torus, directionalLight, pointLight).
- Address existing objects by uuid or name with ui_3d_select_object, ui_3d_delete_object, ui_3d_set_transform, ui_3d_set_visibility, ui_3d_rename_object, ui_3d_set_material_color.
- ui_3d_frame_scene fits the camera to the scene.

Call one tool at a time and use the result before the next call. When the objective is fully satisfied, STOP calling tools and give a one-line summary.`;

const NOT_VEC3_1_1_1 = (v: [number, number, number]) =>
  v[0] !== 1 || v[1] !== 1 || v[2] !== 1;

export const MODEL3D_TOOL_LOOP_CASES: readonly ToolLoopEvalCase<Model3DBridgeFinalState>[] =
  [
    {
      id: "build-scene",
      description:
        "Add a box, a sphere, and a directional light, and move the sphere up",
      objective:
        "Build a small scene: add a box, add a sphere, add a directional light, and move the sphere up (increase its Y position).",
      createBridge: () => createModel3DToolBridge(),
      systemPrompt: MODEL3D_SYSTEM_PROMPT,
      expect: {
        requiredTools: ["ui_3d_add_object", "ui_3d_set_transform"],
        noErrorResults: true,
        minToolCalls: 3,
        maxToolCalls: 15,
        finalState: [
          {
            name: "hasThreeObjects",
            detail: "fewer than 3 objects in the scene",
            test: (s) => s.objects.length >= 3
          },
          {
            name: "hasMesh",
            detail: "no Mesh object present",
            test: (s) => countByType(s, "Mesh") >= 1
          },
          {
            name: "hasDirectionalLight",
            detail: "no DirectionalLight present",
            test: (s) => countByType(s, "DirectionalLight") >= 1
          }
        ]
      }
    },
    {
      id: "recolor-and-arrange",
      description:
        "Rename an existing box to 'Hero', give it an orange material, and scale it up",
      objective:
        "The scene has one box. Rename it to 'Hero', give it an orange material color, and scale it up 2x.",
      createBridge: () =>
        createModel3DToolBridge({ objects: [{ name: "Box", kind: "box" }] }),
      systemPrompt: MODEL3D_SYSTEM_PROMPT,
      userPrompt:
        "Objective: The scene has one box named 'Box'. Rename it to 'Hero', give it an orange material color, and scale it up 2x.",
      expect: {
        requiredTools: [
          "ui_3d_rename_object",
          "ui_3d_set_material_color",
          "ui_3d_set_transform"
        ],
        noErrorResults: true,
        minToolCalls: 3,
        maxToolCalls: 12,
        finalState: [
          {
            name: "heroExists",
            detail: "no object named 'Hero'",
            test: (s) => s.objects.some((o) => o.name === "Hero")
          },
          {
            name: "heroHasColor",
            detail: "'Hero' has no materialColor set",
            test: (s) =>
              s.objects.some((o) => o.name === "Hero" && !!o.materialColor)
          },
          {
            name: "heroScaledUp",
            detail: "'Hero' scale is still [1,1,1]",
            test: (s) =>
              s.objects.some(
                (o) => o.name === "Hero" && NOT_VEC3_1_1_1(o.scale)
              )
          }
        ]
      }
    },
    {
      id: "hide-and-delete",
      description: "Hide a box and delete a sphere from the scene",
      objective:
        "The scene has a box and a sphere. Hide the box, and delete the sphere.",
      createBridge: () =>
        createModel3DToolBridge({
          objects: [
            { name: "Box", kind: "box" },
            { name: "Sphere", kind: "sphere" }
          ]
        }),
      systemPrompt: MODEL3D_SYSTEM_PROMPT,
      userPrompt:
        "Objective: The scene has a box named 'Box' and a sphere named 'Sphere'. Hide the box, and delete the sphere.",
      expect: {
        requiredTools: ["ui_3d_set_visibility", "ui_3d_delete_object"],
        noErrorResults: true,
        minToolCalls: 2,
        maxToolCalls: 10,
        finalState: [
          {
            name: "oneObjectLeft",
            detail: "scene does not have exactly 1 object",
            test: (s) => s.objects.length === 1
          },
          {
            name: "remainingHidden",
            detail: "the remaining object is still visible",
            test: (s) => s.objects.length === 1 && s.objects[0].visible === false
          }
        ]
      }
    }
  ];
