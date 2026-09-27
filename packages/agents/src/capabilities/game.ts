import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { getManagedWorkspaceDir, managedWorkspaceKey, workspaceStorageKind } from "@nodetool-ai/config";
import { AmbiguousGameIdError, Asset, Game, Prediction, Project, Workspace } from "@nodetool-ai/models";
import { gameAssetBinding, gameDocument, gameInputFrame, shortResourceId, type GameDocument, type GameInputFrame, type GameRenderFrame } from "@nodetool-ai/protocol";
import { createScriptedGameSession, createTopDownRoomGame, validateGame, gameDocumentOp, GameOpError } from "@nodetool-ai/game-runtime";
import { workspaceFromRow } from "@nodetool-ai/execution/service";
import { assetKeyCandidates, assetObjectKey } from "@nodetool-ai/storage";
import type { Workspace as RunWorkspace } from "@nodetool-ai/runtime";
import type { CapabilityExport, CapabilityModule, CapabilityRun } from "./types.js";
import { gameSpecs } from "./game.specs.js";
import { persistOutput } from "../tools/asset-persist.js";

const MAX_PLAYTEST_TICKS = 3600;
const MAX_CAPTURE_FRAMES = 8;
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
  "audio/mpeg": "mp3",
  "font/ttf": "ttf",
  "font/otf": "otf"
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

async function readSource(workspace: RunWorkspace, game: Game, source: unknown, revision: unknown): Promise<GameDocument | null> {
  if (source !== undefined && source !== "draft" && source !== "revision") return null;
  if (source === "revision" || revision !== undefined) {
    return readDocument(workspace, game, typeof revision === "string" ? revision : game.current_revision);
  }
  const draft = await Game.readDraft(game.user_id, game.id, workspace);
  return draft?.document ?? null;
}

function outline(document: GameDocument): Record<string, unknown> {
  return {
    settings: {
      schemaVersion: document.schemaVersion,
      entrySceneId: document.entrySceneId,
      pixelsPerUnit: document.pixelsPerUnit,
      tickRate: document.tickRate,
      inputActions: document.inputActions,
      collisionLayers: document.collisionLayers,
      renderEffects: document.renderEffects,
      hudEffectOrder: document.hudEffectOrder
    },
    scenes: document.scenes.map((scene) => ({
      id: scene.id,
      name: scene.name,
      music: scene.music,
      lighting: scene.lighting,
      backgrounds: scene.backgrounds,
      entities: scene.entities.map((entity) => ({
        id: entity.id,
        name: entity.name,
        parentId: entity.parentId,
        components: Object.keys(entity).filter((key) => !["id", "name", "parentId", "behaviors", "templateOnly"].includes(key)),
        behaviorKinds: entity.behaviors.map((behavior) => behavior.kind),
        scriptBytes: entity.behaviors.reduce((total, behavior) => total + (behavior.kind === "script" ? Buffer.byteLength(behavior.source) : 0), 0)
      }))
    })),
    assets: Object.fromEntries(Object.entries(document.assets).map(([slot, asset]) => [slot, { mediaKind: asset.mediaKind, width: asset.width, height: asset.height, assetId: asset.assetId }]))
  };
}

function inputFrames(value: unknown, requiredTicks = 0): GameInputFrame[] | { error: string } {
  if (value === undefined) value = [];
  if (!Array.isArray(value)) return { error: "inputs must be an array" };
  const frames: GameInputFrame[] = [];
  for (const item of value) {
    const parsed = gameInputFrame.safeParse(item);
    if (!parsed.success) return { error: "Invalid input frame" };
    const repeats = typeof item === "object" && item !== null && "ticks" in item ? item.ticks : 1;
    if (!Number.isSafeInteger(repeats) || typeof repeats !== "number" || repeats < 1 || frames.length + repeats > MAX_PLAYTEST_TICKS) {
      return { error: `inputs must total at most ${MAX_PLAYTEST_TICKS} ticks` };
    }
    for (let index = 0; index < repeats; index += 1) {
      frames.push({ pressed: parsed.data.pressed, justPressed: index === 0 ? parsed.data.justPressed : [] });
    }
  }
  if (requiredTicks > MAX_PLAYTEST_TICKS) return { error: `inputs must total at most ${MAX_PLAYTEST_TICKS} ticks` };
  while (frames.length < requiredTicks) frames.push({ pressed: [], justPressed: [] });
  return frames;
}

function captureTicks(value: unknown, fallback: number[]): number[] | { error: string } {
  const ticks = value === undefined ? fallback : value;
  if (!Array.isArray(ticks) || ticks.length > MAX_CAPTURE_FRAMES || ticks.some((tick) => !Number.isSafeInteger(tick) || tick < 0 || tick > MAX_PLAYTEST_TICKS)) {
    return { error: `ticks must contain at most ${MAX_CAPTURE_FRAMES} values between 0 and ${MAX_PLAYTEST_TICKS}` };
  }
  return [...new Set(ticks)].sort((a, b) => a - b);
}

async function captureFrames(run: CapabilityRun, user: string, document: GameDocument, ticks: readonly number[], inputs: readonly GameInputFrame[], seed: number, options: { camera?: unknown; scale?: unknown; sheet?: unknown; overlays?: unknown }): Promise<unknown> {
  const { captureGameFrame } = await import("@nodetool-ai/game-renderer/node");
  const diagnostics: string[] = [];
  const storage = run.context.assetStorage;
  const assetCache = new Map<string, Uint8Array | null>();
  const resolveAsset = async (slot: string): Promise<Uint8Array | null> => {
    const binding = document.assets[slot];
    const assetId = binding?.assetId;
    if (!assetId || !/^[a-f0-9]{32}$/.test(assetId) || !storage) return null;
    if (assetCache.has(assetId)) return assetCache.get(assetId) ?? null;
    const asset = await Asset.find(user, assetId);
    const extension = asset && MEDIA_EXTENSIONS[asset.content_type];
    let bytes: Uint8Array | null = null;
    if (extension) {
      for (const key of assetKeyCandidates(user, `${assetId}.${extension}`)) {
        bytes = await storage.retrieve(storage.uriForKey(key));
        if (bytes) break;
      }
    }
    assetCache.set(assetId, bytes);
    return bytes;
  };
  const session = await createScriptedGameSession(document, seed);
  const entries: Array<{ tick: number; png: Uint8Array; visible_entities: unknown[]; hud_texts: string[]; diagnostics: string[] }> = [];
  try {
    for (const tick of ticks) {
      while (session.inspect().tick < tick) {
        session.step(inputs[session.inspect().tick] ?? { pressed: [], justPressed: [] });
      }
      let frame: GameRenderFrame = session.frame();
      const camera = options.camera;
      if (camera && typeof camera === "object") {
        const c = camera as Record<string, unknown>;
        if ([c.x, c.y, c.zoom].every((value) => typeof value === "number" && Number.isFinite(value)) && (c.zoom as number) > 0) {
          frame = { ...frame, camera: { x: c.x as number, y: c.y as number, zoom: c.zoom as number } };
        }
      }
      const scale = typeof options.scale === "number" && Number.isFinite(options.scale) && options.scale > 0 && options.scale <= 4 ? options.scale : 1;
      const start = diagnostics.length;
      let png: Uint8Array;
      try {
        png = await captureGameFrame(frame, { resolveAsset, scale, effects: document.renderEffects, hudEffectOrder: document.hudEffectOrder, backend: document.renderEffects?.length ? "webgpu" : "canvas2d", onDiagnostic: (message: string) => diagnostics.push(message) });
      } catch (error) {
        diagnostics.push(`WebGPU capture failed: ${error instanceof Error ? error.message : String(error)}`);
        png = await captureGameFrame(frame, { resolveAsset, scale, backend: "canvas2d", onDiagnostic: (message: string) => diagnostics.push(message) });
      }
      const pixelScale = frame.pixelsPerUnit * frame.camera.zoom * scale;
      const overlays = Array.isArray(options.overlays) ? options.overlays.filter((value): value is string => typeof value === "string") : [];
      if (overlays.length > 0) {
        const { createCanvas, loadImage } = await import("@napi-rs/canvas");
        const source = await loadImage(Buffer.from(png));
        const canvas = createCanvas(source.width, source.height);
        const context = canvas.getContext("2d");
        context.drawImage(source, 0, 0);
        context.lineWidth = 2;
        context.strokeStyle = "#ffcc00";
        context.fillStyle = "#ffcc00";
        context.font = "14px sans-serif";
        const sx = (x: number): number => canvas.width / 2 + (x - frame.camera.x) * pixelScale;
        const sy = (y: number): number => canvas.height / 2 - (y - frame.camera.y) * pixelScale;
        const definitions = new Map(document.scenes.flatMap((scene) => scene.entities.map((entity) => [entity.id, entity] as const)));
        for (const sprite of frame.sprites) {
          const entity = definitions.get(sprite.entityId);
          if (overlays.includes("ids")) context.fillText(sprite.entityId, sx(sprite.x), sy(sprite.y));
          if (overlays.includes("colliders") && entity?.collider2d) {
            const collider = entity.collider2d;
            context.strokeRect(sx(sprite.x - collider.width / 2), sy(sprite.y + collider.height / 2), collider.width * pixelScale, collider.height * pixelScale);
          }
        }
        if (overlays.includes("lights") && frame.lighting) {
          for (const light of frame.lighting.points) {
            context.beginPath();
            context.arc(sx(light.x), sy(light.y), light.radius * pixelScale, 0, Math.PI * 2);
            context.stroke();
          }
        }
        if (overlays.includes("camera_bounds")) context.strokeRect(0, 0, canvas.width, canvas.height);
        png = canvas.toBuffer("image/png");
      }
      entries.push({ tick, png, visible_entities: frame.sprites.map((sprite) => ({
        id: sprite.entityId,
        x: Math.round(frame.width * frame.pixelsPerUnit * scale / 2 + (sprite.x - frame.camera.x) * pixelScale),
        y: Math.round(frame.height * frame.pixelsPerUnit * scale / 2 - (sprite.y - frame.camera.y) * pixelScale),
        width: Math.round(sprite.width * sprite.scaleX * pixelScale),
        height: Math.round(sprite.height * sprite.scaleY * pixelScale)
      })), hud_texts: frame.hud.map((label) => label.text), diagnostics: diagnostics.slice(start) });
    }
  } finally {
    session.dispose();
  }
  if (options.sheet && entries.length > 1) {
    const { composeContactSheet } = await import("../timeline-preview/sheet.js");
    const sheet = await composeContactSheet(entries.map((entry) => ({ label: `Tick ${entry.tick}`, png: entry.png })));
    const saved = await persistOutput(run.context, sheet.png, { namePrefix: `game-${document.id}-sheet`, mime: "image/png" });
    return { image: { type: "image", asset_id: saved.asset_id, uri: saved.asset_uri ?? saved.path, path: saved.path, mime_type: saved.mime_type }, frames: entries.map(({ tick, visible_entities, hud_texts, diagnostics }) => ({ tick, visible_entities, hud_texts, diagnostics })) };
  }
  const frames = [];
  for (const entry of entries) {
    const saved = await persistOutput(run.context, entry.png, { namePrefix: `game-${document.id}-tick-${entry.tick}`, mime: "image/png" });
    frames.push({ tick: entry.tick, image: { type: "image", asset_id: saved.asset_id, uri: saved.asset_uri ?? saved.path, path: saved.path, mime_type: saved.mime_type }, visible_entities: entry.visible_entities, hud_texts: entry.hud_texts, diagnostics: entry.diagnostics });
  }
  return { frames };
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

async function publish(user: string, game: Game, baseRevision: string, source: unknown, message?: string): Promise<unknown> {
  if (game.current_revision !== baseRevision) return { error: "Game was modified concurrently", current_revision: game.current_revision };
  const revision = randomUUID().replace(/-/g, "");
  const document = validateSource(source, game.id, revision);
  if ("error" in document) return document;
  const workspace = await workspaceOf(user, game);
  if (!workspace) return { error: "Game workspace is unavailable" };
  const draft = await Game.readDraft(user, game.id, workspace);
  if (!draft) return { error: "Game draft not found" };
  await workspace.write(revisionPath(game, revision), JSON.stringify(document), "application/json");
  const updated = await Game.publish(user, game.id, baseRevision, revision, draft.game.draft_updated_at, workspace, message);
  if (!updated) return { error: "Game was modified concurrently" };
  await workspace.write(`${game.source_root}/drafts/${encodeURIComponent(updated.draft_updated_at)}.json`, JSON.stringify(document), "application/json");
  await workspace.write(`${game.source_root}/draft.json`, JSON.stringify(document), "application/json");
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
    const document = await readSource(workspace, game, args["source"], args["revision"]);
    if (!document) return { error: "Game source not found" };
    const view = args["view"] ?? "outline";
    if (view === "full") return { game: summary(game), draft_updated_at: game.draft_updated_at, document };
    if (view === "outline") return { game: summary(game), draft_updated_at: game.draft_updated_at, outline: outline(document) };
    if (view === "entity") {
      const entityId = args["entity_id"];
      if (typeof entityId !== "string") return { error: "entity_id is required for entity view" };
      const matches = document.scenes.flatMap((scene) => scene.entities.filter((entity) => entity.id === entityId).map((entity) => ({ scene_id: scene.id, entity })));
      return matches.length ? { game: summary(game), draft_updated_at: game.draft_updated_at, matches } : { error: "Entity not found" };
    }
    return { error: "Unknown game view" };
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
    if (!game) return { error: "Game not found" };
    const workspace = await workspaceOf(user, game);
    if (!workspace) return { error: "Game workspace is unavailable" };
    const document = args["document"] ?? await readSource(workspace, game, "draft", undefined);
    return document ? publish(user, game, base, document, typeof args["message"] === "string" ? args["message"] : undefined) : { error: "Game draft not found" };
  }
};

const edit: CapabilityExport = {
  spec: gameSpecs[6],
  impl: async (run, args) => {
    const user = userId(run);
    const id = args["game_id"];
    if (!user || typeof id !== "string") return { error: "game_id is required in a user session" };
    const game = await ownedGame(user, id);
    if (!game) return { error: "Game not found" };
    const workspace = await workspaceOf(user, game);
    if (!workspace) return { error: "Game workspace is unavailable" };
    const parsed = gameDocumentOp.array().min(1).safeParse(args["ops"]);
    if (!parsed.success) return { error: "Invalid game ops", issues: parsed.error.issues.map((issue) => ({ op_index: typeof issue.path[0] === "number" ? issue.path[0] : 0, path: issue.path, message: issue.message })) };
    const base = args["base_updated_at"];
    if (base !== undefined && typeof base !== "string") return { error: "base_updated_at must be a string" };
    for (let attempt = 0; attempt < (base ? 1 : 2); attempt += 1) {
      const fresh = attempt === 0 ? game : await ownedGame(user, id);
      if (!fresh) return { error: "Game not found" };
      try {
        const updated = await Game.updateDraft(user, fresh.id, base ?? fresh.draft_updated_at, parsed.data, workspace, { actor: "agent", threadId: run.context.threadId ?? undefined, messageId: run.context.get?.<string>("chat_message_id") ?? undefined });
        if (updated) return { game: summary(updated.game), draft_updated_at: updated.game.draft_updated_at, document: updated.document };
      } catch (error) {
        if (error instanceof GameOpError) return { error: "Game edit rejected", issues: error.issues.map((issue) => ({ op_index: issue.opIndex, path: issue.path, message: issue.message })) };
        throw error;
      }
    }
    return { error: "Game draft was modified concurrently", draft_updated_at: (await ownedGame(user, id))?.draft_updated_at };
  }
};

const install: CapabilityExport = {
  spec: gameSpecs[3],
  impl: async (run, args) => {
    const user = userId(run);
    const id = args["game_id"];
    const base = args["base_revision"];
    const slot = args["slot"];
    if (!user || typeof id !== "string" || typeof slot !== "string" || !slot) {
      return { error: "game_id and slot are required" };
    }
    const game = await ownedGame(user, id);
    if (!game) return { error: "Game not found" };
    const parsed = gameAssetBinding.safeParse(args["binding"]);
    if (!parsed.success || !/^[a-f0-9]{64}$/.test(parsed.data.digest)) {
      return { error: "Invalid asset binding or digest" };
    }
    if (parsed.data.mediaKind === "font" && !parsed.data.fontFormat) {
      return { error: "Font binding needs a TrueType or OpenType format" };
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
    const formats = parsed.data.mediaKind === "audio"
      ? [["wav", "audio/wav"], ["mp3", "audio/mpeg"], ["ogg", "audio/ogg"]]
      : parsed.data.mediaKind === "font"
        ? [[parsed.data.fontFormat, `font/${parsed.data.fontFormat}`]]
        : [["png", "image/png"], ["jpg", "image/jpeg"], ["webp", "image/webp"]];
    let candidate: { path: string; extension: string; contentType: string; bytes: Uint8Array } | null = null;
    for (const [extension, contentType] of formats) {
      if (!extension) continue;
      const path = `${game.source_root}/assets/${parsed.data.digest}.${extension}`;
      const bytes = await candidateWorkspace.read(path);
      if (bytes) { candidate = { path, extension, contentType: contentType ?? "application/octet-stream", bytes }; break; }
    }
    if (!candidate || createHash("sha256").update(candidate.bytes).digest("hex") !== parsed.data.digest) {
      return { error: "Candidate asset is missing or changed" };
    }
    const { path, extension, contentType, bytes } = candidate;
    if (base !== undefined && base !== game.current_revision) return { error: "Game was modified concurrently" };
    const draft = await Game.readDraft(user, game.id, workspace);
    if (!draft) return { error: "Game draft is missing" };
    const expectedUpdatedAt = typeof args["base_updated_at"] === "string" ? args["base_updated_at"] : draft.game.draft_updated_at;
    const storage = run.context.assetStorage;
    if (!storage) return { error: "Asset storage is unavailable" };
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
      let result: unknown;
      try {
        const updated = await Game.updateDraft(user, game.id, expectedUpdatedAt, [{ op: "bind_asset", slot, binding: { ...parsed.data, assetId: installed.id } }], workspace, { actor: "agent", threadId: run.context.threadId ?? undefined, messageId: run.context.get?.<string>("chat_message_id") ?? undefined });
        result = updated ? { game: summary(updated.game), draft_updated_at: updated.game.draft_updated_at, document: updated.document } : { error: "Game draft was modified concurrently" };
      } catch (error) {
        if (error instanceof GameOpError) result = { error: error.message, op_index: error.opIndex, path: error.path };
        else throw error;
      }
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
    const document = await readSource(workspace, game, args["source"], args["revision"]);
    if (!document) return { error: "Game source not found" };
    const captures = captureTicks(args["capture_ticks"], []);
    if ("error" in captures) return captures;
    const assertions = Array.isArray(args["assertions"]) ? args["assertions"] : [];
    const assertionHorizon = assertions.reduce((maximum, item) => {
      if (!item || typeof item !== "object") return maximum;
      const assertion = item as Record<string, unknown>;
      const tick = assertion.at_tick ?? assertion.before_tick;
      return typeof tick === "number" && Number.isSafeInteger(tick) && tick >= 0 ? Math.max(maximum, tick) : maximum;
    }, 0);
    const inputs = inputFrames(args["inputs"], Math.max(0, ...captures, assertionHorizon));
    if ("error" in inputs) return inputs;
    const seed = typeof args["seed"] === "number" && Number.isSafeInteger(args["seed"])
      ? args["seed"]
      : 1;
    const session = await createScriptedGameSession(document, seed);
    const events: unknown[] = [];
    const contacts = new Map<string, number>();
    const inspections = new Map<number, ReturnType<typeof session.inspect>>([[0, session.inspect()]]);
    const started = Date.now();
    let wallTimeLimited = false;
    let scriptError: { tick: number; message: string } | null = null;
    try {
      for (const input of inputs) {
        if (Date.now() - started > 15_000) { wallTimeLimited = true; break; }
        let result;
        try {
          result = session.step(input);
        } catch (error) {
          scriptError = { tick: session.inspect().tick + 1, message: error instanceof Error ? error.message : String(error) };
          break;
        }
        inspections.set(result.tick, session.inspect());
        for (const event of result.events) {
          if (event.kind === "contact") {
            const pair = [event.entityId, event.otherId].sort().join("|");
            const key = `${pair}:${event.phase ?? "stay"}`;
            contacts.set(key, (contacts.get(key) ?? 0) + 1);
          } else {
            events.push({ tick: result.tick, ...event });
          }
        }
      }
      const state = session.inspect();
      const assertion_results = assertions.map((item) => {
        if (!item || typeof item !== "object") return { passed: false, error: "Invalid assertion" };
        const assertion = item as Record<string, unknown>;
        if (assertion.no_script_errors === true) return { passed: scriptError === null, assertion, observed: scriptError };
        if (assertion.event === "win") {
          const win = events.find((event) => typeof event === "object" && event !== null && "kind" in event && event.kind === "win") as { tick?: number } | undefined;
          const passed = !!win && (typeof assertion.before_tick !== "number" || (win.tick ?? Infinity) <= assertion.before_tick);
          return { passed, assertion, observed: win ?? null };
        }
        if (typeof assertion.entity_id === "string" && assertion.near && typeof assertion.near === "object") {
          const near = assertion.near as Record<string, unknown>;
          const observed = typeof assertion.at_tick === "number" ? inspections.get(assertion.at_tick) : state;
          const entity = observed?.entities.find((candidate) => candidate.id === assertion.entity_id);
          const tolerance = typeof near.tolerance === "number" ? near.tolerance : 0;
          const passed = !!entity && typeof near.x === "number" && typeof near.y === "number" && Math.hypot(entity.x - near.x, entity.y - near.y) <= tolerance;
          return { passed, assertion, observed: entity ?? null };
        }
        return { passed: false, assertion, error: "Unsupported assertion" };
      });
      const images = captures.length && scriptError === null ? await captureFrames(run, user, document, captures, inputs, seed, { sheet: true }) : undefined;
      return {
        game_id: shortResourceId(game.id),
        revision: document.revision,
        ticks: state.tick,
        state,
        events,
        contacts: [...contacts].map(([pair_phase, count]) => ({ pair_phase, count })),
        assertion_results,
        wall_time_limited: wallTimeLimited,
        wall_time_ms: Date.now() - started,
        script_error: scriptError,
        captures: images
      };
    } finally {
      session.dispose();
    }
  }
};

const capture: CapabilityExport = {
  spec: gameSpecs[7],
  impl: async (run, args) => {
    const user = userId(run);
    const id = args["game_id"];
    if (!user || typeof id !== "string") return { error: "game_id is required in a user session" };
    const game = await ownedGame(user, id);
    if (!game) return { error: "Game not found" };
    const workspace = await workspaceOf(user, game);
    if (!workspace) return { error: "Game workspace is unavailable" };
    const document = await readSource(workspace, game, args["source"], args["revision"]);
    if (!document) return { error: "Game source not found" };
    const ticks = captureTicks(args["ticks"], [0]);
    if ("error" in ticks) return ticks;
    const inputs = inputFrames(args["inputs"], Math.max(0, ...ticks));
    if ("error" in inputs) return inputs;
    const seed = typeof args["seed"] === "number" && Number.isSafeInteger(args["seed"]) ? args["seed"] : 1;
    return captureFrames(run, user, document, ticks, inputs, seed, args);
  }
};

const generateAsset: CapabilityExport = {
  spec: gameSpecs[8],
  impl: async (run, args) => {
    const user = userId(run);
    const id = args["game_id"];
    const slot = args["slot"];
    const kind = args["kind"];
    const prompt = args["prompt"];
    if (!user || typeof id !== "string" || typeof slot !== "string" || !slot || typeof prompt !== "string" || !prompt.trim() || !["image", "audio", "music"].includes(String(kind))) {
      return { error: "game_id, slot, kind, and prompt are required" };
    }
    const game = await ownedGame(user, id);
    if (!game) return { error: "Game not found" };
    const workspace = await workspaceOf(user, game);
    if (!workspace) return { error: "Game workspace is unavailable" };
    const draft = await Game.readDraft(user, game.id, workspace);
    if (!draft) return { error: "Game draft not found" };
    const reference = typeof args["reference_slot"] === "string" ? draft.document.assets[args["reference_slot"]] : undefined;
    if (args["reference_slot"] !== undefined && !reference) return { error: "reference_slot is not bound" };
    const capability = kind === "image" ? reference ? "image_to_image" : "text_to_image" : kind === "music" ? "text_to_music" : "text_to_speech";
    const resumedId = args["generation_id"];
    let provider = args["provider"];
    let model = args["model"];
    let generated: { error?: string; asset_uri?: string; path?: string; generation_id?: string; mime_type?: string; background?: boolean };
    if (typeof resumedId === "string") {
      const row = await Prediction.findForUser(user, resumedId);
      if (!row || row.capability !== capability) return { error: "Generation not found for this game asset kind" };
      const { generationRecord } = await import("./generations.js");
      const record = generationRecord(row);
      if (record.status !== "completed") return { generation_id: resumedId, status: record.status, error: record.generation_error ?? undefined };
      const assetId = record.asset_ids[0];
      if (!assetId) return { error: "Generation completed without an asset", generation_id: resumedId };
      const asset = await Asset.find(user, assetId);
      if (!asset) return { error: "Generated asset is unavailable", generation_id: resumedId };
      generated = { asset_uri: `asset://${assetId}`, generation_id: resumedId, mime_type: asset.content_type };
      provider = row.provider;
      model = row.model;
    } else {
      if (typeof provider !== "string" || typeof model !== "string") {
        const { findModel } = await import("./models.js");
        const found = await findModel.impl(run, { capability }) as { ref?: { provider?: string; id?: string }; error?: string };
        provider = found.ref?.provider;
        model = found.ref?.id;
      }
      if (typeof provider !== "string" || typeof model !== "string") return { error: `No ${capability} model is available; pass provider and model` };
      const media = await import("./media.js");
      const generator = kind === "music" ? media.generateMusic : kind === "audio" ? media.generateSpeech : reference ? media.editImage : media.generateImage;
      const generationArgs: Record<string, unknown> = { provider, model, prompt };
      if (kind === "audio") generationArgs["text"] = prompt;
      if (args["background"] === true) generationArgs["background"] = true;
      if (reference) {
        const referenceAsset = await Asset.find(user, reference.assetId);
        const suffix = referenceAsset && MEDIA_EXTENSIONS[referenceAsset.content_type];
        if (!suffix) return { error: "Reference asset is unavailable" };
        generationArgs["input_file"] = `asset://${reference.assetId}.${suffix}`;
      }
      generated = await generator.impl(run, generationArgs) as typeof generated;
    }
    if (generated.error) return generated;
    if (generated.background) return { ...generated, next: "Call await_generation, then call generate_game_asset again with generation_id and the same game_id, slot, kind, prompt, and preparation." };
    const handle = generated.asset_uri ?? generated.path;
    if (!handle) return { error: "Generation returned no readable asset", generation_id: generated.generation_id };
    const resolved = handle.startsWith("asset://") ? await run.context.resolveAssetBytes(handle) : { bytes: await run.context.workspace?.read(handle) ?? null };
    if (!resolved.bytes) return { error: "Generated asset bytes are unavailable", generation_id: generated.generation_id };
    let bytes = resolved.bytes;
    let width = 1;
    let height = 1;
    let preparation: Record<string, unknown> | undefined;
    let trim: { sourceWidth: number; sourceHeight: number; x: number; y: number } | undefined;
    let originalDimensions: { width: number; height: number } | undefined;
    const audioExtension = generated.mime_type === "audio/wav" || generated.mime_type === "audio/x-wav" ? "wav"
      : generated.mime_type === "audio/ogg" ? "ogg"
      : generated.mime_type === "audio/mpeg" || generated.mime_type === "audio/mp3" ? "mp3"
      : handle.endsWith(".wav") ? "wav" : handle.endsWith(".ogg") ? "ogg" : "mp3";
    let extension = kind === "image" ? "png" : audioExtension;
    if (kind === "image") {
      const { imagePreparationSettings, prepareGameImage } = await import("@nodetool-ai/game-nodes");
      const settings = imagePreparationSettings.safeParse(args["preparation"] ?? {});
      if (!settings.success) return { error: "Invalid image preparation", issues: settings.error.issues };
      const prepared = await prepareGameImage(bytes, settings.data);
      bytes = prepared.bytes;
      width = prepared.width;
      height = prepared.height;
      extension = "png";
      preparation = { trimAlpha: settings.data.trimAlpha, mirrorX: settings.data.mirrorX, mirrorY: settings.data.mirrorY };
      if (settings.data.targetWidth) { preparation.targetWidth = settings.data.targetWidth; preparation.targetHeight = settings.data.targetHeight; preparation.cropPolicy = settings.data.cropPolicy ?? "contain"; }
      originalDimensions = { width: prepared.originalWidth, height: prepared.originalHeight };
      trim = prepared.trim;
    }
    const digest = createHash("sha256").update(bytes).digest("hex");
    const contentType = extension === "png" ? "image/png" : extension === "wav" ? "audio/wav" : extension === "ogg" ? "audio/ogg" : "audio/mpeg";
    await workspace.write(`${game.source_root}/assets/${digest}.${extension}`, bytes, contentType);
    const previous = draft.document.assets[slot];
    const binding: Record<string, unknown> = {
      assetId: `generated:${digest}`,
      digest,
      mediaKind: kind === "image" ? "image" : "audio",
      width,
      height,
      pivot: previous?.pivot ?? { x: 0.5, y: 0.5 },
      sampling: previous?.sampling ?? "nearest"
    };
    if (draft.document.schemaVersion === 2) {
      binding.preparation = preparation;
      binding.originalDimensions = originalDimensions;
      binding.trim = trim;
      binding.referenceAssetId = reference?.assetId;
      binding.provenance = `${provider}:${model}:${generated.generation_id ?? ""}`;
    }
    const installed = await install.impl(run, { game_id: game.id, slot, binding, base_updated_at: draft.game.draft_updated_at });
    return typeof installed === "object" && installed !== null
      ? { generation_id: generated.generation_id, ...installed }
      : { generation_id: generated.generation_id, result: installed };
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
          : file.path.endsWith(".ttf") ? "font/ttf"
          : file.path.endsWith(".otf") ? "font/otf"
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
  exports: [create, get, save, install, playtest, buildGame, edit, capture, generateAsset]
};
