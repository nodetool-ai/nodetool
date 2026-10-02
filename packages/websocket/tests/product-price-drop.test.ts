import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import sharp from "sharp";
import { afterEach, expect, it, vi } from "vitest";
import { createJsScriptAppRunner } from "@nodetool-ai/agents";
import { parseApplicationBundle, type ApplicationDocument } from "@nodetool-ai/app-runtime";
import { jsScriptDocument } from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import { Application, Asset, JsScriptVersion, ModelObserver, Storyboard, TimelineSequence, initTestDb, entityFromAsset, publishApplication, releasedApplicationRelease } from "@nodetool-ai/models";
import { ProcessingContext } from "@nodetool-ai/runtime";
import type { TimelineClip } from "@nodetool-ai/timeline";
import { RenderTimelineNode } from "@nodetool-ai/video-nodes";
import { importApplicationBundle, exportApplicationBundle } from "../src/lib/applications-service.js";

const USER = "price-drop-user";
const PRODUCT = "a".repeat(32);
const LOGO = "b".repeat(32);
const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/price-drop/${name}`, import.meta.url));
const bundlePath = new URL("../../base-nodes/nodetool/examples/apps/product-price-drop.app.json", import.meta.url);

// Compare authored rendering fields, excluding regenerated IDs and ownership baselines.
const authoredLayers = (timeline: {clips: TimelineClip[]}) => {
  const identities = new Map(timeline.clips.map(clip => [clip.id, `${clip.storyboardShotId}/${clip.storyboardElementId}`]));
  return timeline.clips.map(clip => ({
    identity: identities.get(clip.id),
    mediaType: clip.mediaType,
    startMs: clip.startMs, durationMs: clip.durationMs,
    transform: clip.transform, layout: clip.layout, flexItem: clip.flexItem,
    parent: clip.parentId ? identities.get(clip.parentId) : undefined,
    opacity: clip.opacity ?? 1, hidden: clip.hidden ?? false,
    blendMode: clip.blendMode ?? "normal", crop: clip.crop, mask: clip.mask,
    textStyle: clip.textStyle, shapeStyle: clip.shapeStyle, transitionIn: clip.transitionIn,
    animations: (clip.animations ?? []).map(animation => ({
      role: animation.role, preset: animation.preset, durationMs: animation.durationMs,
      delayMs: animation.delayMs ?? 0, enabled: animation.enabled ?? true,
      easing: animation.easing, params: animation.params, stagger: animation.stagger,
      curves: animation.custom?.curves, timeBase: animation.custom?.timeBase,
      customMask: animation.custom?.mask, styleTracks: animation.styleTracks,
      textAnimator: animation.textAnimator
    })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
  })).sort((left, right) => String(left.identity).localeCompare(String(right.identity)));
};

let temporary: string | undefined;
afterEach(async () => {vi.restoreAllMocks(); ModelObserver.clear(); if (temporary) await rm(temporary, {recursive: true, force: true});});

it("installs, plans, finishes, renders and reopens the exact editable Price Drop Recipe", async () => {
  initTestDb();
  const bundle = parseApplicationBundle(JSON.parse(await readFile(bundlePath, "utf8")));
  expect(bundle).not.toBeNull();
  const installed = await importApplicationBundle(USER, {bundle: bundle!, projectId: null});
  const row = await Application.findById(installed.id);
  expect(row).not.toBeNull();
  let doc = row!.toDocument() as ApplicationDocument;
  expect(doc.recipe).toEqual(bundle!.app.recipe);
  // Save the same UI-only edit a builder emits through the ordinary document path.
  doc.ui.root.props.title = "My Price Drop";
  row!.document = JSON.stringify(doc);
  await row!.save();
  const release = await publishApplication(row!);
  expect(release.document.recipe).toEqual(bundle!.app.recipe);
  expect(release.document.operations).toEqual(doc.operations);
  expect(release.workflows).toEqual([]);
  doc = (await releasedApplicationRelease(installed.id, USER))!.document;
  const exported = await exportApplicationBundle(USER, installed.id, {released: true});
  expect(exported.scripts).toHaveLength(2);
  for (const operation of exported.app.operations) {
    if (operation.target?.kind !== "script") throw new Error("Expected exported script binding");
    const source = doc.operations.find(entry => entry.id === operation.id)!;
    if (source.target?.kind !== "script") throw new Error("Expected released script binding");
    const pinned = await JsScriptVersion.findByVersion(source.target.scriptId, source.target.scriptVersion);
    const scriptKey = operation.target.scriptId;
    const carried = exported.scripts.find(script => script.key === scriptKey);
    expect(carried?.document).toEqual(jsScriptDocument.parse(JSON.parse(pinned!.document)));
    expect(operation.target.scriptVersion).toBe(source.target.scriptVersion);
  }
  expect(exported.app.recipe).toEqual(bundle!.app.recipe);
  for (const [id, name, contentType] of [[PRODUCT, "product.jpg", "image/jpeg"], [LOGO, "logo.svg", "image/svg+xml"]]) {
    await new Asset({id, user_id: USER, name, content_type: contentType}).save();
  }
  const generation = vi.spyOn(ProcessingContext.prototype, "runGeneration").mockRejectedValue(new Error("Recipe must not generate media"));
  const values: Record<string, unknown> = {productImage: {type: "image", asset_id: PRODUCT.slice(0, 12)}, logo: {type: "image", asset_id: LOGO.slice(0, 12)}, headline: "  Better coffee  ", oldPrice: "€49", newPrice: "€29", cta: "Shop now", brandColor: "#1248AB", direction: "Bold editorial rhythm"};
  const runner = createJsScriptAppRunner(USER);
  const run = async (operationId: string, expectSuccess = true) => {
    const op = doc.operations.find(operation => operation.id === operationId)!;
    if (op.target?.kind !== "script") throw new Error("Expected normal script binding");
    const version = await JsScriptVersion.findByVersion(op.target.scriptId, op.target.scriptVersion);
    expect(version).not.toBeNull();
    const inputs = Object.fromEntries(Object.entries(op.inputs).map(([port, mapping]) => {
      if (mapping.from === "constant") return [port, mapping.value];
      if (mapping.from !== "variable") throw new Error("Expected variable mapping");
      return [port, values[mapping.variableId]];
    }));
    const result = await runner({scriptId: op.target.scriptId, scriptVersion: op.target.scriptVersion, name: op.name, document: JSON.parse(version!.document), inputs});
    if (!expectSuccess) return result;
    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
    for (const [port, mapping] of Object.entries(op.outputs)) if (mapping.to === "variable") values[mapping.variableId] = result.outputs?.[port];
    return result;
  };
  await run("plan");
  const board = await Storyboard.findById(String(values.storyboardId));
  expect(board!.toDocument().shots).toHaveLength(2);
  expect(board!.toDocument().screenplay?.motion_design?.continuities).toHaveLength(1);
  for (const shot of board!.toDocument().shots) {
    for (const element of shot.graphics?.elements ?? []) if (element.kind === "asset") {
      expect([PRODUCT, LOGO]).toContain(element.asset_id);
      expect(element.entity_id).toBe(element.asset_id);
    }
    for (const source of shot.production?.protected_inputs ?? []) if (source.asset_id) {
      expect([PRODUCT, LOGO]).toContain(source.asset_id);
      expect(source.entity_id).toBe(source.asset_id);
    }
  }
  for (const assetId of [PRODUCT, LOGO]) {
    const asset = await Asset.find(USER, assetId);
    expect(entityFromAsset(asset!)?.id).toBe(assetId);
    expect(entityFromAsset(asset!)?.reference_images?.[0].asset_id).toBe(assetId);
  }
  expect(values.designPreview).toMatchObject({type: "timeline", data: {width: 1080, height: 1920, durationMs: 6000}});
  expect(values.timelineId).toBeUndefined();
  values.approval = "approved";
  await run("finish");
  await run("finish");
  const timeline = await TimelineSequence.findById(String(values.timelineId));
  expect(timeline).not.toBeNull();
  const layered = timeline!.toTimelineSequence();
  expect(layered.width).toBe(1080);
  expect(layered.height).toBe(1920);
  expect(layered.clips.filter(clip => clip.mediaType === "image")).toHaveLength(3);
  expect(layered.clips.filter(clip => clip.mediaType === "text")).toHaveLength(4);
  expect(layered.clips.filter(clip => clip.mediaType === "shape")).toHaveLength(2);
  expect(layered.clips.every(clip => clip.storyboardElementId)).toBe(true);
  expect(layered.clips.some(clip => clip.textStyle?.text === values.newPrice)).toBe(true);
  expect(layered.clips.some(clip => clip.textStyle?.text === values.headline)).toBe(true);
  expect(layered.clips.filter(clip => clip.mediaType === "image").map(clip => clip.currentAssetId).sort()).toEqual([PRODUCT, PRODUCT, LOGO].sort());
  const scaffold = (values.designPreview as {data: Parameters<typeof authoredLayers>[0]}).data;
  expect(authoredLayers(layered)).toEqual(authoredLayers(scaffold));
  expect(generation).not.toHaveBeenCalled();

  temporary = await mkdtemp(`${tmpdir()}/price-drop-proof-`);
  const outputPath = `${temporary}/price-drop.mp4`;
  const outputId = "d".repeat(32);
  const node = new RenderTimelineNode();
  node.timeline = {type: "timeline", id: timeline!.id, data: null};
  node.preview_scale = 1;
  node.include_audio = false;
  const rendered = await node.process({
    getTimelineSequence: async () => layered,
    localPath: async (id: string) => id === PRODUCT ? fixture("product.jpg") : id === LOGO ? fixture("logo.svg") : null,
    resolveAssetBytes: async (id: string) => ({bytes: new Uint8Array(await readFile(id === PRODUCT ? fixture("product.jpg") : fixture("logo.svg")))}),
    postMessage: () => {}, signal: new AbortController().signal,
    createAsset: async (args: {content: Uint8Array; contentType: string}) => {
      await writeFile(outputPath, args.content);
      await new Asset({id: outputId, user_id: USER, name: "price-drop.mp4", content_type: args.contentType, size: args.content.length}).save();
      return {id: outputId};
    }
  } as unknown as ProcessingContext);
  expect(rendered.output.asset_id).toBe(outputId);
  expect(rendered.output.metadata?.render_mode).toBe("composited");
  const sampledFrame = `${temporary}/sample.png`;
  await promisify(execFile)("ffmpeg", ["-y", "-ss", "1.5", "-i", outputPath, "-frames:v", "1", sampledFrame]);
  const pixel = await sharp(sampledFrame).extract({left: 5, top: 5, width: 1, height: 1}).removeAlpha().raw().toBuffer();
  expect([...pixel].every((value, index) => Math.abs(value - [18, 72, 171][index]) <= 4)).toBe(true);
  const framePixels = await sharp(sampledFrame).removeAlpha().raw().toBuffer();
  let foregroundPixels = 0;
  for (let index = 0; index < framePixels.length; index += 3) {
    if ([18, 72, 171].some((channel, offset) => Math.abs(framePixels[index + offset] - channel) > 12)) foregroundPixels++;
  }
  expect(foregroundPixels).toBeGreaterThan(1000);
  expect((await readFile(outputPath)).byteLength).toBeGreaterThan(1000);
  const probe = JSON.parse((await promisify(execFile)("ffprobe", ["-v", "error", "-count_frames", "-show_entries", "stream=width,height,nb_read_frames:format=duration", "-of", "json", outputPath])).stdout);
  expect(probe.streams[0].width).toBe(1080);
  expect(probe.streams[0].height).toBe(1920);
  expect(Number(probe.format.duration)).toBeCloseTo(6, 1);
  expect(Number(probe.streams[0].nb_read_frames)).toBe(180);
  if (process.env.PRICE_DROP_PROOF_DIR) {
    const proof = process.env.PRICE_DROP_PROOF_DIR;
    await mkdir(proof, {recursive: true});
    await writeFile(`${proof}/price-drop.mp4`, await readFile(outputPath));
    await writeFile(`${proof}/probe.json`, JSON.stringify(probe, null, 2));
    for (const [name, seconds] of [["hook", "1.5"], ["cta", "4.5"]]) await promisify(execFile)("ffmpeg", ["-y", "-ss", seconds, "-i", outputPath, "-frames:v", "1", `${proof}/${name}.png`]);
  }
  expect(await Asset.find(USER, outputId)).not.toBeNull();
  expect((await TimelineSequence.findById(timeline!.id))!.toDocument().clips).toHaveLength(9);

  const productClip = layered.clips.find(clip => clip.currentAssetId === PRODUCT)!;
  productClip.transform!.position.x += 12;
  timeline!.fromDocument({...timeline!.toDocument(), clips: layered.clips});
  await timeline!.save();
  values.newPrice = "€19";
  await run("plan");
  expect(values.timelineRevision).toBe(timeline!.revision);
  values.approval = "approved";
  await run("finish");
  const rerun = (await TimelineSequence.findById(timeline!.id))!.toDocument();
  expect(rerun.clips).toHaveLength(9);
  expect(rerun.clips.find(clip => clip.id === productClip.id)!.transform!.position.x).toBe(productClip.transform!.position.x);
  expect(rerun.clips.some(clip => clip.textStyle?.text === "€19")).toBe(true);
  await run("plan");
  values.approval = "approved";
  const changedAfterPlan = (await TimelineSequence.findById(timeline!.id))!;
  await changedAfterPlan.save();
  const stale = await run("finish", false);
  expect(stale.ok).toBe(false);
  expect(stale.error).toMatch(/revision|modified|conflict/i);
  expect(generation).not.toHaveBeenCalled();
}, 180_000);

it("normal script operations retain Storyboard ownership guards", async () => {
  initTestDb();
  const board = new Storyboard({user_id: "another-user", name: "Private board"});
  await board.save();
  const runner = createJsScriptAppRunner(USER);
  const result = await runner({
    scriptId: "ownership-test", scriptVersion: 1, name: "Ownership guard",
    document: {schemaVersion: 1, code: 'import { get_storyboard } from "@nodetool-ai/sandbox-nodetool/storyboards"; await output("board", await get_storyboard({storyboard_id: inputs.id}));', inputs: [{name: "id", type: "str"}], outputs: [{name: "board", type: "any"}], description: "", secrets: [], timeoutSeconds: 30, tests: []},
    inputs: {id: board.id}
  });
  expect(result.ok).toBe(false);
  expect(result.error).toMatch(/not found/i);
  expect((await Storyboard.findById(board.id))!.user_id).toBe("another-user");
});

it.runIf(process.env.RECIPE_LIVE_FINISH === "1")("finishes and renders a Price Drop Application with the actual agentic provider", async () => {
  initTestDb();
  const operationsModule = fileURLToPath(new URL("../../../scripts/recipe-operations.mjs", import.meta.url));
  const manifestsModule = fileURLToPath(new URL("../../../scripts/example-apps/product-price-drop.mjs", import.meta.url));
  const {compileSharedRecipeBundle} = await import(operationsModule);
  const {PRODUCT_PRICE_DROP_MANIFEST} = await import(manifestsModule);
  const recipe = structuredClone(PRODUCT_PRICE_DROP_MANIFEST);
  recipe.operations[1].strategy = "agentic";
  recipe.operations[1].model = {provider: "claude_agent_sdk", id: "sonnet"};
  const bundle = compileSharedRecipeBundle(recipe, "Reviewed Price Drop", "Actual model finishing through normal Application operations.");
  const installed = await importApplicationBundle(USER, {bundle, projectId: null});
  const doc = (await Application.findById(installed.id))!.toDocument() as ApplicationDocument;
  for (const [id, name, contentType] of [[PRODUCT, "product.jpg", "image/jpeg"], [LOGO, "logo.svg", "image/svg+xml"]]) {
    await new Asset({id, user_id: USER, name, content_type: contentType}).save();
  }
  const bytes = async (uri: string) => {
    const id = uri.replace(/^asset:\/\//, "");
    if (id !== PRODUCT && id !== LOGO) throw new Error(`Unexpected media source ${uri}`);
    return new Uint8Array(await readFile(fixture(id === PRODUCT ? "product.jpg" : "logo.svg")));
  };
  vi.spyOn(ProcessingContext.prototype, "resolveAssetBytes").mockImplementation(async uri => ({bytes: await bytes(uri), attempts: []}));
  const generation = vi.spyOn(ProcessingContext.prototype, "runGeneration").mockRejectedValue(new Error("Protected Recipe cannot generate media"));
  const values: Record<string, unknown> = {productImage: {type: "image", asset_id: PRODUCT}, logo: {type: "image", asset_id: LOGO}, headline: "  Better coffee  ", oldPrice: "€49", newPrice: "€29", cta: "Shop now", brandColor: "#1248AB", direction: "Bold editorial rhythm"};
  const runner = createJsScriptAppRunner(USER);
  const run = async (id: string) => {
    const operation = doc.operations.find(op => op.id === id)!;
    if (operation.target?.kind !== "script") throw new Error("Expected an installed pinned script");
    const version = await JsScriptVersion.findByVersion(operation.target.scriptId, operation.target.scriptVersion);
    expect(version).not.toBeNull();
    const inputs = Object.fromEntries(Object.entries(operation.inputs).map(([port, mapping]) => {
      if (mapping.from === "constant") return [port, mapping.value];
      if (mapping.from !== "variable") throw new Error("Expected ordinary Application input mapping");
      return [port, values[mapping.variableId]];
    }));
    const result = await runner({scriptId: operation.target.scriptId, scriptVersion: operation.target.scriptVersion, name: operation.name, document: JSON.parse(version!.document), inputs});
    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
    for (const [port, mapping] of Object.entries(operation.outputs)) if (mapping.to === "variable") values[mapping.variableId] = result.outputs?.[port];
  };
  await run("plan");
  expect(values.designPreview).toMatchObject({type: "timeline", data: {width: 1080, height: 1920}});
  expect(values.timelineId).toBeUndefined();
  values.approval = "approved";
  await run("finish");
  expect(values.validation).toEqual([]);
  expect(values.reviews).toEqual(expect.arrayContaining([expect.objectContaining({passed: true, frames: expect.any(Array), referenceFrames: expect.any(Array)})]));
  for (const review of values.reviews as Array<{passed: boolean; frames: unknown[]; referenceFrames: unknown[]}>) {
    expect(review.frames.length).toBeGreaterThan(0);
    expect(review.referenceFrames.length).toBe(2);
  }
  const timeline = (await TimelineSequence.findById(String(values.timelineId)))!;
  const layered = timeline.toTimelineSequence();
  const scaffold = (values.designPreview as {data: Parameters<typeof authoredLayers>[0]}).data;
  expect(authoredLayers(layered)).not.toEqual(authoredLayers(scaffold));
  const images = layered.clips.filter(clip => clip.mediaType === "image");
  expect(images.some(clip => clip.currentAssetId === PRODUCT)).toBe(true);
  expect(images.some(clip => clip.currentAssetId === LOGO)).toBe(true);
  expect(images.every(clip => clip.currentAssetId === PRODUCT || clip.currentAssetId === LOGO)).toBe(true);
  for (const text of [values.headline, values.oldPrice, values.newPrice, values.cta]) {
    expect(layered.clips.some(clip => clip.mediaType === "text" && clip.textStyle?.text === text)).toBe(true);
  }
  expect(layered.clips.every(clip => clip.storyboardElementId)).toBe(true);
  expect(generation).not.toHaveBeenCalled();
  temporary = await mkdtemp(`${tmpdir()}/price-drop-live-proof-`);
  const outputPath = `${temporary}/price-drop-agentic.mp4`;
  const outputId = "e".repeat(32);
  const node = new RenderTimelineNode();
  node.timeline = {type: "timeline", id: timeline.id, data: null};
  node.preview_scale = 1;
  node.include_audio = false;
  const rendered = await node.process({
    getTimelineSequence: async () => layered,
    localPath: async (uri: string) => fixture(uri.replace(/^asset:\/\//, "") === PRODUCT ? "product.jpg" : "logo.svg"),
    resolveAssetBytes: async (uri: string) => ({bytes: await bytes(uri)}),
    postMessage: () => {}, signal: new AbortController().signal,
    createAsset: async (args: {content: Uint8Array; contentType: string}) => {
      await writeFile(outputPath, args.content);
      await new Asset({id: outputId, user_id: USER, name: "price-drop-agentic.mp4", content_type: args.contentType, size: args.content.length}).save();
      return {id: outputId};
    }
  } as unknown as ProcessingContext);
  expect(rendered.output.asset_id).toBe(outputId);
  expect((await readFile(outputPath)).byteLength).toBeGreaterThan(1000);
  const probe = JSON.parse((await promisify(execFile)("ffprobe", ["-v", "error", "-count_frames", "-show_entries", "stream=width,height,nb_read_frames:format=duration", "-of", "json", outputPath])).stdout);
  expect(probe.streams[0]).toMatchObject({width: 1080, height: 1920});
  expect(Number(probe.format.duration)).toBeCloseTo(6, 1);
  expect(Number(probe.streams[0].nb_read_frames)).toBe(180);
  expect((await TimelineSequence.findById(timeline.id))!.toDocument().clips).toEqual(timeline.toDocument().clips);
  if (process.env.PRICE_DROP_PROOF_DIR) {
    const proof = process.env.PRICE_DROP_PROOF_DIR;
    await mkdir(proof, {recursive: true});
    await writeFile(`${proof}/price-drop-agentic.mp4`, await readFile(outputPath));
    await writeFile(`${proof}/agentic-review.json`, JSON.stringify(values.reviews, null, 2));
    await writeFile(`${proof}/agentic-timeline.json`, JSON.stringify(layered, null, 2));
    await writeFile(`${proof}/agentic-probe.json`, JSON.stringify(probe, null, 2));
    for (const [name, seconds] of [["hook", "1.5"], ["cta", "4.5"]]) await promisify(execFile)("ffmpeg", ["-y", "-ss", seconds, "-i", outputPath, "-frames:v", "1", `${proof}/agentic-${name}.png`]);
  }
}, 180_000);
