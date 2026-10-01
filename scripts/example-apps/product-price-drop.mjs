/** A normal Application bundle with two pinned, deterministic JS operations. */
export const PRICE_DROP_INPUTS = [
  ["productImage", "Product image", "image"], ["logo", "Logo", "image"],
  ["headline", "Headline", "text"], ["oldPrice", "Old price", "text"],
  ["newPrice", "New price", "text"], ["cta", "Call to action", "text"],
  ["brandColor", "Brand color", "color"]
];
const preservationRules = PRICE_DROP_INPUTS.map(([inputId, , kind]) => ({inputId, policy: kind === "image" ? "exact_asset" : kind === "color" ? "exact_color" : "exact_text", allowedTransformations: kind === "color" ? ["opacity", "composite"] : ["position", "scale", "opacity", "composite"]}));
const fingerprintCode = `const keys = ["productImage", "logo", "headline", "oldPrice", "newPrice", "cta", "brandColor", "direction"];
const fingerprint = JSON.stringify(keys.map(key => inputs[key]));`;
export const PLAN_CODE = `import { create_storyboard, get_storyboard, edit_storyboard } from "@nodetool-ai/sandbox-nodetool/storyboards";
${fingerprintCode}
for (const key of keys.slice(0, 7)) {
  if (inputs[key] === undefined || inputs[key] === null || (typeof inputs[key] === "string" && !inputs[key].trim())) throw new Error(key + " is required.");
}
const assetId = (value, label) => {
  const id = value.asset_id || (typeof value.uri === "string" && value.uri.startsWith("asset://") ? value.uri.slice(8) : undefined);
  if (!id) throw new Error(label + " must be a stored asset.");
  return id;
};
const product = assetId(inputs.productImage, "Product image");
const logo = assetId(inputs.logo, "Logo");
const board = inputs.storyboardId ? await get_storyboard({storyboard_id: inputs.storyboardId}) : await create_storyboard({name: "Product Price Drop", aspect_ratio: "9:16"});
if (board.error) throw new Error(board.error);
const preservationRules = ${JSON.stringify(preservationRules)};
const allowed = id => preservationRules.find(rule => rule.inputId === id).allowedTransformations;
const protectedInputs = [
  {id: "productImage", kind: "product", asset_id: product, allowed_transformations: allowed("productImage")},
  {id: "logo", kind: "logo", asset_id: logo, allowed_transformations: allowed("logo")},
  ...["headline", "oldPrice", "newPrice", "cta"].map(id => ({id, kind: "exact_text", value: inputs[id], allowed_transformations: allowed(id)})),
  {id: "brandColor", kind: "brand_color", value: inputs.brandColor, allowed_transformations: allowed("brandColor")}
];
const element = (id, kind, role) => ({id: kind === "shape" ? "background" : id, kind, role, protected_input_id: id, ...(id === "oldPrice" ? {direction: "superseded price"} : id === "newPrice" ? {direction: "current price"} : {}), ...(kind === "text" ? {text: inputs[id]} : kind === "asset" ? {asset_id: id === "logo" ? logo : product} : {})});
const production = ids => ({schema_version: 1, media_strategy: "still_motion_graphics", protected_inputs: protectedInputs.filter(input => ids.includes(input.id))});
const shots = [
  {slug: "Hook", action: "Present the original product and exact price drop.", duration_seconds: 3, production: production(["productImage", "headline", "oldPrice", "newPrice", "brandColor"]), graphics: {mode: "graphics_first", direction: inputs.direction || "Bold editorial rhythm", elements: [element("brandColor", "shape", "decorative"), element("productImage", "asset", "product"), element("headline", "text", "headline"), element("oldPrice", "text", "price"), element("newPrice", "text", "price")] }},
  {slug: "CTA", action: "Keep the original product and logo separately editable beside exact CTA.", duration_seconds: 3, production: production(["productImage", "logo", "cta", "brandColor"]), graphics: {mode: "graphics_first", direction: inputs.direction || "Bold editorial rhythm", elements: [element("brandColor", "shape", "decorative"), element("productImage", "asset", "product"), element("logo", "asset", "logo"), element("cta", "text", "cta")] }}
];
const ops = shots.map(shot => {
  const existing = (Array.isArray(board.shots) ? board.shots : []).find(candidate => candidate.slug === shot.slug);
  return existing ? {op: "update_shot", target: existing.id, ...shot} : {op: "add_shot", ...shot};
});
const saved = await edit_storyboard({storyboard_id: board.id, ops});
if (saved.error || saved.failed) throw new Error(saved.error || JSON.stringify(saved.ops));
const ids = saved.shots.map(shot => shot.id);
const directed = await edit_storyboard({storyboard_id: board.id, ops: [{op: "set_board", motion_design: {direction: "One confident visual rhythm across the cut.", transitions: [{from_shot_id: ids[0], to_shot_id: ids[1], direction: "fade"}], continuities: [{id: "background", shot_ids: ids, direction: "continue"}]}}]});
if (directed.error || directed.failed) throw new Error(directed.error || JSON.stringify(directed.ops));
await output("storyboardId", board.id);
await output("storyboardRevision", directed.revision);
await output("plannedFingerprint", fingerprint);
await output("approval", "pending");
await output("planPreview", {shots: shots.map(shot => ({title: shot.slug, duration: shot.duration_seconds, elements: shot.graphics.elements})), motionDesign: "Fade with a continuous brand background"});
await output("step", "review");`;
export const FINISH_CODE = `import { finish_storyboard } from "@nodetool-ai/sandbox-nodetool/storyboards";
${fingerprintCode}
if (inputs.approval !== "approved") throw new Error("Approve the plan before building.");
if (inputs.plannedFingerprint !== fingerprint) throw new Error("Inputs changed after planning. Plan and approve again.");
const result = await finish_storyboard({storyboardId: inputs.storyboardId, expectedStoryboardRevision: inputs.storyboardRevision, ...(inputs.timelineId ? {timelineId: inputs.timelineId, expectedTimelineRevision: inputs.timelineRevision} : {})});
if (result.error) throw new Error(result.error);
await output("timelineId", result.timelineId);
await output("timelineRevision", result.timelineRevision);
await output("timeline", {type: "timeline", id: result.timelineId});
await output("validation", result.validation);
await output("step", "result");`;
const variable = (id, name, type = "str", initial) => ({id, name, type: {type}, scope: "instance", persist: false, ...(initial === undefined ? {} : {default: initial})});
const widget = (type, id, props) => ({type, props: {id, ...props}});
const binding = id => ({from: "variable", variableId: id});
const shared = [...PRICE_DROP_INPUTS.map(([id]) => id), "direction"];
const operation = (id, inputs, outputs) => ({id, name: id === "plan" ? "Plan" : "Build editable ad", workflowId: "", target: {kind: "script", scriptId: id, scriptVersion: 1}, policy: "queue", inputs: Object.fromEntries(inputs.map(key => [key, binding(key)])), outputs: Object.fromEntries(outputs.map(key => [key, {to: "variable", variableId: key}]))});
const script = (key, code, inputs, outputs) => ({key, name: `Price Drop ${key}`, document: {schemaVersion: 1, code, inputs: inputs.map(name => ({name, type: "any"})), outputs: outputs.map(name => ({name, type: "any"})), packages: [], secrets: [], timeoutSeconds: 60, tests: []}});
const planInputs = [...shared, "storyboardId"];
const planOutputs = ["storyboardId", "storyboardRevision", "plannedFingerprint", "approval", "planPreview", "step"]; 
const finishInputs = [...shared, ...planOutputs, "timelineId", "timelineRevision"];
const finishOutputs = ["timelineId", "timelineRevision", "timeline", "validation", "step"];
export const PRODUCT_PRICE_DROP_BUNDLE = {
  schemaVersion: 1, name: "Product Price Drop", description: "Build a layered six-second vertical ad using your exact product, logo, prices and copy. No generated video.", workflows: [],
  scripts: [script("plan", PLAN_CODE, planInputs, planOutputs), script("finish", FINISH_CODE, finishInputs, finishOutputs)],
  app: {
    schemaVersion: 5,
    recipe: {schemaVersion: 1, slug: "product-price-drop", inputs: PRICE_DROP_INPUTS.map(([id, label, kind]) => ({id, label, kind, required: true})), preservationRules, mediaPolicy: {defaultStrategy: "still_motion_graphics", allowGeneratedVideo: false}, operations: [{id: "plan", bindingId: "plan", intent: "plan_storyboard"}, {id: "finish", bindingId: "finish", intent: "finish_storyboard"}], outputs: [{id: "storyboardId", kind: "storyboard"}, {id: "timeline", kind: "timeline"}]},
    variables: [...PRICE_DROP_INPUTS.map(([id, label, kind]) => variable(id, label, kind === "image" ? "image" : "str")), variable("direction", "Creative direction", "str", "Bold editorial rhythm"), variable("step", "Step", "str", "inputs"), ...[...new Set([...planOutputs, ...finishOutputs])].filter(id => id !== "step").map(id => variable(id, id, id === "timeline" ? "timeline" : "str"))],
    operations: [operation("plan", planInputs, planOutputs), operation("finish", finishInputs, finishOutputs)], resources: [],
    ui: {root: {props: {title: "Product Price Drop"}}, content: [
      widget("Stepper", "steps", {binding: "var:step", steps: [{value: "inputs", title: "Inputs"}, {value: "review", title: "Plan and review"}, {value: "result", title: "Editable result"}], allowBack: true}),
      ...PRICE_DROP_INPUTS.map(([id, label, kind]) => widget(kind === "image" ? "ImageInput" : kind === "color" ? "ColorInput" : "TextInput", id, {label, binding: `var:${id}`})),
      widget("ChoiceCards", "direction", {label: "Creative direction", binding: "var:direction", options: [{value: "Bold editorial rhythm", title: "Bold editorial"}, {value: "Quiet premium composition", title: "Quiet premium"}]}),
      widget("Button", "plan", {label: "Plan", disabledWhen: {binding: "op:plan/exec#running", op: "notEmpty"}, events: [{trigger: "click", kind: "run", operationId: "plan"}]}),
      widget("Json", "plan-preview", {label: "Review the exact planned layers", binding: "var:planPreview"}),
      widget("Approval", "approval", {binding: "var:approval", label: "Approve exact sources and copy", description: "Changing any input requires a new plan and approval."}),
      widget("Button", "finish", {label: "Build editable ad", disabledWhen: {binding: "op:finish/exec#running", op: "notEmpty"}, events: [{trigger: "click", kind: "run", operationId: "finish"}]}),
      widget("Timeline", "result", {binding: "var:timeline"}),
      ...["plan", "finish"].map(id => widget("Text", `${id}-error`, {binding: `op:${id}/exec#error`}))
    ]}
  }
};
