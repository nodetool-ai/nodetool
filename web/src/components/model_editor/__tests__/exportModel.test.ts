/**
 * @jest-environment node
 */
import * as THREE from "three";

import { exportFileName, exportModel } from "../exportModel";
import { exportSceneToGltf } from "../exportGltf";

const mockObjParse = jest.fn((_root: THREE.Object3D) => "o mesh\n");
const mockStlParse = jest.fn();
const mockPlyParse = jest.fn();
const mockUsdzParse = jest.fn();

// three's exporters ship as untransformed ESM, so Jest cannot load them.
jest.mock("three/examples/jsm/exporters/OBJExporter.js", () => ({
  OBJExporter: jest.fn().mockImplementation(() => ({ parse: mockObjParse }))
}));
jest.mock("three/examples/jsm/exporters/STLExporter.js", () => ({
  STLExporter: jest.fn().mockImplementation(() => ({ parse: mockStlParse }))
}));
jest.mock("three/examples/jsm/exporters/PLYExporter.js", () => ({
  PLYExporter: jest.fn().mockImplementation(() => ({ parse: mockPlyParse }))
}));
jest.mock("three/examples/jsm/exporters/USDZExporter.js", () => ({
  USDZExporter: jest.fn().mockImplementation(() => ({ parseAsync: mockUsdzParse }))
}));
jest.mock("../exportGltf", () => ({
  exportSceneToGltf: jest.fn(() => Promise.resolve(new Blob(["gltf"])))
}));

const mockedGltf = exportSceneToGltf as jest.MockedFunction<typeof exportSceneToGltf>;

const box = (name: string): THREE.Mesh => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  mesh.name = name;
  return mesh;
};

describe("exportModel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("exports the whole scene live to glTF with its clips and without hidden objects", async () => {
    const root = new THREE.Group();
    root.add(box("Box"));
    const clip = new THREE.AnimationClip("Spin", 1, []);

    await exportModel(root, "glb", { animations: [clip] });

    expect(mockedGltf).toHaveBeenCalledWith(root, [clip], { binary: true, onlyVisible: true });
  });

  it("writes a copy of the visible scene for mesh formats and leaves the live scene alone", async () => {
    const root = new THREE.Group();
    const shown = box("Shown");
    const hidden = box("Hidden");
    hidden.visible = false;
    const hiddenChild = box("HiddenChild");
    hiddenChild.visible = false;
    shown.add(hiddenChild);
    root.add(shown, hidden);

    const blob = await exportModel(root, "obj");

    const written = mockObjParse.mock.calls[0][0];
    expect(written).not.toBe(root);
    expect(written.children.map((child) => child.name)).toEqual(["Shown"]);
    expect(written.children[0].children).toHaveLength(0);
    expect(written.children[0]).not.toBe(shown);
    expect(root.children).toEqual([shown, hidden]);
    expect(shown.children).toEqual([hiddenChild]);
    expect(blob.type).toBe("model/obj");
  });

  it("keeps a nested selection where it sits on screen", async () => {
    const root = new THREE.Group();
    const parent = new THREE.Group();
    parent.position.set(5, 0, 0);
    parent.scale.setScalar(2);
    const child = box("Wheel");
    child.position.set(1, 0, 0);
    parent.add(child);
    root.add(parent);
    mockStlParse.mockReturnValue(new DataView(new ArrayBuffer(84)));

    await exportModel(root, "stl", { selection: child });

    const written = mockStlParse.mock.calls[0][0] as THREE.Group;
    expect(written.children).toHaveLength(1);
    expect(written.children[0].name).toBe("Wheel");
    expect(written.children[0].position.toArray()).toEqual([7, 0, 0]);
    expect(written.children[0].scale.toArray()).toEqual([2, 2, 2]);
    expect(mockStlParse.mock.calls[0][1]).toEqual({ binary: true });
  });

  it("exports a selection to glTF from a copy, without the scene's clips", async () => {
    const root = new THREE.Group();
    const chair = box("Chair");
    root.add(chair);

    await exportModel(root, "gltf", {
      selection: chair,
      animations: [new THREE.AnimationClip("Spin", 1, [])]
    });

    const [written, clips, options] = mockedGltf.mock.calls[0];
    expect(written).not.toBe(root);
    expect(written.children[0].name).toBe("Chair");
    expect(clips).toEqual([]);
    expect(options).toEqual({ binary: false, onlyVisible: true });
  });

  it("refuses a mesh format when nothing visible has geometry", async () => {
    const root = new THREE.Group();
    root.add(new THREE.PointLight());

    await expect(exportModel(root, "ply")).rejects.toThrow("no visible mesh");
    expect(mockPlyParse).not.toHaveBeenCalled();
  });

  it("asks the USDZ exporter for a Quick Look compatible file", async () => {
    const root = new THREE.Group();
    root.add(box("Box"));
    mockUsdzParse.mockResolvedValue(new Uint8Array([1, 2]));

    const blob = await exportModel(root, "usdz");

    expect(mockUsdzParse.mock.calls[0][1]).toEqual({ quickLookCompatible: true });
    expect(blob.type).toBe("model/vnd.usdz+zip");
  });
});

describe("exportFileName", () => {
  it("appends the export format's extension", () => {
    expect(exportFileName("Wheel", "stl")).toBe("Wheel.stl");
    expect(exportFileName("Box.001", "obj")).toBe("Box.001.obj");
  });

  it("replaces characters file systems reject and falls back to model", () => {
    expect(exportFileName("a/b:c", "ply")).toBe("a_b_c.ply");
    expect(exportFileName("   ", "glb")).toBe("model.glb");
  });
});
