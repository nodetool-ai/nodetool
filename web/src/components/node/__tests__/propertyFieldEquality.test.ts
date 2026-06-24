/**
 * @jest-environment node
 */
import { isFieldRelevantDataEqual } from "../propertyFieldEquality";
import type { NodeData } from "../../../stores/NodeData";

function makeData(overrides: Partial<NodeData> = {}): NodeData {
  return {
    properties: {},
    dynamic_properties: {},
    selectable: true,
    workflow_id: "w1",
    ...overrides
  } as NodeData;
}

describe("isFieldRelevantDataEqual", () => {
  it("returns true for referentially identical objects", () => {
    const data = makeData();
    expect(isFieldRelevantDataEqual(data, data, false)).toBe(true);
    expect(isFieldRelevantDataEqual(data, data, true)).toBe(true);
    expect(isFieldRelevantDataEqual(data, data, undefined)).toBe(true);
  });

  it("returns false when workflow_id differs", () => {
    const prev = makeData({ workflow_id: "w1" });
    const next = makeData({ workflow_id: "w2" });
    expect(isFieldRelevantDataEqual(prev, next, false)).toBe(false);
  });

  it("returns true when workflow_id matches and not dynamic", () => {
    const prev = makeData({ properties: { a: 1 } });
    const next = makeData({ properties: { a: 2 } });
    expect(isFieldRelevantDataEqual(prev, next, false)).toBe(true);
  });

  it("returns true when dynamic_properties is the same reference", () => {
    const dp = { x: 10 };
    const prev = makeData({ dynamic_properties: dp });
    const next = makeData({ dynamic_properties: dp });
    expect(isFieldRelevantDataEqual(prev, next, true)).toBe(true);
  });

  it("returns false when isDynamic and dynamic_properties reference differs", () => {
    const prev = makeData({ dynamic_properties: { x: 10 } });
    const next = makeData({ dynamic_properties: { x: 10 } });
    expect(isFieldRelevantDataEqual(prev, next, true)).toBe(false);
  });

  it("ignores dynamic_properties difference when isDynamicProperty is false", () => {
    const prev = makeData({ dynamic_properties: { x: 1 } });
    const next = makeData({ dynamic_properties: { x: 2 } });
    expect(isFieldRelevantDataEqual(prev, next, false)).toBe(true);
  });

  it("ignores dynamic_properties difference when isDynamicProperty is undefined", () => {
    const prev = makeData({ dynamic_properties: { x: 1 } });
    const next = makeData({ dynamic_properties: { x: 2 } });
    expect(isFieldRelevantDataEqual(prev, next, undefined)).toBe(true);
  });

  it("checks workflow_id before dynamic_properties", () => {
    const prev = makeData({ workflow_id: "w1", dynamic_properties: { a: 1 } });
    const next = makeData({ workflow_id: "w2", dynamic_properties: { a: 1 } });
    expect(isFieldRelevantDataEqual(prev, next, true)).toBe(false);
  });

  it("ignores unrelated property changes (collapsed, title, etc.)", () => {
    const prev = makeData({ collapsed: true, title: "A" });
    const next = makeData({ collapsed: false, title: "B" });
    expect(isFieldRelevantDataEqual(prev, next, false)).toBe(true);
  });
});
