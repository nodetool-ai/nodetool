/**
 * The pure half of "Render with AI": which pass of the viewport becomes the
 * source image, the depth range that pass is drawn with, and the instruction
 * that tells an image-edit model what it is looking at.
 */
import * as THREE from "three";

/**
 * The viewport image sent to the model. `shaded` is the editor's own render.
 * `depth` and `normal` drop materials and lighting, so the model takes only
 * the layout and shape from the scene and invents every surface.
 */
export type CapturePass = "shaded" | "depth" | "normal";

export const CAPTURE_PASSES: { id: CapturePass; label: string; hint: string }[] = [
  { id: "shaded", label: "Shaded", hint: "The viewport as you see it, with its colors and lights" },
  { id: "depth", label: "Depth", hint: "Distance from the camera only, so the model invents every surface" },
  { id: "normal", label: "Normals", hint: "Surface direction only, so the model keeps shapes and invents materials" }
];

/**
 * Near and far planes that wrap `box` as seen from `camera`, so a depth pass
 * spends its whole range on the scene instead of on the empty space the
 * editor camera's 0.1–1000 range covers. Null when the box is empty or lies
 * entirely behind the camera.
 */
export function depthRange(
  box: THREE.Box3,
  camera: THREE.Camera
): { near: number; far: number } | null {
  if (box.isEmpty()) {
    return null;
  }
  camera.updateMatrixWorld();
  const view = camera.matrixWorldInverse;
  let min = Infinity;
  let max = -Infinity;
  const corner = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    corner
      .set(
        i & 1 ? box.max.x : box.min.x,
        i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z
      )
      .applyMatrix4(view);
    // The camera looks down its own -Z, so distance in front is -z.
    const distance = -corner.z;
    min = Math.min(min, distance);
    max = Math.max(max, distance);
  }
  if (max <= 0) {
    return null;
  }
  const span = Math.max(max - min, 1e-3);
  return {
    near: Math.max(min - span * 0.02, 1e-3),
    far: max + span * 0.02
  };
}

const PASS_PREAMBLE: Record<CapturePass, string> = {
  shaded:
    "The first image is a rough 3D blockout of a scene, rendered from the camera. Turn it into a finished image. Keep the camera angle, the composition, where each object stands and the direction of the light.",
  depth:
    "The first image is a depth map of a 3D scene: nearer surfaces are brighter. Render the scene it describes from the same camera. Keep the layout, the silhouettes and the distances.",
  normal:
    "The first image is a surface-normal map of a 3D scene. Render the scene it describes from the same camera. Keep every shape, edge and surface orientation."
};

/**
 * The prompt sent with the capture. The creator writes what the picture
 * should look like; this adds what the inputs are, since an image-edit model
 * is otherwise free to treat a grey blockout as the style to keep.
 */
export function buildAiRenderPrompt(
  prompt: string,
  pass: CapturePass,
  referenceCount: number
): string {
  const parts = [PASS_PREAMBLE[pass]];
  if (referenceCount === 1) {
    parts.push("Match the style, palette and lighting mood of the second image. Do not copy its content.");
  } else if (referenceCount > 1) {
    parts.push(
      `Match the style, palette and lighting mood of the other ${referenceCount} images. Do not copy their content.`
    );
  }
  const brief = prompt.trim();
  if (brief) {
    parts.push(brief);
  }
  return parts.join("\n\n");
}

/** Decode a `data:` URL from `toDataURL` into an uploadable file. */
export function dataUrlToFile(dataUrl: string, name: string): File {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/.exec(dataUrl);
  if (!match || !match[2]) {
    throw new Error("The viewport capture is not a base64 image.");
  }
  const binary = atob(match[3]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], name, { type: match[1] || "image/png" });
}

/**
 * The shape of the rendered image. `viewport` sends the whole viewport;
 * any other value frames a centred crop of that ratio in the viewport and
 * sends only the crop.
 */
export type ShotAspect = "viewport" | "1:1" | "4:3" | "3:2" | "16:9" | "3:4" | "2:3" | "9:16";

export const SHOT_ASPECTS: ShotAspect[] = ["viewport", "1:1", "4:3", "3:2", "16:9", "3:4", "2:3", "9:16"];

/**
 * Focal lengths on a 35 mm full-frame camera. `free` keeps the editor's own
 * field of view.
 */
export type ShotLens = "free" | 24 | 35 | 50 | 85;

export const SHOT_LENSES: ShotLens[] = ["free", 24, 35, 50, 85];

/** The editor viewport's vertical field of view, in degrees. */
export const EDITOR_FOV = 50;

/** Height of a full-frame sensor, in millimetres. */
const SENSOR_HEIGHT_MM = 24;

export interface ShotSettings {
  aspect: ShotAspect;
  lens: ShotLens;
}

export const DEFAULT_SHOT: ShotSettings = { aspect: "viewport", lens: "free" };

export interface FrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const parseAspect = (aspect: ShotAspect): number | null => {
  if (aspect === "viewport") {
    return null;
  }
  const [w, h] = aspect.split(":").map(Number);
  return w > 0 && h > 0 ? w / h : null;
};

/**
 * The largest rectangle of `aspect` centred in a `width` × `height`
 * viewport, in whole pixels. The whole viewport for `viewport`.
 */
export function frameRect(width: number, height: number, aspect: ShotAspect): FrameRect {
  const ratio = parseAspect(aspect);
  if (ratio === null || width <= 0 || height <= 0) {
    return { x: 0, y: 0, width, height };
  }
  let frameWidth = width;
  let frameHeight = Math.round(width / ratio);
  if (frameHeight > height) {
    frameHeight = height;
    frameWidth = Math.round(height * ratio);
  }
  return {
    x: Math.floor((width - frameWidth) / 2),
    y: Math.floor((height - frameHeight) / 2),
    width: frameWidth,
    height: frameHeight
  };
}

/**
 * The camera's vertical field of view, in degrees, that gives the framed
 * crop the view of `lens`. `frameFraction` is the frame's height over the
 * viewport's height, so a crop that is shorter than the viewport widens the
 * camera to keep the lens's view inside the frame.
 */
export function cameraFovForLens(lens: ShotLens, frameFraction: number): number {
  if (lens === "free") {
    return EDITOR_FOV;
  }
  const halfFrame = SENSOR_HEIGHT_MM / 2 / lens;
  const fraction = frameFraction > 0 ? Math.min(frameFraction, 1) : 1;
  return THREE.MathUtils.radToDeg(2 * Math.atan(halfFrame / fraction));
}

const isShotAspect = (value: unknown): value is ShotAspect =>
  SHOT_ASPECTS.includes(value as ShotAspect);

const isShotLens = (value: unknown): value is ShotLens =>
  SHOT_LENSES.includes(value as ShotLens);

/** Shot settings from untrusted storage, with unknown values replaced by defaults. */
export function parseShotSettings(value: unknown): ShotSettings {
  if (!value || typeof value !== "object") {
    return DEFAULT_SHOT;
  }
  const { aspect, lens } = value as Partial<Record<keyof ShotSettings, unknown>>;
  return {
    aspect: isShotAspect(aspect) ? aspect : DEFAULT_SHOT.aspect,
    lens: isShotLens(lens) ? lens : DEFAULT_SHOT.lens
  };
}

/** Where the editor camera stands and what it looks at. */
export interface ShotPose {
  position: THREE.Vector3Tuple;
  target: THREE.Vector3Tuple;
}
