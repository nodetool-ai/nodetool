import { describe, expect, it } from "vitest";
import { applyBundle, parseApplicationBundle, type ApplicationBundle } from "../src/bundle.js";
const bundle = (): ApplicationBundle => ({
  schemaVersion: 1, name: "Recipe", description: "", workflows: [],
  scripts: [{key: "plan", name: "Plan", version: 1, document: {schemaVersion: 1, code: "", inputs: [{name: "price", type: "str"}], outputs: [{name: "timeline", type: "str"}]}}],
  app: {schemaVersion: 5, ui: {root: {}, content: []}, resources: [], variables: ["price", "timeline"].map(id => ({id, name: id, type: {type: "str"}, scope: "instance", persist: false})),
    operations: [{id: "plan", name: "Plan", workflowId: "", target: {kind: "script", scriptId: "plan", scriptVersion: 1}, policy: "replace", inputs: {price: {from: "variable", variableId: "price"}}, outputs: {timeline: {to: "variable", variableId: "timeline"}}}],
    recipe: {schemaVersion: 1, slug: "test", inputs: [{id: "price", label: "Price", kind: "text", required: true}], operations: [{id: "plan", bindingId: "plan", intent: "plan"}], outputs: [{id: "timeline", kind: "timeline"}]}}
});
describe("Recipe executable bundle dependencies", () => {
  it("accepts a complete script-only Recipe", () => {expect(parseApplicationBundle(bundle())).not.toBeNull();});
  it("rejects missing scripts before import", () => {
    const value = bundle(); value.scripts = [];
    expect(parseApplicationBundle(value)).toBeNull();
    expect(() => applyBundle(value)).toThrow(/missing bundled script/);
  });
  it("rejects absent pinned versions", () => {
    const value = bundle(); const target = value.app.operations[0].target;
    if (!target || target.kind !== "script") throw new Error("Fixture target missing");
    target.scriptVersion = 99;
    expect(parseApplicationBundle(value)).toBeNull();
  });
  it("rejects nonexistent mapped script ports", () => {
    const value = bundle(); value.app.operations[0].inputs = {missing: {from: "variable", variableId: "price"}};
    expect(parseApplicationBundle(value)).toBeNull();
    const output = bundle(); output.app.operations[0].outputs = {missing: {to: "variable", variableId: "timeline"}};
    expect(parseApplicationBundle(output)).toBeNull();
  });
  it("rejects incompatible typed Recipe script inputs but accepts any ports", () => {
    const value = bundle(); value.scripts[0].document.inputs[0].type = "image";
    expect(parseApplicationBundle(value)).toBeNull();
    value.scripts[0].document.inputs[0].type = "any";
    expect(parseApplicationBundle(value)).not.toBeNull();
  });
  it("preserves ordinary legacy bundle behavior", () => {
    const value = bundle(); delete value.app.recipe; value.scripts = [];
    expect(parseApplicationBundle(value)).not.toBeNull();
  });
});
