/**
 * @jest-environment node
 */
import { parseNodeUIProperties, DEFAULT_NODE_WIDTH } from "../nodeUiDefaults";

describe("parseNodeUIProperties", () => {
  it("returns the object unchanged when input is a valid object", () => {
    const input = { position: { x: 10, y: 20 }, width: 300, color: "#ff0" };
    const result = parseNodeUIProperties(input);
    expect(result).toBe(input);
  });

  it("preserves all known properties", () => {
    const input = {
      selected: true,
      selectable: false,
      position: { x: 5, y: 15 },
      width: 200,
      height: 100,
      zIndex: 3,
      title: "My Node",
      color: "#abc",
      collapsed: true,
      bypassed: true,
      model_id: "m-1",
      endpoint_id: "e-1"
    };
    expect(parseNodeUIProperties(input)).toBe(input);
  });

  it("returns default position when input is null", () => {
    expect(parseNodeUIProperties(null)).toEqual({ position: { x: 0, y: 0 } });
  });

  it("returns default position when input is undefined", () => {
    expect(parseNodeUIProperties(undefined)).toEqual({
      position: { x: 0, y: 0 }
    });
  });

  it("returns default position when input is a string", () => {
    expect(parseNodeUIProperties("not an object")).toEqual({
      position: { x: 0, y: 0 }
    });
  });

  it("returns default position when input is a number", () => {
    expect(parseNodeUIProperties(42)).toEqual({
      position: { x: 0, y: 0 }
    });
  });

  it("returns default position when input is a boolean", () => {
    expect(parseNodeUIProperties(true)).toEqual({
      position: { x: 0, y: 0 }
    });
  });

  it("returns default position when input is an array", () => {
    expect(parseNodeUIProperties([1, 2, 3])).toEqual({
      position: { x: 0, y: 0 }
    });
  });

  it("accepts an empty object", () => {
    const input = {};
    expect(parseNodeUIProperties(input)).toBe(input);
  });
});

describe("DEFAULT_NODE_WIDTH", () => {
  it("is 280", () => {
    expect(DEFAULT_NODE_WIDTH).toBe(280);
  });
});
