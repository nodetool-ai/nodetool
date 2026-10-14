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
