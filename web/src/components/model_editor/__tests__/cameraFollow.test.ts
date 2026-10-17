import * as THREE from "three";
import { fitDistance, followPosition, isOutOfView } from "../cameraFollow";

const makeCamera = (): THREE.PerspectiveCamera => {
  const camera = new THREE.PerspectiveCamera(50, 1.5, 0.1, 1000);
  camera.position.set(3, 2, 3);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
};

describe("isOutOfView", () => {
  it("keeps a point the camera looks at in view", () => {
    expect(isOutOfView(new THREE.Vector3(0, 0, 0), makeCamera())).toBe(false);
  });

  it("reports a part raised above the top edge as out of view", () => {
    // The study's tabletop: Position Y 1.9 left the default view.
    expect(isOutOfView(new THREE.Vector3(0, 0.5, 0), makeCamera())).toBe(false);
    expect(isOutOfView(new THREE.Vector3(0, 6, 0), makeCamera())).toBe(true);
  });

  it("reports a point behind the camera as out of view", () => {
    expect(isOutOfView(new THREE.Vector3(6, 4, 6), makeCamera())).toBe(true);
  });
});

describe("followPosition", () => {
  it("keeps the viewing direction and distance for a part that fits", () => {
    const camera = makeCamera();
    const target = new THREE.Vector3(0, 0, 0);
    const sphere = new THREE.Sphere(new THREE.Vector3(0, 6, 0), 0.2);

    const next = followPosition(camera, target, sphere);

    expect(next.clone().sub(sphere.center).toArray()).toEqual(
      camera.position.clone().sub(target).toArray().map((v) => expect.closeTo(v, 6))
    );
  });

  it("backs away when the part would not fit at the current distance", () => {
    const camera = makeCamera();
    const target = new THREE.Vector3(0, 0, 0);
    const sphere = new THREE.Sphere(new THREE.Vector3(0, 6, 0), 10);

    const next = followPosition(camera, target, sphere);

    expect(next.distanceTo(sphere.center)).toBeCloseTo(fitDistance(10, camera), 6);
    expect(next.distanceTo(sphere.center)).toBeGreaterThan(camera.position.length());
  });
});
