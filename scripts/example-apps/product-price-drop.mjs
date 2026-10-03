import { compileSharedRecipeBundle, PLAN_STORYBOARD_CODE, FINISH_STORYBOARD_CODE } from "../recipe-operations.mjs";

export const PRICE_DROP_INPUTS = [
  ["productImage", "Product image", "image"], ["logo", "Logo", "image"],
  ["headline", "Headline", "text"], ["oldPrice", "Old price", "text"],
  ["newPrice", "New price", "text"], ["cta", "Call to action", "text"],
  ["brandColor", "Brand color", "color"]
];
const element = (inputId, kind, role, direction) => ({id: kind === "shape" ? "background" : inputId, inputId, kind, role, ...(direction ? {direction} : {})});
export const PRODUCT_PRICE_DROP_MANIFEST = {
  schemaVersion: 1, slug: "product-price-drop",
  inputs: [...PRICE_DROP_INPUTS.map(([id, label, kind]) => ({id, label, kind, required: true})), {id: "direction", label: "Creative direction", kind: "text", required: false, choices: [{value: "Bold editorial rhythm", title: "Bold editorial"}, {value: "Quiet premium composition", title: "Quiet premium"}]}],
  defaults: {direction: "Bold editorial rhythm", step: "inputs"},
  preservationRules: PRICE_DROP_INPUTS.map(([inputId, , kind]) => ({inputId, policy: kind === "image" ? "exact_asset" : kind === "color" ? "exact_color" : "exact_text", allowedTransformations: kind === "color" ? ["opacity", "composite"] : ["position", "scale", "opacity", "composite"]})),
  mediaPolicy: {defaultStrategy: "still_motion_graphics", allowGeneratedVideo: false},
  creativeStrategy: {objective: "Present the original product and exact price drop", direction: "One confident visual rhythm across the cut", shots: [
    {id: "Hook", title: "Present the original product and exact price drop", durationSeconds: 3, elements: [element("brandColor", "shape", "decorative"), element("productImage", "asset", "product"), element("headline", "text", "headline"), element("oldPrice", "text", "price", "superseded price"), element("newPrice", "text", "price", "current price")]},
    {id: "CTA", title: "Keep the original product and logo beside the exact CTA", durationSeconds: 3, elements: [element("brandColor", "shape", "decorative"), element("productImage", "asset", "product"), element("logo", "asset", "logo"), element("cta", "text", "cta")]}
  ]},
  presentation: {groups: [{id: "brand", title: "Product and brand", inputIds: ["productImage", "logo", "brandColor"]}, {id: "copy", title: "Exact copy", inputIds: ["headline", "oldPrice", "newPrice", "cta"]}]},
  operations: [{id: "plan", bindingId: "plan", intent: "plan_storyboard", version: 1}, {id: "finish", bindingId: "finish", intent: "finish_storyboard", version: 1, strategy: "agentic", model: {provider: "openai", id: "gpt-5.4-mini"}}],
  outputs: [{id: "storyboardId", kind: "storyboard", label: "Storyboard"}, {id: "designPreview", kind: "timeline", label: "Composed design preview"}, {id: "timeline", kind: "timeline", label: "Editable result"}]
};
const SELECTED_MODEL_CODE = `const selectedModel = inputs.finishModel;
if (!selectedModel?.provider?.trim() || !selectedModel?.id?.trim()) throw new Error("Select a finishing model before planning.");
inputs.finishModel = {provider: selectedModel.provider, id: selectedModel.id};
inputs.recipe = {...inputs.recipe, operations: inputs.recipe.operations.map(operation => operation.intent === "finish_storyboard" ? {...operation, model: inputs.finishModel} : operation)};
`;
export const PLAN_CODE = SELECTED_MODEL_CODE + PLAN_STORYBOARD_CODE;
export const FINISH_CODE = SELECTED_MODEL_CODE + FINISH_STORYBOARD_CODE;
export const buildProductPriceDropBundle = () => {
  const bundle = compileSharedRecipeBundle(PRODUCT_PRICE_DROP_MANIFEST, "Product Price Drop", "Build a layered six-second vertical ad using your exact product, logo, prices and copy. No generated video.");
  bundle.app.variables.push({id: "finishModel", name: "Finishing model", type: {type: "dict"}, scope: "user", persist: true, default: {type: "language_model", provider: "", id: "", name: ""}});
  bundle.app.ui.content.splice(1, 0,
    {type: "ModelSelect", props: {id: "finishModel", label: "Finishing model", binding: "var:finishModel", modelKind: "language_model", events: [{trigger: "change", kind: "setVariable", key: "var:approval", value: "pending"}]}},
    {type: "Text", props: {id: "finishModel-help", text: "The selected language model finishes the editable cut. No generated video."}}
  );
  for (const operation of bundle.app.operations) {
    operation.inputs.finishModel = {from: "variable", variableId: "finishModel"};
  }
  for (const script of bundle.scripts) {
    script.document.code = script.key === "plan_storyboard-v1" ? PLAN_CODE : FINISH_CODE;
    if (!script.document.inputs.some(port => port.name === "finishModel")) {
      script.document.inputs.push({name: "finishModel", type: "dict"});
    }
  }
  return bundle;
};
export const PRODUCT_PRICE_DROP_BUNDLE = buildProductPriceDropBundle();
