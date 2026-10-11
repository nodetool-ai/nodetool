import * as THREE from "three";
import { exportSceneToGlb } from "../exportGltf";
import { EDITOR_SETTINGS_EXTRA, HIDDEN_EXTRA } from "../sceneOps";
import { createPrimitive } from "../objectFactory";

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

  it("writes hidden objects with the hidden extra without showing them", async () => {
    const root = new THREE.Group();
    const hidden = new THREE.Mesh();
    hidden.visible = false;
    root.add(hidden);
    let seen: { visible: boolean; extra: unknown } | null = null;
    mockParse.mockImplementation(
      (_input: unknown, onDone: (result: ArrayBuffer) => void) => {
        seen = { visible: hidden.visible, extra: hidden.userData[HIDDEN_EXTRA] };
        onDone(new ArrayBuffer(4));
      }
    );

    await exportSceneToGlb(root);

    // Frames keep rendering during an export, so a hidden object must not
    // flash on screen; the exporter is told to keep invisible nodes instead.
    expect(seen).toEqual({ visible: false, extra: true });
    expect(mockParse.mock.calls[0][3]).toMatchObject({ onlyVisible: false });
    expect(hidden.userData).toEqual({});
  });

  it("exports a wireframe mesh as triangles and keeps its settings in an extra", async () => {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ wireframe: true, side: THREE.BackSide });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    mesh.castShadow = true;
    mesh.renderOrder = 3;
    root.add(mesh);
    let seen: { wireframe: boolean; material: unknown; object: unknown } | null = null;
    mockParse.mockImplementation(
      (_input: unknown, onDone: (result: ArrayBuffer) => void) => {
        seen = {
          wireframe: material.wireframe,
          material: material.userData[EDITOR_SETTINGS_EXTRA],
          object: mesh.userData[EDITOR_SETTINGS_EXTRA]
        };
        onDone(new ArrayBuffer(4));
      }
    );

    await exportSceneToGlb(root);

    // GLTFExporter writes a wireframe material's mesh as LINES over the
    // triangle indices, which reloads as broken line segments.
    expect(seen).toEqual({
      wireframe: false,
      material: { wireframe: true, backSide: true },
      object: { castShadow: true, renderOrder: 3 }
    });
    expect(material.wireframe).toBe(true);
    expect(material.userData).toEqual({});
    expect(mesh.userData).toEqual({});
  });

  it("writes no settings extra for default objects and materials", async () => {
    const root = new THREE.Group();
    const mesh = createPrimitive("box") as THREE.Mesh;
    root.add(mesh);
    let seen: unknown[] = [];
    mockParse.mockImplementation(
      (_input: unknown, onDone: (result: ArrayBuffer) => void) => {
        seen = [
          mesh.userData[EDITOR_SETTINGS_EXTRA],
          (mesh.material as THREE.Material).userData[EDITOR_SETTINGS_EXTRA]
        ];
        onDone(new ArrayBuffer(4));
      }
    );

    await exportSceneToGlb(root);

    expect(seen).toEqual([undefined, undefined]);
  });

  it("leaves a light's target out of the export and puts it back", async () => {
    const root = new THREE.Group();
    const light = createPrimitive("directionalLight") as THREE.DirectionalLight;
    root.add(light);
    let targetListed: boolean | null = null;
    mockParse.mockImplementation(
      (_input: unknown, onDone: (result: ArrayBuffer) => void) => {
        targetListed = light.children.includes(light.target);
        onDone(new ArrayBuffer(4));
      }
    );

    await exportSceneToGlb(root);

    expect(targetListed).toBe(false);
    expect(light.children).toContain(light.target);
    expect(light.target.parent).toBe(light);
  });

  it("refuses to save a skinned mesh whose bones were deleted", async () => {
    const root = new THREE.Group();
    const bone = new THREE.Bone();
    const mesh = new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    mesh.name = "Body";
    root.add(bone, mesh);
    mesh.bind(new THREE.Skeleton([bone]));
    root.remove(bone);

    await expect(exportSceneToGlb(root)).rejects.toThrow(/Body lost bones/);
    expect(mockParse).not.toHaveBeenCalled();
  });
});
