import { describe, expect, it } from "vitest";
import { applicationDocument } from "../src/api-schemas/applications.js";

const document = () => ({
  schemaVersion: 5, ui: { root: {}, content: [] },
  variables: [{ id: "price", name: "Price", scope: "instance", persist: false }],
  operations: [{ id: "finish", name: "Finish", workflowId: "wf", policy: "replace", inputs: { price: { from: "variable", variableId: "price" } }, outputs: { timeline: { to: "display" } } }],
  recipe: { schemaVersion: 1, slug: "price-drop", inputs: [{ id: "price", label: "Price", kind: "text", required: true }], operations: [{ id: "finish", bindingId: "finish", intent: "finish_storyboard" }], outputs: [{ id: "timeline", kind: "timeline", binding: "op:finish/out:timeline" }] }
});
describe("Recipe Application API validation", () => {
  it("keeps executable Recipe references and output bindings", () => {
    expect(applicationDocument.parse(document()).recipe?.outputs[0].binding).toBe("op:finish/out:timeline");
  });
  it("rejects missing input variables, operation references and output bindings", () => {
    const missingVariable = document(); missingVariable.variables = [];
    expect(applicationDocument.safeParse(missingVariable).success).toBe(false);
    const missingOperation = document(); missingOperation.recipe.operations[0].bindingId = "missing";
    expect(applicationDocument.safeParse(missingOperation).success).toBe(false);
    const missingOutput = document(); missingOutput.recipe.outputs[0].binding = "op:finish/out:missing";
    expect(applicationDocument.safeParse(missingOutput).success).toBe(false);
  });
  it("rejects future Recipe and Application versions", () => {
    const future = document(); future.recipe.schemaVersion = 2;
    expect(applicationDocument.safeParse(future).success).toBe(false);
    expect(applicationDocument.safeParse({ ...document(), schemaVersion: 99 }).success).toBe(false);
  });
  it("retains ordinary legacy Application compatibility", () => {
    expect(applicationDocument.parse({ schemaVersion: 3, ui: { root: {}, content: [] } }).schemaVersion).toBe(3);
  });
});
