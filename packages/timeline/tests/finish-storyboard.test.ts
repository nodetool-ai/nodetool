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
  it.each(["still", "video", "graphics"])("materializes %s source without conflating stills and video", (kind) => {
    const args = input();
    if (kind === "still") args.shots[0].keyframe = { type: "image", asset_id: "still-asset" };
    if (kind === "video") {
      args.shots[0].production!.media_strategy = "generated_video";
      args.shots[0].clip = { type: "video", asset_id: "video-asset" };
    }
    const result = materializeStoryboard(args);
    const source = result.document.clips.find((clip) => clip.storyboardElementId === "$source");
    expect(result.validation).toEqual([]);
    if (kind === "graphics") expect(source).toBeUndefined();
    else expect(source?.mediaType).toBe(kind === "still" ? "image" : "video");
  });
  it("rejects missing required protection and manual brand color changes", () => {
    const args = input();
    const first = materializeStoryboard(args);
    first.document.clips[0].shapeStyle!.fill = "#000000";
    expect(materializeStoryboard({ ...args, current: first.document }).validation.some((issue) => issue.code === "manual_conflict")).toBe(true);
    args.shots[0].graphics!.elements = args.shots[0].graphics!.elements.filter((element) => element.id !== "product");
    expect(materializeStoryboard(args).validation.some((issue) => issue.code === "missing_element")).toBe(true);
  });

  it("reports manual style edits rather than destroying them", () => {
    const args = input();
    const first = materializeStoryboard(args);
    first.document.clips[2].textStyle!.fontSizePx = 17;
    expect(materializeStoryboard({ ...args, current: first.document }).validation.some((issue) => issue.code === "manual_conflict")).toBe(true);
  });

  it.each(["product", "text"])("rejects a shape masquerading as protected %s", (kind) => {
    const args = input();
    const element = args.shots[0].graphics!.elements!.find((value) => value.id === (kind === "product" ? "product" : "price"))!;
    element.kind = "shape";
    expect(materializeStoryboard(args).validation.length).toBeGreaterThan(0);
  });
  it("rejects inherited track effects on protected sources", () => {
    const args = input();
    const result = materializeStoryboard(args);
    result.document.tracks[1].effects = [{ type: "blur", radius: 20 }] as never;
    expect(validateProducedTimeline(args, result.document).some((issue) => issue.code === "forbidden_transform")).toBe(true);
  });
  it("uses motion design for cut animations and continuity without rerun duplication", () => {
    const args = input();
    const second = structuredClone(args.shots[0]);
    second.id = "cta";
    second.index = 1;
    args.shots.push(second);
    const motionDesign = { transitions: [{ from_shot_id: "hook", to_shot_id: "cta", direction: "fade" }], continuities: [{ id: "background", shot_ids: ["hook", "cta"], direction: "continue" }] };
    const first = materializeStoryboard({ ...args, motionDesign });
    expect(first.validation).toEqual([]);
    expect(first.document.clips.find((clip) => clip.storyboardShotId === "hook" && clip.storyboardElementId === "product")!.animations!.some((animation) => animation.role === "out")).toBe(true);
    expect(first.document.clips.filter((clip) => clip.storyboardElementId === "background").every((clip) => !clip.animations?.length)).toBe(true);
    const rerun = materializeStoryboard({ ...args, motionDesign, current: first.document });
    expect(rerun.validation).toEqual([]);
    expect(rerun.document.clips.map((clip) => clip.animations)).toEqual(first.document.clips.map((clip) => clip.animations));
    expect(materializeStoryboard({ ...args, motionDesign: { transitions: [{ from_shot_id: "hook", to_shot_id: "cta", direction: "unknown prose" }] } }).validation.some((issue) => issue.elementId === "$transition")).toBe(true);
  });

  it("rejects zero-scale protected elements", () => {
    const args = input();
    const result = materializeStoryboard(args);
    result.document.clips[1].transform!.scale = { x: 0, y: 0 };
    expect(validateProducedTimeline(args, result.document).some((issue) => issue.code === "missing_element")).toBe(true);
  });

  it("rejects unsupported crossfades and conflicting manual continuity placement", () => {
    const args = input();
    const second = structuredClone(args.shots[0]);
    second.id = "cta"; second.index = 1; args.shots.push(second);
    const motionDesign = { continuities: [{ id: "product", shot_ids: ["hook", "cta"], direction: "continue" }] };
    const first = materializeStoryboard({ ...args, motionDesign });
    const product = first.document.clips.find((clip) => clip.storyboardShotId === "cta" && clip.storyboardElementId === "product")!;
    product.transform!.position.x = 99;
    const rerun = materializeStoryboard({ ...args, motionDesign, current: first.document });
    expect(rerun.validation.some((issue) => issue.code === "manual_conflict")).toBe(true);
    expect(materializeStoryboard({ ...args, motionDesign: { transitions: [{ from_shot_id: "hook", to_shot_id: "cta", direction: "crossfade" }] } }).validation.some((issue) => issue.elementId === "$transition")).toBe(true);
  });

  it("uses rendered rect backgrounds and rejects unknown geometry", () => {
    const args = input();
    const first = materializeStoryboard(args);
    expect(first.document.clips[0].shapeStyle!.kind).toBe("rect");
    first.document.clips[0].shapeStyle!.kind = "rectangle";
    expect(validateProducedTimeline(args, first.document).some((issue) => issue.code === "missing_element")).toBe(true);
  });

  it("places new background below overlays and preserves manual track order on rerun", () => {
    const args = input();
    const first = materializeStoryboard(args);
    const bg = first.document.clips.find((clip) => clip.storyboardElementId === "background")!;
    const product = first.document.clips.find((clip) => clip.storyboardElementId === "product")!;
    expect(first.document.tracks.find((track) => track.id === bg.trackId)!.index).toBeGreaterThan(first.document.tracks.find((track) => track.id === product.trackId)!.index);
    first.document.tracks.find((track) => track.id === product.trackId)!.index = 0;
    const second = materializeStoryboard({ ...args, current: first.document });
    expect(second.document.tracks.find((track) => track.id === product.trackId)!.index).toBe(0);
  });

  it("uses semantic price hierarchy while preserving exact copy and rerun placement", () => {
    const args = input();
    const price = args.shots[0].graphics!.elements!.find((element) => element.id === "price")!;
    price.direction = "current price";
    args.shots[0].graphics!.elements!.push({ id: "superseded", kind: "text", role: "price", direction: "superseded price", text: " €49 " });
    const first = materializeStoryboard(args);
    const current = first.document.clips.find((clip) => clip.storyboardElementId === "price")!;
    const old = first.document.clips.find((clip) => clip.storyboardElementId === "superseded")!;
    expect(old.textStyle!.fontSizePx).toBeLessThan(current.textStyle!.fontSizePx!);
    expect(old.transform!.position.y).toBeLessThan(current.transform!.position.y);
    expect(old.textStyle!.text).toBe(" €49 ");
    const rerun = materializeStoryboard({ ...args, current: first.document });
    expect(rerun.validation).toEqual([]);
    expect(rerun.document.clips.map((clip) => clip.transform)).toEqual(first.document.clips.map((clip) => clip.transform));
  });

  it("materializes distinct approved creative directions without changing source truth", () => {
    const args = input();
    args.shots[0].graphics!.direction = "Bold editorial rhythm";
    const bold = materializeStoryboard(args);
    args.shots[0].graphics!.direction = "Quiet premium composition";
    const quiet = materializeStoryboard(args);
    const boldProduct = bold.document.clips.find((clip) => clip.storyboardElementId === "product")!;
    const quietProduct = quiet.document.clips.find((clip) => clip.storyboardElementId === "product")!;
    expect(boldProduct.animations![0].preset).toBe("slide");
    expect(quietProduct.animations![0].preset).toBe("fade");
    expect(quietProduct.animations![0].durationMs).toBeGreaterThan(boldProduct.animations![0].durationMs);
    expect(boldProduct.currentAssetId).toBe(quietProduct.currentAssetId);
    expect(bold.validation).toEqual([]); expect(quiet.validation).toEqual([]);
    args.shots[0].production!.protected_inputs![0].allowed_transformations = ["position", "scale"];
    const restricted = materializeStoryboard(args);
    expect(restricted.document.clips.find((clip) => clip.storyboardElementId === "product")!.animations).toEqual([]);
    expect(restricted.validation).toEqual([]);
  });

  it("reports manual visibility changes instead of silently unhiding required layers", () => {
    const args = input();
    const first = materializeStoryboard(args);
    first.document.clips.find((clip) => clip.storyboardElementId === "product")!.hidden = true;
    expect(materializeStoryboard({ ...args, current: first.document }).validation.some((issue) => issue.code === "manual_conflict")).toBe(true);
  });

});
