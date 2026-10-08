import * as THREE from "three";

import {
  describeGeometry,
  geometryPatchCommand,
  lightPatchCommand,
  materialPatchCommand
} from "../agentEdits";

const meshWith = (material: THREE.Material | THREE.Material[]) =>
  new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);

describe("materialPatchCommand", () => {
  it("changes only the named fields and undoes them", () => {
    const material = new THREE.MeshStandardMaterial({ color: 0x00ff00, roughness: 0.9 });
    const mesh = meshWith(material);

    const command = materialPatchCommand(mesh, { metalness: 0.75, opacity: 0.5 });
    expect(material.metalness).toBe(0.75);
    expect(material.opacity).toBe(0.5);
    expect(material.transparent).toBe(true);
    expect(material.roughness).toBe(0.9);

    command.undo();
    expect(material.metalness).toBe(0);
    expect(material.opacity).toBe(1);
    expect(material.transparent).toBe(false);

    command.redo();
    expect(material.metalness).toBe(0.75);
  });

  it("changes one slot of a multi-material mesh", () => {
    const a = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const b = new THREE.MeshStandardMaterial({ color: 0xffffff });
    materialPatchCommand(meshWith([a, b]), { slot: 1, color: "#ff0000" });
    expect(a.color.getHexString()).toBe("ffffff");
    expect(b.color.getHexString()).toBe("ff0000");
  });

  it("rejects a missing slot, a bad color and a field the material lacks", () => {
    const basic = meshWith(new THREE.MeshBasicMaterial());
    expect(() => materialPatchCommand(basic, { slot: 2 })).toThrow("slot 2 does not exist");
    expect(() => materialPatchCommand(basic, { color: "orangish" })).toThrow("hex color");
    expect(() => materialPatchCommand(basic, { roughness: 0.5 })).toThrow(
      "MeshBasicMaterial has no roughness"
    );
  });

  it("accepts CSS color names and drops the alpha byte", () => {
    const material = new THREE.MeshStandardMaterial();
    const mesh = meshWith(material);
    materialPatchCommand(mesh, { color: "Tomato" });
    expect(material.color.getHexString()).toBe("ff6347");
    materialPatchCommand(mesh, { emissive: "#11223380" });
    expect(material.emissive.getHexString()).toBe("112233");
  });
});

describe("lightPatchCommand", () => {
  it("sets a spot light's angle in degrees and undoes it", () => {
    const light = new THREE.SpotLight(0xffffff, 10);
    const before = light.angle;
    const command = lightPatchCommand(light, { angle: 45, penumbra: 0.3, intensity: 4 });
    expect(light.angle).toBeCloseTo(Math.PI / 4);
    expect(light.penumbra).toBe(0.3);
    expect(light.intensity).toBe(4);
    command.undo();
    expect(light.angle).toBe(before);
    expect(light.intensity).toBe(10);
  });

  it("rejects fields the light type does not have", () => {
    const sun = new THREE.DirectionalLight();
    expect(() => lightPatchCommand(sun, { distance: 5 })).toThrow("no distance");
    expect(() => lightPatchCommand(new THREE.PointLight(), { angle: 30 })).toThrow("no angle");
  });
});

describe("geometryPatchCommand", () => {
  it("rebuilds a primitive with angles in degrees and disposes the dropped geometry", () => {
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 32));
    const original = mesh.geometry;
    const command = geometryPatchCommand(mesh, { height: 2, thetaLength: 180 });
    expect(describeGeometry(mesh)?.params).toMatchObject({ height: 2, thetaLength: 180, radius: 0.5 });

    const dispose = jest.spyOn(original, "dispose");
    command.dispose?.(false);
    expect(dispose).toHaveBeenCalled();
  });

  it("names the valid parameters when one is unknown", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry());
    expect(() => geometryPatchCommand(mesh, { radius: 1 })).toThrow(
      "Its parameters are: width, height, depth"
    );
  });

  it("refuses imported geometry", () => {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry());
    expect(() => geometryPatchCommand(mesh, { width: 1 })).toThrow("no editable parameters");
  });
});
