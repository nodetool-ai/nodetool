import * as THREE from "three";

import type { EditorCommand } from "./editorHistory";
import { disposeObject } from "./sceneTree";

/** A local transform, copied so later edits to the object cannot change it. */
export interface TransformSnapshot {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
}

export const captureTransform = (object: THREE.Object3D): TransformSnapshot => ({
  position: object.position.clone(),
  quaternion: object.quaternion.clone(),
  scale: object.scale.clone()
});

export const applyTransform = (
  object: THREE.Object3D,
  snapshot: TransformSnapshot
): void => {
  object.position.copy(snapshot.position);
  object.quaternion.copy(snapshot.quaternion);
  object.scale.copy(snapshot.scale);
  object.updateMatrixWorld(true);
};

export const transformsEqual = (
  a: TransformSnapshot,
  b: TransformSnapshot
): boolean =>
  a.position.equals(b.position) &&
  a.quaternion.equals(b.quaternion) &&
  a.scale.equals(b.scale);

export const transformCommand = (
  label: string,
  object: THREE.Object3D,
  before: TransformSnapshot,
  after: TransformSnapshot,
  mergeKey?: string
): EditorCommand => ({
  label,
  mergeKey,
  undo: () => applyTransform(object, before),
  redo: () => applyTransform(object, after)
});

/**
 * One value change, applied through `set`. `release` frees a value the scene
 * no longer holds once the command is dropped, such as a replaced geometry.
 */
export const setValueCommand = <T>(
  label: string,
  set: (value: T) => void,
  before: T,
  after: T,
  mergeKey?: string,
  release?: (value: T) => void
): EditorCommand => ({
  label,
  mergeKey,
  undo: () => set(before),
  redo: () => set(after),
  dispose: release ? (undone) => release(undone ? after : before) : undefined
});

/** Insert `child` into `parent` at `index` in the child list. */
export const insertChildAt = (
  parent: THREE.Object3D,
  child: THREE.Object3D,
  index: number
): void => {
  parent.add(child);
  const children = parent.children;
  const current = children.indexOf(child);
  const target = Math.max(0, Math.min(index, children.length - 1));
  if (current !== target) {
    children.splice(current, 1);
    children.splice(target, 0, child);
  }
};

/** Records adding `object`, which must already be a child of `parent`. */
export const addObjectCommand = (
  label: string,
  object: THREE.Object3D,
  parent: THREE.Object3D
): EditorCommand => {
  const index = parent.children.indexOf(object);
  return {
    label,
    undo: () => {
      parent.remove(object);
    },
    redo: () => {
      insertChildAt(parent, object, index);
    },
    // Undone means the object is detached and nothing can bring it back.
    dispose: (undone) => {
      if (undone) {
        disposeObject(object);
      }
    }
  };
};

/**
 * Removes `object` from its parent and returns the command that restores it.
 * The object keeps its GPU resources until the command is dropped.
 */
export const removeObject = (
  label: string,
  object: THREE.Object3D
): EditorCommand | null => {
  const parent = object.parent;
  if (!parent) {
    return null;
  }
  const index = parent.children.indexOf(object);
  parent.remove(object);
  return {
    label,
    undo: () => {
      insertChildAt(parent, object, index);
    },
    redo: () => {
      parent.remove(object);
    },
    dispose: (undone) => {
      if (!undone) {
        disposeObject(object);
      }
    }
  };
};

/**
 * Moves `object` under `nextParent` at `index`, keeping its world transform,
 * and returns the command that reverses it. Returns null when the move would
 * put an object inside itself.
 */
export const reparentObject = (
  label: string,
  object: THREE.Object3D,
  nextParent: THREE.Object3D,
  index: number
): EditorCommand | null => {
  const previousParent = object.parent;
  if (!previousParent || object === nextParent) {
    return null;
  }
  let ancestor: THREE.Object3D | null = nextParent;
  while (ancestor) {
    if (ancestor === object) {
      return null;
    }
    ancestor = ancestor.parent;
  }
  const previousIndex = previousParent.children.indexOf(object);
  const before = captureTransform(object);
  nextParent.attach(object);
  insertChildAt(nextParent, object, index);
  const after = captureTransform(object);
  return {
    label,
    undo: () => {
      insertChildAt(previousParent, object, previousIndex);
      applyTransform(object, before);
    },
    redo: () => {
      insertChildAt(nextParent, object, index);
      applyTransform(object, after);
    }
  };
};

export interface ValueEdit<T> {
  label: string;
  /** Edits sharing a key within the merge window undo as one step. */
  mergeKey?: string;
  get: () => T;
  set: (value: T) => void;
  value: T;
  equals?: (a: T, b: T) => boolean;
  /** Frees a value the scene no longer holds, see {@link setValueCommand}. */
  release?: (value: T) => void;
}

/** Apply a value change and record it for undo. */
export type RecordEdit = <T>(edit: ValueEdit<T>) => void;
