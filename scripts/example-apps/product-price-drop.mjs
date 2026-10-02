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
  operations: [{id: "plan", bindingId: "plan", intent: "plan_storyboard", version: 1}, {id: "finish", bindingId: "finish", intent: "finish_storyboard", version: 1}],
  outputs: [{id: "storyboardId", kind: "storyboard", label: "Storyboard"}, {id: "planPreview", kind: "value", label: "Review the exact planned layers"}, {id: "designPreview", kind: "timeline", label: "Composed design preview"}, {id: "timeline", kind: "timeline", label: "Editable result"}]
};
export const PLAN_CODE = PLAN_STORYBOARD_CODE;
export const FINISH_CODE = FINISH_STORYBOARD_CODE;
export const PRODUCT_PRICE_DROP_BUNDLE = compileSharedRecipeBundle(PRODUCT_PRICE_DROP_MANIFEST, "Product Price Drop", "Build a layered six-second vertical ad using your exact product, logo, prices and copy. No generated video.");
