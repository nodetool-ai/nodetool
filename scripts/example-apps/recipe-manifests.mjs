import { compileSharedRecipeBundle } from "../recipe-operations.mjs";
import { PRODUCT_PRICE_DROP_BUNDLE } from "./product-price-drop.mjs";

const input = (id, label, kind) => ({id, label, kind, required: true});
const element = (id, kind, role) => ({id: kind === "shape" ? "background" : id, inputId: id, kind, role});
const operations = [{id: "plan", bindingId: "plan", intent: "plan_storyboard", version: 1}, {id: "finish", bindingId: "finish", intent: "finish_storyboard", version: 1}];
const outputs = [{id: "storyboardId", kind: "storyboard"}, {id: "designPreview", kind: "timeline", label: "Composed design preview"}, {id: "timeline", kind: "timeline"}];
const preserve = inputs => inputs.map(({id, kind}) => ({inputId: id, policy: kind === "image" ? "exact_asset" : kind === "color" ? "exact_color" : "exact_text", allowedTransformations: kind === "color" ? ["composite", "opacity"] : ["position", "scale", "opacity", "composite"]}));
const testimonialInputs = [input("portrait", "Customer portrait", "image"), input("quote", "Exact testimonial", "text"), input("attribution", "Customer name", "text"), input("brandColor", "Brand color", "color")];
export const TESTIMONIAL_MANIFEST = {
  schemaVersion: 1, slug: "testimonial-card", inputs: testimonialInputs,
  defaults: {step: "inputs"}, preservationRules: preserve(testimonialInputs),
  mediaPolicy: {defaultStrategy: "still_motion_graphics", allowGeneratedVideo: false},
  creativeStrategy: {objective: "Display an authentic customer quotation", aspectRatio: "4:5", direction: "Give the words room to breathe", shots: [
    {id: "testimonial", title: "The customer's exact words", durationSeconds: 5, elements: [element("brandColor", "shape", "decorative"), element("portrait", "asset", "product"), element("quote", "text", "headline"), element("attribution", "text", "cta")]}
  ]}, operations, outputs
};
const catalogueInputs = [input("firstProduct", "First product", "image"), input("firstName", "First name", "text"), input("secondProduct", "Second product", "image"), input("secondName", "Second name", "text"), input("thirdProduct", "Third product", "image"), input("thirdName", "Third name", "text"), input("brandColor", "Brand color", "color")];
export const CATALOGUE_MANIFEST = {
  schemaVersion: 1, slug: "catalogue-visual-set", inputs: catalogueInputs,
  defaults: {step: "inputs"}, preservationRules: preserve(catalogueInputs),
  mediaPolicy: {defaultStrategy: "still_motion_graphics", allowGeneratedVideo: false},
  creativeStrategy: {objective: "Present a catalogue of original product assets", aspectRatio: "1:1", direction: "Consistent product hierarchy across cards", shots: ["first", "second", "third"].map(id => ({id, title: "Catalogue product " + id, durationSeconds: 2, elements: [element("brandColor", "shape", "decorative"), element(id + "Product", "asset", "product"), element(id + "Name", "text", "headline")]}))},
  presentation: {groups: ["first", "second", "third"].map(id => ({id, title: "Product " + id, inputIds: [id + "Product", id + "Name"]}))}, operations, outputs
};
export const COMPILED_RECIPE_FIXTURES = [
  PRODUCT_PRICE_DROP_BUNDLE,
  compileSharedRecipeBundle(TESTIMONIAL_MANIFEST, "Testimonial Card", "An editable portrait and exact customer quotation. No generated spokesperson."),
  compileSharedRecipeBundle(CATALOGUE_MANIFEST, "Catalogue Visual Set", "Three original product assets in consistent editable product cards.")
];
