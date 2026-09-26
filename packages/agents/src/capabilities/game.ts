import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { getManagedWorkspaceDir, managedWorkspaceKey, workspaceStorageKind } from "@nodetool-ai/config";
import { AmbiguousGameIdError, Asset, Game, Project, Workspace } from "@nodetool-ai/models";
import { gameAssetBinding, gameDocument, gameInputFrame, shortResourceId, type GameDocument } from "@nodetool-ai/protocol";
import { createScriptedGameSession, createTopDownRoomGame, validateGame } from "@nodetool-ai/game-runtime";
import { workspaceFromRow } from "@nodetool-ai/execution/service";
import { assetKeyCandidates, assetObjectKey } from "@nodetool-ai/storage";
import type { Workspace as RunWorkspace } from "@nodetool-ai/runtime";
import type { CapabilityExport, CapabilityModule, CapabilityRun } from "./types.js";
import { gameSpecs } from "./game.specs.js";

const MAX_PLAYTEST_TICKS = 600;
const MAX_RETURNED_EVENTS = 50;
const MAX_BUILD_ASSETS = 128;
const MAX_BUILD_ASSET_BYTES = 64 * 1024 * 1024;
const MAX_BUILD_BYTES = 256 * 1024 * 1024;
const MAX_BUILD_FILES = 256;

const MEDIA_EXTENSIONS: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3"
};

function userId(run: CapabilityRun): string | null {
  return run.context.userId ?? null;
}

async function ownedGame(user: string, id: string): Promise<Game | null> {
  try {
    const game = await Game.findOwned(user, id);
    return game && (await Project.findOwned(user, game.project_id)) ? game : null;
  } catch (error) {
    if (error instanceof AmbiguousGameIdError) return null;
    throw error;
  }
}

function openWorkspace(row: Workspace): RunWorkspace | null {
  return workspaceFromRow(row);
}

async function workspaceOf(user: string, game: Game): Promise<RunWorkspace | null> {
  const row = await Workspace.find(user, game.workspace_id);
  return row && row.project_id === game.project_id ? openWorkspace(row) : null;
}

async function projectWorkspace(user: string, projectId: string): Promise<Workspace | null> {
  const existing = (await Workspace.listByProject(user, projectId))
    .find((row) => row.isAccessible() && (process.env["NODETOOL_ENV"] !== "production" || row.isManaged()));
  if (existing) return existing;
  const defaultRow = await Workspace.ensureDefault(user);
  const managedPath = workspaceStorageKind() === "cloud"
    ? managedWorkspaceKey(user)
    : getManagedWorkspaceDir(user);
  const rootRow = defaultRow.isManaged() ? defaultRow : new Workspace({
    user_id: user,
    name: "Managed workspace",
    path: managedPath,
    is_default: false
  });
  const root = openWorkspace(rootRow);
  if (!root) return null;
  const segment = createHash("sha256").update(projectId).digest("hex");
  await root.mkdir(`projects/${segment}`);
  const path = rootRow.isVirtual()
    ? `${rootRow.path}/projects/${segment}`
    : join(rootRow.path, "projects", segment);
  return (await Workspace.create({
    user_id: user,
    project_id: projectId,
    name: "Game workspace",
    path,
    is_default: false
  })) as Workspace;
}

function revisionPath(game: Game, revision: string): string {
  return `${game.source_root}/revisions/${revision}/game.json`;
}

async function readDocument(workspace: RunWorkspace, game: Game, revision: string): Promise<GameDocument | null> {
  if (!/^[a-f0-9]{32}$/.test(revision)) return null;
  const raw = await workspace.readText(revisionPath(game, revision));
  if (raw === null) return null;
  const parsed = gameDocument.safeParse(JSON.parse(raw));
  return parsed.success && parsed.data.id === game.id && parsed.data.revision === revision
    ? parsed.data
    : null;
}

function validateSource(source: unknown, gameId: string, revision: string): GameDocument | { error: string } {
  const parsed = gameDocument.safeParse(source);
  if (!parsed.success) return { error: parsed.error.message };
  const result = validateGame({ ...parsed.data, id: gameId, revision });
  return result.document ?? { error: result.errors.join("; ") };
}

function summary(game: Game): Record<string, string> {
  return {
    id: game.id,
    name: game.name,
    revision: game.current_revision,
    workspace_id: game.workspace_id
  };
}

async function publish(user: string, game: Game, baseRevision: string, source: unknown): Promise<unknown> {
  if (game.current_revision !== baseRevision) return { error: "Game was modified concurrently", current_revision: game.current_revision };
  const revision = randomUUID().replace(/-/g, "");
  const document = validateSource(source, game.id, revision);
  if ("error" in document) return document;
  const workspace = await workspaceOf(user, game);
  if (!workspace) return { error: "Game workspace is unavailable" };
  await workspace.write(revisionPath(game, revision), JSON.stringify(document), "application/json");
  const updated = await Game.publish(user, game.id, baseRevision, revision);
  if (!updated) return { error: "Game was modified concurrently" };
  return { game: summary(updated), document };
}

const create: CapabilityExport = {
  spec: gameSpecs[0],
  impl: async (run, args) => {
    const user = userId(run);
    const projectId = args["project_id"];
    const name = args["name"];
    if (!user || typeof projectId !== "string" || typeof name !== "string" || !name.trim()) {
      return { error: "project_id and name are required in a user session" };
    }
    const created = await createNativeGame(user, projectId, name.trim());
    return "error" in created
      ? created
      : { game: summary(created.game), document: created.document };
  }
};

/** Shared by explicit game creation and the guided asset workflow builder. */
export async function createNativeGame(user: string, projectId: string, name: string): Promise<{ game: Game; document: GameDocument } | { error: string }> {
    const project = await Project.findOwned(user, projectId);
    if (!project) return { error: "Project not found" };
    const workspaceRow = await projectWorkspace(user, project.id);
    const workspace = workspaceRow && openWorkspace(workspaceRow);
    if (!workspace || !workspaceRow) return { error: "Project workspace is unavailable" };
    const id = randomUUID().replace(/-/g, "");
    const revision = randomUUID().replace(/-/g, "");
    const document = validateSource(createTopDownRoomGame(id), id, revision);
    if ("error" in document) return document;
    const game = new Game({
      id,
      user_id: user,
      project_id: project.id,
      workspace_id: workspaceRow.id,
      name: name.trim(),
      current_revision: revision
    });
    await workspace.write(revisionPath(game, revision), JSON.stringify(document), "application/json");
    const inserted = await Game.insertNew({
      id,
      userId: user,
      projectId: project.id,
      workspaceId: workspaceRow.id,
      name: name.trim(),
      revision
    });
    return inserted ? { game: inserted, document } : { error: "Game id collision" };
}

const get: CapabilityExport = {
  spec: gameSpecs[1],
  impl: async (run, args) => {
    const user = userId(run);
    const id = args["game_id"];
    if (!user || typeof id !== "string") return { error: "game_id is required in a user session" };
    const game = await ownedGame(user, id);
    if (!game) return { error: "Game not found" };
    const workspace = await workspaceOf(user, game);
    if (!workspace) return { error: "Game workspace is unavailable" };
    const revision = typeof args["revision"] === "string" ? args["revision"] : game.current_revision;
    const document = await readDocument(workspace, game, revision);
    return document ? { game: summary(game), document } : { error: "Game revision not found" };
  }
};

const save: CapabilityExport = {
  spec: gameSpecs[2],
  impl: async (run, args) => {
    const user = userId(run);
    const id = args["game_id"];
    const base = args["base_revision"];
    if (!user || typeof id !== "string" || typeof base !== "string") return { error: "game_id and base_revision are required" };
    const game = await ownedGame(user, id);
    return game ? publish(user, game, base, args["document"]) : { error: "Game not found" };
  }
};

const install: CapabilityExport = {
  spec: gameSpecs[3],
  impl: async (run, args) => {
    const user = userId(run);
    const id = args["game_id"];
    const base = args["base_revision"];
    const slot = args["slot"];
    if (!user || typeof id !== "string" || typeof base !== "string" || typeof slot !== "string" || !slot) {
      return { error: "game_id, base_revision, and slot are required" };
    }
    const game = await ownedGame(user, id);
    if (!game) return { error: "Game not found" };
    const parsed = gameAssetBinding.safeParse(args["binding"]);
    if (!parsed.success || !/^[a-f0-9]{64}$/.test(parsed.data.digest)) {
      return { error: "Invalid asset binding or digest" };
    }
    const workspace = await workspaceOf(user, game);
    if (!workspace) return { error: "Game workspace is unavailable" };
    const candidateId = args["candidate_workspace_id"];
    let candidateWorkspace = workspace;
    if (candidateId !== undefined) {
      if (typeof candidateId !== "string") return { error: "candidate_workspace_id must be a string" };
      const row = await Workspace.find(user, candidateId);
      if (!row || row.project_id !== game.project_id) return { error: "Candidate workspace not found" };
      const resolved = openWorkspace(row);
      if (!resolved) return { error: "Candidate workspace is unavailable" };
      candidateWorkspace = resolved;
    }
    const extension = parsed.data.mediaKind === "audio" ? "wav" : "png";
    const path = `${game.source_root}/assets/${parsed.data.digest}.${extension}`;
    const bytes = await candidateWorkspace.read(path);
    if (!bytes || createHash("sha256").update(bytes).digest("hex") !== parsed.data.digest) {
      return { error: "Candidate asset is missing or changed" };
    }
    if (base !== game.current_revision) return { error: "Game was modified concurrently" };
    const document = await readDocument(workspace, game, game.current_revision);
    if (!document) return { error: "Current game revision is missing" };
    const storage = run.context.assetStorage;
    if (!storage) return { error: "Asset storage is unavailable" };
    const contentType = extension === "wav" ? "audio/wav" : "image/png";
    if (candidateWorkspace !== workspace) await workspace.write(path, bytes, contentType);
    const installed = await Asset.create({
      user_id: user,
      project_id: game.project_id,
      parent_id: user,
      name: `${slot}.${extension}`,
      content_type: contentType,
      size: bytes.byteLength,
      metadata: { game_source_asset_id: parsed.data.assetId, game_digest: parsed.data.digest }
    });
    if (!(installed instanceof Asset)) return { error: "Failed to create installed asset" };
    const key = assetObjectKey(user, `${installed.id}.${extension}`);
    let uri: string | null = null;
    try {
      uri = await storage.store(key, bytes, contentType);
      const result = await publish(user, game, base, {
        ...document,
        assets: { ...document.assets, [slot]: { ...parsed.data, assetId: installed.id } }
      });
      if (typeof result === "object" && result !== null && "error" in result) {
        await storage.delete(uri);
        await installed.delete();
      }
      return result;
    } catch (error) {
      if (uri) await storage.delete(uri);
      await installed.delete();
      throw error;
    }
  }
};

const playtest: CapabilityExport = {
  spec: gameSpecs[4],
  impl: async (run, args) => {
    const user = userId(run);
    const id = args["game_id"];
    if (!user || typeof id !== "string") return { error: "game_id is required in a user session" };
    const game = await ownedGame(user, id);
    if (!game) return { error: "Game not found" };
    const workspace = await workspaceOf(user, game);
    if (!workspace) return { error: "Game workspace is unavailable" };
    const revision = typeof args["revision"] === "string" ? args["revision"] : game.current_revision;
    const document = await readDocument(workspace, game, revision);
    if (!document) return { error: "Game revision not found" };
    const inputs = gameInputFrame.array().max(MAX_PLAYTEST_TICKS).safeParse(args["inputs"]);
    if (!inputs.success) return { error: `inputs must be an array of at most ${MAX_PLAYTEST_TICKS} frames` };
    const seed = typeof args["seed"] === "number" && Number.isSafeInteger(args["seed"])
      ? args["seed"]
      : 1;
    const session = await createScriptedGameSession(document, seed);
    const events: unknown[] = [];
    try {
      for (const input of inputs.data) {
        const result = session.step(input);
        for (const event of result.events) {
          if (events.length < MAX_RETURNED_EVENTS) events.push({ tick: result.tick, ...event });
        }
      }
      return {
        game_id: shortResourceId(game.id),
        revision,
        ticks: inputs.data.length,
        state: session.inspect(),
        events,
        events_truncated: events.length >= MAX_RETURNED_EVENTS
      };
    } finally {
      session.dispose();
    }
  }
};

const buildGame: CapabilityExport = {
  spec: gameSpecs[5],
  impl: async (run, args) => {
    const user = userId(run);
    const id = args["game_id"];
    if (!user || typeof id !== "string") return { error: "game_id is required in a user session" };
    const game = await ownedGame(user, id);
    if (!game) return { error: "Game not found" };
    const workspace = await workspaceOf(user, game);
    if (!workspace) return { error: "Game workspace is unavailable" };
    const revision = typeof args["revision"] === "string" ? args["revision"] : game.current_revision;
    const document = await readDocument(workspace, game, revision);
    if (!document) return { error: "Game revision not found" };
    if (Object.keys(document.assets).length > MAX_BUILD_ASSETS) {
      return { error: `A standalone build supports at most ${MAX_BUILD_ASSETS} assets` };
    }
    const expectedDigests = new Map<string, Set<string>>();
    for (const binding of Object.values(document.assets)) {
      if (binding.assetId.startsWith("builtin:")) continue;
      const digests = expectedDigests.get(binding.assetId) ?? new Set<string>();
      digests.add(binding.digest);
      expectedDigests.set(binding.assetId, digests);
    }
    if ([...expectedDigests.values()].some((digests) => digests.size !== 1)) {
      return { error: "One source asset has conflicting digests in this revision" };
    }
    const buildPath = `game-builds/${game.id}/${revision}`;
    const indexPath = `${buildPath}/index.html`;
    if (await workspace.exists(indexPath)) {
      return { game_id: game.id, revision, build_path: buildPath, entry_path: indexPath, cached: true };
    }
    const storage = run.context.assetStorage;
    const cache = new Map<string, { bytes: Uint8Array; mimeType: string }>();
    let totalAssetBytes = 0;
    const resolveAsset = async (assetId: string): Promise<{ bytes: Uint8Array; mimeType: string } | null> => {
      const cached = cache.get(assetId);
      if (cached) return cached;
      if (!/^[a-f0-9]{32}$/.test(assetId)) return null;
      const asset = await Asset.find(user, assetId);
      if (!asset || !storage) return null;
      const extension = MEDIA_EXTENSIONS[asset.content_type];
      if (!extension || (asset.size !== null && asset.size > MAX_BUILD_ASSET_BYTES)) return null;
      const keys = assetKeyCandidates(user, `${asset.id}.${extension}`);
      let bytes: Uint8Array | null = null;
      for (const key of keys) {
        bytes = await storage.retrieve(storage.uriForKey(key));
        if (bytes) break;
      }
      if (!bytes || bytes.byteLength > MAX_BUILD_ASSET_BYTES) return null;
      const digest = createHash("sha256").update(bytes).digest("hex");
      if (!expectedDigests.get(assetId)?.has(digest)) {
        throw new Error(`Asset digest changed for ${assetId}`);
      }
      totalAssetBytes += bytes.byteLength;
      if (totalAssetBytes > MAX_BUILD_BYTES) {
        throw new Error(`A standalone build supports at most ${MAX_BUILD_BYTES} asset bytes`);
      }
      const resolved = { bytes, mimeType: asset.content_type };
      cache.set(assetId, resolved);
      return resolved;
    };
    const scratch = await workspace.scratchDir();
    const staging = await mkdtemp(join(scratch, ".native-game-build-"));
    try {
      const { buildStandaloneGame } = await import("@nodetool-ai/game-renderer/build");
      await buildStandaloneGame({ document, outputDir: join(staging, "player"), resolveAsset });
      const files: Array<{ path: string; bytes: Uint8Array }> = [];
      const pending = [""];
      let totalBytes = 0;
      while (pending.length > 0) {
        const directory = pending.pop() ?? "";
        for (const entry of await readdir(join(staging, "player", directory), { withFileTypes: true })) {
          const path = directory ? `${directory}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            pending.push(path);
          } else if (entry.isFile()) {
            const bytes = await readFile(join(staging, "player", path));
            totalBytes += bytes.byteLength;
            if (files.length >= MAX_BUILD_FILES || totalBytes > MAX_BUILD_BYTES) {
              throw new Error("Standalone build exceeds file or byte limits");
            }
            files.push({ path, bytes });
          }
        }
      }
      if (!files.some((file) => file.path === "index.html")) {
        throw new Error("Standalone player entry is missing");
      }
      for (const file of files.filter((item) => item.path !== "index.html")) {
        const contentType = file.path.endsWith(".js") ? "text/javascript"
          : file.path.endsWith(".css") ? "text/css"
          : file.path.endsWith(".json") ? "application/json"
          : file.path.endsWith(".png") ? "image/png"
          : file.path.endsWith(".jpg") ? "image/jpeg"
          : file.path.endsWith(".webp") ? "image/webp"
          : file.path.endsWith(".wav") ? "audio/wav"
          : file.path.endsWith(".ogg") ? "audio/ogg"
          : file.path.endsWith(".mp3") ? "audio/mpeg"
          : "application/octet-stream";
        await workspace.write(`${buildPath}/${file.path}`, file.bytes, contentType);
      }
      const index = files.find((file) => file.path === "index.html");
      if (!index) throw new Error("Standalone player entry is missing");
      await workspace.write(indexPath, index.bytes, "text/html");
      return { game_id: game.id, revision, build_path: buildPath, entry_path: indexPath, cached: false };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  }
};

export const module: CapabilityModule = {
  module: "game",
  exports: [create, get, save, install, playtest, buildGame]
};
