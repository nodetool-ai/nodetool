/**
 * A blockout set: an empty glTF scene with a ground plane, and the `model3d`
 * clip that films it with a free camera.
 *
 * The set is an ordinary model asset, so the 3D model editor opens it and the
 * agent's `edit_model3d` operations add boxes, figures and cameras to it. The
 * clip is an ordinary `model3d` clip. Nothing here is a new document type.
 */

import {
  applyOperation,
  createModel3DFile,
  serializeModel3D
} from "@nodetool-ai/model3d";
import {
  DEFAULT_FREE_CAMERA_POSITION,
  DEFAULT_FREE_CAMERA_TARGET,
  focalLengthMmToFovDeg,
  model3dStyleWithPatch,
  type TimelineClip
} from "@nodetool-ai/timeline";

import type { Asset } from "../../stores/ApiTypes";
import { assetToClip } from "./dnd/assetToClipAdapter";

export const BLOCKOUT_SET_CONTENT_TYPE = "model/gltf-binary";

/** Edge length of the square ground plane, metres. */
export const BLOCKOUT_SET_GROUND_SIZE = 12;

/** The lens a new blockout clip starts on, millimetres. */
export const BLOCKOUT_SET_LENS_MM = 35;

/**
 * What a blockout clip clears the frame to. Scene content, not chrome: it is
 * the colour three.js and Blender clear to, so no theme token applies. It is
 * darker than the lit grey of the ground and the shapes, so the horizon and
 * every silhouette read in the first frame.
 */
export const BLOCKOUT_SET_BACKGROUND_COLOR = "#7d828a";

/**
 * The bytes of a new set: a GLB with one ground plane at the origin, so the
 * first frame shows a floor and a horizon instead of nothing.
 */
export function blockoutSetBytes(name: string): Uint8Array {
  const file = createModel3DFile(name);
  file.format = "glb";
  const ground = applyOperation(file, {
    op: "add_object",
    kind: "plane",
    name: "Ground"
  }).object;
  if (ground) {
    // The plane is 2 units wide and lies in its own XY, turned flat.
    const half = BLOCKOUT_SET_GROUND_SIZE / 2;
    applyOperation(file, {
      op: "set_transform",
      target: ground.uuid,
      scale: [half, half, 1]
    });
  }
  return serializeModel3D(file);
}

/** A new set as an uploadable file named `<name>.glb`. */
export function blockoutSetFile(name: string): File {
  const bytes = blockoutSetBytes(name);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new File([buffer], `${name}.glb`, {
    type: BLOCKOUT_SET_CONTENT_TYPE
  });
}

/**
 * The clip a new set is filmed with: a free camera at eye height looking at
 * the origin, over a flat opaque background. The lighting stays the default
 * `studio`: under `flat` light a grey box in front of a grey wall has no edge.
 */
export function blockoutSetClip(
  asset: Asset,
  trackId: string,
  startMs: number,
  name?: string
): TimelineClip {
  const clip = assetToClip(asset, trackId, startMs);
  return {
    ...clip,
    // The clip names the set, not its file: "Blockout set", not "….glb".
    name: name ?? clip.name.replace(/\.(glb|gltf)$/i, ""),
    model3dStyle: model3dStyleWithPatch(clip.model3dStyle, {
      camera: {
        mode: "free",
        position: [...DEFAULT_FREE_CAMERA_POSITION],
        target: [...DEFAULT_FREE_CAMERA_TARGET],
        rollDeg: 0,
        fovDeg: focalLengthMmToFovDeg(BLOCKOUT_SET_LENS_MM)
      },
      background: { transparent: false, color: BLOCKOUT_SET_BACKGROUND_COLOR }
    })
  };
}
