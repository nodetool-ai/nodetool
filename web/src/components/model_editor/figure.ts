import * as THREE from "three";
import {
  buildFigure,
  FIGURE_DEFAULT_BODY,
  FIGURE_DEFAULT_COLOR,
  FIGURE_DEFAULT_HEIGHT,
  FIGURE_DEFAULT_POSE,
  FIGURE_EXTRA,
  FIGURE_JOINTS,
  FIGURE_MAX_HEIGHT,
  FIGURE_MIN_HEIGHT,
  FIGURE_PART_EXTRA,
  isFigureBody,
  isFigureJoint,
  isFigurePose,
  type FigureBody,
  type FigureInfo,
  type FigureJoint,
  type FigurePart,
  type FigurePose,
  type Geometry
} from "@nodetool-ai/model3d";

import type { EditorCommand } from "./editorHistory";

/**
 * The blockout figure in the live scene. Its joint tree, poses and meshes come
 * from `@nodetool-ai/model3d`, so a figure added here and one added by the
 * headless `edit_model3d` are the same object in the saved file: a group whose
 * `userData.nodetool_figure` holds body, pose, height and cast link, with one
 * mesh per joint marked by `userData.nodetool_figure_part`.
 */

/** What a figure can be created or changed with. Null clears a text field. */
export interface FigurePatch {
  body?: FigureBody;
  pose?: FigurePose;
  /** Standing height in meters. */
  height?: number;
  /** CSS hex color of the whole figure. */
  color?: string;
  entityId?: string | null;
  label?: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The figure a root object declares, or null when it is not a figure. */
export const figureInfoOf = (object: THREE.Object3D): FigureInfo | null => {
  const raw: unknown = object.userData[FIGURE_EXTRA];
  if (!isRecord(raw)) {
    return null;
  }
  const body = isFigureBody(raw.body) ? raw.body : FIGURE_DEFAULT_BODY;
  const info: FigureInfo = {
    body,
    pose: isFigurePose(raw.pose) ? raw.pose : FIGURE_DEFAULT_POSE,
    height:
      typeof raw.height === "number" && Number.isFinite(raw.height) && raw.height > 0
        ? raw.height
        : FIGURE_DEFAULT_HEIGHT[body]
  };
  if (typeof raw.entityId === "string" && raw.entityId !== "") {
    info.entityId = raw.entityId;
  }
  if (typeof raw.label === "string" && raw.label !== "") {
    info.label = raw.label;
  }
  return info;
};

export const isFigure = (object: THREE.Object3D): boolean => figureInfoOf(object) !== null;

/**
 * True for a joint of a figure. Joints are posed through the figure, so the
 * outliner, picking and the agent tools leave them out.
 */
export const isFigurePart = (object: THREE.Object3D): boolean =>
  isFigureJoint(object.userData[FIGURE_PART_EXTRA]);

/** The object a click on `object` selects: the figure, for one of its joints. */
export const selectableOf = (object: THREE.Object3D): THREE.Object3D => {
  let node: THREE.Object3D | null = object;
  while (node && isFigurePart(node)) {
    node = node.parent;
  }
  return node && node !== object && isFigure(node) ? node : object;
};

/** A figure's joint objects, by joint. */
export const figureParts = (root: THREE.Object3D): Map<FigureJoint, THREE.Object3D> => {
  const parts = new Map<FigureJoint, THREE.Object3D>();
  root.traverse((node) => {
    const joint: unknown = node.userData[FIGURE_PART_EXTRA];
    if (node !== root && isFigureJoint(joint) && !parts.has(joint)) {
      parts.set(joint, node);
    }
  });
  return parts;
};

/** The distinct materials a figure's joints draw with. */
export const figureMaterials = (root: THREE.Object3D): THREE.Material[] => {
  const materials = new Set<THREE.Material>();
  for (const part of figureParts(root).values()) {
    if (part instanceof THREE.Mesh) {
      const own: THREE.Material[] = Array.isArray(part.material)
        ? part.material
        : [part.material];
      own.forEach((material) => materials.add(material));
    }
  }
  return [...materials];
};

const toBufferGeometry = (geometry: Geometry): THREE.BufferGeometry => {
  const buffer = new THREE.BufferGeometry();
  buffer.setAttribute("position", new THREE.BufferAttribute(geometry.positions, 3));
  buffer.setAttribute("normal", new THREE.BufferAttribute(geometry.normals, 3));
  buffer.setIndex(new THREE.BufferAttribute(geometry.indices, 1));
  return buffer;
};

const toRadians = THREE.MathUtils.degToRad;

const posePart = (object: THREE.Object3D, part: FigurePart): void => {
  object.position.fromArray(part.translation);
  object.rotation.set(
    toRadians(part.rotation[0]),
    toRadians(part.rotation[1]),
    toRadians(part.rotation[2])
  );
};

const checkHeight = (height: number): number => {
  if (!Number.isFinite(height) || height < FIGURE_MIN_HEIGHT || height > FIGURE_MAX_HEIGHT) {
    throw new Error(
      `A figure's height must be between ${FIGURE_MIN_HEIGHT} and ${FIGURE_MAX_HEIGHT} meters, got ${height}.`
    );
  }
  return height;
};

const HEX_COLOR = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

const checkColor = (color: string): THREE.Color => {
  const text = color.trim();
  if (!HEX_COLOR.test(text)) {
    throw new Error(`color must be a CSS hex string like "#ff8800", got "${color}".`);
  }
  return new THREE.Color(text.startsWith("#") ? text : `#${text}`);
};

const applyLinks = (info: FigureInfo, patch: FigurePatch): void => {
  for (const key of ["entityId", "label"] as const) {
    const value = patch[key];
    if (value === undefined) {
      continue;
    }
    const trimmed = value === null ? "" : value.trim();
    if (trimmed === "") {
      delete info[key];
    } else {
      info[key] = trimmed;
    }
  }
};

/** Build a figure. The caller names it and adds it to the scene. */
export const createFigure = (options: FigurePatch = {}): THREE.Group => {
  const body = options.body ?? FIGURE_DEFAULT_BODY;
  const pose = options.pose ?? FIGURE_DEFAULT_POSE;
  const height = checkHeight(options.height ?? FIGURE_DEFAULT_HEIGHT[body]);
  const material = new THREE.MeshPhysicalMaterial({
    color: checkColor(options.color ?? FIGURE_DEFAULT_COLOR),
    metalness: 0.1,
    roughness: 0.8
  });
  const root = new THREE.Group();
  const objects = new Map<FigureJoint, THREE.Object3D>();
  for (const part of buildFigure(body, pose, height).parts) {
    const mesh = new THREE.Mesh(toBufferGeometry(part.geometry), material);
    mesh.name = part.name;
    mesh.userData[FIGURE_PART_EXTRA] = part.joint;
    posePart(mesh, part);
    (part.parent ? (objects.get(part.parent) as THREE.Object3D) : root).add(mesh);
    objects.set(part.joint, mesh);
  }
  const info: FigureInfo = { body, pose, height };
  applyLinks(info, options);
  root.userData[FIGURE_EXTRA] = info;
  return root;
};

/**
 * Pose a figure and rebuild its joints for `info`. Geometry is rebuilt only
 * when the body or height changed, and the replaced geometry is freed, since
 * an undo can build it again.
 */
export const applyFigureInfo = (root: THREE.Object3D, info: FigureInfo): void => {
  const current = figureInfoOf(root);
  if (!current) {
    throw new Error(`${root.name || root.type} is a ${root.type}, not a figure.`);
  }
  const objects = figureParts(root);
  const missing = FIGURE_JOINTS.filter((joint) => !objects.has(joint));
  if (missing.length > 0) {
    throw new Error(
      `${root.name || "This figure"} has lost its ${missing.join(", ")} joint(s), so it cannot be posed. Delete it and add a new figure.`
    );
  }
  const height = checkHeight(info.height);
  const reshaped = info.body !== current.body || height !== current.height;
  for (const part of buildFigure(info.body, info.pose, height).parts) {
    const object = objects.get(part.joint) as THREE.Object3D;
    posePart(object, part);
    if (reshaped && object instanceof THREE.Mesh) {
      (object.geometry as THREE.BufferGeometry).dispose();
      object.geometry = toBufferGeometry(part.geometry);
    }
  }
  root.userData[FIGURE_EXTRA] = { ...info, height };
  root.updateMatrixWorld(true);
};

/** `current` with `patch` applied. A new body takes its own default height. */
export const patchFigureInfo = (current: FigureInfo, patch: FigurePatch): FigureInfo => {
  const body = patch.body ?? current.body;
  const next: FigureInfo = {
    ...current,
    body,
    pose: patch.pose ?? current.pose,
    height: checkHeight(
      patch.height ?? (patch.body ? FIGURE_DEFAULT_HEIGHT[body] : current.height)
    )
  };
  applyLinks(next, patch);
  return next;
};

/**
 * Change a figure's body, pose, height, color or cast link and return the
 * command that reverses it.
 */
export const figurePatchCommand = (root: THREE.Object3D, patch: FigurePatch): EditorCommand => {
  const current = figureInfoOf(root);
  if (!current) {
    throw new Error(`${root.name || root.type} is a ${root.type}, not a figure.`);
  }
  const next = patchFigureInfo(current, patch);
  const color = patch.color === undefined ? null : checkColor(patch.color);
  const materials = figureMaterials(root) as (THREE.Material & { color?: THREE.Color })[];
  const colorsBefore = materials.map((material) => material.color?.clone());
  const redo = (): void => {
    applyFigureInfo(root, next);
    if (color) {
      materials.forEach((material) => material.color?.copy(color));
    }
  };
  const undo = (): void => {
    applyFigureInfo(root, current);
    materials.forEach((material, index) => {
      const saved = colorsBefore[index];
      if (saved) {
        material.color?.copy(saved);
      }
    });
  };
  redo();
  return { label: `Edit figure ${root.name || "Figure"}`, undo, redo };
};
