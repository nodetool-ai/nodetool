import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import sharp from "sharp";
import { afterEach, expect, it, vi } from "vitest";
import { createJsScriptAppRunner } from "@nodetool-ai/agents";
import { parseApplicationBundle, type ApplicationDocument } from "@nodetool-ai/app-runtime";
import { Application, Asset, JsScriptVersion, ModelObserver, Storyboard, TimelineSequence, initTestDb } from "@nodetool-ai/models";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { RenderTimelineNode } from "@nodetool-ai/video-nodes";
import { importApplicationBundle, exportApplicationBundle } from "../src/lib/applications-service.js";

const USER = "price-drop-user";
const PRODUCT = "a".repeat(32);
const LOGO = "b".repeat(32);
const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/price-drop/${name}`, import.meta.url));
const bundlePath = new URL("../../base-nodes/nodetool/examples/apps/product-price-drop.app.json", import.meta.url);
let temporary: string | undefined;
afterEach(async () => {vi.restoreAllMocks(); ModelObserver.clear(); if (temporary) await rm(temporary, {recursive: true, force: true});});

it("installs, plans, finishes, renders and reopens the exact editable Price Drop Recipe", async () => {
  initTestDb();
  const bundle = parseApplicationBundle(JSON.parse(await readFile(bundlePath, "utf8")));
  expect(bundle).not.toBeNull();
  const installed = await importApplicationBundle(USER, {bundle: bundle!, projectId: null});
  const row = await Application.findById(installed.id);
  expect(row).not.toBeNull();
  const doc = row!.toDocument() as ApplicationDocument;
  expect(doc.recipe).toEqual(bundle!.app.recipe);
  // Save the same UI-only edit a builder emits through the ordinary document path.
  doc.ui.root.props.title = "My Price Drop";
  row!.document = JSON.stringify(doc);
  await row!.save();
  const exported = await exportApplicationBundle(USER, installed.id);
  expect(exported.app.recipe).toEqual(bundle!.app.recipe);
  for (const [id, name, contentType] of [[PRODUCT, "product.jpg", "image/jpeg"], [LOGO, "logo.svg", "image/svg+xml"]]) {
    await new Asset({id, user_id: USER, name, content_type: contentType}).save();
  }
  const generation = vi.spyOn(ProcessingContext.prototype, "runGeneration").mockRejectedValue(new Error("Recipe must not generate media"));
  const values: Record<string, unknown> = {productImage: {type: "image", asset_id: PRODUCT}, logo: {type: "image", asset_id: LOGO}, headline: "  Better coffee  ", oldPrice: "€49", newPrice: "€29", cta: "Shop now", brandColor: "#1248AB", direction: "Bold editorial rhythm"};
  const runner = createJsScriptAppRunner(USER);
  const run = async (operationId: string) => {
    const op = doc.operations.find(operation => operation.id === operationId)!;
    if (op.target?.kind !== "script") throw new Error("Expected normal script binding");
    const version = await JsScriptVersion.findByVersion(op.target.scriptId, op.target.scriptVersion);
    expect(version).not.toBeNull();
    const inputs = Object.fromEntries(Object.entries(op.inputs).map(([port, mapping]) => {
      if (mapping.from !== "variable") throw new Error("Expected variable mapping");
      return [port, values[mapping.variableId]];
    }));
    const result = await runner({scriptId: op.target.scriptId, scriptVersion: op.target.scriptVersion, name: op.name, document: JSON.parse(version!.document), inputs});
    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
    for (const [port, mapping] of Object.entries(op.outputs)) if (mapping.to === "variable") values[mapping.variableId] = result.outputs?.[port];
    return result;
  };
  await run("plan");
  const board = await Storyboard.findById(String(values.storyboardId));
  expect(board!.toDocument().shots).toHaveLength(2);
  expect(board!.toDocument().screenplay?.motion_design?.continuities).toHaveLength(1);
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
  values.timelineRevision = timeline!.revision;
  values.newPrice = "€19";
  await run("plan");
  values.approval = "approved";
  await run("finish");
  const rerun = (await TimelineSequence.findById(timeline!.id))!.toDocument();
  expect(rerun.clips).toHaveLength(9);
  expect(rerun.clips.find(clip => clip.id === productClip.id)!.transform!.position.x).toBe(productClip.transform!.position.x);
  expect(rerun.clips.some(clip => clip.textStyle?.text === "€19")).toBe(true);
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
