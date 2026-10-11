import * as THREE from "three";
import { buildAiRenderPrompt, dataUrlToFile, depthRange } from "../aiRender";

const cameraAt = (z: number): THREE.PerspectiveCamera => {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  camera.position.set(0, 0, z);
  camera.lookAt(0, 0, 0);
  return camera;
};

describe("depthRange", () => {
  it("wraps the box tightly instead of using the camera's planes", () => {
    const box = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
    const range = depthRange(box, cameraAt(10));
    expect(range).not.toBeNull();
    // The box spans distances 9 to 11 from a camera at z = 10.
    expect(range!.near).toBeGreaterThan(8.9);
    expect(range!.near).toBeLessThan(9);
    expect(range!.far).toBeGreaterThan(11);
    expect(range!.far).toBeLessThan(11.1);
  });

  it("keeps the near plane in front of a camera inside the box", () => {
    const box = new THREE.Box3(new THREE.Vector3(-5, -5, -5), new THREE.Vector3(5, 5, 5));
    const range = depthRange(box, cameraAt(0.5));
    expect(range!.near).toBeGreaterThan(0);
    expect(range!.far).toBeGreaterThan(5);
  });

  it("answers null for an empty scene or one behind the camera", () => {
    expect(depthRange(new THREE.Box3(), cameraAt(10))).toBeNull();
    const behind = new THREE.Box3(new THREE.Vector3(-1, -1, 20), new THREE.Vector3(1, 1, 22));
    expect(depthRange(behind, cameraAt(10))).toBeNull();
  });
});

describe("buildAiRenderPrompt", () => {
  it("names the input pass and keeps the creator's brief last", () => {
    const prompt = buildAiRenderPrompt("  moonlit bedroom, Pixar style ", "shaded", 0);
    expect(prompt).toMatch(/blockout/);
    expect(prompt).not.toMatch(/second image/);
    expect(prompt.endsWith("moonlit bedroom, Pixar style")).toBe(true);
  });

  it("describes depth and normal passes as maps, not as the style to keep", () => {
    expect(buildAiRenderPrompt("x", "depth", 0)).toMatch(/depth map/);
    expect(buildAiRenderPrompt("x", "normal", 0)).toMatch(/normal map/);
  });

  it("points the model at the style references after the capture", () => {
    expect(buildAiRenderPrompt("", "shaded", 1)).toMatch(/second image/);
    expect(buildAiRenderPrompt("", "shaded", 2)).toMatch(/other 2 images/);
  });
});

describe("dataUrlToFile", () => {
  it("decodes a base64 PNG data URL", async () => {
    const file = dataUrlToFile("data:image/png;base64,iVBORw==", "view.png");
    expect(file.name).toBe("view.png");
    expect(file.type).toBe("image/png");
    expect(file.size).toBe(5);
  });

  it("rejects a data URL that is not base64", () => {
    expect(() => dataUrlToFile("data:,hello", "view.png")).toThrow(/not a base64 image/);
  });
});
