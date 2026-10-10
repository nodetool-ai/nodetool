import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Asset, Game, ModelObserver, Project, Workspace, initTestDb } from "@nodetool-ai/models";
import { anyGameDocument, gameSnapshot3D } from "@nodetool-ai/protocol";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { workspaceFromRow } from "@nodetool-ai/execution/service";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import { inputFrames3D } from "../src/capabilities/game3d.js";
import { GAME_ASSET_NODE_RUNNER_CONTEXT_KEY } from "../src/capabilities/game-asset-source.js";

const USER = "game3d-owner";
const PROJECT = "game3d-project";
let directory: string;
function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) { throw new Error("Expected a record result"); }
  return Object.fromEntries(Object.entries(value));
}
function replyDocument(value: unknown) {
  const result = readRecord(value);
  return { result, document: anyGameDocument.parse(result.document), game: readRecord(result.game) };
}
async function agent(user = USER, sourceAssets: ReadonlyMap<string, Uint8Array> = new Map()) {
  const [row] = await Workspace.listByProject(USER, PROJECT);
  const workspace = row && workspaceFromRow(row);
  if (!workspace) { throw new Error("Workspace missing"); }
  return { workspace, run: createCapabilityRun({ context: { userId: user, workspace, assetStorage: new InMemoryStorageAdapter(), resolveAssetBytes: async (uri: string) => ({ bytes: sourceAssets.get(uri) ?? null }) } as ProcessingContext, gate: UNGATED }) };
}
function closedGlb(): Uint8Array {
  const raw = new TextEncoder().encode(JSON.stringify({ asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: "Visual" }] }));
  const padded = Math.ceil(raw.length / 4) * 4;
  const bytes = new Uint8Array(20 + padded); bytes.fill(32, 20);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, bytes.length, true);
  view.setUint32(12, padded, true); view.setUint32(16, 0x4e4f534a, true); bytes.set(raw, 20);
  return bytes;
}

function externalGltf(uri = "mesh.bin") {
  const binary = new Uint8Array(72);
  new Float32Array(binary.buffer, 0, 12).set([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
  new Uint16Array(binary.buffer, 48, 12).set([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]);
  const source = new TextEncoder().encode(JSON.stringify({ asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    buffers: [{ uri, byteLength: binary.length }], bufferViews: [{ buffer: 0, byteLength: 48 }, { buffer: 0, byteOffset: 48, byteLength: 24 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 4, type: "VEC3", min: [0, 0, 0], max: [1, 1, 1] },
      { bufferView: 1, componentType: 5123, count: 12, type: "SCALAR" }] }));
  return { source, binary };
}

describe("native game tools in 3D", () => {
  beforeEach(async () => {
    initTestDb(); directory = await mkdtemp(join(tmpdir(), "nodetool-agent-game3d-"));
    await Project.insertNew({ id: PROJECT, user_id: USER, name: "3D Game", kind: "game" });
    await Workspace.create({ user_id: USER, project_id: PROJECT, name: "Game files", path: directory, is_default: false });
  });
  afterEach(async () => { ModelObserver.clear(); await rm(directory, { recursive: true, force: true }); });

  it("keeps omitted dimension in 2D and edits the 3D spatial draft through a short ID", async () => {
    const { run } = await agent();
    expect(replyDocument(await run.invoke("create_native_game", { project_id: PROJECT, name: "Legacy" })).document.schemaVersion).toBe(4);
    const created = replyDocument(await run.invoke("create_native_game", { project_id: PROJECT, name: "Exploration", dimension: "3d" }));
    if (created.document.schemaVersion !== 3) { throw new Error("Expected 3D document"); }
    const shortId = created.document.id.slice(0, 12);
    const outline = readRecord(await run.invoke("get_native_game", { game_id: shortId }));
    expect(outline.outline).toMatchObject({ settings: { dimension: "3d" }, scenes: [{ activeCameraId: "camera" }] });
    const edited = replyDocument(await run.invoke("edit_native_game", { game_id: shortId,
      ops: [{ op: "update_entity", entity_id: "player", set: { transform3d: { position: { x: 2 } } } }] }));
    if (edited.document.schemaVersion !== 3) { throw new Error("Expected 3D document"); }
    expect(edited.document.scenes[0].entities.find((entity) => entity.id === "player")?.transform3d.position.x).toBe(2);
    const other = await agent("another-user");
    expect(await other.run.invoke("get_native_game", { game_id: shortId })).toEqual({ error: "Game not found" });
    expect(await run.invoke("autoplay_native_game", { game_id: shortId })).toMatchObject({ status: "unsupported", code: "autoplay_3d_unsupported" });
  });

  it("sets presentation-only render culling and frame budgets through edit_native_game", async () => {
    const { run } = await agent();
    const created = replyDocument(await run.invoke("create_native_game", { project_id: PROJECT, name: "Culling", dimension: "3d" }));
    const missingLayer = readRecord(await run.invoke("edit_native_game", { game_id: created.document.id,
      ops: [{ op: "update_entity", entity_id: "crate", set: { renderCulling: { layer: "props" } } }] }));
    expect(JSON.stringify(missingLayer)).toContain("Cull layer props is not declared");
    const edited = replyDocument(await run.invoke("edit_native_game", { game_id: created.document.id, ops: [
      { op: "set_performance", performance: { cullLayers: { props: { maxDistance: 40 } }, budgets: { drawCalls: 300 } } },
      { op: "update_entity", entity_id: "crate", set: { renderCulling: { layer: "props" } } }
    ] }));
    if (edited.document.schemaVersion !== 3) { throw new Error("Expected 3D document"); }
    expect(edited.document.performance).toEqual({ cullLayers: { props: { maxDistance: 40 } }, budgets: { drawCalls: 300 } });
    expect(edited.document.scenes[0].entities.find((entity) => entity.id === "crate")?.renderCulling).toEqual({ layer: "props" });
  });

  it("names collision layers, a layer matrix and collider layers through edit_native_game", async () => {
    const { run } = await agent();
    const created = replyDocument(await run.invoke("create_native_game", { project_id: PROJECT, name: "Layers", dimension: "3d" }));
    const missingLayer = readRecord(await run.invoke("edit_native_game", { game_id: created.document.id,
      ops: [{ op: "update_entity", entity_id: "crate", set: { collider3d: { layer: "debris" } } }] }));
    expect(JSON.stringify(missingLayer)).toContain("Collision layer debris is not declared");
    const edited = replyDocument(await run.invoke("edit_native_game", { game_id: created.document.id, ops: [
      { op: "set_game", collision_layers: ["world", "debris"], collision_matrix: [["debris", "world"]] },
      { op: "update_entity", entity_id: "crate", set: { collider3d: { layer: "debris" } } }
    ] }));
    if (edited.document.schemaVersion !== 3) { throw new Error("Expected 3D document"); }
    expect(edited.document.collisionMatrix).toEqual([["debris", "world"]]);
    expect(edited.document.scenes[0].entities.find((entity) => entity.id === "crate")?.collider3d).toMatchObject({ layer: "debris", category: 1, mask: 0xffff });
    const outline = readRecord(await run.invoke("get_native_game", { game_id: created.document.id }));
    expect(JSON.stringify(outline)).toContain("\"collisionMatrix\":[[\"debris\",\"world\"]]");
  });

  it("stores and removes a document animation graph through edit_native_game", async () => {
    const { run } = await agent();
    const created = replyDocument(await run.invoke("create_native_game", { project_id: PROJECT, name: "Locomotion", dimension: "3d" }));
    const graph = { parameters: { speed: { kind: "float", default: 0 } }, layers: [{ id: "base", initialState: "move", states: {
      move: { motion: { kind: "blend1d", parameter: "speed", points: [{ value: 0, clip: "idle" }, { value: 2, clip: "walk" }, { value: 6, clip: "run" }] } } } }] };
    const stored = replyDocument(await run.invoke("edit_native_game", { game_id: created.document.id,
      ops: [{ op: "set_animation_graph", graph_id: "locomotion", graph }] }));
    if (stored.document.schemaVersion !== 3) { throw new Error("Expected 3D document"); }
    expect(stored.document.animationGraphs?.locomotion?.parameters.speed).toEqual({ kind: "float", default: 0 });
    expect(await run.invoke("edit_native_game", { game_id: created.document.id, ops: [{ op: "remove_animation_graph", graph_id: "missing" }] }))
      .toMatchObject({ error: "Game edit rejected", issues: [{ op_index: 0, path: ["graph_id"], message: "Animation graph does not exist" }] });
    const removed = replyDocument(await run.invoke("edit_native_game", { game_id: created.document.id,
      ops: [{ op: "remove_animation_graph", graph_id: "locomotion" }] }));
    if (removed.document.schemaVersion !== 3) { throw new Error("Expected 3D document"); }
    expect(removed.document.animationGraphs).toBeUndefined();
  });

  it("consumes analog input and restores the same physics/script snapshot hash", async () => {
    const { run } = await agent();
    const created = replyDocument(await run.invoke("create_native_game", { project_id: PROJECT, name: "Replay", dimension: "3d" }));
    const played = readRecord(await run.invoke("playtest_native_game", { game_id: created.document.id, inputs: [{ pressed: [], axes: { moveZ: -1 }, ticks: 30 }],
      restore_at_tick: 10, assertions: [{ no_script_errors: true }, { replay_matches: true }, { at_tick: 0, entity_id: "player", near: { x: 0, y: 1, z: 3, tolerance: 0 } },
        { entity_id: "player", region: { min: { x: -1, y: 0, z: -10 }, max: { x: 1, y: 2, z: 3 } } }] }));
    expect(played).toMatchObject({ ticks: 30, dimension: "3d", replay_matches: true, script_error: null, route_complete: true });
    expect(Array.isArray(played.assertion_results) && played.assertion_results.every((result) => readRecord(result).passed === true)).toBe(true);
    const snapshot = gameSnapshot3D.parse(played.snapshot);
    expect(snapshot.physics.bytes.length).toBeGreaterThan(0);
    expect(snapshot.entities.find((entity) => entity.id === "player")?.transform.position.z).toBeLessThan(3);
    const resumed = readRecord(await run.invoke("playtest_native_game", { game_id: created.document.id, snapshot, inputs: [{ pressed: [], ticks: 2 }] }));
    expect(resumed.ticks).toBe(32);
    expect(inputFrames3D([{ pressed: [], axes: { moveX: 2 } }])).toMatchObject({ error: "Invalid 3D input frame" });
  });

  it("prepares an owned GLB candidate and installs only on the explicit tool call", async () => {
    const { run, workspace } = await agent();
    const created = replyDocument(await run.invoke("create_native_game", { project_id: PROJECT, name: "Model import", dimension: "3d" }));
    await workspace.write("character.glb", closedGlb(), "model/gltf-binary");
    const candidate = readRecord(await run.invoke("generate_game_asset", { game_id: created.document.id, slot: "character", kind: "model", input_file: "character.glb" }));
    expect(candidate).toMatchObject({ installed: false, binding: { mediaKind: "model", nodeIds: ["node:0", "node:1"] } });
    expect((await Game.readDraft(USER, created.document.id, workspace))?.document.assets.character).toBeUndefined();
    const installed = replyDocument(await run.invoke("install_native_game_asset", { game_id: created.document.id, slot: "character", binding: candidate.binding }));
    expect(installed.document.assets.character).toMatchObject({ mediaKind: "model", nodeIds: ["node:0", "node:1"] });
    expect(installed.document.assets.character.assetId).toHaveLength(32);
    expect(await run.invoke("generate_game_asset", { game_id: created.document.id, slot: "character", kind: "model", input_file: "../private.glb" })).toMatchObject({ error: expect.stringContaining("workspace-relative") });
  });

  it("stages the model_3d ref a TextTo3D node returns", async () => {
    const { workspace } = await agent();
    const runner = async () => ({ output: { type: "model_3d", data: closedGlb() } });
    const context = { userId: USER, workspace, assetStorage: new InMemoryStorageAdapter(), resolveAssetBytes: async () => ({ bytes: null }),
      get: (key: string) => (key === GAME_ASSET_NODE_RUNNER_CONTEXT_KEY ? runner : undefined) } as unknown as ProcessingContext;
    const run = createCapabilityRun({ context, gate: UNGATED });
    const created = replyDocument(await run.invoke("create_native_game", { project_id: PROJECT, name: "Generated model", dimension: "3d" }));
    const candidate = readRecord(await run.invoke("generate_game_asset", { game_id: created.document.id, slot: "crate", kind: "model",
      node_type: "nodetool.model3d.TextTo3D", params: { prompt: "a wooden crate" } }));
    expect(candidate).toMatchObject({ installed: false, binding: { mediaKind: "model" } });
  });

  it("refuses an HDRI candidate whose bytes and dimensions no preparation verified", async () => {
    const { run, workspace } = await agent();
    const created = replyDocument(await run.invoke("create_native_game", { project_id: PROJECT, name: "Sky", dimension: "3d" }));
    const bytes = new TextEncoder().encode("#?RADIANCE\nnot an image");
    const digest = createHash("sha256").update(bytes).digest("hex");
    for (const extension of ["hdr", "png"]) { await workspace.write(`games/${created.document.id}/assets/${digest}.${extension}`, bytes, "application/octet-stream"); }
    const binding = { mediaKind: "hdri", assetId: "sky", digest, format: "hdr", width: 2048, height: 1024, byteLength: bytes.length, preparationVersion: "1" };
    expect(await run.invoke("install_native_game_asset", { game_id: created.document.id, slot: "sky", binding }))
      .toEqual({ error: "HDRI candidates cannot be installed until HDRI preparation verifies their bytes and dimensions" });
    expect((await Game.readDraft(USER, created.document.id, workspace))?.document.assets.sky).toBeUndefined();
  });

  it("normalizes owned glTF dependencies and installs the digest of the normalized GLB", async () => {
    const { source, binary } = externalGltf();
    const sourceAsset = await Asset.create({ user_id: USER, project_id: PROJECT, parent_id: USER, name: "authored.gltf", content_type: "model/gltf+json", size: source.length });
    if (!(sourceAsset instanceof Asset)) { throw new Error("Source asset missing"); }
    const { run, workspace } = await agent(USER, new Map([[`asset://${sourceAsset.id}`, source]]));
    const created = replyDocument(await run.invoke("create_native_game", { project_id: PROJECT, name: "Source normalization", dimension: "3d" }));
    await workspace.write("source/mesh.bin", binary, "application/octet-stream");
    const candidate = readRecord(await run.invoke("generate_game_asset", { game_id: created.document.id, slot: "authored", kind: "model",
      input_file: `asset://${sourceAsset.id.slice(0, 12)}`, dependency_files: { "mesh.bin": "source/mesh.bin" }, preparation: { scale: 2, forward: "+z", origin: "centerGround" } }));
    const binding = readRecord(candidate.binding);
    expect(binding).toMatchObject({ sourceAssetId: sourceAsset.id, sourceDigest: createHash("sha256").update(source).digest("hex"),
      importSettings: { scale: 2, forward: "+z", origin: "centerGround" }, triangles: 4 });
    expect(binding.digest).not.toBe(binding.sourceDigest);
    if (typeof binding.digest !== "string") { throw new Error("Digest missing"); }
    const staged = await workspace.read(`games/${created.document.id}/assets/${binding.digest}.glb`);
    expect(staged && createHash("sha256").update(staged).digest("hex")).toBe(binding.digest);
    const installed = replyDocument(await run.invoke("install_native_game_asset", { game_id: created.document.id, slot: "authored", binding }));
    expect(installed.document.assets.authored).toMatchObject({ digest: binding.digest, sourceAssetId: sourceAsset.id, sourceDigest: binding.sourceDigest, importSettings: binding.importSettings });
    await workspace.write("source/unsafe.gltf", externalGltf("../../private.bin").source, "model/gltf+json");
    const denied = readRecord(await run.invoke("generate_game_asset", { game_id: created.document.id, slot: "unsafe", kind: "model", input_file: "source/unsafe.gltf" }));
    expect(denied).toMatchObject({ error: "Model preparation failed", diagnostics: [{ message: expect.stringContaining("workspace-relative") }] });
  });

  it("generates a collider candidate and refuses mismatched or unsafe runtime geometry", async () => {
    const { run, workspace } = await agent();
    const created = replyDocument(await run.invoke("create_native_game", { project_id: PROJECT, name: "Collider candidate", dimension: "3d" }));
    const { source, binary } = externalGltf();
    await workspace.write("source/mesh.gltf", source, "model/gltf+json");
    await workspace.write("source/mesh.bin", binary, "application/octet-stream");
    const candidate = readRecord(await run.invoke("generate_game_asset", { game_id: created.document.id, slot: "terrain", kind: "collider",
      input_file: "source/mesh.gltf", preparation: { shape: "triangleMesh" } }));
    expect(candidate).toMatchObject({ installed: false, binding: { mediaKind: "collider", shape: "triangleMesh", vertices: 4, triangles: 4 } });
    const installed = replyDocument(await run.invoke("install_native_game_asset", { game_id: created.document.id, slot: "terrain", binding: candidate.binding }));
    const bound = installed.document.assets.terrain;
    await run.invoke("edit_native_game", { game_id: created.document.id, ops: [
      { op: "bind_asset", slot: "terrain", binding: { ...bound, vertices: 5 } },
      { op: "update_entity", entity_id: "floor", set: { collider3d: { kind: "triangleMesh", assetId: "terrain" } } }
    ] });
    expect(await run.invoke("playtest_native_game", { game_id: created.document.id, inputs: [] })).toMatchObject({ error: expect.stringContaining("does not match its binding"), code: "game3d_preparation_failed" });
    await workspace.write("bad.json", new TextEncoder().encode(JSON.stringify({ vertices: [0, 0, 0, 1e100, 0, 0, 0, 1e100, 0] })), "application/json");
    expect(await run.invoke("generate_game_asset", { game_id: created.document.id, slot: "bad", kind: "collider", input_file: "bad.json", preparation: { shape: "convexHull" } })).toMatchObject({ error: expect.stringContaining("precision") });
  });

  it("captures the real renderer with the same committed simulation hash and projected bounds", async () => {
    const { run, workspace } = await agent();
    const created = replyDocument(await run.invoke("create_native_game", { project_id: PROJECT, name: "Capture", dimension: "3d" }));
    const inputs = [{ pressed: [], axes: { moveZ: -1 }, ticks: 15 }];
    const played = readRecord(await run.invoke("playtest_native_game", { game_id: created.document.id, inputs }));
    const captured = readRecord(await run.invoke("capture_native_game_frame", { game_id: created.document.id, inputs, ticks: [15], overlays: ["bounds"], scale: 0.5 }));
    if (!Array.isArray(captured.frames) || !captured.frames[0]) { throw new Error(`Capture failed: ${JSON.stringify(captured)}`); }
    const frame = readRecord(captured.frames[0]);
    expect(frame.state_hash).toBe(played.state_hash);
    expect(frame.capabilities).toMatchObject({ backend: "webgl2" });
    expect(Array.isArray(frame.projected_bounds) && frame.projected_bounds.length).toBeGreaterThan(0);
    const image = readRecord(frame.image);
    if (typeof image.path !== "string") { throw new Error("Capture image path missing"); }
    expect((await workspace.read(image.path))?.length).toBeGreaterThan(100);
  });

  it("exports a pinned 3D revision with all runtime artifacts", async () => {
    const { run } = await agent();
    const created = replyDocument(await run.invoke("create_native_game", { project_id: PROJECT, name: "Export", dimension: "3d" }));
    const built = readRecord(await run.invoke("build_native_game", { game_id: created.document.id }));
    expect(built).toMatchObject({ game_id: created.document.id, revision: created.document.revision, cached: false });
    if (typeof built.build_path !== "string" || typeof built.entry_path !== "string") { throw new Error("Build paths missing"); }
    expect(await readFile(join(directory, built.entry_path), "utf8")).toContain("NodeTool 3D Game");
    const manifest = JSON.parse(await readFile(join(directory, built.build_path, "manifest.json"), "utf8"));
    expect(manifest).toMatchObject({ dimension: "3d", sourceRevision: created.document.revision });
    expect(manifest.files["emscripten-module.wasm"]).toHaveLength(64);
  });
});
