/**
 * Barrel export coverage for @nodetool/node-sdk index.ts
 */
import { describe, it, expect } from "vitest";
import {
  BaseNode,
  NodeRegistry,
  register,
  loadPythonPackageMetadata,
  Passthrough,
  Add,
  Multiply,
  Constant,
  StringConcat,
  FormatText,
  ThresholdProcessor,
  ErrorNode,
  SlowNode,
  StreamingCounter,
  IntAccumulator,
  ALL_TEST_NODES
} from "../src/index.js";

describe("@nodetool/node-sdk barrel exports", () => {
  it("exports BaseNode", () => {
    expect(BaseNode).toBeDefined();
  });

  it("exports NodeRegistry and register", () => {
    expect(NodeRegistry).toBeDefined();
    expect(register).toBeDefined();
    expect(typeof register).toBe("function");
  });

  it("exports loadPythonPackageMetadata", () => {
    expect(loadPythonPackageMetadata).toBeDefined();
    expect(typeof loadPythonPackageMetadata).toBe("function");
  });

  it("exports all test node classes", () => {
    expect(Passthrough).toBeDefined();
    expect(Add).toBeDefined();
    expect(Multiply).toBeDefined();
    expect(Constant).toBeDefined();
    expect(StringConcat).toBeDefined();
    expect(FormatText).toBeDefined();
    expect(ThresholdProcessor).toBeDefined();
    expect(ErrorNode).toBeDefined();
    expect(SlowNode).toBeDefined();
    expect(StreamingCounter).toBeDefined();
    expect(IntAccumulator).toBeDefined();
  });

  it("exports ALL_TEST_NODES array", () => {
    expect(ALL_TEST_NODES).toBeDefined();
    expect(ALL_TEST_NODES).toHaveLength(11);
  });
});
