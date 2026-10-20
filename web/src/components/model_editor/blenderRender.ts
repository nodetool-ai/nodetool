/**
 * The pure half of "Render with Blender": the render settings the panel
 * offers, their bounds, the node data the `nodetool.blender.RenderImage` job
 * runs with, and the camera that carries the editor's view into Blender.
 *
 * The bounds match the RenderImage node props, so a value the panel accepts
 * is one the node accepts.
 */
import * as THREE from "three";

export type BlenderEngine = "eevee" | "cycles";
export type BlenderLighting = "studio" | "soft" | "flat";

/**
 * Which camera Blender renders through. `view` is the editor's viewport
 * camera, written into the exported scene as its first camera. `scene` is
 * the first camera the scene already has. `orbit` frames the scene from the
 * azimuth, elevation, field of view and zoom settings.
 */
export type BlenderCameraMode = "view" | "scene" | "orbit";

export interface BlenderRenderSettings {
  engine: BlenderEngine;
  samples: number;
  /** Cycles only. EEVEE ignores it. */
  denoise: boolean;
  width: number;
  height: number;
  /** Render scale in percent of width x height. */
  resolutionPercentage: number;
  camera: BlenderCameraMode;
  azimuth: number;
  elevation: number;
  fov: number;
  zoom: number;
  /** Used only when the scene has no lights of its own. */
  lighting: BlenderLighting;
  lightIntensity: number;
  backgroundColor: string;
  transparent: boolean;
  /** Wall clock for the render, in seconds. */
  timeout: number;
}

export const BLENDER_ENGINES: readonly BlenderEngine[] = ["eevee", "cycles"];
export const BLENDER_LIGHTING: readonly BlenderLighting[] = ["studio", "soft", "flat"];
export const BLENDER_CAMERA_MODES: readonly BlenderCameraMode[] = ["view", "scene", "orbit"];

export const DEFAULT_BLENDER_RENDER_SETTINGS: BlenderRenderSettings = {
  engine: "eevee",
  samples: 64,
  denoise: true,
  width: 1920,
  height: 1080,
  resolutionPercentage: 100,
  camera: "view",
  azimuth: 45,
  elevation: 25,
  fov: 35,
  zoom: 1,
  lighting: "studio",
  lightIntensity: 1,
  // The render's backdrop, drawn into the picture rather than the editor's
  // chrome, so it is a document value (the RenderImage node's default) and
  // not a palette token.
  // eslint-disable-next-line design-tokens/color-tokens
  backgroundColor: "#808080",
  transparent: false,
  timeout: 600
};

/** Settings that hold a number. */
export type BlenderNumberKey = {
  [K in keyof BlenderRenderSettings]: BlenderRenderSettings[K] extends number ? K : never;
}[keyof BlenderRenderSettings];

/** Bounds of each numeric setting, the RenderImage node's own. */
export const BLENDER_NUMBER_BOUNDS: Record<BlenderNumberKey, { min: number; max: number; integer?: boolean }> = {
  samples: { min: 1, max: 4096, integer: true },
  width: { min: 16, max: 4096, integer: true },
  height: { min: 16, max: 4096, integer: true },
  resolutionPercentage: { min: 1, max: 100, integer: true },
  azimuth: { min: -360, max: 360 },
  elevation: { min: -89, max: 89 },
  fov: { min: 5, max: 120 },
  zoom: { min: 0.1, max: 10 },
  lightIntensity: { min: 0, max: 10 },
  timeout: { min: 1, max: 3600, integer: true }
};

/** Clamp a numeric setting into its bounds, or its default when not finite. */
export function clampSetting(key: BlenderNumberKey, value: number): number {
  const { min, max, integer } = BLENDER_NUMBER_BOUNDS[key];
  if (!Number.isFinite(value)) {
    return DEFAULT_BLENDER_RENDER_SETTINGS[key];
  }
  const clamped = Math.min(max, Math.max(min, value));
  return integer ? Math.round(clamped) : clamped;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const oneOf = <T extends string>(value: unknown, values: readonly T[], fallback: T): T =>
  values.find((candidate) => candidate === value) ?? fallback;

/**
 * Settings from anything, such as a stored JSON blob: known keys are kept
 * when valid and clamped into bounds, everything else falls back to the
 * defaults.
 */
export function sanitizeBlenderSettings(raw: unknown): BlenderRenderSettings {
  const d = DEFAULT_BLENDER_RENDER_SETTINGS;
  const input = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const num = (key: BlenderNumberKey): number => {
    const value = input[key];
    return typeof value === "number" ? clampSetting(key, value) : d[key];
  };
  const color = input.backgroundColor;
  return {
    engine: oneOf(input.engine, BLENDER_ENGINES, d.engine),
    samples: num("samples"),
    denoise: typeof input.denoise === "boolean" ? input.denoise : d.denoise,
    width: num("width"),
    height: num("height"),
    resolutionPercentage: num("resolutionPercentage"),
    camera: oneOf(input.camera, BLENDER_CAMERA_MODES, d.camera),
    azimuth: num("azimuth"),
    elevation: num("elevation"),
    fov: num("fov"),
    zoom: num("zoom"),
    lighting: oneOf(input.lighting, BLENDER_LIGHTING, d.lighting),
    lightIntensity: num("lightIntensity"),
    backgroundColor: typeof color === "string" && HEX_COLOR.test(color) ? color : d.backgroundColor,
    transparent: typeof input.transparent === "boolean" ? input.transparent : d.transparent,
    timeout: num("timeout")
  };
}

/** Height that gives `width` the viewport's aspect ratio, inside the bounds. */
export function heightForAspect(width: number, aspect: number): number {
  if (!Number.isFinite(aspect) || aspect <= 0) {
    return clampSetting("height", width);
  }
  return clampSetting("height", width / aspect);
}

export const BLENDER_RENDER_NODE_TYPE = "nodetool.blender.RenderImage";

/**
 * Property values of the RenderImage node for these settings and the stored
 * scene. The editor's view travels as the scene's first camera, so `view`
 * renders through the node's `scene` mode.
 */
export function blenderRenderNodeData(
  settings: BlenderRenderSettings,
  modelAssetId: string
): Record<string, unknown> {
  return {
    model: { type: "model_3d", uri: `asset://${modelAssetId}`, asset_id: modelAssetId },
    camera_mode: settings.camera === "view" ? "scene" : settings.camera,
    width: settings.width,
    height: settings.height,
    azimuth: settings.azimuth,
    elevation: settings.elevation,
    fov: settings.fov,
    zoom: settings.zoom,
    lighting: settings.lighting,
    light_intensity: settings.lightIntensity,
    background_color: settings.backgroundColor,
    transparent: settings.transparent,
    engine: settings.engine,
    samples: settings.samples,
    denoise: settings.denoise,
    resolution_percentage: settings.resolutionPercentage,
    timeout: settings.timeout
  };
}

export const VIEW_CAMERA_NAME = "NodeTool View";

/**
 * A copy of the viewport camera placed in `root`'s space, for export as the
 * scene's first camera. Its aspect is the output's, so Blender frames the
 * render with the view's vertical field of view.
 */
export function makeViewCamera(
  viewCamera: THREE.Camera,
  root: THREE.Object3D,
  aspect: number
): THREE.PerspectiveCamera {
  if (!(viewCamera instanceof THREE.PerspectiveCamera)) {
    throw new Error("The viewport camera is not a perspective camera. Use the orbit camera instead.");
  }
  const camera = new THREE.PerspectiveCamera(viewCamera.fov, aspect, viewCamera.near, viewCamera.far);
  camera.name = VIEW_CAMERA_NAME;
  viewCamera.updateMatrixWorld();
  root.updateMatrixWorld();
  const local = root.matrixWorld.clone().invert().multiply(viewCamera.matrixWorld);
  local.decompose(camera.position, camera.quaternion, camera.scale);
  camera.updateMatrixWorld();
  return camera;
}

/** Decode base64 into bytes. */
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Where the rendered image is in the node's output: an asset the server
 * already stored, inline bytes, or a URL to fetch. Null when the output
 * carries no image.
 */
export type RenderedImage =
  | { kind: "asset"; assetId: string }
  | { kind: "bytes"; bytes: Uint8Array }
  | { kind: "url"; url: string };

export function renderedImageOf(output: unknown): RenderedImage | null {
  if (output === null || typeof output !== "object") {
    return null;
  }
  const image = (output as Record<string, unknown>).image;
  if (image === null || typeof image !== "object") {
    return null;
  }
  const ref = image as Record<string, unknown>;
  if (typeof ref.asset_id === "string" && ref.asset_id.length > 0) {
    return { kind: "asset", assetId: ref.asset_id };
  }
  const data = ref.data;
  if (typeof data === "string" && data.length > 0) {
    return { kind: "bytes", bytes: base64ToBytes(data) };
  }
  if (data instanceof Uint8Array && data.length > 0) {
    return { kind: "bytes", bytes: data };
  }
  if (Array.isArray(data) && data.length > 0) {
    return { kind: "bytes", bytes: Uint8Array.from(data as number[]) };
  }
  if (typeof ref.uri === "string" && ref.uri.length > 0) {
    const dataUrl = /^data:[^;,]*;base64,(.*)$/.exec(ref.uri);
    if (dataUrl) {
      return { kind: "bytes", bytes: base64ToBytes(dataUrl[1]) };
    }
    const asset = /^asset:\/\/([^./]+)/.exec(ref.uri);
    if (asset) {
      return { kind: "asset", assetId: asset[1] };
    }
    return { kind: "url", url: ref.uri };
  }
  return null;
}
