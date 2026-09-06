/**
 * What a `model3d` clip's Blender bake depends on, and how its camera reaches
 * the Blender job (design §D6).
 *
 * Two things live here, and neither of them renders: the hash that decides
 * whether a stored bake is still the clip's picture, and the mapping from the
 * clip's camera onto the job DTO. The sample list the bake is rendered from is
 * `computeModel3DBakeSamples` in `render/`, because it samples the clip's
 * animation curves and those are resolved by the scene model.
 */

import { stableSerialize } from "./stableSerialize.js";
import type {
  ClipModel3DCamera,
  ClipModel3DStyle,
  TimelineClip
} from "./types.js";

/** The sequence settings a bake is rendered at. */
export interface Model3DBakeSequence {
  fps: number;
  width: number;
  height: number;
}

/** Render quality the style does not carry; the bake request picks it. */
export interface Model3DBakeRenderSettings {
  engine: "eevee" | "cycles";
  samples: number;
  denoise: boolean;
  /** Render scale in percent of the sequence resolution. */
  resolutionPercentage: number;
}

/**
 * One frame's camera as the Blender job takes it: `CameraParams` from
 * `@nodetool-ai/blender-nodes`, plus the two fields `ClipModel3DCamera`
 * carries that the DTO did not have. Declared here rather than imported
 * because this package is pure TypeScript and knows nothing about a runner;
 * the two shapes are checked against each other where they meet.
 */
export interface Model3DBakeCameraParams {
  camera_mode: "auto" | "scene" | "orbit";
  azimuth: number;
  elevation: number;
  fov: number;
  zoom: number;
  lighting: "studio" | "soft" | "flat";
  light_intensity: number;
  background_color: string;
  transparent: boolean;
  engine: "eevee" | "cycles";
  samples: number;
  denoise: boolean;
  resolution_percentage: number;
  /** `scene` mode: the glTF camera to render through. */
  scene_camera_name?: string;
  /** Look-at offset from the bounding-sphere center, world units. */
  target_offset?: [number, number, number];
}

/**
 * What Blender clears to when the style is transparent. The value is never
 * drawn — `film_transparent` is on — but the DTO has no optional colour, and
 * a round trip through the mapping has to come back with the same string.
 */
const TRANSPARENT_BACKGROUND_COLOR = "#000000";

/**
 * The clip's camera as one frame of the bake job. `orbit` and `scene` are the
 * only two modes a clip has; the job's `auto` is not reachable from a clip,
 * which is what makes the reverse mapping total.
 */
export function model3dBakeCameraParams(
  camera: ClipModel3DCamera,
  style: ClipModel3DStyle,
  render: Model3DBakeRenderSettings
): Model3DBakeCameraParams {
  const params: Model3DBakeCameraParams = {
    camera_mode: camera.mode,
    azimuth: camera.azimuthDeg,
    elevation: camera.elevationDeg,
    fov: camera.fovDeg,
    zoom: camera.zoom,
    lighting: style.lighting,
    light_intensity: style.lightIntensity,
    background_color: style.background.transparent
      ? TRANSPARENT_BACKGROUND_COLOR
      : style.background.color,
    transparent: style.background.transparent,
    engine: render.engine,
    samples: render.samples,
    denoise: render.denoise,
    resolution_percentage: render.resolutionPercentage
  };
  if (camera.sceneCameraName !== undefined) {
    params.scene_camera_name = camera.sceneCameraName;
  }
  if (camera.targetOffset !== undefined) {
    params.target_offset = [...camera.targetOffset];
  }
  return params;
}

/**
 * The camera a bake frame was rendered with, back in the clip's vocabulary.
 * The inverse of {@link model3dBakeCameraParams} over everything a clip owns;
 * the lighting, background and engine fields belong to the style and the
 * request, not to the camera, so they are not read back.
 */
export function clipModel3DCameraFromBakeParams(
  params: Model3DBakeCameraParams
): ClipModel3DCamera {
  const camera: ClipModel3DCamera = {
    mode: params.camera_mode === "scene" ? "scene" : "orbit",
    azimuthDeg: params.azimuth,
    elevationDeg: params.elevation,
    fovDeg: params.fov,
    zoom: params.zoom
  };
  if (params.scene_camera_name !== undefined) {
    camera.sceneCameraName = params.scene_camera_name;
  }
  if (params.target_offset !== undefined) {
    camera.targetOffset = [...params.target_offset];
  }
  return camera;
}

/**
 * FNV-1a over the payload, twice with different offsets, as 16 hex digits.
 *
 * Not a cryptographic digest, and deliberately not one: the browser preview,
 * the browser export and the server validator all compare this value, they
 * compare it synchronously once per layer per frame, and `node:crypto` does
 * not exist in a bundle while Web Crypto only digests asynchronously. What
 * the value has to be is identical on every host for the same input, which a
 * pure-arithmetic hash over a canonically ordered payload is.
 */
function digest(payload: string): string {
  const hash = (seed: number): number => {
    let acc = seed >>> 0;
    for (let i = 0; i < payload.length; i += 1) {
      const code = payload.charCodeAt(i);
      acc = Math.imul(acc ^ (code & 0xff), 0x01000193) >>> 0;
      acc = Math.imul(acc ^ (code >>> 8), 0x01000193) >>> 0;
    }
    return acc >>> 0;
  };
  return (
    hash(0x811c9dc5).toString(16).padStart(8, "0") +
    hash(0x9e3779b9).toString(16).padStart(8, "0")
  );
}

const MODEL3D_BAKE_HASH_VERSION_PREFIX = "model3d-bake-v1:";

/**
 * The hash a `model3d` clip's bake is stored under, and checked against.
 *
 * It names every input the baked picture depends on (§D6): the style without
 * `bake` itself, the glTF asset, the clip's animations (the camera curves and
 * the `orbit` preset among them), the trim window, the duration, the speed,
 * the time remap, and the sequence's fps and size. A change to any of them
 * makes the bake stale and the live 3D layer draws again.
 *
 * Everything else about the clip is deliberately absent: start, track,
 * transform, opacity, effects, mask and matte apply to the baked layer the
 * way they apply to any video clip, so a change to one of them does not need
 * a re-render.
 */
export function computeModel3DBakeHash(
  clip: TimelineClip,
  sequence: Model3DBakeSequence
): string {
  const { bake: _bake, ...style } = clip.model3dStyle ?? {};
  const payload = `${MODEL3D_BAKE_HASH_VERSION_PREFIX}${stableSerialize({
    assetId: clip.currentAssetId,
    style,
    animations: clip.animations,
    inPointMs: clip.inPointMs,
    outPointMs: clip.outPointMs,
    durationMs: clip.durationMs,
    speedMultiplier: clip.speedMultiplier,
    speedBaked: clip.speedBaked,
    timeRemap: clip.timeRemap,
    fps: sequence.fps,
    width: sequence.width,
    height: sequence.height
  })}`;
  return digest(payload);
}
