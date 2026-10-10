import { useEffect, type MutableRefObject } from "react";
import * as THREE from "three";

import {
  describeGeometry,
  describeLight,
  describeMaterial,
  geometryPatchCommand,
  lightPatchCommand,
  materialPatchCommand,
  materialsOf
} from "./agentEdits";
import {
  captureTransform,
  reparentObject,
  transformCommand
} from "./editorCommands";
import type { EditorCommand, EditorHistory } from "./editorHistory";
import type { PrimitiveKind } from "./objectFactory";
import { isLightTarget } from "./sceneTree";
import type { CameraRequestInput } from "./ViewportHelpers";
import {
  setModel3DToolHandler,
  type Model3DHistoryResult,
  type Model3DObjectDetail,
  type Model3DSceneNode,
  type Model3DToolHandler
} from "./model3DToolBridge";

export interface Model3DAgentToolsOptions {
  /** The tools act on this editor only while it is the visible tab. */
  active: boolean;
  root: THREE.Object3D;
  history: EditorHistory;
  selectedUuidRef: MutableRefObject<string | null>;
  setSelectedUuid: (uuid: string | null) => void;
  pushCommand: (command: EditorCommand) => void;
  /**
   * Runs before every tool call that changes the scene. The editor ends its
   * animation preview here, so the preview's rest pose cannot overwrite the edit.
   */
  beforeEdit: () => void;
  /** Re-render after a history step that pushed no command. */
  refresh: () => void;
  addPrimitive: (kind: PrimitiveKind, name?: string) => THREE.Object3D;
  deleteObject: (object: THREE.Object3D) => void;
  duplicateObject: (object: THREE.Object3D) => THREE.Object3D | null;
  setVisible: (object: THREE.Object3D, visible: boolean) => void;
  renameObject: (object: THREE.Object3D, name: string) => void;
  requestCamera: (request: CameraRequestInput) => void;
  captureView: () => string;
}

const toDegrees = THREE.MathUtils.radToDeg;
const toRadians = THREE.MathUtils.degToRad;

/** Find an object by uuid, then by exact name, then by case-insensitive name. */
export const findSceneObject = (
  root: THREE.Object3D,
  idOrName: string
): THREE.Object3D | null => {
  const byUuid = root.getObjectByProperty("uuid", idOrName);
  if (byUuid) {
    return byUuid;
  }
  const byName = root.getObjectByName(idOrName);
  if (byName) {
    return byName;
  }
  const lower = idOrName.trim().toLowerCase();
  let match: THREE.Object3D | null = null;
  root.traverse((child) => {
    if (!match && child !== root && child.name.toLowerCase() === lower) {
      match = child;
    }
  });
  return match;
};

export const toSceneNode = (
  object: THREE.Object3D,
  root: THREE.Object3D
): Model3DSceneNode => ({
  uuid: object.uuid,
  name: object.name || object.type,
  type: object.type,
  visible: object.visible,
  position: [object.position.x, object.position.y, object.position.z],
  rotation: [
    toDegrees(object.rotation.x),
    toDegrees(object.rotation.y),
    toDegrees(object.rotation.z)
  ],
  scale: [object.scale.x, object.scale.y, object.scale.z],
  parentUuid: object.parent && object.parent !== root ? object.parent.uuid : null
});

export const toObjectDetail = (
  object: THREE.Object3D,
  root: THREE.Object3D
): Model3DObjectDetail => {
  const detail: Model3DObjectDetail = {
    ...toSceneNode(object, root),
    children: object.children
      .filter((child) => !isLightTarget(child))
      .map((child) => child.name || child.uuid)
  };
  if (object instanceof THREE.Mesh) {
    detail.materials = materialsOf(object).map(describeMaterial);
    const geometry = describeGeometry(object);
    if (geometry) {
      detail.geometry = geometry;
    }
  }
  if (object instanceof THREE.Light) {
    detail.light = describeLight(object);
  }
  return detail;
};

/**
 * Register the `ui_3d_*` tool handler for this editor while it is the active
 * tab. Agent edits go through the same history as the user's, so they can be
 * undone with Ctrl+Z.
 */
export const useModel3DAgentTools = (options: Model3DAgentToolsOptions): void => {
  const {
    active,
    root,
    history,
    selectedUuidRef,
    setSelectedUuid,
    pushCommand,
    beforeEdit,
    refresh,
    addPrimitive,
    deleteObject,
    duplicateObject,
    setVisible,
    renameObject,
    requestCamera,
    captureView
  } = options;

  useEffect(() => {
    if (!active) {
      return;
    }
    const node = (object: THREE.Object3D) => toSceneNode(object, root);
    const detail = (object: THREE.Object3D) => toObjectDetail(object, root);

    const requireObject = (idOrName: string): THREE.Object3D => {
      const object = findSceneObject(root, idOrName);
      if (!object || object === root) {
        throw new Error(
          `No object named or with uuid "${idOrName}" in the scene. Call ui_3d_list_scene for the names.`
        );
      }
      return object;
    };

    const requireMesh = (idOrName: string): THREE.Mesh => {
      const object = requireObject(idOrName);
      if (!(object instanceof THREE.Mesh)) {
        throw new Error(`${object.name || idOrName} is a ${object.type}, not a mesh, so it has no material or geometry.`);
      }
      return object;
    };

    const historyStep = (step: () => EditorCommand | null): Model3DHistoryResult => {
      beforeEdit();
      const command = step();
      if (command) {
        refresh();
      }
      return {
        applied: command?.label ?? null,
        nextUndo: history.undoLabel(),
        nextRedo: history.redoLabel()
      };
    };

    const handler: Model3DToolHandler = {
      listScene: () => {
        const nodes: Model3DSceneNode[] = [];
        root.traverse((child) => {
          if (child !== root && !isLightTarget(child)) {
            nodes.push(node(child));
          }
        });
        return nodes;
      },
      getSelected: () => {
        const id = selectedUuidRef.current;
        const object = id ? root.getObjectByProperty("uuid", id) : undefined;
        return object ? node(object) : null;
      },
      getObject: (idOrName) => detail(requireObject(idOrName)),
      addPrimitive: (kind, name) => {
        beforeEdit();
        return node(addPrimitive(kind, name));
      },
      selectObject: (idOrName) => {
        if (!idOrName) {
          setSelectedUuid(null);
          return null;
        }
        const object = requireObject(idOrName);
        setSelectedUuid(object.uuid);
        return node(object);
      },
      deleteObject: (idOrName) => {
        beforeEdit();
        const object = requireObject(idOrName);
        const deleted = node(object);
        deleteObject(object);
        return deleted;
      },
      duplicateObject: (idOrName) => {
        beforeEdit();
        const copy = duplicateObject(requireObject(idOrName));
        if (!copy) {
          throw new Error(`${idOrName} cannot be duplicated.`);
        }
        return node(copy);
      },
      setParent: (idOrName, parentIdOrName) => {
        beforeEdit();
        const object = requireObject(idOrName);
        const parent = parentIdOrName ? requireObject(parentIdOrName) : root;
        if (object.parent === parent) {
          return node(object);
        }
        const command = reparentObject(
          `Parent ${object.name || object.type}`,
          object,
          parent,
          parent.children.length
        );
        if (!command) {
          throw new Error(
            `${object.name} cannot be placed under ${parent.name}, because ${parent.name} is ${object.name} or one of its children.`
          );
        }
        pushCommand(command);
        return node(object);
      },
      setTransform: (idOrName, patch) => {
        beforeEdit();
        const object = requireObject(idOrName);
        const before = captureTransform(object);
        if (patch.position) {
          object.position.fromArray(patch.position);
        }
        if (patch.rotation) {
          object.rotation.set(
            toRadians(patch.rotation[0]),
            toRadians(patch.rotation[1]),
            toRadians(patch.rotation[2])
          );
        }
        if (patch.scale) {
          object.scale.fromArray(patch.scale);
        }
        object.updateMatrixWorld();
        pushCommand(
          transformCommand(
            `Transform ${object.name || object.type}`,
            object,
            before,
            captureTransform(object)
          )
        );
        return node(object);
      },
      setVisibility: (idOrName, visible) => {
        beforeEdit();
        const object = requireObject(idOrName);
        setVisible(object, visible);
        return node(object);
      },
      renameObject: (idOrName, name) => {
        beforeEdit();
        const object = requireObject(idOrName);
        const trimmed = name.trim();
        if (!trimmed) {
          throw new Error("Object name cannot be empty.");
        }
        renameObject(object, trimmed);
        return node(object);
      },
      setMaterialColor: (idOrName, color) => {
        beforeEdit();
        const mesh = requireMesh(idOrName);
        pushCommand(materialPatchCommand(mesh, { color }));
        return node(mesh);
      },
      setMaterial: (idOrName, patch) => {
        beforeEdit();
        const mesh = requireMesh(idOrName);
        pushCommand(materialPatchCommand(mesh, patch));
        return detail(mesh);
      },
      setLight: (idOrName, patch) => {
        beforeEdit();
        const object = requireObject(idOrName);
        if (!(object instanceof THREE.Light)) {
          throw new Error(`${object.name || idOrName} is a ${object.type}, not a light.`);
        }
        pushCommand(lightPatchCommand(object, patch));
        return detail(object);
      },
      setGeometry: (idOrName, params) => {
        beforeEdit();
        const mesh = requireMesh(idOrName);
        pushCommand(geometryPatchCommand(mesh, params));
        return detail(mesh);
      },
      undo: () => historyStep(() => history.undo()),
      redo: () => historyStep(() => history.redo()),
      frameScene: () => {
        requestCamera({ kind: "frameAll" });
      },
      captureView
    };

    return setModel3DToolHandler(handler);
  }, [
    active,
    root,
    history,
    selectedUuidRef,
    setSelectedUuid,
    pushCommand,
    beforeEdit,
    refresh,
    addPrimitive,
    deleteObject,
    duplicateObject,
    setVisible,
    renameObject,
    requestCamera,
    captureView
  ]);
};
