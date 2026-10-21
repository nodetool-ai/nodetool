import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { configureGameEnvironment } from "../src/renderer3d/environment/index.js";
import { blockoutFrame } from "./fixtures/game3d.js";

describe("configureGameEnvironment", () => {
  // three resolves every fogged material's program again whenever scene.fog is a new object.
  it("keeps the fog and background objects across frames and follows their settings", () => {
    const scene = new THREE.Scene();
    const ambient = new THREE.AmbientLight();
    const renderer = { shadowMap: { enabled: false } } as unknown as THREE.WebGLRenderer;
    const environment = blockoutFrame().environment;
    const linear = { ...environment, fog: { color: "#112233", near: 5, far: 50 } };
    configureGameEnvironment(scene, ambient, renderer, linear);
    const fog = scene.fog;
    const background = scene.background;
    configureGameEnvironment(scene, ambient, renderer, { ...linear, background: "#445566", fog: { color: "#ffffff", near: 10, far: 90 } });
    expect(scene.fog).toBe(fog);
    expect(scene.background).toBe(background);
    expect(scene.fog).toMatchObject({ near: 10, far: 90 });
    expect((scene.fog as THREE.Fog).color.getHexString()).toBe("ffffff");
    expect((scene.background as THREE.Color).getHexString()).toBe("445566");
    const height = { ...environment, fog: { kind: "height", color: "#ffffff", density: 0.01, baseHeight: 0, heightFalloff: 0.1, maxOpacity: 1 } } as const;
    configureGameEnvironment(scene, ambient, renderer, height);
    const exp = scene.fog;
    expect(exp).toBeInstanceOf(THREE.FogExp2);
    configureGameEnvironment(scene, ambient, renderer, height);
    expect(scene.fog).toBe(exp);
    configureGameEnvironment(scene, ambient, renderer, { ...environment, fog: undefined });
    expect(scene.fog).toBeNull();
  });
});
