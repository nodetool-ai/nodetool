import { describe, expect, it } from "vitest";
import type { Shot } from "@nodetool-ai/protocol";
import { timelineDocument } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import type { TimelineSequence } from "../src/types.js";
import { materializeStoryboard, validateProducedTimeline, stampStoryboardMaterializationBaseline } from "../src/finish-storyboard.js";

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
  it("preserves unrelated document metadata on a finishing rerun", () => {
    const args = input();
    const first = materializeStoryboard(args).document;
    const metadata: Partial<TimelineSequence> = {
      name: "Manual composition", scriptEnabled: false, templateId: "template",
      tempo: { bpm: 87, offsetMs: 12, timeSignature: { beatsPerBar: 3, beatUnit: 4 } },
      transcript: [{ id: "line", text: "Manual notes", beatStartMs: 0, clipIds: [] }],
      trackFolders: [{ id: "folder", name: "Manual folder" }],
      setup: { stage: "done", brief: "Manual brief" },
      camera2d: null, source: null, mediaTracks: []
    };
    const current = { ...first, ...metadata };
    const before = structuredClone(current);
    const result = materializeStoryboard({ ...args, current });
    expect(result.validation).toEqual([]);
    expect(result.document).toMatchObject(metadata);
    expect(current).toEqual(before);
  });
  const unsupportedMetadata: Array<[string, Partial<TimelineSequence>]> = [
    ["camera", { camera2d: { position: { x: 12, y: 0 }, depthPx: 0, focalLengthPx: 1000 } }],
    ["code source", { source: { lang: "js", code: "// manual", bakedAt: "2026-10-01", scenes: {} } }],
    ["media tracking", { mediaTracks: [{ id: "tracking", clipId: "clip", sourceAssetId: "product-asset", name: "Manual tracking", kind: "point", sourceStartMs: 0, sourceEndMs: 1000, samples: [], status: "ready" }] }]
  ];
  it.each(unsupportedMetadata)("returns an explicit conflict without mutation for %s", (_, metadata) => {
    const args = input();
    const current = { ...materializeStoryboard(args).document, ...metadata };
    const before = structuredClone(current);
    const result = materializeStoryboard({ ...args, current });
    expect(result.validation.some((issue) => issue.code === "manual_conflict")).toBe(true);
    expect(result.document).toEqual(before);
    expect(current).toEqual(before);
  });
  it.each(unsupportedMetadata.filter(([name]) => name !== "code source"))("rejects actual %s transformations during standalone production validation", (_, metadata) => {
    const args = input();
    const current = { ...materializeStoryboard(args).document, ...metadata };
    expect(validateProducedTimeline(args, current).some((issue) => issue.code === "forbidden_transform")).toBe(true);
  });
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
  it("rejects an image masquerading as the protected brand shape", () => {
    const args = input();
    const first = materializeStoryboard(args);
    first.document.clips[0].mediaType = "image";
    first.document.clips[0].currentAssetId = "replacement";
    expect(validateProducedTimeline(args, first.document).some((issue) => issue.code === "protected_value" && issue.elementId === "background")).toBe(true);
    expect(materializeStoryboard({ ...args, current: first.document }).validation.some((issue) => issue.code === "manual_conflict" && issue.elementId === "background")).toBe(true);
  });

  it.each([true, false])("does not mutate an existing document when composition has validation errors: %s", (invalid) => {
    const args = input();
    args.shots[0].graphics!.elements = [{ id: "headline", kind: "text", text: "Exact" }, { id: "line", kind: "shape" }];
    args.shots[0].production!.protected_inputs = [];
    const first = materializeStoryboard(args);
    first.document.tracks.push({ ...first.document.tracks[0], id: "manual", name: "Manual", index: 2 });
    first.document.clips.push({ ...first.document.clips[0], id: "manual", trackId: "manual", storyboardBoardId: undefined });
    const before = structuredClone(first.document);
    args.shots[0].graphics!.elements = [{ id: "background", kind: "shape" }, { id: "headline", kind: "text", text: "Exact" }, ...(invalid ? [{ id: "bad", kind: "asset" as const }] : [])];
    const next = materializeStoryboard({ ...args, current: first.document });
    expect(next.validation.length > 0).toBe(invalid);
    expect(first.document).toEqual(before);
  });

  it("rejects color-changing blend modes on protected layers and reports manual conflicts", () => {
    const args = input();
    const first = materializeStoryboard(args);
    first.document.clips[0].blendMode = "multiply";
    expect(validateProducedTimeline(args, first.document).some((issue) => issue.code === "forbidden_transform")).toBe(true);
    expect(materializeStoryboard({ ...args, current: first.document }).validation.some((issue) => issue.code === "manual_conflict")).toBe(true);
  });

  it("rejects inherited track effects on protected sources", () => {
    const args = input();
    const result = materializeStoryboard(args);
    result.document.tracks[1].effects = [{ type: "blur", radius: 20 }] as never;
    expect(validateProducedTimeline(args, result.document).some((issue) => issue.code === "forbidden_transform")).toBe(true);
  });
  it("rejects forbidden source masks and unproven transitions on protected clips", () => {
    const args = input();
    const document = materializeStoryboard(args).document;
    const product = document.clips.find(clip => clip.storyboardElementId === "product")!;
    product.mask = { kind: "ellipse", x: 0, y: 0, width: 0.5, height: 1 };
    expect(validateProducedTimeline(args, document).some(issue => issue.code === "forbidden_transform" && issue.message.includes("mask is forbidden"))).toBe(true);
    delete product.mask;
    product.transitionIn = { type: "push", durationMs: 300 };
    expect(validateProducedTimeline(args, document).some(issue => issue.code === "forbidden_transform" && issue.message.includes("Transition push"))).toBe(true);
  });
  it("preserves user layer names independently from semantic element identity", () => {
    const args = input();
    const first = materializeStoryboard(args).document;
    const price = first.clips.find(clip => clip.storyboardElementId === "price")!;
    price.name = "Human price";
    const result = materializeStoryboard({...args, current: first});
    expect(result.validation).toEqual([]);
    expect(result.document.clips.find(clip => clip.id === price.id)?.name).toBe("Human price");
    expect(result.document.clips.find(clip => clip.id === price.id)?.storyboardElementId).toBe("price");
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

  it.each([{ x: 10000, y: 0 }, { x: -10000, y: 0 }, { x: 0, y: 10000 }, { x: 0, y: -10000 }])("rejects a required product outside the canvas at %j", (position) => {
    const args = input();
    args.shots[0].graphics!.direction = "Bold editorial rhythm";
    const result = materializeStoryboard(args);
    result.document.clips[1].transform!.position = position;
    expect(validateProducedTimeline(args, result.document).some((issue) => issue.code === "missing_element" && issue.elementId === "product")).toBe(true);
    expect(materializeStoryboard({ ...args, current: result.document }).validation.some((issue) => issue.code === "missing_element" && issue.elementId === "product")).toBe(true);
  });

  it("allows an entry animation whose movement intersects the canvas", () => {
    const args = input();
    args.shots[0].graphics!.direction = "Bold editorial rhythm";
    const first = materializeStoryboard(args);
    first.document.clips[1].transform!.position.y = 1700;
    const next = materializeStoryboard({ ...args, current: first.document });
    expect(next.validation).toEqual([]);
    expect(next.document.clips[1].transform!.position.y).toBe(1700);
  });

  it("preserves a manual placement that partially intersects the canvas", () => {
    const args = input();
    const first = materializeStoryboard(args);
    first.document.clips[1].transform!.position.x = 550;
    const rerun = materializeStoryboard({ ...args, current: first.document });
    expect(rerun.validation).toEqual([]);
    expect(rerun.document.clips[1].transform!.position.x).toBe(550);
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

  it("places a still source beneath separately editable graphics", () => {
    const args = input();
    args.shots[0].keyframe = { type: "image", asset_id: "still" };
    const result = materializeStoryboard(args);
    const source = result.document.clips.find((clip) => clip.storyboardElementId === "$source")!;
    const text = result.document.clips.find((clip) => clip.storyboardElementId === "price")!;
    expect(result.document.tracks.find((track) => track.id === source.trackId)!.index).toBeGreaterThan(result.document.tracks.find((track) => track.id === text.trackId)!.index);
  });

  it.each([false, true])("rejects manual owned layer deletion including whole cut deletion %s", (all) => {
    const args = input();
    const first = materializeStoryboard(args);
    const current = timelineDocument.parse(first.document);
    expect(current.storyboardMaterializations).toEqual([{ boardId: args.boardId, elementKeys: ["hook/background", "hook/product", "hook/price"] }]);
    current.clips = all ? [] : current.clips.filter((clip) => clip.storyboardElementId !== "product");
    expect(materializeStoryboard({ ...args, current }).validation.some((issue) => issue.code === "manual_conflict")).toBe(true);
  });
  it("permits newly planned graphics and preserves other board ownership", () => {
    const args = input();
    const first = materializeStoryboard(args);
    first.document.storyboardMaterializations!.push({ boardId: "other", elementKeys: ["other/clip"] });
    args.shots[0].graphics!.elements.push({ id: "new-copy", kind: "text", text: "New" });
    const result = materializeStoryboard({ ...args, current: first.document });
    expect(result.validation).toEqual([]);
    expect(result.document.storyboardMaterializations).toContainEqual({ boardId: "other", elementKeys: ["other/clip"] });
  });

});


describe("agent-owned finishing layers", () => {
  it("does not duplicate reserved transition animations on repeated materialization", () => {
    const firstShot = shot(); const secondShot = { ...shot(), id: "close", index: 1 };
    for (const value of [firstShot, secondShot]) value.production!.protected_inputs!.find((input) => input.id === "brand")!.allowed_transformations = ["opacity"];
    const args = { ...input(), shots: [firstShot, secondShot], motionDesign: { transitions: [{ from_shot_id: "hook", to_shot_id: "close", direction: "fade" }] } };
    let document = materializeStoryboard(args).document;
    const extra = structuredClone(document.clips.find((clip) => clip.storyboardElementId === "background")!);
    extra.id = "extra"; extra.storyboardElementId = "$agent:shape:accent"; extra.animations = [];
    stampStoryboardMaterializationBaseline(extra); document.clips.push(extra);
    document.storyboardMaterializations![0].elementKeys.push("hook/$agent:shape:accent");
    for (let count = 0; count < 4; count += 1) {
      const result = materializeStoryboard({ ...args, current: document });
      expect(result.validation).toEqual([]); document = result.document;
      const animations = document.clips.find((clip) => clip.id === "extra")!.animations ?? [];
      expect(animations.filter((animation) => animation.id === "extra:cut-out")).toHaveLength(1);
    }
  });
  it("conflicts if a retained agent layer leaves its provenance shot after a duration change", () => {
    const args = { ...input(), shots: [shot(), { ...shot(), id: "close", index: 1 }] };
    const current = materializeStoryboard(args).document;
    const extra = structuredClone(current.clips.find((clip) => clip.storyboardShotId === "close" && clip.storyboardElementId === "background")!);
    extra.id = "extra"; extra.storyboardElementId = "$agent:shape:accent"; stampStoryboardMaterializationBaseline(extra); current.clips.push(extra);
    current.storyboardMaterializations![0].elementKeys.push("close/$agent:shape:accent");
    args.shots[0].duration_seconds = 8;
    const result = materializeStoryboard({ ...args, current });
    expect(result.validation).toEqual(expect.arrayContaining([expect.objectContaining({ code: "manual_conflict", elementId: "$agent:shape:accent", message: expect.stringContaining("timing changed") })]));
    expect(current.clips.find((clip) => clip.id === "extra")!.startMs).toBe(4000);
  });
});
