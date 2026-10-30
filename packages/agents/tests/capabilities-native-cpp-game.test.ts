import { mkdtemp, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import { createServer } from "node:net";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { ModelObserver, Project, Workspace, initTestDb } from "@nodetool-ai/models";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import { nativeGameDocument } from "@nodetool-ai/protocol/native-game";
import { nativeCppGameSpecs } from "../src/capabilities/native-cpp-game.specs.js";

const nativeWorkerExecutable = process.env.NODETOOL_NATIVE_GAME_WORKER ?? resolve("../../native/game/build/game-worker");
let directory: string;
let workspaceId: string;
const USER = "native-cpp-owner", PROJECT = "native-cpp-project";
const source = nativeGameDocument.parse({ schemaVersion: 4, engine: "native-cpp-1", dimension: "3d", id: "draft", title: "Agent course", initialSceneId: "course", scenes: [{ id: "course", entities: [{ id: "counter", behaviors: [{ id: "score", scriptId: "logic" }] }] }], scripts: [{ id: "logic", source: "input => ({state:{n:(input.state.n||0)+1},commands:[{kind:'score',amount:1}]})" }] });
const createdReply = z.object({ status: z.literal("ok"), game_id: z.string(), revision: z.number() });
const agent = (user = USER) => createCapabilityRun({ context: new ProcessingContext({ jobId: "cpp-authoring", userId: user }), gate: UNGATED });
beforeEach(async () => {
  initTestDb(); directory = await mkdtemp(join(tmpdir(), "native-cpp-agent-"));
  await Project.insertNew({ id: PROJECT, user_id: USER, name: "Native", kind: "game" });
  workspaceId = (await Workspace.create({ user_id: USER, project_id: PROJECT, name: "Files", path: directory, is_default: false })).id;
  vi.stubEnv("NODETOOL_NATIVE_GAME_WORKER", nativeWorkerExecutable);
});
afterEach(async () => { ModelObserver.clear(); vi.unstubAllEnvs(); await rm(directory, { recursive: true, force: true }); });
it("authors through compact IDs, rejects invalid/stale edits, saves and verifies QuickJS replay", async () => {
  const run = agent();
  const created = createdReply.parse(await run.invoke("native_cpp_game_create", { project_id: PROJECT, workspace_id: workspaceId.slice(0, 12), document: source }));
  expect(created.game_id).toHaveLength(12);
  expect(await run.invoke("native_cpp_game_edit", { game_id: created.game_id, expected_revision: 0, operations: [{ kind: "setScript", script: { id: "logic", source: "({broken" } }] })).toMatchObject({ status: "error" });
  expect(await run.invoke("native_cpp_game_get", { game_id: created.game_id })).toMatchObject({ revision: 0, entities: [{ id: "counter" }] });
  expect(await run.invoke("native_cpp_game_edit", { game_id: created.game_id, expected_revision: 0, operations: [{ kind: "setTitle", title: "Changed" }] })).toMatchObject({ status: "ok", revision: 1 });
  expect(await run.invoke("native_cpp_game_edit", { game_id: created.game_id, expected_revision: 0, operations: [{ kind: "setTitle", title: "Lost" }] })).toMatchObject({ status: "conflict", current_revision: 1 });
  expect(await run.invoke("native_cpp_game_get", { game_id: created.game_id, view: "document" })).toMatchObject({ document: { title: "Changed", revision: 1 } });
  const simulated = await run.invoke("native_cpp_game_simulate", { game_id: created.game_id, ticks: 4, verify_replay: true, assertions: [{ tick: 4, path: ["score"], equals: 4 }] });
  expect(simulated).not.toHaveProperty("status", "error");
  expect(simulated).toMatchObject({ revision: 1, report: { engine: "native-cpp-1" } });
  expect(await agent("other").invoke("native_cpp_game_get", { game_id: created.game_id })).toMatchObject({ status: "error", message: "Game not found" });
});
it("installs immutable workspace bytes and exposes field-selected paginated inspection", async () => {
  const run = agent(), created = createdReply.parse(await run.invoke("native_cpp_game_create", { project_id: PROJECT, workspace_id: workspaceId, document: source }));
  await writeFile(join(directory, "sound.wav"), new Uint8Array([1, 2, 3]));
  expect(await run.invoke("native_cpp_game_install_asset", { game_id: created.game_id, expected_revision: 0, asset_id: "sound", kind: "audio", source_path: "sound.wav" })).toMatchObject({ status: "ok", revision: 1 });
  expect(await run.invoke("native_cpp_game_get", { game_id: created.game_id, fields: ["id"], limit: 1 })).toMatchObject({ entities: [{ id: "counter", scene_id: "course" }], assets: [{ id: "sound", size: 3, digest: expect.stringMatching(/^[a-f0-9]{64}$/) }] });
  expect(await run.invoke("native_cpp_game_install_asset", { game_id: created.game_id, expected_revision: 1, asset_id: "bad", kind: "audio", source_path: "../escape" })).toMatchObject({ status: "error" });
});
it("publishes explicit engine tool metadata and capabilities without opening raw sessions", async () => {
  expect(nativeCppGameSpecs.every((spec) => spec.name.startsWith("native_cpp_game_"))).toBe(true);
  expect(await agent().invoke("native_cpp_game_schema", {})).toMatchObject({ document_schema: { oneOf: expect.any(Array) }, capabilities: { engine: "native-cpp-1" } });
});
it.runIf(process.env.NODETOOL_NATIVE_GAME_PLAYER)("captures through the native player and preserves a durable image artifact", async () => {
  const run = agent(), created = createdReply.parse(await run.invoke("native_cpp_game_create", { project_id: PROJECT, workspace_id: workspaceId, document: source }));
  expect(await run.invoke("native_cpp_game_capture", { game_id: created.game_id, ticks: 2 })).toMatchObject({ image: { bytes: expect.any(Number), workspace_uri: expect.any(String), workspace_path: expect.stringContaining("/captures/") }, report: { tick: 2 } });
});

it.runIf(process.env.NODETOOL_NATIVE_GAME_RUNTIME_DIR)("exports a desktop bundle and preserves its workspace artifact", async () => {
  const run = agent(), created = createdReply.parse(await run.invoke("native_cpp_game_create", { project_id: PROJECT, workspace_id: workspaceId, document: source }));
  const result = z.object({ artifact: z.object({ uri: z.string(), path: z.string(), files: z.number() }), report: z.object({ output: z.string() }) }).parse(await run.invoke("native_cpp_game_export", { game_id: created.game_id }));
  expect(result.artifact.files).toBeGreaterThan(1);
  expect((await stat(join(directory, result.artifact.path))).isDirectory()).toBe(true);
  expect(result.report.output).toBe(result.artifact.uri);
});

it.runIf(process.env.NODETOOL_NATIVE_BROWSER_PROFILE === "1").each(["2d", "3d"] as const)("authors, corrects, reopens, verifies replay and exports native %s through shipped tools", async (dimension) => {
  const document = nativeGameDocument.parse({ ...source, schemaVersion: dimension === "2d" ? 5 : 4, dimension, scenes: [{ id: "course", entities: [{ id: "counter", behaviors: [{ id: "score", scriptId: "logic" }] }] }] });
  const run = agent();
  const created = createdReply.parse(await run.invoke("native_cpp_game_create", { project_id: PROJECT, workspace_id: workspaceId, document }));
  expect(await run.invoke("native_cpp_game_edit", { game_id: created.game_id, expected_revision: 0, operations: [{ kind: "setScript", script: { id: "logic", source: "({broken" } }] })).toMatchObject({ status: "error" });
  expect(await run.invoke("native_cpp_game_edit", { game_id: created.game_id, expected_revision: 0, operations: [{ kind: "setScript", script: { id: "logic", source: "input => ({commands:[{kind:'score',amount:2}]})" } }] })).toMatchObject({ status: "ok", revision: 1 });
  const reopened = agent();
  expect(await reopened.invoke("native_cpp_game_get", { game_id: created.game_id, view: "document" })).toMatchObject({ revision: 1, document: { dimension, revision: 1 } });
  expect(await reopened.invoke("native_cpp_game_simulate", { game_id: created.game_id, ticks: 4, inputs: [{}, {}, {}, {}], verify_replay: true, assertions: [{ tick: 4, path: ["score"], equals: 8 }] })).toMatchObject({ report: { valid: true, replayVerified: true } });
  const exported = z.object({ artifact: z.object({ path: z.string() }), report: z.object({ target: z.literal("web"), entry: z.literal("index.html") }) }).parse(await reopened.invoke("native_cpp_game_export", { game_id: created.game_id, target: "web" }));
  expect((await stat(join(directory, exported.artifact.path, "native-game.wasm"))).size).toBeGreaterThan(0);
});

it("authorizes live editor identity and sends document guards before mutations", async () => {
  const run = agent(), created = createdReply.parse(await run.invoke("native_cpp_game_create", { project_id: PROJECT, workspace_id: workspaceId, document: source }));
  const documentReply = z.object({ document: nativeGameDocument }).parse(await run.invoke("native_cpp_game_get", { game_id: created.game_id, view: "document" }));
  let active = documentReply.document, mutateCount = 0, switchAfterInspect = false;
  const socket = join(directory, "editor.sock");
  const server = createServer((connection) => {
    let buffer = "";
    connection.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      if (!buffer.includes("\n")) { return; }
      const request = z.object({ requestId: z.string(), operation: z.string(), documentId: z.string() }).passthrough().parse(JSON.parse(buffer));
      const envelope = { protocolVersion: 1, requestId: request.requestId };
      if (request.documentId !== active.id) { connection.end(`${JSON.stringify({ ...envelope, status: "error", error: { code: "wrong_document", message: "Editor has another game open" } })}\n`); return; }
      if (request.operation === "transaction") { mutateCount++; active = nativeGameDocument.parse({ ...active, revision: active.revision + 1, title: "Editor changed" }); }
      connection.end(`${JSON.stringify({ ...envelope, status: "ok", result: { document: active, revision: active.revision, playing: false } })}\n`);
      if (switchAfterInspect && request.operation === "inspect") { active = nativeGameDocument.parse({ ...active, id: "another-document" }); }
    });
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(socket, resolve); });
  vi.stubEnv("NODETOOL_NATIVE_GAME_EDITOR_SOCKET", socket);
  try {
    expect(await run.invoke("native_cpp_game_editor", { game_id: created.game_id, request: { operation: "transaction", expectedRevision: 0, operations: [{ kind: "setTitle", title: "Editor changed" }] } })).toMatchObject({ editor_revision: 1 });
    switchAfterInspect = true;
    expect(await run.invoke("native_cpp_game_editor", { game_id: created.game_id, request: { operation: "transaction", expectedRevision: 1, operations: [{ kind: "setTitle", title: "Blocked" }] } })).toMatchObject({ status: "error", code: "wrong_document" });
    expect(mutateCount).toBe(1);
    expect(await agent("other").invoke("native_cpp_game_editor", { game_id: created.game_id, request: { operation: "inspect" } })).toMatchObject({ status: "error", message: "Game not found" });
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});

it("benchmarks an authorized native game through its compact ID with timing and build identity", async () => {
  const run = agent();
  const created = createdReply.parse(await run.invoke("native_cpp_game_create", { project_id: PROJECT, workspace_id: workspaceId, document: source }));
  const result = z.object({
    game_id: z.string(), revision: z.literal(0),
    report: z.object({
      engine: z.literal("native-cpp-1"), engineBuild: z.string().min(1),
      documentDigest: z.string().regex(/^[a-f0-9]{64}$/), manifestDigest: z.string().regex(/^[a-f0-9]{64}$/),
      ticks: z.literal(3), warmup: z.literal(1), metric: z.literal("host-roundtrip-ms"),
      tickMs: z.object({ p50: z.number().finite().nonnegative(), p95: z.number().finite().nonnegative(), max: z.number().finite().nonnegative() })
    })
  }).parse(await run.invoke("native_cpp_game_bench", { game_id: created.game_id, ticks: 3, warmup: 1, seed: 1 }));
  expect(result.game_id).toBe(created.game_id);
  expect(result.report.tickMs.p50).toBeLessThanOrEqual(result.report.tickMs.p95);
  expect(result.report.tickMs.p95).toBeLessThanOrEqual(result.report.tickMs.max);
  expect(await agent("other").invoke("native_cpp_game_bench", { game_id: created.game_id, ticks: 3, warmup: 1 })).toMatchObject({ status: "error", message: "Game not found" });
});

it("keeps2D authoring defaults and schema discovery on the native route", async () => {
  const run = agent();
  const document = nativeGameDocument.parse({ schemaVersion: 5, engine: "native-cpp-1", dimension: "2d", id: "draft2d", title: "Native2D", initialSceneId: "course", scenes: [{ id: "course", entities: [{ id: "actor", body2d: { type: "kinematic" } }] }] });
  const created = createdReply.parse(await run.invoke("native_cpp_game_create", { project_id: PROJECT, workspace_id: workspaceId, document }));
  expect(await run.invoke("native_cpp_game_schema", { dimension: "2d" })).toMatchObject({ dimension: "2d", script_declarations: expect.stringContaining('"x": number') });
  expect(await run.invoke("native_cpp_game_edit", { game_id: created.game_id, expected_revision: 0, operations: [{ kind: "addEntity", sceneId: "course", entity: { id: "added" } }] })).toMatchObject({ status: "ok", revision: 1, dimension: "2d" });
  expect(await run.invoke("native_cpp_game_get", { game_id: created.game_id, view: "entity", entity_id: "added" })).toMatchObject({ entity: { transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } } });
  expect(await run.invoke("native_cpp_game_edit", { game_id: created.game_id, expected_revision: 1, operations: [{ kind: "addEntity", sceneId: "course", entity: { id: "wrong", transform: { position: [0,0,0] } } }] })).toMatchObject({ status: "error" });
  expect(await run.invoke("native_cpp_game_get", { game_id: created.game_id })).toMatchObject({ revision: 1, dimension: "2d" });
});
