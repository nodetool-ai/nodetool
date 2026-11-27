/**
 * The scene-edit script: one operation per verb the 3D editor exposes, applied
 * in order against a document.
 *
 * `edit_model3d` parses a caller's JSON into this union and hands it here, and
 * the eval bridge drives the same verbs, so a headless edit and an edit made in
 * the browser go through one implementation.
 */

import { base64Encode, type Model3DFile } from "./gltf.js";
import {
  addObject,
  deleteObject,
  Model3DOperationError,
  renameObject,
  selectObject,
  setMaterialColor,
  setCamera,
  setFigure,
  setTransform,
  setVisibility,
  type CameraOptions,
  type FigureOptions,
  type Model3DSceneObject
} from "./scene.js";
import { FIGURE_BODIES, FIGURE_POSES, isFigureBody, isFigurePose } from "./figure.js";
import type { Vec3 } from "./math.js";
import { PRIMITIVE_KINDS, type PrimitiveKind } from "./primitives.js";

export type Model3DOperation =
  | ({
      op: "add_object";
      kind: PrimitiveKind;
      name?: string;
      /** Where the object goes, in place of the kind's default position. */
      position?: Vec3;
    } & FigureOptions &
      CameraOptions)
  | ({ op: "set_figure"; target: string } & FigureOptions)
  | ({ op: "set_camera"; target: string; position?: Vec3 } & CameraOptions)
  | { op: "delete_object"; target: string }
  | {
      op: "set_transform";
      target: string;
      position?: Vec3;
      rotation?: Vec3;
      scale?: Vec3;
    }
  | { op: "set_visibility"; target: string; visible: boolean }
  | { op: "rename_object"; target: string; name: string }
  | { op: "set_material_color"; target: string; color: string }
  | { op: "select_object"; target: string | null };

export const MODEL3D_OPERATIONS = [
  "add_object",
  "delete_object",
  "set_transform",
  "set_visibility",
  "rename_object",
  "set_material_color",
  "select_object",
  "set_figure",
  "set_camera"
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function requireTarget(args: Record<string, unknown>, op: string): string {
  const target = args["target"];
  if (typeof target !== "string" || target.trim() === "") {
    throw new Model3DOperationError(
      `${op} needs a target — an object's uuid or name (get the scene listing first).`
    );
  }
  return target;
}

function optionalVec3(
  args: Record<string, unknown>,
  key: string,
  op: string
): Vec3 | undefined {
  const value = args[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    value.some((n) => typeof n !== "number" || !Number.isFinite(n))
  ) {
    throw new Model3DOperationError(
      `${op}.${key} must be three finite numbers, e.g. [0, 1, 0].`
    );
  }
  return [value[0], value[1], value[2]] as Vec3;
}

function optionalNumber(
  args: Record<string, unknown>,
  key: string,
  op: string
): number | undefined {
  const value = args[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Model3DOperationError(`${op}.${key} must be a finite number.`);
  }
  return value;
}

/** A text field that null (or, on set_figure, an empty string) clears. */
function optionalText(
  args: Record<string, unknown>,
  key: string,
  op: string
): string | null | undefined {
  const value = args[key];
  if (value === undefined) {
    return undefined;
  }
  if (value !== null && typeof value !== "string") {
    throw new Model3DOperationError(`${op}.${key} must be a string or null.`);
  }
  return value;
}

function parseFigureOptions(args: Record<string, unknown>, op: string): FigureOptions {
  const options: FigureOptions = {};
  const body = args["body"];
  if (body !== undefined && body !== null) {
    if (!isFigureBody(body)) {
      throw new Model3DOperationError(
        `${op}.body is "${String(body)}"; expected one of ${FIGURE_BODIES.join(", ")}.`
      );
    }
    options.body = body;
  }
  const pose = args["pose"];
  if (pose !== undefined && pose !== null) {
    if (!isFigurePose(pose)) {
      throw new Model3DOperationError(
        `${op}.pose is "${String(pose)}"; expected one of ${FIGURE_POSES.join(", ")}.`
      );
    }
    options.pose = pose;
  }
  const height = optionalNumber(args, "height", op);
  if (height !== undefined) {
    options.height = height;
  }
  const color = args["color"];
  if (color !== undefined && color !== null) {
    if (typeof color !== "string" || color.trim() === "") {
      throw new Model3DOperationError(`${op}.color must be a CSS hex string like "#ff8800".`);
    }
    options.color = color;
  }
  const entityId = optionalText(args, "entityId", op);
  if (entityId !== undefined) {
    options.entityId = entityId;
  }
  const label = optionalText(args, "label", op);
  if (label !== undefined) {
    options.label = label;
  }
  return options;
}

function parseCameraOptions(args: Record<string, unknown>, op: string): CameraOptions {
  const options: CameraOptions = {};
  for (const key of ["fovDeg", "aspectRatio", "znear", "zfar"] as const) {
    const value = optionalNumber(args, key, op);
    if (value !== undefined) {
      options[key] = value;
    }
  }
  const lookAt = optionalVec3(args, "lookAt", op);
  if (lookAt) {
    options.lookAt = lookAt;
  }
  return options;
}

const FIGURE_FIELDS = ["body", "pose", "height", "color", "entityId", "label"] as const;
const CAMERA_FIELDS = ["fovDeg", "aspectRatio", "znear", "zfar", "lookAt"] as const;

/** Reject fields that belong to another kind, which would otherwise be dropped. */
function rejectFields(
  args: Record<string, unknown>,
  fields: readonly string[],
  message: (field: string) => string
): void {
  for (const field of fields) {
    if (args[field] !== undefined && args[field] !== null) {
      throw new Model3DOperationError(message(field));
    }
  }
}

/**
 * Read one operation out of caller-supplied JSON.
 *
 * Every argument is checked here rather than at the call site, because the
 * failure a model actually makes is a well-named operation with the wrong
 * arguments — an `add_object` with no kind, a `set_visibility` with no
 * `visible` — and silently defaulting those writes something nobody asked for.
 */
export function parseOperation(raw: unknown): Model3DOperation {
  if (!isRecord(raw)) {
    throw new Model3DOperationError("An operation must be an object.");
  }
  const op = typeof raw["op"] === "string" ? raw["op"].trim() : "";
  if (!(MODEL3D_OPERATIONS as readonly string[]).includes(op)) {
    throw new Model3DOperationError(
      `Unknown operation "${String(raw["op"])}"; expected one of ${MODEL3D_OPERATIONS.join(", ")}.`
    );
  }

  switch (op as Model3DOperation["op"]) {
    case "add_object": {
      const kind = raw["kind"];
      if (
        typeof kind !== "string" ||
        !(PRIMITIVE_KINDS as readonly string[]).includes(kind)
      ) {
        throw new Model3DOperationError(
          `add_object.kind is "${String(kind)}"; expected one of ${PRIMITIVE_KINDS.join(", ")}.`
        );
      }
      const name = raw["name"];
      if (name !== undefined && typeof name !== "string") {
        throw new Model3DOperationError("add_object.name must be a string.");
      }
      let parsed: Extract<Model3DOperation, { op: "add_object" }> = {
        op: "add_object",
        kind: kind as PrimitiveKind
      };
      if (kind === "figure") {
        parsed = { ...parsed, ...parseFigureOptions(raw, op) };
      } else {
        rejectFields(raw, FIGURE_FIELDS, (field) => `add_object.${field} applies to kind "figure" only.`);
      }
      if (kind === "camera") {
        parsed = { ...parsed, ...parseCameraOptions(raw, op) };
      } else {
        rejectFields(raw, CAMERA_FIELDS, (field) => `add_object.${field} applies to kind "camera" only.`);
      }
      if (typeof name === "string" && name.trim() !== "") {
        parsed.name = name;
      }
      const position = optionalVec3(raw, "position", op);
      if (position) {
        parsed.position = position;
      }
      return parsed;
    }
    case "delete_object":
      return { op: "delete_object", target: requireTarget(raw, op) };
    case "set_transform": {
      const parsed: Model3DOperation = {
        op: "set_transform",
        target: requireTarget(raw, op)
      };
      const position = optionalVec3(raw, "position", op);
      const rotation = optionalVec3(raw, "rotation", op);
      const scale = optionalVec3(raw, "scale", op);
      if (!position && !rotation && !scale) {
        throw new Model3DOperationError(
          "set_transform needs at least one of position, rotation or scale."
        );
      }
      if (position) parsed.position = position;
      if (rotation) parsed.rotation = rotation;
      if (scale) parsed.scale = scale;
      return parsed;
    }
    case "set_visibility": {
      const visible = raw["visible"];
      if (typeof visible !== "boolean") {
        throw new Model3DOperationError(
          "set_visibility.visible must be true or false."
        );
      }
      return { op: "set_visibility", target: requireTarget(raw, op), visible };
    }
    case "rename_object": {
      const name = raw["name"];
      if (typeof name !== "string" || name.trim() === "") {
        throw new Model3DOperationError(
          "rename_object.name must be a non-empty string."
        );
      }
      return { op: "rename_object", target: requireTarget(raw, op), name };
    }
    case "set_material_color": {
      const color = raw["color"];
      if (typeof color !== "string" || color.trim() === "") {
        throw new Model3DOperationError(
          'set_material_color.color must be a CSS hex string like "#ff8800".'
        );
      }
      return { op: "set_material_color", target: requireTarget(raw, op), color };
    }
    case "set_figure": {
      const options = parseFigureOptions(raw, op);
      if (Object.keys(options).length === 0) {
        throw new Model3DOperationError(
          `set_figure needs at least one of ${FIGURE_FIELDS.join(", ")}.`
        );
      }
      return { op: "set_figure", target: requireTarget(raw, op), ...options };
    }
    case "set_camera": {
      const options = parseCameraOptions(raw, op);
      const position = optionalVec3(raw, "position", op);
      if (Object.keys(options).length === 0 && !position) {
        throw new Model3DOperationError(
          `set_camera needs at least one of position, ${CAMERA_FIELDS.join(", ")}.`
        );
      }
      const parsed: Model3DOperation = {
        op: "set_camera",
        target: requireTarget(raw, op),
        ...options
      };
      if (position) {
        parsed.position = position;
      }
      return parsed;
    }
    case "select_object": {
      const target = raw["target"];
      if (
        target === undefined ||
        target === null ||
        (typeof target === "string" && target.trim() === "")
      ) {
        return { op: "select_object", target: null };
      }
      return { op: "select_object", target: requireTarget(raw, op) };
    }
  }
}

export interface OperationResult {
  op: Model3DOperation["op"];
  object: Model3DSceneObject | null;
}

/** Apply one operation, mutating the document. Throws {@link Model3DOperationError}. */
export function applyOperation(
  file: Model3DFile,
  operation: Model3DOperation
): OperationResult {
  const { json } = file;
  switch (operation.op) {
    case "add_object": {
      const { op, kind, name, position, ...rest } = operation;
      return {
        op,
        object: addObject(json, kind, name, {
          base64Encode,
          position,
          figure: rest,
          camera: rest
        })
      };
    }
    case "set_figure": {
      const { op, target, ...options } = operation;
      return { op, object: setFigure(json, target, options, base64Encode) };
    }
    case "set_camera": {
      const { op, target, ...options } = operation;
      return { op, object: setCamera(json, target, options) };
    }
    case "delete_object":
      return { op: operation.op, object: deleteObject(json, operation.target) };
    case "set_transform":
      return {
        op: operation.op,
        object: setTransform(json, operation.target, {
          position: operation.position,
          rotation: operation.rotation,
          scale: operation.scale
        })
      };
    case "set_visibility":
      return {
        op: operation.op,
        object: setVisibility(json, operation.target, operation.visible)
      };
    case "rename_object":
      return {
        op: operation.op,
        object: renameObject(json, operation.target, operation.name)
      };
    case "set_material_color":
      return {
        op: operation.op,
        object: setMaterialColor(json, operation.target, operation.color)
      };
    case "select_object":
      return {
        op: operation.op,
        object: selectObject(json, operation.target)
      };
    default: {
      const unknown = operation as { op?: unknown };
      throw new Model3DOperationError(
        `Unknown operation "${String(unknown.op)}".`
      );
    }
  }
}

/** Apply operations in order. The first failure stops the script and throws. */
export function applyOperations(
  file: Model3DFile,
  operations: readonly Model3DOperation[]
): OperationResult[] {
  return operations.map((operation) => applyOperation(file, operation));
}
