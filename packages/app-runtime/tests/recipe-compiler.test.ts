import { describe, expect, it } from "vitest";
import { compileRecipeApplication, type BoundRecipeOperation } from "../src/recipe-compiler.js";
import { parseApplicationDocument, type RecipeManifest } from "../src/document.js";

const manifest = (): RecipeManifest => ({
  schemaVersion: 1, slug: "quote-card", inputs: [{id: "quote", label: "Exact quote", kind: "text", required: true}],
  preservationRules: [{inputId: "quote", policy: "exact_text"}],
  mediaPolicy: {defaultStrategy: "still_motion_graphics", allowGeneratedVideo: false},
  operations: [{id: "plan", bindingId: "plan", intent: "plan_storyboard", version: 1}],
  outputs: [{id: "storyboard", kind: "storyboard"}]
});
const operation = (): BoundRecipeOperation => ({
  contract: {id: "plan_storyboard", version: 1, inputs: {quote: {type: "str", required: true}}, outputs: {storyboard: {type: "storyboard", required: true}}, spend: "none", sideEffects: [{resource: "storyboard", operations: ["create", "update"]}], preservation: ["exact_text"], mediaStrategies: ["still_motion_graphics"], idempotency: "semantic_upsert", staleness: "input_fingerprint"},
  binding: {id: "plan", name: "Plan quote", workflowId: "", target: {kind: "script", scriptId: "shared-plan", scriptVersion: 2}, policy: "queue", inputs: {quote: {from: "variable", variableId: "quote"}}, outputs: {storyboard: {to: "variable", variableId: "storyboard"}}}
});
const messages = (recipe: unknown, operations = [operation()]): string => {
  const result = compileRecipeApplication(recipe, {operations});
  if (result.status === "ok") throw new Error("Expected compilation failure");
  return result.diagnostics.map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`).join("\n");
};

describe("Recipe compiler", () => {
  it("emits a deterministic normal editable Application and preserves target and contract versions", () => {
    const recipe = manifest(); const bound = operation();
    const original = structuredClone({recipe, bound});
    const result = compileRecipeApplication(recipe, {operations: [bound], title: "Quote card"});
    expect(result.status).toBe("ok");
    expect(result).toEqual(compileRecipeApplication(structuredClone(recipe), {operations: [structuredClone(bound)], title: "Quote card"}));
    if (result.status !== "ok") return;
    expect(parseApplicationDocument(result.document)).toEqual(result.document);
    expect(result.document.ui.content).toContainEqual({type: "TextInput", props: {id: "quote", label: "Exact quote", binding: "var:quote"}});
    expect(result.document.operations[0].target).toEqual({kind: "script", scriptId: "shared-plan", scriptVersion: 2});
    expect(result.document.recipe?.operations[0].version).toBe(1);
    expect({recipe, bound}).toEqual(original);
  });
  it("rejects malformed, absent and unsupported Recipe metadata", () => {
    expect(messages({...manifest(), schemaVersion: 99})).toContain("Unsupported Recipe version 99");
    expect(messages({...manifest(), inputs: [{id: "x", kind: "unknown"}]})).toContain("Malformed");
    expect(messages(undefined)).toContain("missing");
  });
  it("reports a specific unsupported input strategy", () => {
    const value = manifest(); value.inputs[0].kind = "entity";
    expect(messages(value)).toContain("recipe.inputs[0].kind: No supported widget strategy for entity");
  });
  it.each(["asset", "storyboard", "timeline"] as const)("does not emit a ResourcePicker that cannot write the %s variable", (kind) => {
    const value = manifest(); value.inputs[0].kind = kind;
    expect(messages(value)).toContain(`recipe.inputs[0].kind: No supported widget strategy for ${kind}`);
  });
  it("rejects unavailable and ambiguously bound semantic operations", () => {
    const value = manifest(); value.operations[0].version = 9;
    expect(messages(value)).toContain("plan_storyboard@9");
    expect(messages(manifest(), [])).toContain("found 0");
    expect(messages(manifest(), [operation(), operation()])).toContain("found 2");
  });
  it("rejects missing required IO and undeclared mapped ports", () => {
    const bound = operation(); bound.binding.inputs = {};
    expect(messages(manifest(), [bound])).toContain("inputs.quote: Required operation input is unbound");
    const output = operation(); output.binding.outputs = {};
    expect(messages(manifest(), [output])).toContain("outputs.storyboard: Required operation output is unbound");
    const unknown = operation(); unknown.binding.inputs.typo = {from: "constant", value: ""};
    expect(messages(manifest(), [unknown])).toContain("inputs.typo");
  });
  it("rejects mismatched typed ports and constants", () => {
    const bound = operation(); bound.binding.inputs.quote = {from: "constant", value: 1};
    expect(messages(manifest(), [bound])).toContain("Constant must have operation input type str");
    const wrong: BoundRecipeOperation = {...operation(), contract: {...operation().contract, inputs: {quote: {type: "image", required: true}}}};
    expect(messages(manifest(), [wrong])).toContain("conflicting types str and image");
  });
  it("rejects array constants for required dict ports", () => {
    const original = operation();
    const bound: BoundRecipeOperation = {...original, contract: {...original.contract, inputs: {...original.contract.inputs, recipe: {type: "dict", required: true}}}};
    bound.binding.inputs.recipe = {from: "constant", value: []};
    expect(messages(manifest(), [bound])).toContain("inputs.recipe: Constant must have operation input type dict");
  });
  it("validates list constant elements recursively against the declared port", () => {
    const original = operation();
    const bound: BoundRecipeOperation = {...original, contract: {...original.contract, inputs: {...original.contract.inputs, options: {type: "list[dict]", required: true}}}};
    for (const value of [{}, [{valid: true}, []]]) {
      bound.binding.inputs.options = {from: "constant", value};
      expect(messages(manifest(), [bound])).toContain("inputs.options: Constant must have operation input type list[dict]");
    }
    bound.binding.inputs.options = {from: "constant", value: [{valid: true}]};
    expect(compileRecipeApplication(manifest(), {operations: [bound]}).status).toBe("ok");
    const nested: BoundRecipeOperation = {...bound, contract: {...bound.contract, inputs: {...bound.contract.inputs, options: {type: "list[list[dict]]", required: true}}}};
    nested.binding.inputs.options = {from: "constant", value: [[{valid: true}]]};
    expect(compileRecipeApplication(manifest(), {operations: [nested]}).status).toBe("ok");
  });
  it("validates structured state defaults while retaining exact typed values", () => {
    const original = operation();
    const bound: BoundRecipeOperation = {...original, contract: {...original.contract, outputs: {...original.contract.outputs, options: {type: "list[dict]"}}}};
    bound.binding.outputs.options = {to: "variable", variableId: "options"};
    const value = manifest(); value.defaults = {quote: "  €29  ", options: {wrong: "shape"}};
    expect(messages(value, [bound])).toContain("recipe.defaults.options: Default must have variable type list[dict]");
    value.defaults.options = [{label: "  Exact copy  "}];
    const result = compileRecipeApplication(value, {operations: [bound]});
    if (result.status !== "ok") { throw new Error(JSON.stringify(result.diagnostics)); }
    expect(result.document.variables.find(variable => variable.id === "options")?.default).toEqual(value.defaults.options);
    expect(result.document.variables.find(variable => variable.id === "quote")?.default).toBe("  €29  ");
  });
  it("rejects unresolved or unreadable output bindings", () => {
    const value = manifest(); value.outputs[0].binding = "var:missing";
    expect(messages(value)).toContain("unresolved readable binding var:missing");
    const incompatible = manifest(); incompatible.outputs[0].kind = "timeline";
    expect(messages(incompatible)).toContain("recipe.outputs[0]: Timeline output requires a timeline reference");
  });
  it("rejects a required state variable with no earlier producer", () => {
    const bound = operation(); bound.binding.inputs.quote = {from: "variable", variableId: "unproduced"};
    expect(messages(manifest(), [bound])).toContain("Required variable unproduced has no Recipe input, default or operation output producer");
  });
  it("rejects protected truth that has no visible semantic element", () => {
    const value = manifest(); value.creativeStrategy = {shots: [{id: "empty", title: "Empty", durationSeconds: 2, elements: []}]};
    expect(messages(value)).toContain("Protected input quote has no visible semantic element");
  });
  it("fails before execution when media strategy or preservation cannot be guaranteed", () => {
    const noPreservation: BoundRecipeOperation = {...operation(), contract: {...operation().contract, preservation: []}};
    expect(messages(manifest(), [noPreservation])).toContain("cannot guarantee exact_text");
    const value = manifest(); value.mediaPolicy = {defaultStrategy: "generated_video", allowGeneratedVideo: true};
    expect(messages(value)).toContain("does not support generated_video");
    value.mediaPolicy.allowGeneratedVideo = false;
    expect(messages(value)).toContain("Generated video is forbidden");
  });
  it("requires separately invocable approval and declared stale-input behavior for spend", () => {
    const spend: BoundRecipeOperation = {...operation(), contract: {...operation().contract, spend: "generation"}};
    expect(messages(manifest(), [spend])).toContain("Spend operations require");
    const approval: BoundRecipeOperation = {...operation(), contract: {...operation().contract, approvalInput: "approval", staleness: "none"}};
    expect(messages(manifest(), [approval])).toContain("must reject stale");
  });
  it("preserves exact whitespace and validates defaults and choice membership", () => {
    const value = manifest(); value.defaults = {quote: "  €29  "};
    const result = compileRecipeApplication(value, {operations: [operation()]});
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.document.variables[0].default).toBe("  €29  ");
    expect(messages({...value, defaults: {quote: 29}})).toContain("recipe.defaults.quote");
    value.inputs[0].choices = [{value: "a", title: "A"}];
    expect(messages(value)).toContain("Default must name a declared choice");
  });
  it("supports grouped static choices through the existing widget catalog", () => {
    const value = manifest(); value.inputs[0].choices = [{value: "a", title: "A", description: "First", image: "asset://fixture"}];
    value.defaults = {quote: "a"}; value.presentation = {groups: [{id: "copy", title: "Copy", inputIds: ["quote"]}]};
    const result = compileRecipeApplication(value, {operations: [operation()]});
    if (result.status !== "ok") throw new Error(JSON.stringify(result.diagnostics));
    expect(result.document.ui.content[0]).toEqual({type: "Heading", props: {id: "group-copy", text: "Copy", level: "h2"}});
    expect(result.document.ui.content[1]).toEqual({type: "ChoiceCards", props: {id: "quote", label: "Exact quote", binding: "var:quote", options: value.inputs[0].choices}});
    value.presentation.groups[0].inputIds = ["typo"];
    expect(messages(value)).toContain("Unknown input typo");
  });
  it("rejects malformed semantic references and graphic source kind mismatch", () => {
    const value = manifest(); value.creativeStrategy = {shots: [{id: "quote", title: "Quote", durationSeconds: 2, elements: [{id: "quote", inputId: "quote", kind: "asset", role: "product"}]}]};
    expect(messages(value)).toContain("recipe.creativeStrategy.shots[0].elements[0]");
    value.creativeStrategy.shots![0].elements[0].inputId = "missing";
    expect(messages(value)).toContain("Malformed");
  });
  it("requires a concrete pinned target and retains a normal pinned workflow", () => {
    const bound = operation(); bound.binding.target = {kind: "script", scriptId: "", scriptVersion: 0};
    expect(messages(manifest(), [bound])).toContain("pin a positive target version");
    delete bound.binding.target; bound.binding.workflowId = "real-workflow"; bound.binding.workflowVersion = 7;
    const result = compileRecipeApplication(manifest(), {operations: [bound]});
    if (result.status !== "ok") throw new Error(JSON.stringify(result.diagnostics));
    expect(result.document.operations[0].workflowVersion).toBe(7);
  });
});
