import * as THREE from "three";
import { applyOpacity, colorEdit, toOpaqueHex } from "../PropertiesPanel";

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

describe("colorEdit", () => {
  it("restores the exact original color on undo, not its rounded hex", () => {
    const color = new THREE.Color(0.8, 0.8, 0.8);
    const original = color.clone();
    const edit = colorEdit("Color", color, "#ff0000", "k");
    const before = edit.get();
    edit.set(edit.value);
    expect(color.getHexString()).toBe("ff0000");
    edit.set(before);
    expect(color.equals(original)).toBe(true);
  });

  it("treats a pick of the displayed color as no change", () => {
    const color = new THREE.Color(0.8, 0.8, 0.8);
    const edit = colorEdit("Color", color, `#${color.getHexString()}`, "k");
    expect(edit.equals?.(edit.get(), edit.value)).toBe(true);
  });
});
