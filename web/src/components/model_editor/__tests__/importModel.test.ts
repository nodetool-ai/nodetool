/**
 * @jest-environment node
 */
import * as THREE from "three";

import { importModelFile, isModelFileName, modelNameFromFile } from "../importModel";
import { HIDDEN_EXTRA } from "../sceneOps";

const mockParseAsync = jest.fn();
const mockObjParse = jest.fn();
const mockSetMaterials = jest.fn();
const mockMtlParse = jest.fn();
const mockStlParse = jest.fn();
const mockPlyParse = jest.fn();
const mockColladaParse = jest.fn();
const mockManagers: THREE.LoadingManager[] = [];

// three's loaders ship as untransformed ESM, so Jest cannot load them.
jest.mock("three/examples/jsm/loaders/GLTFLoader.js", () => ({
  GLTFLoader: jest.fn().mockImplementation((manager: THREE.LoadingManager) => {
    mockManagers.push(manager);
    return { parseAsync: mockParseAsync };
  })
}));
jest.mock("three/examples/jsm/loaders/OBJLoader.js", () => ({
  OBJLoader: jest.fn().mockImplementation(() => ({
    parse: mockObjParse,
    setMaterials: mockSetMaterials
  }))
}));
jest.mock("three/examples/jsm/loaders/MTLLoader.js", () => ({
  MTLLoader: jest.fn().mockImplementation(() => ({ parse: mockMtlParse }))
}));
jest.mock("three/examples/jsm/loaders/STLLoader.js", () => ({
  STLLoader: jest.fn().mockImplementation(() => ({ parse: mockStlParse }))
}));
jest.mock("three/examples/jsm/loaders/PLYLoader.js", () => ({
  PLYLoader: jest.fn().mockImplementation(() => ({ parse: mockPlyParse }))
}));
jest.mock("three/examples/jsm/loaders/ColladaLoader.js", () => ({
  ColladaLoader: jest.fn().mockImplementation(() => ({ parse: mockColladaParse }))
}));
jest.mock("three/examples/jsm/loaders/FBXLoader.js", () => ({ FBXLoader: jest.fn() }));
jest.mock("three/examples/jsm/loaders/3MFLoader.js", () => ({ ThreeMFLoader: jest.fn() }));
jest.mock("three/examples/jsm/loaders/USDLoader.js", () => ({ USDLoader: jest.fn() }));

const fileOf = (name: string, content: BlobPart = new Uint8Array([1, 2, 3])): File =>
  new File([content], name);

const triangle = (): THREE.BufferGeometry => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)
  );
  return geometry;
};

describe("importModelFile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockManagers.length = 0;
  });

  it("wraps the file's scene in one group named after the file", async () => {
    const scene = new THREE.Group();
    const seat = new THREE.Mesh();
    seat.name = "Seat";
    const back = new THREE.Mesh();
    back.name = "Back";
    back.userData[HIDDEN_EXTRA] = true;
    scene.add(seat, back);
    mockParseAsync.mockResolvedValue({ scene, animations: [] });

    const group = await importModelFile(fileOf("Chair.glb"));

    expect(group.name).toBe("Chair");
    expect(group.children.map((c) => c.name)).toEqual(["Seat", "Back"]);
    expect(back.visible).toBe(false);
    expect(mockParseAsync.mock.calls[0][0]).toBeInstanceOf(ArrayBuffer);
  });

  it("serves a .gltf file's .bin and textures from the files picked with it", async () => {
    mockParseAsync.mockResolvedValue({ scene: new THREE.Group(), animations: [] });
    await importModelFile(fileOf("scene.gltf"), [fileOf("Scene.bin"), fileOf("wood.png")]);

    const manager = mockManagers[0];
    expect(manager.resolveURL("scene.bin")).toMatch(/^blob:/);
    expect(manager.resolveURL("textures/Wood.PNG")).toMatch(/^blob:/);
    expect(manager.resolveURL("missing.png")).toBe("missing.png");
  });

  it("applies the .mtl an .obj names and converts its materials for the Inspector", async () => {
    const materials = { preload: jest.fn() };
    mockMtlParse.mockReturnValue(materials);
    const phong = new THREE.MeshPhongMaterial({ color: 0xff0000, shininess: 30 });
    const loaded = new THREE.Group();
    const mesh = new THREE.Mesh(triangle(), phong);
    mesh.name = "Leg";
    loaded.add(mesh);
    mockObjParse.mockReturnValue(loaded);

    const group = await importModelFile(fileOf("table.obj", "mtllib Table.mtl\nv 0 0 0\n"), [
      fileOf("table.mtl", "newmtl Red\n")
    ]);

    expect(mockMtlParse).toHaveBeenCalledWith("newmtl Red\n", "");
    expect(materials.preload).toHaveBeenCalled();
    expect(mockSetMaterials).toHaveBeenCalledWith(materials);
    expect(group.name).toBe("table");
    const leg = group.children[0] as THREE.Mesh;
    expect(leg.name).toBe("Leg");
    expect(leg.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    const standard = leg.material as THREE.MeshStandardMaterial;
    expect(standard.color.getHex()).toBe(0xff0000);
    expect(standard.metalness).toBe(0);
    expect(standard.roughness).toBeCloseTo(0.25);
  });

  it("imports an .obj without its .mtl using the loader's default material", async () => {
    mockObjParse.mockReturnValue(new THREE.Group());
    await importModelFile(fileOf("table.obj", "mtllib table.mtl\n"));
    expect(mockMtlParse).not.toHaveBeenCalled();
    expect(mockSetMaterials).not.toHaveBeenCalled();
  });

  it("turns an STL geometry into a shaded mesh", async () => {
    mockStlParse.mockReturnValue(triangle());

    const group = await importModelFile(fileOf("Bracket.stl"));

    const mesh = group.children[0] as THREE.Mesh;
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    expect(mesh.name).toBe("Bracket");
    expect(mesh.geometry.hasAttribute("normal")).toBe(true);
    expect(mesh.material).toBeInstanceOf(THREE.MeshStandardMaterial);
  });

  it("turns a PLY without faces into a colored point cloud", async () => {
    const geometry = triangle();
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(new Array(9).fill(1), 3));
    mockPlyParse.mockReturnValue(geometry);

    const group = await importModelFile(fileOf("scan.ply"));

    const points = group.children[0] as THREE.Points;
    expect(points).toBeInstanceOf(THREE.Points);
    expect((points.material as THREE.PointsMaterial).vertexColors).toBe(true);
  });

  it("keeps a Collada root's up-axis rotation in its children", async () => {
    const scene = new THREE.Group();
    scene.rotation.x = -Math.PI / 2;
    const part = new THREE.Mesh(triangle(), new THREE.MeshLambertMaterial());
    part.position.set(0, 0, 2);
    scene.add(part);
    mockColladaParse.mockReturnValue({ scene });

    const group = await importModelFile(fileOf("robot.dae", "<COLLADA/>"));

    expect(part.parent).toBe(group);
    expect(part.position.y).toBeCloseTo(2);
    expect(part.position.z).toBeCloseTo(0);
    expect(part.material).toBeInstanceOf(THREE.MeshStandardMaterial);
  });

  it("rejects other formats before parsing", async () => {
    await expect(importModelFile(fileOf("chair.blend"))).rejects.toThrow("is not a .glb");
    expect(mockParseAsync).not.toHaveBeenCalled();
  });
});

describe("model file names", () => {
  it("recognises every supported extension in any case", () => {
    for (const name of ["a.GLB", "a.gltf", "a.obj", "a.FBX", "a.stl", "a.ply", "a.dae", "a.3mf", "a.usdz"]) {
      expect(isModelFileName(name)).toBe(true);
    }
    expect(isModelFileName("a.mtl")).toBe(false);
    expect(isModelFileName("a.png")).toBe(false);
  });

  it("strips only the model extension", () => {
    expect(modelNameFromFile("Chair.final.glb")).toBe("Chair.final");
    expect(modelNameFromFile("Part.STL")).toBe("Part");
    expect(modelNameFromFile(".glb")).toBe("Model");
  });
});
