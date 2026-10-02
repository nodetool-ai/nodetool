import { compileRecipeApplication, inspectRecipeManifest, parseApplicationBundle, recipeInputType } from "@nodetool-ai/app-runtime";

/** Shared deterministic Storyboard planning. Variation is semantic manifest data. */
export const PLAN_STORYBOARD_CODE = `import { create_storyboard, get_storyboard, edit_storyboard, preview_storyboard_design } from "@nodetool-ai/sandbox-nodetool/storyboards";
import { get_timeline } from "@nodetool-ai/sandbox-nodetool/timelines";
import { get_entity, create_entity } from "@nodetool-ai/sandbox-nodetool/entities";
const recipe = inputs.recipe;
if (recipe.mediaPolicy?.defaultStrategy !== "still_motion_graphics" || !recipe.creativeStrategy?.shots?.length) throw new Error("This operation requires still motion graphics shot intent.");
const keys = recipe.inputs.map(input => input.id);
const fingerprint = JSON.stringify([recipe, ...keys.map(key => inputs[key])]);
for (const input of recipe.inputs) {
  const value = inputs[input.id];
  if (input.required && (value === undefined || value === null || (typeof value === "string" && !value.trim()))) throw new Error(input.id + " is required.");
}
const assetId = (value, label) => {
  const id = value?.asset_id || (typeof value?.uri === "string" && value.uri.startsWith("asset://") ? value.uri.slice(8) : undefined);
  if (!id) throw new Error(label + " must be a stored asset.");
  return id;
};
const sourceEntities = {};
for (const input of recipe.inputs) {
  const role = recipe.creativeStrategy.shots.flatMap(shot => shot.elements).find(element => element.inputId === input.id)?.role;
  if (input.kind !== "image" || (role !== "product" && role !== "logo")) continue;
  const id = assetId(inputs[input.id], input.label);
  const existing = await get_entity({entity_id: id});
  if (existing.entity) {
    if (existing.entity.reference_images?.[0]?.asset_id !== id) throw new Error(input.label + " entity no longer points to the selected exact asset.");
    sourceEntities[input.id] = existing.entity.id;
  } else {
    const created = await create_entity({asset_id: id, kind: "prop", name: input.label, descriptor: "The original uploaded " + role + " asset. Preserve its exact source identity."});
    if (created.error || !created.entity_id) throw new Error(created.error || "Source entity was not created.");
    sourceEntities[input.id] = created.entity_id;
  }
}
const protectedInputs = (recipe.preservationRules || []).map(rule => {
  const value = inputs[rule.inputId];
  const input = recipe.inputs.find(candidate => candidate.id === rule.inputId);
  const role = recipe.creativeStrategy.shots.flatMap(shot => shot.elements).find(element => element.inputId === rule.inputId)?.role;
  const common = {id: rule.inputId, allowed_transformations: rule.allowedTransformations || []};
  if (rule.policy === "exact_asset") return {...common, kind: role === "logo" ? "logo" : role === "product" ? "product" : "source_asset", asset_id: assetId(value, input.label), ...(sourceEntities[rule.inputId] ? {entity_id: sourceEntities[rule.inputId]} : {})};
  const text = rule.policy === "exact_color" && value?.type === "color" ? value.value : value;
  if (typeof text !== "string" || !text.trim()) throw new Error(rule.inputId + " must be an exact non-empty value.");
  return {...common, kind: rule.policy === "exact_color" ? "brand_color" : "exact_text", value: text};
});
const shots = recipe.creativeStrategy.shots.map(intent => {
  const ids = intent.elements.map(element => element.inputId);
  return {slug: intent.id, action: intent.title, duration_seconds: intent.durationSeconds,
    production: {schema_version: 1, media_strategy: "still_motion_graphics", protected_inputs: protectedInputs.filter(input => ids.includes(input.id))},
    graphics: {mode: "graphics_first", direction: inputs.direction || recipe.creativeStrategy.direction || "Clear editorial composition", elements: intent.elements.map(element => ({id: element.id, kind: element.kind, role: element.role, ...(protectedInputs.some(input => input.id === element.inputId) ? {protected_input_id: element.inputId} : {}), ...(sourceEntities[element.inputId] ? {entity_id: sourceEntities[element.inputId]} : {}), ...(element.direction ? {direction: element.direction} : {}), ...(element.kind === "text" ? {text: inputs[element.inputId]} : element.kind === "asset" ? {asset_id: assetId(inputs[element.inputId], element.inputId)} : {})}))}
  };
});
const board = inputs.storyboardId ? await get_storyboard({storyboard_id: inputs.storyboardId}) : await create_storyboard({name: recipe.slug, aspect_ratio: recipe.creativeStrategy.aspectRatio || "9:16"});
if (board.error) throw new Error(board.error);
if (board.timeline_id) {
  const linked = await get_timeline({timeline_id: board.timeline_id});
  if (linked.error) throw new Error(linked.error);
  await output("timelineId", linked.timeline.id);
  await output("timelineRevision", linked.revision);
}
const existingShots = Array.isArray(board.shots) ? board.shots : [];
if (existingShots.length && JSON.stringify(existingShots.map(shot => shot.slug)) !== JSON.stringify(shots.map(shot => shot.slug))) throw new Error("Storyboard shot structure differs from this Recipe. Start a new plan without storyboardId or explicitly reconcile the board before planning.");
const ops = shots.map(shot => {
  const existing = existingShots.find(candidate => candidate.slug === shot.slug);
  return existing ? {op: "update_shot", target: existing.id, ...shot} : {op: "add_shot", ...shot};
});
const saved = await edit_storyboard({storyboard_id: board.id, ops});
if (saved.error || saved.failed) throw new Error(saved.error || JSON.stringify(saved.ops));
const ids = shots.map(shot => saved.shots.find(savedShot => savedShot.slug === shot.slug)?.id);
if (ids.some(id => !id)) throw new Error("Planned shot identity was not returned.");
const backgrounds = recipe.creativeStrategy.shots.map(shot => shot.elements.find(element => element.kind === "shape")?.id);
const continuity = backgrounds[0] && backgrounds.every(id => id === backgrounds[0]) ? [{id: backgrounds[0], shot_ids: ids, direction: "continue"}] : [];
const motion = {direction: recipe.creativeStrategy.direction || "One consistent editorial rhythm", transitions: ids.slice(1).map((id, index) => ({from_shot_id: ids[index], to_shot_id: id, direction: "fade"})), continuities: continuity};
const directed = await edit_storyboard({storyboard_id: board.id, ops: [{op: "set_board", motion_design: motion}]});
if (directed.error || directed.failed) throw new Error(directed.error || JSON.stringify(directed.ops));
const preview = await preview_storyboard_design({storyboardId: board.id, expectedStoryboardRevision: directed.revision});
if (preview.error) throw new Error(preview.error);
await output("designPreview", preview.timeline);
await output("storyboardId", board.id);
await output("storyboardRevision", directed.revision);
await output("plannedFingerprint", fingerprint);
await output("approval", "pending");
await output("planPreview", {shots: shots.map(shot => ({title: shot.action, duration: shot.duration_seconds, elements: shot.graphics.elements})), motionDesign: motion.direction});
await output("step", "review");`;

export const FINISH_STORYBOARD_CODE = `import { finish_storyboard } from "@nodetool-ai/sandbox-nodetool/storyboards";
const fingerprint = JSON.stringify([inputs.recipe, ...inputs.recipe.inputs.map(input => inputs[input.id])]);
if (inputs.approval !== "approved") throw new Error("Approve the plan before building.");
if (inputs.plannedFingerprint !== fingerprint) throw new Error("Inputs changed after planning. Plan and approve again.");
const declaredOperation = inputs.recipe.operations.find(operation => operation.id === inputs.recipeOperationId);
if (!declaredOperation || declaredOperation.intent !== "finish_storyboard") throw new Error("Finishing operation is absent from the approved Recipe.");
const declaredStrategy = declaredOperation.strategy || "deterministic";
if (inputs.finishStrategy !== undefined && inputs.finishStrategy !== declaredStrategy) throw new Error("Finish strategy differs from the approved Recipe.");
if (declaredStrategy === "agentic" && inputs.finishStrategy !== "agentic") throw new Error("Agentic strategy must be explicitly bound.");
if (declaredStrategy === "agentic" && (!inputs.finishModel || JSON.stringify(inputs.finishModel) !== JSON.stringify(declaredOperation.model))) throw new Error("Agentic finishing requires the approved provider and model.");
if (inputs.finishModel !== undefined && JSON.stringify(inputs.finishModel) !== JSON.stringify(declaredOperation.model)) throw new Error("Finish model differs from the approved Recipe.");
const result = await finish_storyboard({storyboardId: inputs.storyboardId, expectedStoryboardRevision: inputs.storyboardRevision, ...(inputs.finishStrategy ? {strategy: inputs.finishStrategy} : {}), ...(inputs.finishModel ? {model: inputs.finishModel} : {}), ...(inputs.timelineId ? {timelineId: inputs.timelineId, expectedTimelineRevision: inputs.timelineRevision} : {})});
if (result.error) throw new Error(result.error);
await output("timelineId", result.timelineId);
await output("timelineRevision", result.timelineRevision);
await output("storyboardRevision", result.storyboardRevision);
await output("timeline", {type: "timeline", id: result.timelineId});
await output("validation", result.validation);
await output("step", "result");`;

const statePorts = {
  storyboardId: {type: "str"}, storyboardRevision: {type: "int"},
  timelineId: {type: "str"}, timelineRevision: {type: "int"},
  plannedFingerprint: {type: "str"}, approval: {type: "str"}, planPreview: {type: "dict"}, designPreview: {type: "timeline"}, step: {type: "str"}
};
const preservation = ["exact_asset", "exact_text", "exact_color"];

/** The fixed shared production operations specialize only their typed Recipe input ports. */
export const sharedRecipeOperations = recipe => {
  const inspected = inspectRecipeManifest(recipe);
  if (inspected.status !== "valid") throw new Error(inspected.status === "unsupported" ? "recipe.schemaVersion: unsupported Recipe version " + inspected.schemaVersion : "recipe: malformed Recipe manifest");
  recipe = inspected.manifest;
  if (recipe.mediaPolicy?.defaultStrategy !== "still_motion_graphics") throw new Error("recipe.mediaPolicy.defaultStrategy: shared planning requires explicit still_motion_graphics policy");
  if (!recipe.creativeStrategy?.shots?.length) throw new Error("recipe.creativeStrategy.shots: shared planning requires semantic shot intent");
  const reserved = new Set(["recipe", "recipeOperationId", "finishStrategy", "finishModel", ...Object.keys(statePorts), "timeline", "validation"]);
  for (const input of recipe.inputs) if (reserved.has(input.id)) throw new Error(`recipe.inputs.${input.id}: reserved shared-operation state port`);
  for (const shot of recipe.creativeStrategy?.shots ?? []) for (const element of shot.elements) {
    const policy = element.kind === "asset" ? "exact_asset" : element.kind === "shape" ? "exact_color" : "exact_text";
    if (!recipe.preservationRules?.some(rule => rule.inputId === element.inputId && rule.policy === policy)) throw new Error(`recipe.creativeStrategy.shots.${shot.id}.${element.id}: shared planning requires ${policy} source preservation`);
  }
  const sourcePorts = Object.fromEntries(recipe.inputs.map(input => [input.id, {type: recipeInputType(input.kind), required: input.required}]));
  const plan = {
    id: "plan_storyboard", version: 1,
    inputs: {recipe: {type: "dict", required: true}, ...sourcePorts, storyboardId: statePorts.storyboardId},
    outputs: Object.fromEntries(Object.entries(statePorts).map(([id, port]) => [id, {...port, required: !id.startsWith("timeline")} ])),
    spend: "none", sideEffects: [{resource: "asset", operations: ["update"]}, {resource: "storyboard", operations: ["create", "update"]}],
    preservation, mediaStrategies: ["still_motion_graphics"], idempotency: "semantic_upsert", staleness: "input_fingerprint"
  };
  const finish = {
    id: "finish_storyboard", version: 1,
    inputs: {recipe: {type: "dict", required: true}, recipeOperationId: {type: "str", required: true}, ...sourcePorts, finishStrategy: {type: "str"}, finishModel: {type: "dict"}, storyboardId: {type: "str", required: true}, storyboardRevision: {type: "int", required: true}, timelineId: statePorts.timelineId, timelineRevision: statePorts.timelineRevision, approval: {type: "str", required: true}, plannedFingerprint: {type: "str", required: true}},
    outputs: {timelineId: {type: "str", required: true}, timelineRevision: {type: "int", required: true}, storyboardRevision: {type: "int", required: true}, timeline: {type: "timeline", required: true}, validation: {type: "list[dict]", required: true}, step: {type: "str", required: true}},
    spend: "none", sideEffects: [{resource: "timeline", operations: ["create", "update"]}, {resource: "storyboard", operations: ["update"]}],
    preservation, mediaStrategies: ["still_motion_graphics"], idempotency: "revision_checked", staleness: "resource_revision", approvalInput: "approval"
  };
  const contracts = [plan, finish];
  const codes = {plan_storyboard: PLAN_STORYBOARD_CODE, finish_storyboard: FINISH_STORYBOARD_CODE};
  const names = {plan_storyboard: "Plan", finish_storyboard: "Build editable ad"};
  const operations = [];
  const scripts = [];
  for (const spec of recipe.operations) {
    const contract = contracts.find(candidate => candidate.id === spec.intent && candidate.version === (spec.version ?? 1));
    if (!contract) continue;
    if (spec.strategy !== undefined && spec.intent !== "finish_storyboard") throw new Error(`recipe.operations.${spec.id}.strategy: shared planning does not support a finishing strategy`);
    if (spec.strategy === "agentic" && !spec.model) throw new Error(`recipe.operations.${spec.id}.model: agentic Application finishing requires an explicit provider and model ID`);
    if (spec.model && spec.strategy !== "agentic") throw new Error(`recipe.operations.${spec.id}.model: model requires explicit agentic finishing strategy`);
    const selectedContract = {...contract, spend: spec.strategy === "agentic" ? "model" : contract.spend};
    const inputs = Object.fromEntries(Object.keys(contract.inputs).filter(id => id !== "finishStrategy" && id !== "finishModel").map(id => [id, id === "recipe" ? {from: "constant", value: recipe} : id === "recipeOperationId" ? {from: "constant", value: spec.id} : {from: "variable", variableId: id}]));
    if (spec.strategy) inputs.finishStrategy = {from: "constant", value: spec.strategy};
    if (spec.model) inputs.finishModel = {from: "constant", value: spec.model};
    const outputs = Object.fromEntries(Object.keys(contract.outputs).map(id => [id, {to: "variable", variableId: id}]));
    const scriptId = `${contract.id}-v${contract.version}`;
    operations.push({contract: selectedContract, binding: {id: spec.bindingId, name: names[spec.intent], workflowId: "", target: {kind: "script", scriptId, scriptVersion: 1}, policy: "queue", inputs, outputs}});
    const existingScript = scripts.find(script => script.key === scriptId);
    const timeoutSeconds = spec.strategy === "agentic" ? 120 : 60;
    if (existingScript) existingScript.document.timeoutSeconds = Math.max(existingScript.document.timeoutSeconds, timeoutSeconds);
    else scripts.push({key: scriptId, name: names[spec.intent], version: 1, document: {schemaVersion: 1, code: codes[spec.intent], inputs: Object.entries(contract.inputs).map(([name, port]) => ({name, type: port.type})), outputs: Object.entries(contract.outputs).map(([name, port]) => ({name, type: port.type})), packages: [], secrets: [], timeoutSeconds, tests: []}});
  }
  return {operations, scripts};
};

export const compileSharedRecipeBundle = (recipe, name, description) => {
  const shared = sharedRecipeOperations(recipe);
  const result = compileRecipeApplication(recipe, {operations: shared.operations, title: name});
  if (result.status !== "ok") throw new Error(result.diagnostics.map(error => `${error.path}: ${error.message}`).join("\n"));
  const bundle = {schemaVersion: 1, name, description, app: result.document, workflows: [], scripts: shared.scripts};
  if (!parseApplicationBundle(bundle)) throw new Error("Compiled Recipe failed executable bundle validation.");
  return bundle;
};
