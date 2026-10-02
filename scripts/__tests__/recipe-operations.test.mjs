import { assert, describe, expect, it } from "vitest";
import { applyBundle, parseApplicationBundle } from "@nodetool-ai/app-runtime";
import { applicationDocument } from "@nodetool-ai/protocol/api-schemas/applications.js";
import { bundleTarget, simulateApp } from "@nodetool-ai/execution/app-debug";
import { COMPILED_RECIPE_FIXTURES, TESTIMONIAL_MANIFEST } from "../example-apps/recipe-manifests.mjs";
import { compileSharedRecipeBundle, sharedRecipeOperations, PLAN_STORYBOARD_CODE, FINISH_STORYBOARD_CODE } from "../recipe-operations.mjs";

const execute = async (code, inputs, capabilities) => {
  const outputs = {};
  const body = code.replace(/^import .*;\n/gm, "");
  const run = new Function("inputs", "output", ...Object.keys(capabilities), `return (async () => {${body}})();`);
  await run(inputs, async (id, value) => {outputs[id] = value;}, ...Object.values(capabilities));
  return outputs;
};
const values = recipe => Object.fromEntries(recipe.inputs.map(input => [input.id, input.kind === "image" ? {asset_id: input.id.padEnd(32, "a")} : input.kind === "color" ? "#1248AB" : "  Exact " + input.id + "  "]));
const plan = async (recipe, extra = {}) => {
  let shots = []; let revision = 0;
  const inputs = {...values(recipe), recipe, ...extra};
  const outputs = await execute(PLAN_STORYBOARD_CODE, inputs, {
    get_entity: async ({entity_id}) => ({entity: {id: entity_id, reference_images: [{asset_id: entity_id}]}}),
    preview_storyboard_design: async () => ({timeline: {type: "timeline", data: {durationMs: 6000, tracks: [], clips: []}}}),
    create_storyboard: async () => ({id: "board", shots: []}),
    edit_storyboard: async ({ops}) => {
      for (const op of ops) {
        if (op.op === "add_shot") shots.push({...op, id: "shot-" + shots.length});
        if (op.op === "update_shot") shots = shots.map(shot => shot.id === op.target ? {...shot, ...op} : shot);
      }
      return {shots, failed: 0, revision: ++revision};
    }
  });
  return {inputs, outputs, shots};
};

describe("shared executable Recipe operations", () => {
  it("compiles three materially different manifests deterministically with no authored UI", () => {
    expect(COMPILED_RECIPE_FIXTURES.map(bundle => bundle.app.recipe.creativeStrategy.shots.length)).toEqual([2, 1, 3]);
    for (const bundle of COMPILED_RECIPE_FIXTURES) {
      const regenerated = compileSharedRecipeBundle(bundle.app.recipe, bundle.name, bundle.description);
      expect(regenerated).toEqual(bundle);
      expect(applicationDocument.safeParse(bundle.app).success).toBe(true);
      expect(applicationDocument.parse(bundle.app).recipe).toEqual(bundle.app.recipe);
      expect(parseApplicationBundle(bundle)).not.toBeNull();
      expect(bundle.scripts[0].document.code).toBe(PLAN_STORYBOARD_CODE);
      expect(bundle.scripts[1].document.code).toBe(FINISH_STORYBOARD_CODE);
      expect(bundle.scripts.every(script => script.document.inputs.every(port => port.type !== "any"))).toBe(true);
      expect(bundle.app.ui.content.some(widget => widget.type === "Approval")).toBe(true);
      const planIndex = bundle.app.ui.content.findIndex(widget => widget.type === "Button" && widget.props.id === "plan");
      const reviewIndex = bundle.app.ui.content.findIndex(widget => widget.props.id === "output-planPreview");
      const approvalIndex = bundle.app.ui.content.findIndex(widget => widget.type === "Approval");
      expect(planIndex).toBeLessThan(reviewIndex); expect(reviewIndex).toBeLessThan(approvalIndex);
      const designIndex = bundle.app.ui.content.findIndex(widget => widget.type === "Timeline" && widget.props.binding === "var:designPreview");
      expect(designIndex).toBeGreaterThan(planIndex); expect(designIndex).toBeLessThan(approvalIndex);
    }
  });
  it("passes the real app-debug no-run binding validator for every emitted bundle", async () => {
    for (const raw of COMPILED_RECIPE_FIXTURES) {
      const bundle = parseApplicationBundle(raw); assert(bundle);
      const report = await simulateApp(bundleTarget(bundle, bundle.app.recipe.slug), {run: false}, {runOnServer: async () => {throw new Error("Must not execute during compilation validation");}, runScript: async () => {throw new Error("Must not execute a script during static validation");}});
      expect(report.validation.errors).toEqual([]);
      expect(report.verdict.ok).toBe(true);
    }
  });
  it("normal bundle installation preserves concrete pins and semantic contract versions", async () => {
    const source = COMPILED_RECIPE_FIXTURES[0];
    const installed = applyBundle(source, {newScriptId: script => "installed-" + script.key});
    expect(installed.app.document.recipe.operations.map(operation => operation.version)).toEqual([1, 1]);
    expect(installed.app.document.operations.map(operation => operation.target.scriptVersion)).toEqual([1, 1]);
  });
  it("declares all actual resource writes and keeps planning before any spend", () => {
    const {operations} = sharedRecipeOperations(TESTIMONIAL_MANIFEST);
    expect(operations[0].contract.sideEffects).toEqual([{resource: "asset", operations: ["update"]}, {resource: "storyboard", operations: ["create", "update"]}]);
    expect(operations[1].contract.sideEffects.map(effect => effect.resource)).toEqual(["timeline", "storyboard"]);
    expect(operations.every(operation => operation.contract.spend === "none")).toBe(true);
    expect(operations[1].contract.approvalInput).toBe("approval");
  });
  it("plans different creative structures with the same implementation and exact source truth", async () => {
    for (const bundle of COMPILED_RECIPE_FIXTURES) {
      const recipe = bundle.app.recipe;
      const {inputs, outputs, shots} = await plan(recipe);
      expect(shots).toHaveLength(recipe.creativeStrategy.shots.length);
      for (const shot of shots) {
        expect(shot.production.media_strategy).toBe("still_motion_graphics");
        for (const graphic of shot.graphics.elements) {
          const intent = recipe.creativeStrategy.shots.find(intent => intent.id === shot.slug).elements.find(element => element.id === graphic.id);
          if (graphic.kind === "asset") expect(graphic.asset_id).toBe(inputs[intent.inputId].asset_id);
          if (graphic.kind === "text") expect(graphic.text).toBe(inputs[intent.inputId]);
        }
      }
      expect(outputs.approval).toBe("pending");
      expect(outputs.plannedFingerprint).toBe(JSON.stringify([recipe, ...recipe.inputs.map(input => inputs[input.id])]));
    }
  });
  it("fails before resource writes if policy or protected sources are invalid", async () => {
    let writes = 0;
    const capabilities = {create_storyboard: async () => {writes++;}};
    const inputs = {...values(TESTIMONIAL_MANIFEST), recipe: {...TESTIMONIAL_MANIFEST, mediaPolicy: {defaultStrategy: "generated_video"}}};
    await expect(execute(PLAN_STORYBOARD_CODE, inputs, capabilities)).rejects.toThrow("still motion graphics");
    await expect(execute(PLAN_STORYBOARD_CODE, {...inputs, recipe: TESTIMONIAL_MANIFEST, portrait: {uri: "https://foreign/product.png"}}, capabilities)).rejects.toThrow("stored asset");
    expect(writes).toBe(0);
  });
  it("invalidates approval for copy, asset or manifest-policy changes before finish dispatch", async () => {
    const {inputs, outputs} = await plan(TESTIMONIAL_MANIFEST);
    let calls = 0;
    const capability = {finish_storyboard: async () => {calls++; return {timelineId: "timeline", timelineRevision: 1, storyboardRevision: 2, validation: {valid: true}};}};
    const approved = {...inputs, ...outputs, approval: "approved", recipeOperationId: "finish"};
    await expect(execute(FINISH_STORYBOARD_CODE, {...approved, quote: "changed"}, capability)).rejects.toThrow("Inputs changed");
    await expect(execute(FINISH_STORYBOARD_CODE, {...approved, portrait: {asset_id: "replacement"}}, capability)).rejects.toThrow("Inputs changed");
    await expect(execute(FINISH_STORYBOARD_CODE, {...approved, recipe: {...TESTIMONIAL_MANIFEST, preservationRules: []}}, capability)).rejects.toThrow("Inputs changed");
    expect(calls).toBe(0);
    expect((await execute(FINISH_STORYBOARD_CODE, approved, capability)).timeline).toEqual({type: "timeline", id: "timeline"});
    expect(calls).toBe(1);
  });
  it("does not claim unsupported semantic operation versions or reserved source ports", () => {
    const unknown = structuredClone(TESTIMONIAL_MANIFEST); unknown.operations[0].version = 7;
    expect(() => compileSharedRecipeBundle(unknown, "Unknown", "")).toThrow("plan_storyboard@7");
    const reserved = structuredClone(TESTIMONIAL_MANIFEST); reserved.inputs[0].id = "approval";
    reserved.preservationRules[0].inputId = "approval";
    reserved.creativeStrategy.shots[0].elements.find(element => element.inputId === "portrait").inputId = "approval";
    expect(() => sharedRecipeOperations(reserved)).toThrow("reserved shared-operation state port");
  });
  it("requires explicit agentic provider/model and forwards its normal constant binding", async () => {
    const recipe = structuredClone(TESTIMONIAL_MANIFEST);
    recipe.operations[1].strategy = "agentic";
    expect(() => compileSharedRecipeBundle(recipe, "Agentic", "")).toThrow("model: agentic Application finishing requires");
    recipe.operations[1].model = {provider: "openai", id: "fixture-model"};
    const bundle = compileSharedRecipeBundle(recipe, "Agentic", "");
    expect(applicationDocument.parse(bundle.app).recipe.operations[1].model).toEqual(recipe.operations[1].model);
    const {operations} = sharedRecipeOperations(recipe);
    expect(operations[1].contract.spend).toBe("model");
    expect(bundle.app.operations[1].inputs.finishModel).toEqual({from: "constant", value: recipe.operations[1].model});
    expect(bundle.scripts[1].document.timeoutSeconds).toBe(120);
    const planned = await plan(recipe);
    let invoked;
    const inputs = {...planned.inputs, ...planned.outputs, recipeOperationId: "finish", approval: "approved", finishStrategy: "agentic", finishModel: recipe.operations[1].model};
    const capability = {finish_storyboard: async args => {invoked = args; return {timelineId: "t", timelineRevision: 1, storyboardRevision: 2, validation: []};}};
    await execute(FINISH_STORYBOARD_CODE, inputs, capability);
    expect(invoked.strategy).toBe("agentic"); expect(invoked.model).toEqual(recipe.operations[1].model);
    invoked = undefined;
    await expect(execute(FINISH_STORYBOARD_CODE, {...inputs, finishStrategy: undefined}, capability)).rejects.toThrow("explicitly bound");
    await expect(execute(FINISH_STORYBOARD_CODE, {...inputs, finishModel: {provider: "other", id: "other"}}, capability)).rejects.toThrow("approved provider and model");
    expect(invoked).toBeUndefined();
  });
  it("reuses canonical entities without overwriting their metadata or redirecting exact sources", async () => {
    const recipe = COMPILED_RECIPE_FIXTURES[0].app.recipe;
    const inputs = {...values(recipe), recipe}; let writes = 0;
    const created = new Map();
    let shots = [];
    const capabilities = {
      get_entity: async ({entity_id}) => {if (!created.has(entity_id)) throw new Error("SandboxCapabilityError: get_entity: Entity " + entity_id + " was not found."); return {entity: created.get(entity_id)};},
      get_asset: async ({asset_id}) => ({id: asset_id}),
      create_entity: async ({asset_id}) => {writes++; created.set(asset_id, {id: asset_id, reference_images: [{asset_id}]}); return {entity_id: asset_id};},
      create_storyboard: async () => ({id: "board", shots: []}),
      get_storyboard: async () => ({id: "board", aspect_ratio: "9:16", shots}),
      edit_storyboard: async ({ops}) => {
        for (const op of ops) if (op.op === "add_shot") shots.push({...op, id: "shot-" + shots.length});
        return {shots, revision: 1};
      },
      preview_storyboard_design: async () => ({timeline: {type: "timeline", data: {durationMs: 6000, tracks: [], clips: []}}})
    };
    await execute(PLAN_STORYBOARD_CODE, inputs, capabilities);
    expect(writes).toBe(2);
    expect(shots[0].graphics.elements.find(element => element.role === "product").entity_id).toBe(inputs.productImage.asset_id);
    expect(shots[0].production.protected_inputs.find(input => input.id === "productImage").entity_id).toBe(inputs.productImage.asset_id);
    await execute(PLAN_STORYBOARD_CODE, {...inputs, storyboardId: "board"}, capabilities);
    expect(writes).toBe(2); expect(shots).toHaveLength(2);
    const compact = inputs.productImage.asset_id.slice(0, 12);
    created.set(inputs.productImage.asset_id, {id: compact, reference_images: [{asset_id: compact}]});
    capabilities.get_asset = async ({asset_id}) => ({id: asset_id === compact ? inputs.productImage.asset_id : asset_id});
    await execute(PLAN_STORYBOARD_CODE, {...inputs, storyboardId: "board"}, capabilities);
    expect(writes).toBe(2);
    capabilities.get_asset = async ({asset_id}) => {if (asset_id === compact) throw new Error("short id matches more than one row"); return {id: asset_id};};
    await expect(execute(PLAN_STORYBOARD_CODE, inputs, capabilities)).rejects.toThrow("more than one row");
    capabilities.get_asset = async ({asset_id}) => ({id: asset_id});
    created.set(inputs.productImage.asset_id, {id: inputs.productImage.asset_id, reference_images: [{asset_id: "replacement"}]});
    await expect(execute(PLAN_STORYBOARD_CODE, inputs, capabilities)).rejects.toThrow("entity no longer points");
    expect(writes).toBe(2);
  });
  it("rejects missing runtime strategy and shot intent at compilation", () => {
    const absentPolicy = structuredClone(TESTIMONIAL_MANIFEST); delete absentPolicy.mediaPolicy;
    expect(() => compileSharedRecipeBundle(absentPolicy, "Invalid", "")).toThrow("recipe.mediaPolicy.defaultStrategy");
    const absentShots = structuredClone(TESTIMONIAL_MANIFEST); delete absentShots.creativeStrategy;
    expect(() => compileSharedRecipeBundle(absentShots, "Invalid", "")).toThrow("recipe.creativeStrategy.shots");
  });
  it("returns an explicit conflict instead of retaining removed or incorrectly ordered recipe shots", async () => {
    const original = COMPILED_RECIPE_FIXTURES[0].app.recipe;
    const planned = await plan(original); let writes = 0;
    const capabilities = {
      get_entity: async ({entity_id}) => ({entity: {id: entity_id, reference_images: [{asset_id: entity_id}]}}),
      get_storyboard: async () => ({id: "board", aspect_ratio: "9:16", shots: planned.shots}),
      edit_storyboard: async () => {writes++; throw new Error("Must not edit a structurally different board");}
    };
    const reordered = structuredClone(original); reordered.creativeStrategy.shots.reverse();
    await expect(execute(PLAN_STORYBOARD_CODE, {...planned.inputs, recipe: reordered, storyboardId: "board"}, capabilities)).rejects.toThrow("shot structure differs");
    const removed = structuredClone(original); removed.creativeStrategy.shots.pop();
    await expect(execute(PLAN_STORYBOARD_CODE, {...planned.inputs, recipe: removed, storyboardId: "board"}, capabilities)).rejects.toThrow("shot structure differs");
    const reshaped = structuredClone(original); reshaped.creativeStrategy.aspectRatio = "1:1";
    await expect(execute(PLAN_STORYBOARD_CODE, {...planned.inputs, recipe: reshaped, storyboardId: "board"}, capabilities)).rejects.toThrow("aspect ratio differs");
    expect(writes).toBe(0);
  });
});
