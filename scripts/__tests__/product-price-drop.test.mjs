import { readFileSync } from "node:fs";
import { isKnownWidget, parseApplicationBundle } from "@nodetool-ai/app-runtime";
import assert from "node:assert/strict";
import { test } from "vitest";
import { PRODUCT_PRICE_DROP_BUNDLE, PLAN_CODE, FINISH_CODE } from "../example-apps/product-price-drop.mjs";
const input = {productImage: {asset_id: "a".repeat(32)}, logo: {asset_id: "b".repeat(32)}, headline: "  Better coffee  ", oldPrice: "€49", newPrice: "€29", cta: "Shop now", brandColor: "#1248AB", direction: "Bold editorial rhythm"};
const execute = async (code, inputs, capabilities) => {
  const results = {};
  const body = code.replace(/^import .*;\n/, "");
  const fn = new Function("inputs", "output", ...Object.keys(capabilities), `return (async () => {${body}})();`);
  await fn(inputs, async (name, value) => {results[name] = value;}, ...Object.values(capabilities));
  return results;
};
test("normal bundle preserves Recipe metadata and pinned operation mappings", () => {
  const parsed = parseApplicationBundle(PRODUCT_PRICE_DROP_BUNDLE);
  assert.ok(parsed);
  assert.deepEqual(parsed.app.recipe, PRODUCT_PRICE_DROP_BUNDLE.app.recipe);
  assert.equal(parsed.scripts.length, 2);
  assert.ok(parsed.app.ui.content.every(widget => isKnownWidget(widget.type)));
  assert.deepEqual(JSON.parse(readFileSync(new URL("../../packages/base-nodes/nodetool/examples/apps/product-price-drop.app.json", import.meta.url))), PRODUCT_PRICE_DROP_BUNDLE);
  assert.equal(parsed.app.operations[0].inputs.productImage.variableId, "productImage");
  assert.equal(parsed.app.operations[1].target.kind, "script");
});
test("plan retains exact sources and whitespace with graphics-only strategy", async () => {
  let shots = [];
  const edits = [];
  const result = await execute(PLAN_CODE, input, {
    create_storyboard: async () => ({id: "c".repeat(32), shots: 0}),
    get_storyboard: async () => ({id: "c".repeat(32), shots}),
    edit_storyboard: async ({ops}) => {
      edits.push(ops);
      for (const op of ops) {
        if (op.op === "add_shot") shots.push({...op, id: String(shots.length + 1)});
        if (op.op === "update_shot") shots = shots.map(shot => shot.id === op.target ? {...shot, ...op} : shot);
      }
      return {shots, failed: 0, revision: 1};
    }
  });
  assert.equal(shots.length, 2);
  assert.equal(shots[0].graphics.elements.find(element => element.id === "headline").text, input.headline);
  assert.equal(shots[0].production.protected_inputs[0].asset_id, input.productImage.asset_id);
  assert.equal(shots[0].production.media_strategy, "still_motion_graphics");
  assert.equal(result.approval, "pending");
  assert.equal(result.step, "review");
  assert.equal(result.planPreview.shots.length, 2);
  for (const protectedInput of shots[0].production.protected_inputs) assert.deepEqual(protectedInput.allowed_transformations, PRODUCT_PRICE_DROP_BUNDLE.app.recipe.preservationRules.find(rule => rule.inputId === protectedInput.id).allowedTransformations);
  assert.equal(edits[1][0].motion_design.continuities[0].shot_ids.length, 2);
  await execute(PLAN_CODE, {...input, storyboardId: result.storyboardId}, {
    create_storyboard: async () => {throw Error("must reuse");},
    get_storyboard: async () => ({id: result.storyboardId, shots}),
    edit_storyboard: async ({ops}) => {assert.ok(ops.every(op => op.op !== "add_shot")); return {shots, failed: 0, revision: 2};}
  });
});
test("finish rejects stale approval before invoking finishing", async () => {
  const plannedFingerprint = JSON.stringify([...Object.values(input)]);
  let calls = 0;
  const finish_storyboard = async () => {calls++; return {timelineId: "t", timelineRevision: "r", storyboardRevision: 4, validation: {valid: true}};};
  await assert.rejects(execute(FINISH_CODE, {...input, approval: "pending", plannedFingerprint}, {finish_storyboard}), /Approve/);
  await assert.rejects(execute(FINISH_CODE, {...input, newPrice: "€19", approval: "approved", plannedFingerprint}, {finish_storyboard}), /Inputs changed/);
  assert.equal(calls, 0);
  const output = await execute(FINISH_CODE, {...input, approval: "approved", plannedFingerprint, storyboardId: "b", storyboardRevision: "r"}, {finish_storyboard});
  assert.deepEqual(output.timeline, {type: "timeline", id: "t"});
  assert.equal(output.storyboardRevision, 4);
});
test("the shipped Recipe fails closed when protection version or operation references change", () => {
  const future = structuredClone(PRODUCT_PRICE_DROP_BUNDLE);
  future.app.recipe.schemaVersion = 99;
  assert.equal(parseApplicationBundle(future), null);
  const missingVariable = structuredClone(PRODUCT_PRICE_DROP_BUNDLE);
  missingVariable.app.variables = missingVariable.app.variables.filter(variable => variable.id !== "productImage");
  assert.equal(parseApplicationBundle(missingVariable), null);
  const missingOperation = structuredClone(PRODUCT_PRICE_DROP_BUNDLE);
  missingOperation.app.operations = missingOperation.app.operations.filter(operation => operation.id !== "finish");
  assert.equal(parseApplicationBundle(missingOperation), null);
});
