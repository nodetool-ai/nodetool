import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, copyFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { z } from "zod";
import { Game, NativeGameStore, Project, Workspace } from "@nodetool-ai/models";
import { workspaceFromRow } from "@nodetool-ai/execution/service";
import { isShortResourceId, shortResourceId, nativeGameScriptDeclarations } from "@nodetool-ai/protocol";
import { nativeGameDocument, nativeGameDocumentJsonSchema, nativeGameScriptCommandJsonSchema, nativeGame2dScriptCommandJsonSchema, nativeGame2dTransactionJsonSchema, nativeGameTransactionJsonSchema, nativeGameTransactionForDimension, type NativeGameDocument } from "@nodetool-ai/protocol/native-game";
import { NativeGameWorker, NativeGameWorkerError, nativeCppExecutable, requestNativeEditor, NativeEditorError, simulateNativeCppGame, captureNativeCppGame, benchmarkNativeCppGame, exportNativeCppGame } from "@nodetool-ai/game-runtime/native";
import type { Workspace as RunWorkspace } from "@nodetool-ai/runtime";
import type { CapabilityExport, CapabilityModule, CapabilityRun } from "./types.js";
import { nativeCppGameSchemas, nativeCppGameSpecs } from "./native-cpp-game.specs.js";
import { persistOutput } from "../tools/asset-persist.js";

const inspectedDocument = z.object({ document: nativeGameDocument });
function signal(run: CapabilityRun): AbortSignal | undefined { return run.signal ?? run.context.signal; }
function worker(): NativeGameWorker {
  return new NativeGameWorker({ executable: nativeCppExecutable("worker") });
}
async function withWorker<T>(run: CapabilityRun, action: (client: NativeGameWorker) => Promise<T>): Promise<T> {
  signal(run)?.throwIfAborted();
  const client = worker();
  try { return await action(client); } finally { client.close(); }
}
async function owned(run: CapabilityRun, id: string) {
  const user = run.context.userId;
  if (!user) { throw new Error("A user session is required"); }
  const game = await Game.findOwned(user, id);
  if (!game || !await Project.findOwned(user, game.project_id)) { throw new Error("Game not found"); }
  const row = await Workspace.find(user, game.workspace_id);
  if (!row || row.project_id !== game.project_id) { throw new Error("Game workspace not found"); }
  const workspace = workspaceFromRow(row);
  if (!workspace) { throw new Error("Game workspace is unavailable"); }
  const saved = await NativeGameStore.read(user, game.id, workspace);
  if (!saved) { throw new Error("Native game source not found"); }
  return { user, game, workspace, document: saved.document };
}
function digest(document: NativeGameDocument) {
  return { engine: document.engine, dimension: document.dimension, schema_version: document.schemaVersion, revision: document.revision, game_id: shortResourceId(document.id),
    document_digest: createHash("sha256").update(JSON.stringify(document)).digest("hex"),
    manifest_digest: createHash("sha256").update(JSON.stringify(document.assets)).digest("hex"),
    script_count: document.scripts.length,
    source_digests: document.scripts.slice(0, 100).map((script) => ({ script_id: script.id, digest: createHash("sha256").update(script.source).digest("hex") })) };
}
async function stage<T>(workspace: RunWorkspace, game: Game, document: NativeGameDocument, action: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(await workspace.scratchDir(), ".native-game-tool-"));
  try {
    let bytes = 0;
    for (const asset of document.assets) {
      bytes += asset.size;
      if (bytes > 256 * 1024 * 1024) { throw new Error("Game assets exceed staging budget"); }
      const path = workspace.key(`${game.source_root}/${asset.path}`);
      const stat = await workspace.stat(path);
      if (!stat || stat.isDirectory || stat.size !== asset.size || stat.size > 64 * 1024 * 1024) { throw new Error("Prepared asset size mismatch or staging limit exceeded"); }
      const source = await workspace.materialize(path);
      const target = join(directory, asset.path);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(source, target);
    }
    return await action(directory);
  } finally { await rm(directory, { recursive: true, force: true }); }
}
async function apply(run: CapabilityRun, id: string, expected: number, operations: unknown[]) {
  const state = await owned(run, id);
  if (state.document.revision !== expected) { return { status: "conflict", current_revision: state.document.revision }; }
  const transaction = nativeGameTransactionForDimension(state.document.dimension).parse({ requestId: randomUUID(), expectedRevision: expected, operations });
  const candidate = await withWorker(run, async (client) => {
    await client.request("open", { sessionId: "edit", document: state.document }, { signal: signal(run) });
    await client.request("transaction", { sessionId: "edit", ...transaction }, { signal: signal(run) });
    const result = await client.request("inspect", { sessionId: "edit" }, { signal: signal(run) });
    return nativeGameDocument.parse(inspectedDocument.parse(result).document);
  });
  const saved = await NativeGameStore.save(state.user, state.game.id, expected, candidate, state.workspace);
  return saved ? { status: "ok", ...digest(saved.document) } : { status: "conflict", current_revision: (await NativeGameStore.read(state.user, state.game.id, state.workspace))?.document.revision };
}
const handlers: readonly CapabilityExport["impl"][] = [
  async (run, raw) => { const { dimension } = nativeCppGameSchemas.schema.parse(raw); return withWorker(run, async (client) => ({ dimension, document_schema: nativeGameDocumentJsonSchema(), transaction_schema: dimension === "2d" ? nativeGame2dTransactionJsonSchema() : nativeGameTransactionJsonSchema(), command_schema: dimension === "2d" ? nativeGame2dScriptCommandJsonSchema() : nativeGameScriptCommandJsonSchema(), script_declarations: nativeGameScriptDeclarations(dimension), script_example: "input => ({state:{ticks:(input.state.ticks||0)+1},commands:[{kind:\"score\",amount:1}]})", capabilities: await client.request("hello", {}, { signal: signal(run) }) })); },
  async (run, raw) => {
    const args = nativeCppGameSchemas.create.parse(raw);
    const user = run.context.userId;
    if (!user) { throw new Error("A user session is required"); }
    const project = await Project.findOwned(user, args.project_id);
    if (!project) { throw new Error("Project not found"); }
    const matches = isShortResourceId(args.workspace_id) ? (await Workspace.listByProject(user, project.id)).filter((row) => row.id.startsWith(args.workspace_id)) : [];
    if (matches.length > 1) { throw new Error("Workspace ID prefix is ambiguous"); }
    const row = isShortResourceId(args.workspace_id) ? matches[0] : await Workspace.find(user, args.workspace_id);
    if (!row || row.project_id !== project.id) { throw new Error("Workspace not found"); }
    const workspace = workspaceFromRow(row);
    if (!workspace) { throw new Error("Workspace storage unavailable"); }
    const document = nativeGameDocument.parse({ ...args.document, id: randomUUID().replace(/-/g, ""), revision: 0 });
    await withWorker(run, (client) => client.request("validate", { document }, { signal: signal(run) }));
    const source = JSON.stringify(document), hash = createHash("sha256").update(source).digest("hex");
    await workspace.write(`games/${document.id}/native/${hash}.json`, source, "application/json");
    const game = await Game.insertNew({ id: document.id, userId: user, projectId: project.id, workspaceId: row.id, name: document.title, revision: "0", draftVersionId: hash });
    if (!game) { throw new Error("Game already exists"); }
    return { status: "ok", ...digest(document) };
  },
  async (run, raw) => {
    const args = nativeCppGameSchemas.get.parse(raw), { document } = await owned(run, args.game_id);
    if (args.view === "document") {
      if (JSON.stringify(document).length > 256 * 1024) { throw new Error("Document exceeds tool output budget. Use paginated outline and entity/script views."); }
      return { ...digest(document), document };
    }
    if (args.view === "script") {
      const script = document.scripts.find((item) => item.id === args.script_id);
      return { ...digest(document), script: script ? { ...script, source: script.source.slice(args.source_offset, args.source_offset + args.source_limit), source_length: script.source.length, source_offset: args.source_offset, next_source_offset: args.source_offset + args.source_limit < script.source.length ? args.source_offset + args.source_limit : null } : null };
    }
    if (args.view === "assets") { return { ...digest(document), assets: document.assets.slice(args.offset, args.offset + args.limit), total: document.assets.length, next_offset: args.offset + args.limit < document.assets.length ? args.offset + args.limit : null }; }
    const entities = document.scenes.flatMap((scene) => scene.entities.map((entity) => ({ ...entity, scene_id: scene.id })));
    if (args.view === "entity") { return { ...digest(document), entity: entities.find((entity) => entity.id === args.entity_id) ?? null }; }
    const fields = args.fields ?? ["id", "name", "transform"];
    const page = entities.slice(args.offset, args.offset + args.limit).map((entity) => Object.fromEntries([...["scene_id"].map((field) => [field, entity.scene_id]), ...fields.map((field) => [field, Object.entries(entity).find(([name]) => name === field)?.[1]])]));
    return { ...digest(document), title: document.title, total: entities.length, offset: args.offset, entities: page,
      next_offset: args.offset + args.limit < entities.length ? args.offset + args.limit : null, scenes: document.scenes.map((scene) => ({ id: scene.id, name: scene.name })), assets: document.assets.slice(0, 100), asset_count: document.assets.length, scripts: digest(document).source_digests };
  },
  async (run, raw) => { const args = nativeCppGameSchemas.edit.parse(raw); return apply(run, args.game_id, args.expected_revision, args.operations); },
  async (run, raw) => {
    const args = nativeCppGameSchemas.simulate.parse(raw), { document } = await owned(run, args.game_id);
    return { ...digest(document), report: await simulateNativeCppGame(document, { ticks: args.ticks, seed: args.seed, inputs: args.inputs, assertions: args.assertions, verifyReplay: args.verify_replay, signal: signal(run) }) };
  },
  async (run, raw) => {
    const args = nativeCppGameSchemas.capture.parse(raw), state = await owned(run, args.game_id);
    return stage(state.workspace, state.game, state.document, async (directory) => {
      const out = join(directory, "capture.png");
      const report = await captureNativeCppGame(state.document, { assetsDir: directory, out, ticks: args.ticks, seed: args.seed, inputs: args.inputs, signal: signal(run) });
      const capturePath = `${state.game.source_root}/captures/${randomUUID().replace(/-/g, "")}.png`;
      await state.workspace.absorb(out, capturePath);
      const image = await persistOutput(run.context, await readFile(out), { namePrefix: "native-game", mime: "image/png" });
      return { ...digest(state.document), image: { ...image, workspace_id: shortResourceId(state.game.workspace_id), workspace_uri: state.workspace.uri(capturePath), workspace_path: capturePath }, report: { ...report, out: state.workspace.uri(capturePath) } };
    });
  },
  async (run, raw) => {
    const args = nativeCppGameSchemas.bench.parse(raw), { document } = await owned(run, args.game_id);
    return { ...digest(document), report: await benchmarkNativeCppGame(document, { ticks: args.ticks, warmup: args.warmup, seed: args.seed, inputs: args.inputs, signal: signal(run) }) };
  },
  async (run, raw) => {
    const args = nativeCppGameSchemas.export.parse(raw), state = await owned(run, args.game_id);
    return stage(state.workspace, state.game, state.document, async (directory) => {
      const out = join(directory, "export");
      const report = await exportNativeCppGame(state.document, { assetsDir: directory, out, target: args.target, signal: signal(run) });
      const destination = `${state.game.source_root}/exports/${randomUUID().replace(/-/g, "")}`;
      let count = 0;
      const copy = async (local: string, relative: string): Promise<void> => {
        for (const entry of await readdir(local, { withFileTypes: true })) {
          signal(run)?.throwIfAborted();
          if (++count > 2048 || entry.isSymbolicLink()) { throw new Error("Export file budget or symlink restriction exceeded"); }
          const child = relative ? `${relative}/${entry.name}` : entry.name;
          if (entry.isDirectory()) { await copy(join(local, entry.name), child); }
          else { await state.workspace.absorb(join(local, entry.name), `${destination}/${child}`); }
        }
      };
      await copy(out, "");
      return { ...digest(state.document), artifact: { uri: state.workspace.uri(destination), path: destination, files: count }, report: { ...report, output: state.workspace.uri(destination) } };
    });
  },
  async (run, raw) => {
    const args = nativeCppGameSchemas.editor.parse(raw), state = await owned(run, args.game_id);
    const socket = process.env.NODETOOL_NATIVE_GAME_EDITOR_SOCKET;
    if (!socket) { throw new Error("A live native editor is not configured"); }
    const inspected = await requestNativeEditor(socket, { operation: "inspect" }, { signal: signal(run), documentId: state.game.id });
    if (inspected.document.id !== state.game.id) { throw new Error("The live editor has a different game open"); }
    const result = args.request.operation === "inspect" ? inspected : await requestNativeEditor(socket, args.request, { signal: signal(run), documentId: state.game.id, dimension: inspected.document.dimension });
    if (result.document.id !== state.game.id) { throw new Error("The live editor changed its open game"); }
    return { ...digest(result.document), editor_revision: result.revision, playing: result.playing,
      entities: result.document.scenes.flatMap((scene) => scene.entities.map((entity) => ({ scene_id: scene.id, id: entity.id, name: entity.name, transform: entity.transform }))).slice(0, 100) };
  },
  async (run, raw) => {
    const args = nativeCppGameSchemas.install.parse(raw), state = await owned(run, args.game_id);
    if (state.document.revision !== args.expected_revision) { return { status: "conflict", current_revision: state.document.revision }; }
    const source = state.workspace.key(args.source_path), stat = await state.workspace.stat(source);
    if (!stat || stat.isDirectory || stat.size > 64 * 1024 * 1024) { throw new Error("Asset is missing or exceeds size budget"); }
    const bytes = await state.workspace.read(source);
    if (!bytes || bytes.length > 64 * 1024 * 1024) { throw new Error("Asset source is unavailable or exceeds size budget"); }
    const hash = createHash("sha256").update(bytes).digest("hex"), path = `assets/${hash}`;
    await state.workspace.write(`${state.game.source_root}/${path}`, bytes);
    return apply(run, state.game.id, args.expected_revision, [{ kind: "setAsset", asset: { id: args.asset_id, kind: args.kind, digest: hash, path, size: bytes.length } }]);
  }
];
export const module: CapabilityModule = {
  module: "native-cpp-game",
  exports: nativeCppGameSpecs.map((spec, index) => ({ spec, impl: async (run, args) => {
    const handler = handlers[index];
    if (!handler) { throw new Error("Missing native game capability"); }
    try {
      const result = await handler(run, args);
      if (JSON.stringify(result).length > 256 * 1024) { return { status: "error", code: "output_limit", message: "Result exceeds tool output budget. Use focused entity/script views or shorter runs." }; }
      return result;
    }
    catch (error) {
      if (error instanceof NativeEditorError) { return { status: "error", code: error.code, message: error.message, current_revision: error.currentRevision }; }
      if (error instanceof NativeGameWorkerError) { return { status: "error", code: error.code, message: error.message, path: error.path, details: error.details, current_revision: error.currentRevision }; }
      return { status: "error", message: error instanceof Error ? error.message : String(error) };
    }
  } }))
};
