/**
 * Validation tests for select-style nodes: SelectInputNode
 * (nodetool.input.SelectInput) and ConstantSelectNode
 * (nodetool.constant.Select) reject a configured value that is not one of the
 * allowed options, while leaving empty/unconfigured cases untouched.
 */

import { describe, it, expect } from "vitest";
import { SelectInputNode } from "../src/nodes/input.js";
import { ConstantSelectNode } from "../src/nodes/constant.js";

describe("SelectInputNode value validation", () => {
  it("returns the value when it is one of the options", async () => {
    const node = new SelectInputNode();
    node.assign({ value: "b", options: ["a", "b", "c"] });
    await expect(node.process()).resolves.toEqual({ output: "b" });
  });

  it("throws when the value is not one of the non-empty options", async () => {
    const node = new SelectInputNode();
    node.assign({ value: "z", options: ["a", "b", "c"] });
    await expect(node.process()).rejects.toThrow(/not one of the allowed options/);
  });

  it("passes through an empty value even with non-empty options", async () => {
    const node = new SelectInputNode();
    node.assign({ value: "", options: ["a", "b", "c"] });
    await expect(node.process()).resolves.toEqual({ output: "" });
  });

  it("returns the value unchanged when options are empty", async () => {
    const node = new SelectInputNode();
    node.assign({ value: "anything", options: [] });
    await expect(node.process()).resolves.toEqual({ output: "anything" });
  });
});

describe("ConstantSelectNode value validation", () => {
  it("returns the value when it is one of the options", async () => {
    const node = new ConstantSelectNode();
    node.assign({ value: "b", options: ["a", "b", "c"] });
    await expect(node.process()).resolves.toEqual({ output: "b" });
  });

  it("throws when the value is not one of the non-empty options", async () => {
    const node = new ConstantSelectNode();
    node.assign({ value: "z", options: ["a", "b", "c"] });
    await expect(node.process()).rejects.toThrow(/not one of the allowed options/);
  });

  it("passes through an empty value even with non-empty options", async () => {
    const node = new ConstantSelectNode();
    node.assign({ value: "", options: ["a", "b", "c"] });
    await expect(node.process()).resolves.toEqual({ output: "" });
  });

  it("returns the value unchanged when options are empty", async () => {
    const node = new ConstantSelectNode();
    node.assign({ value: "anything", options: [] });
    await expect(node.process()).resolves.toEqual({ output: "anything" });
  });
});
