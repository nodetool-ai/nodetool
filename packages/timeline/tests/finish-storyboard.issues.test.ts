import { describe, expect, it } from "vitest";
import type { Shot } from "@nodetool-ai/protocol";
import { materializeStoryboard, validateProducedTimeline } from "../src/finish-storyboard.js";

const shot = (): Shot => ({
  type: "shot", id: "hook", index: 0, action: "Price drop", status: "planned", duration_seconds: 4,
  production: { media_strategy: "still_motion_graphics", protected_inputs: [
    { id: "product", kind: "product", asset_id: "product-asset", allowed_transformations: ["position", "scale", "opacity", "composite"] },
    { id: "price", kind: "exact_text", value: "€29", allowed_transformations: ["position", "opacity"] },
    { id: "brand", kind: "brand_color", value: "#0033AA", allowed_transformations: [] }
  ] },
  graphics: { mode: "graphics_first", elements: [
    { id: "background", kind: "shape", protected_input_id: "brand" },
    { id: "product", kind: "asset", role: "product", protected_input_id: "product" },
    { id: "price", kind: "text", role: "price", protected_input_id: "price", text: "€29" }
  ] }
});
const args = () => ({ boardId: "board", shots: [shot()], width: 1080, height: 1920 });
const issues = (mutate: (doc: ReturnType<typeof materializeStoryboard>["document"], input: ReturnType<typeof args>) => void) => {
  const input = args();
  const { document } = materializeStoryboard(input);
  mutate(document, input);
  return validateProducedTimeline(input, document).map(({ code, elementId, message }) => [code, elementId, message]);
};

describe("validateProducedTimeline issue sequence", () => {
  it("is empty for a faithful document", () => {
    expect(issues(() => {})).toEqual([]);
  });
  it("reports a missing layer", () => {
    expect(issues((doc) => { doc.clips.splice(1, 1); })).toEqual([["missing_element", "product", "Missing hook/product."]]);
  });
  it("reports a duplicate layer", () => {
    expect(issues((doc) => { doc.clips.push({ ...doc.clips[1], id: "dup" }); })).toEqual([["duplicate_element", "product", "Duplicate hook/product."]]);
  });
  it("reports an invisible protected image", () => {
    expect(issues((doc) => { doc.clips[1].hidden = true; })).toEqual([["missing_element", "product", "product must be visible."]]);
  });
  it("reports every asset check on a generated, replaced source in order", () => {
    expect(issues((doc) => { Object.assign(doc.clips[1], { currentAssetId: "fake", mediaType: "video", sourceType: "generated" }); })).toEqual([
      ["protected_source", "product", "product requires its original separately editable image."],
      ["protected_source", "product", "product must use original asset product-asset."],
      ["forbidden_generation", "product", "product cannot use a generative source."]
    ]);
  });
  it("reports shape checks, brand color and transform in order", () => {
    expect(issues((doc) => {
      Object.assign(doc.clips[0], { mediaType: "image", shapeStyle: undefined, blendMode: "multiply", opacity: 0.5 });
    })).toEqual([
      ["protected_value", "background", "background requires its separately editable shape."],
      ["missing_element", "background", "background has unsupported or missing visible shape geometry."],
      ["protected_value", "background", "background must keep exact brand color."],
      ["forbidden_transform", "background", "opacity is forbidden for brand."],
      ["forbidden_transform", "background", "Color-changing blending on brand cannot preserve protected values."]
    ]);
  });
  it("reports text copy and exact-text protection", () => {
    expect(issues((doc) => { doc.clips[2].textStyle!.text = "€30"; })).toEqual([
      ["protected_value", "price", "price requires its exact editable text."],
      ["protected_value", "price", "price must keep exact copy."]
    ]);
  });
  it("reports unknown protected input and track effects", () => {
    expect(issues((doc, input) => {
      input.shots[0].graphics!.elements![0].protected_input_id = "ghost";
      doc.tracks.forEach((track) => { track.effects = [{ type: "blur", radius: 2 }] as never; });
    })).toEqual([
      ["missing_element", "brand", "Protected input brand has no editable visible graphics element."],
      ["protected_source", "background", "Unknown protected input ghost."],
      ["forbidden_transform", "product", "Track effects on product cannot be proven faithful."],
      ["forbidden_transform", "price", "Track effects on price cannot be proven faithful."]
    ]);
  });
  it("reports global transforms before per-element issues", () => {
    expect(issues((doc) => { doc.camera2d = { position: { x: 1, y: 0 }, depthPx: 0, focalLengthPx: 1000 }; }).map(([code]) => code))
      .toEqual(Array(3).fill("forbidden_transform"));
  });
  it("reports a layer outside the canvas", () => {
    expect(issues((doc) => { doc.clips[2].transform!.position.x = 100000; }).map(([code, id]) => [code, id])).toEqual([["missing_element", "price"]]);
  });
});
