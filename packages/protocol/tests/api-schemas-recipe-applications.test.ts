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
  it("rejects ambiguous duplicate preservation declarations", () => {
    const value = document();
    const recipe = { ...value.recipe, preservationRules: [{ inputId: "price", policy: "exact_text" }, { inputId: "price", policy: "exact_text" }] };
    expect(applicationDocument.safeParse({ ...value, recipe }).success).toBe(false);
  });
  it("retains ordinary legacy Application compatibility", () => {
    expect(applicationDocument.parse({ schemaVersion: 3, ui: { root: {}, content: [] } }).schemaVersion).toBe(3);
  });
  it("round-trips compiler choices, semantic shot intent and pinned agentic operation configuration", () => {
    const value = document();
    const recipe = {...value.recipe,
      inputs: [{...value.recipe.inputs[0], choices: [{value: "€29", title: "Price", image: "asset://preview"}]}],
      creativeStrategy: {aspectRatio: "4:5", shots: [{id: "hook", title: "Hook", durationSeconds: 3, elements: [{id: "price", inputId: "price", kind: "text", role: "price"}]}]},
      operations: [{...value.recipe.operations[0], version: 2, strategy: "agentic", model: {provider: "openai", id: "fixture-model"}}]
    };
    expect(applicationDocument.parse({...value, recipe}).recipe).toEqual(recipe);
  });
  it("rejects duplicate choices, invalid source references and unsupported authoring configuration", () => {
    const value = document();
    const choices = {...value.recipe, inputs: [{...value.recipe.inputs[0], choices: [{value: "same", title: "A"}, {value: "same", title: "B"}]}]};
    expect(applicationDocument.safeParse({...value, recipe: choices}).success).toBe(false);
    const creativeStrategy = {shots: [{id: "hook", title: "Hook", durationSeconds: 3, elements: [{id: "price", inputId: "missing", kind: "text", role: "price"}]}]};
    expect(applicationDocument.safeParse({...value, recipe: {...value.recipe, creativeStrategy}}).success).toBe(false);
    expect(applicationDocument.safeParse({...value, recipe: {...value.recipe, operations: [{...value.recipe.operations[0], strategy: "unknown"}]}}).success).toBe(false);
  });
  it("accepts a template-owned shape only with a fill or stroke style", () => {
    const value = document();
    const withShape = (element: Record<string, unknown>) => ({...value, recipe: {...value.recipe, creativeStrategy: {shots: [{id: "hook", title: "Hook", durationSeconds: 3, elements: [{id: "price", inputId: "price", kind: "text", role: "price"}, element]}]}}});
    expect(applicationDocument.safeParse(withShape({id: "panel", kind: "shape", role: "decorative", style: {fill: "#FFFFFF", cornerRadius: 0.03}})).success).toBe(true);
    expect(applicationDocument.safeParse(withShape({id: "panel", kind: "shape", role: "decorative"})).success).toBe(false);
    expect(applicationDocument.safeParse(withShape({id: "panel", kind: "text", role: "decorative", style: {fill: "#FFFFFF"}})).success).toBe(false);
    expect(applicationDocument.safeParse(withShape({id: "panel", kind: "shape", role: "decorative", style: {fill: "white"}})).success).toBe(false);
  });
});
