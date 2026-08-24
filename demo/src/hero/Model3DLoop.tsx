/**
 * The 3D surface loop — the fifth of the landing page's creative surfaces
 * (marketing/POSITIONING_PLAN.md Part 5).
 *
 * Unlike the other four this replays no cast: the 3D editor has no recording,
 * and a scene needs no timeline to be worth looking at. It mounts the real
 * editor on a glTF scene built by the product's own `@nodetool-ai/model3d`
 * operations (`scripts/build-3d-cast-scene.ts`) and orbits the camera, which
 * the editor exposes for exactly this — a host that renders it as a picture
 * rather than as an editor.
 *
 * WebGL survives the screenshot here because the editor already asks for
 * `preserveDrawingBuffer`. The sketch surface needed a Canvas2D pin for the
 * opposite reason: its WebGPU canvas did not.
 */
import React from "react";
import { AbsoluteFill, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Model3DDemoSurface } from "@web-demo";
import { useInterFont } from "../promo/fonts";
import { PROMO_BG } from "../promo/theme";
import {
  LoopFade,
  SURFACE_LOOP_FRAMES,
  SurfaceLabel,
} from "./SurfaceLoop";

/** Frames the fade holds for, on top of the shared one, while the scene loads. */
const LOAD_HOLD_FRAMES = 10;

export const Model3DLoop: React.FC = () => {
  useInterFont();
  const frame = useCurrentFrame();

  // A slow partial orbit: a full turn would end where it started and read as
  // a stall, so the cut lands on a different angle than the open.
  const azimuthDeg = interpolate(frame, [0, SURFACE_LOOP_FRAMES], [26, 122]);
  const elevationDeg = interpolate(
    frame,
    [0, SURFACE_LOOP_FRAMES / 2, SURFACE_LOOP_FRAMES],
    [24, 36, 26]
  );
  const distance = interpolate(frame, [0, SURFACE_LOOP_FRAMES], [5.2, 4.3]);

  return (
    <AbsoluteFill style={{ background: PROMO_BG }}>
      <Model3DDemoSurface
        url={staticFile("casts/model3d/composition.gltf")}
        name="Product shot"
        cameraPose={{
          azimuthDeg,
          elevationDeg,
          distance,
          target: [0, 0.6, 0],
        }}
      />
      <SurfaceLabel label="3D" claim="Deterministic spatial composition" />
      <LoopFade extraFrames={LOAD_HOLD_FRAMES} />
    </AbsoluteFill>
  );
};
