import * as THREE from "three";
import { applyOpacity, toOpaqueHex } from "../PropertiesPanel";

describe("toOpaqueHex", () => {
  it("drops the alpha byte the color picker adds for translucent picks", () => {
    expect(toOpaqueHex("#ff880080")).toBe("#ff8800");
    expect(new THREE.Color(toOpaqueHex("#ff880080")).getHexString()).toBe("ff8800");
  });

  it("leaves other colors alone", () => {
    expect(toOpaqueHex("#ff8800")).toBe("#ff8800");
  });
});

describe("applyOpacity", () => {
  it("turns transparency off again when opacity returns to 1", () => {
    const material = new THREE.MeshStandardMaterial();
    applyOpacity(material, 0.5);
    expect(material.transparent).toBe(true);
    applyOpacity(material, 1);
    expect(material.transparent).toBe(false);
  });

  it("keeps a material that was transparent before the edit transparent", () => {
    const material = new THREE.MeshStandardMaterial({ transparent: true });
    applyOpacity(material, 0.5);
    applyOpacity(material, 1);
    expect(material.transparent).toBe(true);
  });
});
