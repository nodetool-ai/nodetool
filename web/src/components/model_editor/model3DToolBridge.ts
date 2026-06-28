import type { PrimitiveKind } from "./objectFactory";

/**
 * Serializable description of a single object in the editor scene graph.
 * Transforms are returned in editor-friendly units: position/scale as world
 * units and rotation in **degrees** (matching the Properties panel).
 */
export interface Model3DSceneNode {
  uuid: string;
  name: string;
  /** Three.js object type, e.g. "Mesh", "Group", "DirectionalLight". */
  type: string;
  visible: boolean;
  position: [number, number, number];
  /** Euler rotation in degrees. */
  rotation: [number, number, number];
  scale: [number, number, number];
  /** Parent object uuid, or null when the object sits directly under the root. */
  parentUuid: string | null;
}

export interface Model3DTransformPatch {
  position?: [number, number, number];
  /** Euler rotation in degrees. */
  rotation?: [number, number, number];
  scale?: [number, number, number];
}

/**
 * Operations the live {@link Model3DEditor} exposes to the agent tooling layer.
 * Each mutator returns the affected node so the agent gets immediate feedback.
 * Objects are addressed by uuid or by (case-insensitive) name.
 */
export interface Model3DToolHandler {
  listScene: () => Model3DSceneNode[];
  getSelected: () => Model3DSceneNode | null;
  addPrimitive: (kind: PrimitiveKind, name?: string) => Model3DSceneNode;
  selectObject: (idOrName: string | null) => Model3DSceneNode | null;
  deleteObject: (idOrName: string) => Model3DSceneNode;
  setTransform: (
    idOrName: string,
    patch: Model3DTransformPatch
  ) => Model3DSceneNode;
  setVisibility: (idOrName: string, visible: boolean) => Model3DSceneNode;
  renameObject: (idOrName: string, name: string) => Model3DSceneNode;
  setMaterialColor: (idOrName: string, color: string) => Model3DSceneNode;
  frameScene: () => void;
  /**
   * Render the current viewport and return it as a PNG `data:` URL, so a
   * vision-capable agent can visually inspect the scene.
   */
  captureView: () => string;
}

let handler: Model3DToolHandler | null = null;

/**
 * Register (or clear, with null) the handler for the currently-open editor.
 * The editor calls this on mount and clears it on unmount so the ui_3d_* tools
 * always operate on the live scene — or fail cleanly when no editor is open.
 */
export function setModel3DToolHandler(next: Model3DToolHandler | null): void {
  handler = next;
}

export function getModel3DToolHandler(): Model3DToolHandler {
  if (!handler) {
    throw new Error(
      "No 3D model editor is open. Open a .glb/.gltf asset in the 3D editor to use 3D tools."
    );
  }
  return handler;
}
