/**
 * The orbit gesture's arithmetic (T10): the bounds a pointer cannot drag the
 * camera past, and the wrap that keeps a long drag readable. The rates
 * themselves are pinned through the overlay in
 * `Model3DOrbitOverlay.test.tsx`, where a pixel of travel is a degree.
 */

import {
  DEFAULT_MODEL3D_STYLE,
  type ClipModel3DCamera
} from "@nodetool-ai/timeline";

import {
  MAX_ZOOM,
  MIN_ELEVATION_DEG,
  MIN_ZOOM,
  orbitCameraFromDrag,
  orbitDegreesPerPixel,
  zoomFromWheel
} from "../model3dOrbitGesture";

const camera: ClipModel3DCamera = DEFAULT_MODEL3D_STYLE.camera;

describe("model3dOrbitGesture", () => {
  it("turns 360° over one frame height, whatever the frame is", () => {
    expect(orbitDegreesPerPixel(360)).toBeCloseTo(1, 9);
    expect(orbitDegreesPerPixel(720)).toBeCloseTo(0.5, 9);
  });

  it("wraps azimuth into [0, 360) so a long drag reads as a heading", () => {
    const spun = orbitCameraFromDrag({ ...camera, azimuthDeg: 10 }, 40, 0, 36);
    expect(spun.azimuthDeg).toBeCloseTo(10 - 400 + 720, 9);
    expect(spun.azimuthDeg).toBeGreaterThanOrEqual(0);
    expect(spun.azimuthDeg).toBeLessThan(360);
  });

  it("stops elevation short of the lower pole", () => {
    expect(orbitCameraFromDrag(camera, 0, -5000, 360).elevationDeg).toBe(
      MIN_ELEVATION_DEG
    );
  });

  it("keeps zoom positive and bounded through a wheel burst", () => {
    let zoom = camera.zoom;
    for (let i = 0; i < 200; i++) {
      zoom = zoomFromWheel(zoom, 500);
    }
    expect(zoom).toBe(MIN_ZOOM);

    for (let i = 0; i < 400; i++) {
      zoom = zoomFromWheel(zoom, -500);
    }
    expect(zoom).toBe(MAX_ZOOM);
  });
});
