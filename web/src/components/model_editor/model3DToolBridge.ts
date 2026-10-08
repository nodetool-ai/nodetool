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

export interface Model3DMaterialInfo {
  /** Index into the mesh's material list. */
  slot: number;
  name: string;
  /** Three.js material type, e.g. "MeshStandardMaterial". */
  type: string;
  color?: string;
  emissive?: string;
  emissiveIntensity?: number;
  metalness?: number;
  roughness?: number;
  opacity: number;
  transparent: boolean;
}

export interface Model3DLightInfo {
  type: string;
  color: string;
  intensity: number;
  /** Point and spot lights: range, 0 for unlimited. */
  distance?: number;
  decay?: number;
  /** Spot lights: cone half-angle in degrees. */
  angle?: number;
  penumbra?: number;
}

export interface Model3DGeometryInfo {
  /** Three.js geometry type, e.g. "BoxGeometry". */
  type: string;
  /** Construction parameters. Angles are in degrees. */
  params: Record<string, number>;
}

/** One object with its material, light and geometry settings. */
export interface Model3DObjectDetail extends Model3DSceneNode {
  children: string[];
  materials?: Model3DMaterialInfo[];
  light?: Model3DLightInfo;
  geometry?: Model3DGeometryInfo;
}

export interface Model3DMaterialPatch {
  /** Material slot to change. Every slot when left out. */
  slot?: number;
  color?: string;
  emissive?: string;
  emissiveIntensity?: number;
  metalness?: number;
  roughness?: number;
  opacity?: number;
}

export interface Model3DLightPatch {
  color?: string;
  intensity?: number;
  distance?: number;
  decay?: number;
  /** Cone half-angle in degrees. */
  angle?: number;
  penumbra?: number;
}

/** What an undo or redo did, or null fields when there was nothing to do. */
export interface Model3DHistoryResult {
  /** Label of the step that was undone or redone, or null when none was. */
  applied: string | null;
  nextUndo: string | null;
  nextRedo: string | null;
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
  getObject: (idOrName: string) => Model3DObjectDetail;
  duplicateObject: (idOrName: string) => Model3DSceneNode;
  /** Move under `parent`, or to the scene root with null. Keeps the world transform. */
  setParent: (idOrName: string, parent: string | null) => Model3DSceneNode;
  setMaterial: (idOrName: string, patch: Model3DMaterialPatch) => Model3DObjectDetail;
  setLight: (idOrName: string, patch: Model3DLightPatch) => Model3DObjectDetail;
  /** Rebuild a primitive's geometry. Angles are in degrees. */
  setGeometry: (idOrName: string, params: Record<string, number>) => Model3DObjectDetail;
  undo: () => Model3DHistoryResult;
  redo: () => Model3DHistoryResult;
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
 * The editor calls this while it is the active tab and calls the returned
 * disposer when it stops being active or unmounts, so the ui_3d_* tools always
 * operate on the live scene — or fail cleanly when no editor is open. The
 * disposer clears the handler only if it is still `next`, so one editor
 * leaving never unregisters another that registered after it.
 */
export function setModel3DToolHandler(
  next: Model3DToolHandler | null
): () => void {
  handler = next;
  return () => {
    if (handler === next) {
      handler = null;
    }
  };
}

export function getModel3DToolHandler(): Model3DToolHandler {
  if (!handler) {
    throw new Error(
      "No 3D model editor is open. Open a .glb/.gltf asset in the 3D editor to use 3D tools."
    );
  }
  return handler;
}
