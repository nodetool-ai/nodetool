import { assert, describe, expect, it, vi } from "vitest";
import { applyBundle, parseApplicationBundle, compileRecipeApplication } from "@nodetool-ai/app-runtime";
import { applicationDocument } from "@nodetool-ai/protocol/api-schemas/applications.js";
import { bundleTarget, simulateApp } from "@nodetool-ai/execution/app-debug";
import { loadPersistedVariables, savePersistedVariables } from "../../web/src/components/appbuilder/runtime/variablePersistence.ts";
import { COMPILED_RECIPE_FIXTURES, TESTIMONIAL_MANIFEST } from "../example-apps/recipe-manifests.mjs";
import { compileSharedRecipeBundle, sharedRecipeOperations, PLAN_STORYBOARD_CODE, FINISH_STORYBOARD_CODE } from "../recipe-operations.mjs";

import { buildProductPriceDropBundle, PLAN_CODE, FINISH_CODE, PRODUCT_PRICE_DROP_DEBUG_INTERACTIONS } from "../example-apps/product-price-drop.mjs";

const execute = async (code, inputs, capabilities) => {
  const outputs = {};
  const body = code.replace(/^import .*;\n/gm, "");
  const run = new Function("inputs", "output", ...Object.keys(capabilities), `return (async () => {${body}})();`);
  await run(inputs, async (id, value) => {outputs[id] = value;}, ...Object.values(capabilities));
  return outputs;
};
const values = recipe => Object.fromEntries(recipe.inputs.map(input => [input.id, input.kind === "image" ? {asset_id: input.id.padEnd(32, "a")} : input.kind === "color" ? "#1248AB" : "  Exact " + input.id + "  "]));
const plan = async (recipe, extra = {}, code = PLAN_STORYBOARD_CODE) => {
  let shots = []; let revision = 0;
  const inputs = {...values(recipe), recipe, ...extra};
  const outputs = await execute(code, inputs, {
    get_entity: async ({entity_id}) => ({entity: {id: entity_id, reference_images: [{asset_id: entity_id}]}}),
    preview_storyboard_design: async () => ({linkedScriptFingerprint: "approved-script", timeline: {type: "timeline", data: {durationMs: 6000, tracks: [], clips: []}}}),
    create_storyboard: async () => ({id: "board", shots: []}),
    edit_storyboard: async ({ops}) => {
      for (const op of ops) {
        if (op.op === "add_shot") shots.push({...op, id: "shot-" + shots.length});
        if (op.op === "update_shot") shots = shots.map(shot => shot.id === op.target ? {...shot, ...op} : shot);
      }
      return {shots: shots.map(({id, slug, action}) => ({id, slug, action})), failed: 0, revision: ++revision};
    }
  });
  return {inputs, outputs, shots};
};

describe("shared executable Recipe operations", () => {
  it("exposes the Price Drop finishing model and binds it to planning and finishing", () => {
    const bundle = COMPILED_RECIPE_FIXTURES[0];
    expect(bundle.app.ui.content).toContainEqual(expect.objectContaining({
      type: "ModelSelect", props: expect.objectContaining({binding: "var:finishModel", modelKind: "language_model"})
    }));
    for (const operation of bundle.app.operations) {
      expect(operation.inputs.finishModel).toEqual({from: "variable", variableId: "finishModel"});
    }
  });
  it("uses the chosen Price Drop model and rejects a model changed after approval", async () => {
    const bundle = COMPILED_RECIPE_FIXTURES[0];
    const finishModel = {type: "language_model", provider: "anthropic", id: "chosen-model", name: "Chosen"};
    const planned = await plan(bundle.app.recipe, {finishModel}, PLAN_CODE);
    let invoked;
    const capability = {
      get_storyboard: async () => ({revision: 2}),
      finish_storyboard: async args => {invoked = args; return {timelineId: "t", timelineRevision: 1, storyboardRevision: 2, validation: []};}
    };
    const inputs = {...planned.inputs, ...planned.outputs, finishModel, recipeOperationId: "finish", approval: "approved", finishStrategy: "agentic"};
    await execute(FINISH_CODE, structuredClone(inputs), capability);
    expect(invoked).toMatchObject({strategy: "agentic", model: {provider: "anthropic", id: "chosen-model"}});
    invoked = undefined;
    await expect(execute(FINISH_CODE, {...structuredClone(inputs), finishModel: {...finishModel, id: "changed"}}, capability)).rejects.toThrow("Inputs changed");
    expect(invoked).toBeUndefined();
    await expect(execute(PLAN_CODE, {...planned.inputs, finishModel: {provider: "", id: ""}}, {})).rejects.toThrow("Select a finishing model");
  });
  it("compiles three materially different manifests deterministically with standard Application bindings", () => {
    expect(COMPILED_RECIPE_FIXTURES.map(bundle => bundle.app.recipe.creativeStrategy.shots.length)).toEqual([2, 1, 3]);
    for (const bundle of COMPILED_RECIPE_FIXTURES) {
      const regenerated = bundle.app.recipe.slug === "product-price-drop" ? buildProductPriceDropBundle() : compileSharedRecipeBundle(bundle.app.recipe, bundle.name, bundle.description);
      expect(regenerated).toEqual(bundle);
      expect(applicationDocument.safeParse(bundle.app).success).toBe(true);
      expect(applicationDocument.parse(bundle.app).recipe).toEqual(bundle.app.recipe);
      expect(parseApplicationBundle(bundle)).not.toBeNull();
      expect(bundle.scripts[0].document.code).toBe(bundle.app.recipe.slug === "product-price-drop" ? PLAN_CODE : PLAN_STORYBOARD_CODE);
      expect(bundle.scripts[1].document.code).toBe(bundle.app.recipe.slug === "product-price-drop" ? FINISH_CODE : FINISH_STORYBOARD_CODE);
      expect(bundle.scripts.every(script => script.document.inputs.every(port => port.type !== "any"))).toBe(true);
      const approvalIndex = bundle.app.ui.content.findIndex(widget =>
        widget.type === "Approval" ||
        (widget.type === "Button" && widget.props.id === "finish" &&
          widget.props.events.some(event => event.kind === "setVariable" && event.key === "var:approval" && event.value === "approved"))
      );
      expect(approvalIndex).toBeGreaterThanOrEqual(0);
      const planIndex = bundle.app.ui.content.findIndex(widget => widget.type === "Button" && widget.props.id === "plan");
      const reviewIndex = bundle.app.ui.content.findIndex(widget => widget.type === "Storyboard" && widget.props.binding === "var:storyboardId");
      expect(planIndex).toBeLessThan(reviewIndex); expect(reviewIndex).toBeLessThan(approvalIndex);
      const designIndex = bundle.app.ui.content.findIndex(widget => widget.type === "Timeline" && widget.props.binding === "var:designPreview");
      expect(designIndex).toBeGreaterThan(planIndex); expect(designIndex).toBeLessThan(approvalIndex);
    }
  });
  it("passes the real app-debug no-run binding validator for every emitted bundle", async () => {
    for (const raw of COMPILED_RECIPE_FIXTURES) {
      const bundle = parseApplicationBundle(raw); assert(bundle);
      const report = await simulateApp(bundleTarget(bundle, bundle.app.recipe.slug), {run: false, params: {"var:approval": "approved"}, ...(bundle.app.recipe.slug === "product-price-drop" ? {interact: PRODUCT_PRICE_DROP_DEBUG_INTERACTIONS} : {})}, {runOnServer: async () => {throw new Error("Must not execute during compilation validation");}, runScript: async () => {throw new Error("Must not execute a script during static validation");}});
      expect(report.validation.errors).toEqual([]);
      expect(report.verdict.ok).toBe(true);
    }
  });
  it("validates a compiled explicit workflow target through the normal app-debug binding path", async () => {
    const recipe = {schemaVersion: 1, slug: "pinned-quote", inputs: [{id: "quote", label: "Quote", kind: "text", required: true}], operations: [{id: "plan", bindingId: "plan", intent: "quote"}], outputs: [{id: "result", kind: "value"}]};
    const contract = {id: "quote", version: 1, inputs: {quote: {type: "str", required: true}}, outputs: {result: {type: "str", required: true}}, spend: "none", sideEffects: [], preservation: [], mediaStrategies: [], idempotency: "read_only", staleness: "none"};
    const binding = {id: "plan", name: "Quote", workflowId: "", target: {kind: "workflow", workflowId: "pinned-workflow", workflowVersion: 7}, inputs: {quote: {from: "variable", variableId: "quote"}}, outputs: {result: {to: "variable", variableId: "result"}}, policy: "replace"};
    const compiled = compileRecipeApplication(recipe, {operations: [{contract, binding}]});
    assert(compiled.status === "ok");
    expect(compiled.document.operations[0].workflowId).toBe("pinned-workflow");
    expect(compiled.document.operations[0].workflowVersion).toBe(7);
    const bundle = parseApplicationBundle({schemaVersion: 1, name: "Pinned quote", description: "", app: compiled.document, scripts: [], workflows: [{key: "pinned-workflow", name: "Quote", version: 7, graph: {nodes: [{id: "quote", type: "nodetool.input.StringInput", properties: {name: "quote"}}, {id: "result", type: "nodetool.output.StringOutput", properties: {name: "result"}}], edges: []}}]});
    assert(bundle);
    const dependencies = {runOnServer: async () => {throw new Error("Static validation must not execute");}};
    const report = await simulateApp(bundleTarget(bundle, "pinned-quote"), {run: false}, dependencies);
    expect(report.validation.errors).toEqual([]);
    expect(report.verdict.ok).toBe(true);
    const broken = structuredClone(bundle);
    broken.app.operations[0].workflowId = "missing-workflow";
    const invalid = await simulateApp(bundleTarget(broken, "broken-pinned-quote"), {run: false}, dependencies);
    expect(invalid.validation.errors.length).toBeGreaterThan(0);
    expect(invalid.verdict.ok).toBe(false);
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
      expect(outputs.planPreview.shots[0].elements).toEqual(shots[0].graphics.elements);
      expect(outputs.plannedFingerprint).toBe(JSON.stringify([recipe, ...recipe.inputs.map(input => inputs[input.id])]));
    }
  });
  it("adopts edited direction without rewriting the board and preserves it on copy changes", async () => {
    const planned = await plan(TESTIMONIAL_MANIFEST);
    const shots = structuredClone(planned.shots);
    shots[0].graphics.direction = "My edited art direction";
    const board = {id: "board", aspect_ratio: TESTIMONIAL_MANIFEST.creativeStrategy.aspectRatio, revision: 9, shots, motion_design: {direction: "My motion"}};
    let writes = 0;
    const capabilities = {
      get_storyboard: async () => board,
      get_entity: async ({entity_id}) => ({entity: {reference_images: [{asset_id: entity_id}]}}),
      preview_storyboard_design: async () => ({timeline: {type: "timeline", data: {clips: []}}}),
      edit_storyboard: async ({ops}) => {
        writes++;
        for (const op of ops) {
          if (op.op === "update_shot") Object.assign(shots.find(shot => shot.id === op.target), op);
          if (op.op === "set_board") board.motion_design = op.motion_design;
        }
        return {...board, revision: ++board.revision};
      }
    };
    const adopted = await execute(PLAN_STORYBOARD_CODE, {...planned.inputs, ...planned.outputs}, capabilities);
    expect(writes).toBe(0);
    expect(adopted.storyboardRevision).toBe(9);
    expect(adopted.approval).toBe("pending");
    expect(adopted.planPreview.motionDesign).toBe("My motion");
    await execute(PLAN_STORYBOARD_CODE, {...planned.inputs, ...adopted, quote: "Updated exact quote", brandColor: "#FFFFFF"}, capabilities);
    expect(shots[0].graphics.direction).toBe("My edited art direction");
    expect(board.motion_design.direction).toBe("My motion");
    expect(shots[0].production.protected_inputs.find(input => input.id === "brandColor").value).toBe("#FFFFFF");
    expect(shots[0].graphics.elements.find(element => element.kind === "text" && element.role === "quote")?.text ?? shots[0].graphics.elements.find(element => element.id === "quote")?.text).toBe("Updated exact quote");
  });
  it("rejects an edited hybrid strategy before refresh or input reconciliation", async () => {
    const planned = await plan(TESTIMONIAL_MANIFEST);
    planned.shots[0].production.media_strategy = "hybrid";
    const capabilities = {
      get_entity: async ({entity_id}) => ({entity: {reference_images: [{asset_id: entity_id}]}}),
      get_storyboard: async () => ({id: "board", aspect_ratio: TESTIMONIAL_MANIFEST.creativeStrategy.aspectRatio, revision: 2, shots: planned.shots})
    };
    for (const change of [{}, {quote: "New copy"}]) {
      await expect(execute(PLAN_STORYBOARD_CODE, {...planned.inputs, ...planned.outputs, ...change}, capabilities)).rejects.toThrow("media strategy conflict");
    }
  });
  it("refuses to adopt an existing board whose bound copy differs without a checkpoint", async () => {
    const planned = await plan(TESTIMONIAL_MANIFEST);
    const capabilities = {
      get_entity: async ({entity_id}) => ({entity: {reference_images: [{asset_id: entity_id}]}}),
      get_storyboard: async () => ({id: "board", aspect_ratio: TESTIMONIAL_MANIFEST.creativeStrategy.aspectRatio, revision: 2, shots: planned.shots}),
      preview_storyboard_design: async () => ({timeline: {type: "timeline", data: {clips: []}}})
    };
    await expect(execute(PLAN_STORYBOARD_CODE, {...planned.inputs, storyboardId: "board", quote: "Unreviewed different quote"}, capabilities)).rejects.toThrow("bound source conflict");
  });
  it("persists recipe checkpoints while keeping design preview pixels transient", () => {
    const bundle = compileSharedRecipeBundle(TESTIMONIAL_MANIFEST, "Resume", "");
    for (const id of ["quote", "storyboardId", "storyboardRevision", "timelineId", "timelineRevision", "approval", "plannedFingerprint", "timeline"]) {
      expect(bundle.app.variables.find(variable => variable.id === id)).toMatchObject({scope: "user", persist: true});
    }
    expect(bundle.app.variables.find(variable => variable.id === "designPreview")).toMatchObject({scope: "instance", persist: false});
  });
  it("resumes the same approved board through browser persistence and rejects a changed revision", async () => {
    const recipe = TESTIMONIAL_MANIFEST;
    const {inputs, outputs} = await plan(recipe);
    const bundle = compileSharedRecipeBundle(recipe, "Resume", "");
    const storage = new Map();
    vi.stubGlobal("window", {localStorage: {getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value)}});
    try {
      savePersistedVariables("application:resume", bundle.app.variables, {...inputs, ...outputs, approval: "approved"});
      const resumed = loadPersistedVariables("application:resume", bundle.app.variables);
      expect(resumed.storyboardId).toBe(outputs.storyboardId);
      expect(resumed.quote).toBe(inputs.quote);
      let calls = 0;
      const capabilities = {
        get_storyboard: async () => ({revision: outputs.storyboardRevision}),
        finish_storyboard: async () => { calls++; return {status: "unreviewed_draft", timelineId: "same-timeline", timelineRevision: 1, storyboardRevision: 3, validation: []}; }
      };
      const finished = await execute(FINISH_STORYBOARD_CODE, {...resumed, recipe, recipeOperationId: "finish"}, capabilities);
      expect(finished.finishStatus).toBe("Unreviewed editable draft");
      savePersistedVariables("application:resume", bundle.app.variables, {...resumed, ...finished});
      expect(loadPersistedVariables("application:resume", bundle.app.variables).timeline).toEqual({type: "timeline", id: "same-timeline"});
      capabilities.get_storyboard = async () => ({revision: outputs.storyboardRevision + 1});
      await expect(execute(FINISH_STORYBOARD_CODE, {...resumed, recipe, recipeOperationId: "finish"}, capabilities)).rejects.toThrow("Refresh and approve");
      expect(calls).toBe(1);
    } finally {
      vi.unstubAllGlobals();
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
    const capability = {get_storyboard: async () => ({revision: 2}), finish_storyboard: async () => {calls++; return {timelineId: "timeline", timelineRevision: 1, storyboardRevision: 2, validation: {valid: true}};}};
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
    const capability = {get_storyboard: async () => ({revision: 2}), finish_storyboard: async args => {invoked = args; return {timelineId: "t", timelineRevision: 1, storyboardRevision: 2, validation: []};}};
    await execute(FINISH_STORYBOARD_CODE, inputs, capability);
    expect(invoked.expectedLinkedScriptFingerprint).toBe("approved-script");
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
