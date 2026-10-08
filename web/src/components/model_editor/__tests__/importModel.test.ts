/**
 * @jest-environment node
 */
import * as THREE from "three";

import { importModelFile, isModelFileName, modelNameFromFile } from "../importModel";
import { HIDDEN_EXTRA } from "../sceneOps";

const mockParseAsync = jest.fn();

// GLTFLoader ships as untransformed ESM, so Jest cannot load it.
jest.mock("three/examples/jsm/loaders/GLTFLoader.js", () => ({
  GLTFLoader: jest.fn().mockImplementation(() => ({ parseAsync: mockParseAsync }))
}));

const fileOf = (name: string): File => new File([new Uint8Array([1, 2, 3])], name);

describe("importModelFile", () => {
  beforeEach(() => {
    mockParseAsync.mockReset();
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

  it("reads a .gltf file as text", async () => {
    mockParseAsync.mockResolvedValue({ scene: new THREE.Group(), animations: [] });
    await importModelFile(fileOf("scene.gltf"));
    expect(typeof mockParseAsync.mock.calls[0][0]).toBe("string");
  });

  it("rejects other formats before parsing", async () => {
    await expect(importModelFile(fileOf("chair.obj"))).rejects.toThrow("not a .glb or .gltf");
    expect(mockParseAsync).not.toHaveBeenCalled();
  });
});

describe("model file names", () => {
  it("recognises glTF extensions in any case", () => {
    expect(isModelFileName("a.GLB")).toBe(true);
    expect(isModelFileName("a.gltf")).toBe(true);
    expect(isModelFileName("a.fbx")).toBe(false);
  });

  it("strips only the model extension", () => {
    expect(modelNameFromFile("Chair.final.glb")).toBe("Chair.final");
    expect(modelNameFromFile(".glb")).toBe("Model");
  });
});
