import { describe, expect, it } from "vitest";

import {
  applyOperations,
  createModel3DFile,
  listScene,
  parseOperation
} from "../src/index.js";

const message = (raw: unknown): string => {
  try {
    parseOperation(raw);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error(`parseOperation accepted ${JSON.stringify(raw)}`);
};

describe("parseOperation", () => {
  it("accepts the well-formed shapes", () => {
    expect(parseOperation({ op: "add_object", kind: "box" })).toEqual({
      op: "add_object",
      kind: "box"
    });
    expect(parseOperation({ op: "add_object", kind: "box", name: "Crate" })).toEqual({
      op: "add_object",
      kind: "box",
      name: "Crate"
    });
    expect(
      parseOperation({ op: "set_transform", target: "Box", scale: [2, 2, 2] })
    ).toEqual({ op: "set_transform", target: "Box", scale: [2, 2, 2] });
    expect(parseOperation({ op: "select_object" })).toEqual({
      op: "select_object",
      target: null
    });
  });

  // Each of these is a shape a model produces, and each one used to write
  // something nobody asked for: no kind became a point light, no `visible`
  // hid the object, an empty transform patch saved an unchanged document.
  it("names the argument that is wrong", () => {
    expect(message("add_object")).toMatch(/must be an object/);
    expect(message({ op: "explode", target: "Box" })).toMatch(/Unknown operation/);
    expect(message({ op: "add_object" })).toMatch(/add_object.kind is "undefined"/);
    expect(message({ op: "add_object", kind: "dodecahedron" })).toMatch(
      /expected one of box, sphere/
    );
    expect(message({ op: "delete_object" })).toMatch(/needs a target/);
    expect(message({ op: "delete_object", target: "  " })).toMatch(/needs a target/);
    expect(message({ op: "set_transform", target: "Box" })).toMatch(
      /at least one of position, rotation or scale/
    );
    expect(
      message({ op: "set_transform", target: "Box", position: [1, 2] })
    ).toMatch(/position must be three finite numbers/);
    expect(
      message({ op: "set_transform", target: "Box", scale: [1, "2", 3] })
    ).toMatch(/scale must be three finite numbers/);
    expect(message({ op: "set_visibility", target: "Box" })).toMatch(
      /visible must be true or false/
    );
    expect(message({ op: "rename_object", target: "Box", name: " " })).toMatch(
      /name must be a non-empty string/
    );
    expect(message({ op: "set_material_color", target: "Box" })).toMatch(
      /CSS hex string/
    );
  });

  it("refuses to guess rather than writing a default", () => {
    const file = createModel3DFile();
    applyOperations(file, [parseOperation({ op: "add_object", kind: "box" })]);
    expect(() =>
      applyOperations(file, [parseOperation({ op: "set_visibility", target: "Box" })])
    ).toThrow(/visible must be true or false/);
    expect(listScene(file.json)[0].visible).toBe(true);
  });
});
