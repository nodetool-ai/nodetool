import * as THREE from "three";
import { exportSceneToGlb } from "../exportGltf";

const mockParse = jest.fn();

// GLTFExporter ships as untransformed ESM, so Jest cannot load it. The mock
// records what the editor hands the exporter.
jest.mock("three/examples/jsm/exporters/GLTFExporter.js", () => ({
  GLTFExporter: jest.fn().mockImplementation(() => ({ parse: mockParse }))
}));

describe("exportSceneToGlb", () => {
  beforeEach(() => {
    mockParse.mockReset();
    mockParse.mockImplementation(
      (_input: unknown, onDone: (result: ArrayBuffer) => void) =>
        onDone(new ArrayBuffer(4))
    );
  });

  it("exports the root's children as top-level nodes, not the root group", async () => {
    const root = new THREE.Group();
    root.name = "Scene";
    const box = new THREE.Mesh();
    const light = new THREE.PointLight();
    root.add(box, light);

    await exportSceneToGlb(root);

    const input = mockParse.mock.calls[0][0] as THREE.Scene;
    expect(input).toBeInstanceOf(THREE.Scene);
    expect(input).not.toBe(root);
    expect(input.children).toEqual([box, light]);
    // The live objects stay parented to the editor root.
    expect(box.parent).toBe(root);
    expect(root.children).toEqual([box, light]);
  });

  it("passes the loaded animation clips to the exporter", async () => {
    const clip = new THREE.AnimationClip("Spin", 1, []);

    await exportSceneToGlb(new THREE.Group(), [clip]);

    expect(mockParse.mock.calls[0][3]).toMatchObject({
      binary: true,
      animations: [clip]
    });
  });

  it("resolves a binary result as a GLB blob", async () => {
    const blob = await exportSceneToGlb(new THREE.Group());
    expect(blob.type).toBe("model/gltf-binary");
  });
});
