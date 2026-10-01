import { describe, expect, it } from "vitest";
import type { Shot } from "@nodetool-ai/protocol";
import { timelineDocument } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import { materializeStoryboard, validateProducedTimeline } from "../src/finish-storyboard.js";

const shot = (): Shot => ({
  type: "shot", id: "hook", index: 0, action: "Price drop", status: "planned", duration_seconds: 4,
  production: { media_strategy: "still_motion_graphics", protected_inputs: [
    { id: "product", kind: "product", asset_id: "product-asset", allowed_transformations: ["position", "scale", "opacity", "composite"] },
    { id: "price", kind: "exact_text", value: " €29 ", allowed_transformations: ["position", "opacity"] },
    { id: "brand", kind: "brand_color", value: "#0033AA", allowed_transformations: [] }
  ] },
  graphics: { mode: "graphics_first", elements: [
    { id: "background", kind: "shape", protected_input_id: "brand" },
    { id: "product", kind: "asset", role: "product", protected_input_id: "product" },
    { id: "price", kind: "text", role: "price", protected_input_id: "price", text: " €29 " }
  ] }
});
const input = () => ({ boardId: "board", shots: [shot()], width: 1080, height: 1920 });

describe("Storyboard finishing", () => {
  it("creates separately editable exact layers with persistent semantic ownership", () => {
    const result = materializeStoryboard(input());
    expect(result.validation).toEqual([]);
    expect(result.document.clips.map((clip) => clip.mediaType)).toEqual(["shape", "image", "text"]);
    expect(result.document.clips[1].currentAssetId).toBe("product-asset");
    expect(result.document.clips[2].textStyle?.text).toBe(" €29 ");
    expect(result.durationMs).toBe(4000);
    const saved = timelineDocument.parse(result.document);
    expect(saved.clips.map((clip) => clip.storyboardElementId)).toEqual(["background", "product", "price"]);
    expect(saved.clips.every((clip) => !!clip.storyboardMaterializationBaseline)).toBe(true);
  });
  it("updates price without duplicating layers and preserves manual product placement", () => {
    const args = input();
    const first = materializeStoryboard(args);
    first.document.clips[1].transform!.position.x = 87;
    args.shots[0].production!.protected_inputs![1].value = "€19";
    const second = materializeStoryboard({ ...args, current: first.document });
    expect(second.validation).toEqual([]);
    expect(second.document.clips.map((clip) => clip.id)).toEqual(first.document.clips.map((clip) => clip.id));
    expect(second.document.clips[1].transform!.position.x).toBe(87);
    expect(second.document.clips[2].textStyle?.text).toBe("€19");
    expect(second.document.clips).toHaveLength(3);
  });
  it.each(["replacement", "generation", "copy", "color", "missing", "duplicate", "transform"])("rejects actual %s violations", (kind) => {
    const args = input();
    const { document } = materializeStoryboard(args);
    if (kind === "replacement") document.clips[1].currentAssetId = "fake";
    if (kind === "generation") document.clips[1].bindingKind = "image-to-image";
    if (kind === "copy") document.clips[2].textStyle!.text = "€29";
    if (kind === "color") document.clips[0].shapeStyle!.fill = "#FF0000";
    if (kind === "missing") document.clips[1].hidden = true;
    if (kind === "duplicate") document.clips.push({ ...document.clips[1], id: "duplicate" });
    if (kind === "transform") document.clips[1].transform!.rotation = 10;
    expect(validateProducedTimeline(args, document).length).toBeGreaterThan(0);
  });
  it("reports manually replaced protected source before a rerun saves", () => {
    const args = input();
    const first = materializeStoryboard(args);
    first.document.clips[1].currentAssetId = "replacement";
    expect(materializeStoryboard({ ...args, current: first.document }).validation.some((issue) => issue.code === "manual_conflict")).toBe(true);
  });
});
