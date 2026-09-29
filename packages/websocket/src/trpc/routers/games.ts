import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import sharp from "sharp";
import { getManagedWorkspaceDir, managedWorkspaceKey, workspaceStorageKind } from "@nodetool-ai/config";
import { AmbiguousGameIdError, Asset, Game, Project, Workspace } from "@nodetool-ai/models";
import { exampleGameSummary, anyGameAssetBinding, gameAssetBinding, gameAssetBinding3D, gamePreparedCollider3D, gameModelImportSettings3D, parseGameDocument, anyGameDocument as gameDocument, installExampleGameInput, type AnyGameDocument as GameDocument } from "@nodetool-ai/protocol";
import { createTopDownRoomGame, createNative3DGame, anyGameDocumentOp as gameDocumentOp, GameOpError, decodePreparedGameCollider3D, validateAnyGame } from "@nodetool-ai/game-runtime";
import { normalizeGameModel3D, prepareGameModelBinding3D } from "@nodetool-ai/game-renderer/preparation3d";
import type { Workspace as RunWorkspace } from "@nodetool-ai/runtime";
import { getAssetAdapter } from "../../lib/storage.js";
import { getAssetStorageKey, retrieveAssetBytes } from "../../lib/asset-paths.js";
import { installExampleGameAssets, listExampleGames } from "../../lib/example-games.js";
import { workspaceFromRow } from "../../lib/workflow-workspace.js";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";

const idInput = z.object({ id: z.string() });
const gameInfo = z.object({
  id: z.string(),
  projectId: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  revision: z.string(),
  draftUpdatedAt: z.string(),
  draftBaseRevision: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});
const gameWithDocument = z.object({ game: gameInfo, document: gameDocument });
const gameRevisionInfo = z.object({ revision: z.string(), modifiedAt: z.number(), current: z.boolean(), message: z.string().nullable() });

function info(game: Game): z.infer<typeof gameInfo> {
  return {
    id: game.id,
    projectId: game.project_id,
    workspaceId: game.workspace_id,
    name: game.name,
    revision: game.current_revision,
    draftUpdatedAt: game.draft_updated_at,
    draftBaseRevision: game.draft_base_revision,
    createdAt: game.created_at,
    updatedAt: game.updated_at
  };
}

function newRevision(): string {
  return randomUUID().replace(/-/g, "");
}

function sourcePath(game: Game, revision: string): string {
  return `${game.source_root}/revisions/${revision}/game.json`;
}

async function ownedGame(userId: string, id: string): Promise<Game> {
  let game: Game | null;
  try {
    game = await Game.findOwned(userId, id);
  } catch (error) {
    if (error instanceof AmbiguousGameIdError) {
      throwApiError(ApiErrorCode.INVALID_INPUT, error.message);
    }
    throw error;
  }
  if (!game || !(await Project.findOwned(userId, game.project_id))) {
    throwApiError(ApiErrorCode.NOT_FOUND, "Game not found");
  }
  return game;
}

async function gameWorkspace(userId: string, game: Game): Promise<RunWorkspace> {
  const row = await Workspace.find(userId, game.workspace_id);
  if (!row || row.project_id !== game.project_id) {
    throwApiError(ApiErrorCode.NOT_FOUND, "Game workspace not found");
  }
  const workspace = workspaceFromRow(row);
  if (!workspace) {
    throwApiError(ApiErrorCode.SERVICE_UNAVAILABLE, "Workspace storage is unavailable");
  }
  return workspace;
}

async function persistGameAsset(
  userId: string, game: Game, workspace: RunWorkspace, draftUpdatedAt: string,
  slot: string, binding: z.infer<typeof anyGameAssetBinding>, bytes: Uint8Array,
  extension: string, contentType: string
): Promise<z.infer<typeof gameWithDocument>> {
  await workspace.write(`${game.source_root}/assets/${binding.digest}.${extension}`, bytes, contentType);
  const installed = await Asset.create({
    user_id: userId, project_id: game.project_id, parent_id: userId,
    name: `${slot}.${extension}`, content_type: contentType, size: bytes.byteLength,
    metadata: { game_source_asset_id: binding.mediaKind === "model" ? binding.sourceAssetId ?? binding.assetId : binding.assetId,
      game_digest: binding.digest }
  });
  if (!(installed instanceof Asset)) { throwApiError(ApiErrorCode.INTERNAL_ERROR, "Asset creation failed"); }
  const storage = getAssetAdapter();
  let uri: string | null = null;
  try {
    uri = await storage.store(getAssetStorageKey(userId, installed.id, contentType), bytes, contentType);
    const op = gameDocumentOp.parse({ op: "bind_asset", slot, binding: { ...binding, assetId: installed.id } });
    const saved = await Game.updateDraft(userId, game.id, draftUpdatedAt, [op], workspace, { actor: "user" });
    if (!saved) { throwApiError(ApiErrorCode.ALREADY_EXISTS, "Game draft was modified concurrently"); }
    return { game: info(saved.game), document: saved.document };
  } catch (error) {
    if (uri) { await storage.delete(uri); }
    await installed.delete();
    throw error;
  }
}

async function projectWorkspace(userId: string, projectId: string): Promise<Workspace> {
  const rows = await Workspace.listByProject(userId, projectId);
  const existing = rows.find((row) => row.isAccessible() && (process.env["NODETOOL_ENV"] !== "production" || row.isManaged()));
  if (existing) return existing;
  const defaultRow = await Workspace.ensureDefault(userId);
  const managed = defaultRow.isManaged() ? defaultRow : new Workspace({
    user_id: userId,
    name: "Managed workspace",
    path: workspaceStorageKind() === "cloud"
      ? managedWorkspaceKey(userId)
      : getManagedWorkspaceDir(userId),
    is_default: false
  });
  const root = workspaceFromRow(managed);
  if (!root) {
    throwApiError(ApiErrorCode.SERVICE_UNAVAILABLE, "Managed workspace is unavailable");
  }
  const segment = createHash("sha256").update(projectId).digest("hex");
  await root.mkdir(`projects/${segment}`);
  return (await Workspace.create({
    user_id: userId,
    project_id: projectId,
    name: "Game workspace",
    path: managed.isVirtual()
      ? `${managed.path}/projects/${segment}`
      : join(managed.path, "projects", segment),
    is_default: false
  })) as Workspace;
}

function validatedDocument(value: unknown, id: string, revision: string): GameDocument {
  const parsed = parseGameDocument(value);
  if (!parsed.ok) { throwApiError(ApiErrorCode.INVALID_INPUT, parsed.diagnostics.map((issue) => `${issue.code} ${issue.path.join(".")}: ${issue.message}`).join("; ")); }
  const source = parsed.document;
  const result = validateAnyGame({ ...source, id, revision });
  if (!result.valid || !result.document) {
    throwApiError(ApiErrorCode.INVALID_INPUT, result.diagnostics.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));
  }
  return result.document;
}

async function readRevision(workspace: RunWorkspace, game: Game, revision: string): Promise<GameDocument> {
  if (!/^[a-f0-9]{32}$/.test(revision)) {
    throwApiError(ApiErrorCode.INVALID_INPUT, "Invalid game revision");
  }
  const source = await workspace.readText(sourcePath(game, revision));
  if (source === null) {
    throwApiError(ApiErrorCode.NOT_FOUND, "Game revision not found");
  }
  const document = gameDocument.parse(JSON.parse(source));
  if (document.id !== game.id || document.revision !== revision) {
    throwApiError(ApiErrorCode.INTERNAL_ERROR, "Game revision is corrupt");
  }
  return document;
}

async function writeRevision(workspace: RunWorkspace, game: Game, document: GameDocument): Promise<void> {
  await workspace.write(sourcePath(game, document.revision), JSON.stringify(document), "application/json");
}

async function publishDocument(userId: string, game: Game, baseRevision: string, value?: unknown, message?: string): Promise<{ game: z.infer<typeof gameInfo>; document: GameDocument }> {
  if (baseRevision !== game.current_revision) {
    throwApiError(ApiErrorCode.ALREADY_EXISTS, "Game was modified concurrently");
  }
  const workspace = await gameWorkspace(userId, game);
  const draft = await Game.readDraft(userId, game.id, workspace);
  if (!draft) {
    throwApiError(ApiErrorCode.NOT_FOUND, "Game draft not found");
  }
  const revision = newRevision();
  const document = validatedDocument(value ?? draft.document, game.id, revision);
  if ((document.schemaVersion === 3) !== (draft.document.schemaVersion === 3)) {
    throwApiError(ApiErrorCode.INVALID_INPUT, "A game cannot change dimension");
  }
  await writeRevision(workspace, game, document);
  const updated = await Game.publish(userId, game.id, baseRevision, revision, draft.game.draft_updated_at, workspace, message);
  if (!updated) {
    await workspace.delete(sourcePath(game, revision));
    throwApiError(ApiErrorCode.ALREADY_EXISTS, "Game was modified concurrently");
  }
  if (draft.game.draft_version_id) {
    await workspace.delete(`${game.source_root}/drafts/${draft.game.draft_version_id}.json`);
  }
  await workspace.write(`${game.source_root}/draft.json`, JSON.stringify(document), "application/json");
  return { game: info(updated), document };
}

async function createGame(
  userId: string,
  projectId: string,
  name: string,
  source?: GameDocument,
  dimension: "2d" | "3d" = "2d"
): Promise<{ game: z.infer<typeof gameInfo>; document: GameDocument }> {
  if (!(await Project.findOwned(userId, projectId))) {
    throwApiError(ApiErrorCode.NOT_FOUND, "Project not found");
  }
  const workspaceRow = await projectWorkspace(userId, projectId);
  const workspace = workspaceFromRow(workspaceRow);
  if (!workspace) {
    throwApiError(ApiErrorCode.SERVICE_UNAVAILABLE, "Workspace storage is unavailable");
  }
  const id = randomUUID().replace(/-/g, "");
  const revision = newRevision();
  const document = validatedDocument(source ?? (dimension === "3d" ? createNative3DGame(id) : createTopDownRoomGame(id)), id, revision);
  const candidate = new Game({
    id,
    user_id: userId,
    project_id: projectId,
    workspace_id: workspaceRow.id,
    name,
    current_revision: revision
  });
  await writeRevision(workspace, candidate, document);
  const game = await Game.insertNew({
    id,
    userId,
    projectId,
    workspaceId: workspaceRow.id,
    name,
    revision
  });
  if (!game) throwApiError(ApiErrorCode.ALREADY_EXISTS, "Game already exists");
  return { game: info(game), document };
}

export const gamesRouter = router({
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .output(z.array(gameInfo))
    .query(async ({ ctx, input }) => {
      if (!(await Project.findOwned(ctx.userId, input.projectId))) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Project not found");
      }
      return (await Game.listByProject(ctx.userId, input.projectId)).map(info);
    }),

  create: protectedProcedure
    .input(z.object({ projectId: z.string(), name: z.string().min(1).max(200), dimension: z.enum(["2d", "3d"]).optional(), document: gameDocument.optional() }))
    .output(gameWithDocument)
    .mutation(({ ctx, input }) => {
      if (input.dimension && input.document && ((input.document.schemaVersion === 3) !== (input.dimension === "3d"))) {
        throwApiError(ApiErrorCode.INVALID_INPUT, "Requested dimension does not match the supplied game document");
      }
      return createGame(ctx.userId, input.projectId, input.name, input.document, input.dimension);
    }),

  examples: protectedProcedure
    .output(z.array(exampleGameSummary))
    .query(({ ctx }) => listExampleGames(ctx.apiOptions)),

  installExample: protectedProcedure
    .input(installExampleGameInput)
    .output(gameWithDocument)
    .mutation(async ({ ctx, input }) => {
      // The Examples page targets the personal project, which exists only
      // once something has been saved to it.
      if (input.projectId === `personal:${ctx.userId}`) await Project.ensurePersonal(ctx.userId);
      if (!(await Project.findOwned(ctx.userId, input.projectId))) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Project not found");
      }
      const installed = await installExampleGameAssets(ctx.userId, input.projectId, ctx.apiOptions, input.slug);
      try {
        return await createGame(ctx.userId, input.projectId, input.name ?? installed.bundle.name, installed.document);
      } catch (error) {
        await installed.rollback();
        throw error;
      }
    }),

  get: protectedProcedure
    .input(idInput.extend({ revision: z.string().optional() }))
    .output(gameWithDocument)
    .query(async ({ ctx, input }) => {
      const game = await ownedGame(ctx.userId, input.id);
      const workspace = await gameWorkspace(ctx.userId, game);
      return { game: info(game), document: await readRevision(workspace, game, input.revision ?? game.current_revision) };
    }),

  getDraft: protectedProcedure
    .input(idInput)
    .output(gameWithDocument)
    .query(async ({ ctx, input }) => {
      const game = await ownedGame(ctx.userId, input.id);
      const draft = await Game.readDraft(ctx.userId, game.id, await gameWorkspace(ctx.userId, game));
      if (!draft) throwApiError(ApiErrorCode.NOT_FOUND, "Game draft not found");
      return { game: info(draft.game), document: draft.document };
    }),

  saveDraft: protectedProcedure
    .input(idInput.extend({ baseUpdatedAt: z.string(), ops: z.array(gameDocumentOp).min(1) }))
    .output(gameWithDocument)
    .mutation(async ({ ctx, input }) => {
      const game = await ownedGame(ctx.userId, input.id);
      try {
        const saved = await Game.updateDraft(
          ctx.userId, game.id, input.baseUpdatedAt, input.ops,
          await gameWorkspace(ctx.userId, game), { actor: "user" }
        );
        if (!saved) throwApiError(ApiErrorCode.ALREADY_EXISTS, "Game draft was modified concurrently");
        return { game: info(saved.game), document: saved.document };
      } catch (error) {
        if (error instanceof GameOpError) {
          throwApiError(ApiErrorCode.INVALID_INPUT, `Op ${error.opIndex}: ${error.path}: ${error.message}`);
        }
        throw error;
      }
    }),

  draftChanges: protectedProcedure
    .input(idInput)
    .output(z.array(z.object({
      id: z.string(), actor: z.enum(["agent", "user"]), threadId: z.string().nullable(),
      messageId: z.string().nullable(), summary: z.string(), beforeUpdatedAt: z.string(),
      beforeDigest: z.string(), createdAt: z.string(), ops: z.array(gameDocumentOp),
      affectedEntityIds: z.array(z.string())
    })))
    .query(async ({ ctx, input }) => {
      const game = await ownedGame(ctx.userId, input.id);
      return (await Game.listDraftChanges(ctx.userId, game.id)).map(({ gameId: _gameId, ...change }) => change);
    }),

  draftBeforeChange: protectedProcedure
    .input(idInput.extend({ changeId: z.string() }))
    .output(gameDocument)
    .query(async ({ ctx, input }) => {
      const game = await ownedGame(ctx.userId, input.id);
      const document = await Game.readDraftBeforeChange(
        ctx.userId, game.id, input.changeId, await gameWorkspace(ctx.userId, game)
      );
      if (!document) throwApiError(ApiErrorCode.NOT_FOUND, "Game draft change not found");
      return document;
    }),

  revisions: protectedProcedure
    .input(idInput)
    .output(z.array(gameRevisionInfo))
    .query(async ({ ctx, input }) => {
      const game = await ownedGame(ctx.userId, input.id);
      const workspace = await gameWorkspace(ctx.userId, game);
      const messages = await Game.listRevisionMessages(ctx.userId, game.id);
      const entries = await workspace.list(`${game.source_root}/revisions`, { recursive: true });
      const revisions = entries.flatMap((entry) => {
        const match = /^([a-f0-9]{32})\/game\.json$/.exec(entry.path.slice(`${game.source_root}/revisions/`.length));
        return match ? [{ revision: match[1], modifiedAt: entry.modifiedAt, current: match[1] === game.current_revision,
          message: messages.get(match[1]) ?? null }] : [];
      });
      return revisions.sort((a, b) => b.modifiedAt - a.modifiedAt);
    }),

  publish: protectedProcedure
    .input(idInput.extend({ baseRevision: z.string(), document: gameDocument.optional(), message: z.string().trim().max(500).optional() }))
    .output(gameWithDocument)
    .mutation(async ({ ctx, input }) =>
      publishDocument(ctx.userId, await ownedGame(ctx.userId, input.id), input.baseRevision, input.document, input.message)
    ),

  restore: protectedProcedure
    .input(idInput.extend({ baseRevision: z.string(), revision: z.string() }))
    .output(gameWithDocument)
    .mutation(async ({ ctx, input }) => {
      const game = await ownedGame(ctx.userId, input.id);
      const workspace = await gameWorkspace(ctx.userId, game);
      const oldDocument = await readRevision(workspace, game, input.revision);
      return publishDocument(ctx.userId, game, input.baseRevision, oldDocument);
    }),

  restoreDraft: protectedProcedure
    .input(idInput.extend({ baseUpdatedAt: z.string(), revision: z.string() }))
    .output(gameWithDocument)
    .mutation(async ({ ctx, input }) => {
      const game = await ownedGame(ctx.userId, input.id);
      const workspace = await gameWorkspace(ctx.userId, game);
      const document = await readRevision(workspace, game, input.revision);
      const restored = await Game.replaceDraft(ctx.userId, game.id, input.baseUpdatedAt, document, workspace);
      if (!restored) throwApiError(ApiErrorCode.ALREADY_EXISTS, "Game draft was modified concurrently");
      return { game: info(restored.game), document: restored.document };
    }),

  installAsset: protectedProcedure
    .input(idInput.extend({ baseRevision: z.string().optional(), baseUpdatedAt: z.string().optional(), slot: z.string().min(1),
      assetId: z.string(), expectedDigest: z.string().optional(), importSettings: gameModelImportSettings3D.partial().optional(),
      dependencyAssetIds: z.record(z.string(), z.string()).refine((value) => Object.keys(value).length <= 320, "Too many model dependencies").optional() }))
    .output(gameWithDocument)
    .mutation(async ({ ctx, input }) => {
      const game = await ownedGame(ctx.userId, input.id);
      const workspace = await gameWorkspace(ctx.userId, game);
      const draft = await Game.readDraft(ctx.userId, game.id, workspace);
      if (!draft) { throwApiError(ApiErrorCode.NOT_FOUND, "Game draft not found"); }
      if (input.baseRevision && game.current_revision !== input.baseRevision) {
        throwApiError(ApiErrorCode.ALREADY_EXISTS, "Game was modified concurrently");
      }
      if (input.baseUpdatedAt && draft.game.draft_updated_at !== input.baseUpdatedAt) {
        throwApiError(ApiErrorCode.ALREADY_EXISTS, "Game draft was modified concurrently");
      }
      const is3D = draft.document.schemaVersion === 3;
      const asset = await Asset.find(ctx.userId, input.assetId);
      if (!asset || (is3D ? !["model/gltf-binary", "model/gltf+json"].includes(asset.content_type) : !asset.content_type.startsWith("image/"))) {
        throwApiError(ApiErrorCode.NOT_FOUND, is3D ? "Model asset not found" : "Image asset not found");
      }
      if (is3D && asset.size !== null && asset.size > 64 * 1024 * 1024) {
        throwApiError(ApiErrorCode.INVALID_INPUT, "Model source exceeds import byte budget");
      }
      const bytes = await retrieveAssetBytes(getAssetAdapter(), ctx.userId, asset.id, asset.content_type);
      if (!bytes) { throwApiError(ApiErrorCode.NOT_FOUND, is3D ? "Model bytes not found" : "Image bytes not found"); }
      const digest = createHash("sha256").update(bytes).digest("hex");
      if (input.expectedDigest && digest !== input.expectedDigest) {
        throwApiError(ApiErrorCode.INVALID_INPUT, is3D ? "Model content digest changed" : "Image content digest changed");
      }
      if (draft.document.schemaVersion === 3) {
        const normalized = await normalizeGameModel3D(bytes, {
          assetId: asset.id, sourceAssetId: asset.id, importSettings: input.importSettings,
          provenance: asset.workflow_id ?? undefined,
          resolveDependency: async (uri) => {
            const dependencyId = input.dependencyAssetIds && Object.hasOwn(input.dependencyAssetIds, uri)
              ? input.dependencyAssetIds[uri] : undefined;
            if (!dependencyId) { return null; }
            const dependency = await Asset.find(ctx.userId, dependencyId);
            if (!dependency) { throwApiError(ApiErrorCode.NOT_FOUND, "Model dependency asset not found"); }
            if (dependency.size !== null && dependency.size > 64 * 1024 * 1024) {
              throwApiError(ApiErrorCode.INVALID_INPUT, "Model dependency exceeds import byte budget");
            }
            return retrieveAssetBytes(getAssetAdapter(), ctx.userId, dependency.id, dependency.content_type);
          }
        });
        if (!normalized.ok) { throwApiError(ApiErrorCode.INVALID_INPUT, normalized.diagnostics.map((issue) => issue.message).join("; ")); }
        return persistGameAsset(ctx.userId, game, workspace, draft.game.draft_updated_at, input.slot,
          normalized.binding, normalized.bytes, "glb", "model/gltf-binary");
      }
      const metadata = await sharp(bytes).metadata();
      if (!metadata.width || !metadata.height) { throwApiError(ApiErrorCode.INVALID_INPUT, "Image dimensions are unavailable"); }
      const saved = await Game.updateDraft(ctx.userId, game.id, draft.game.draft_updated_at, [{
        op: "bind_asset", slot: input.slot,
        binding: {
          assetId: asset.id, digest, width: metadata.width, height: metadata.height,
          pivot: draft.document.assets[input.slot]?.pivot ?? { x: 0.5, y: 0.5 },
          sampling: draft.document.assets[input.slot]?.sampling ?? "nearest",
          provenance: asset.workflow_id ?? undefined
        }
      }], workspace, { actor: "user" });
      if (!saved) { throwApiError(ApiErrorCode.ALREADY_EXISTS, "Game draft was modified concurrently"); }
      return { game: info(saved.game), document: saved.document };
    }),

  installCandidate: protectedProcedure
    .input(idInput.extend({
      baseRevision: z.string().optional(),
      baseUpdatedAt: z.string().optional(),
      slot: z.string().min(1),
      candidateWorkspaceId: z.string().optional(),
      binding: anyGameAssetBinding
    }))
    .output(gameWithDocument)
    .mutation(async ({ ctx, input }) => {
      const game = await ownedGame(ctx.userId, input.id);
      const workspace = await gameWorkspace(ctx.userId, game);
      const candidateRow = input.candidateWorkspaceId
        ? await Workspace.find(ctx.userId, input.candidateWorkspaceId)
        : null;
      if (input.candidateWorkspaceId && (!candidateRow || candidateRow.project_id !== game.project_id)) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Candidate workspace not found");
      }
      const candidateWorkspace = candidateRow ? workspaceFromRow(candidateRow) : workspace;
      if (!candidateWorkspace) {
        throwApiError(ApiErrorCode.SERVICE_UNAVAILABLE, "Candidate workspace storage is unavailable");
      }
      const digest = input.binding.digest;
      if (!/^[a-f0-9]{64}$/.test(digest)) {
        throwApiError(ApiErrorCode.INVALID_INPUT, "Invalid candidate digest");
      }
      if (input.binding.mediaKind === "font" && !input.binding.fontFormat) {
        throwApiError(ApiErrorCode.INVALID_INPUT, "Font binding needs a TrueType or OpenType format");
      }
      const formats = input.binding.mediaKind === "model"
        ? [["glb", "model/gltf-binary"]]
        : input.binding.mediaKind === "collider"
          ? [["json", "application/json"]]
          : input.binding.mediaKind === "audio"
        ? [["wav", "audio/wav"], ["mp3", "audio/mpeg"], ["ogg", "audio/ogg"]]
        : input.binding.mediaKind === "font"
          ? [[input.binding.fontFormat, `font/${input.binding.fontFormat}`]]
          : [["png", "image/png"], ["jpg", "image/jpeg"], ["webp", "image/webp"]];
      let candidate: { extension: string; contentType: string; bytes: Uint8Array } | null = null;
      for (const [extension, contentType] of formats) {
        if (!extension || !contentType) continue;
        const path = `${game.source_root}/assets/${digest}.${extension}`;
        const bytes = await candidateWorkspace.read(path);
        if (bytes) {
          candidate = { extension, contentType, bytes };
          break;
        }
      }
      if (!candidate || createHash("sha256").update(candidate.bytes).digest("hex") !== digest) {
        throwApiError(ApiErrorCode.INVALID_INPUT, "Candidate asset is missing or changed");
      }
      const { extension, contentType, bytes } = candidate;
      let binding = input.binding;
      if (binding.mediaKind === "model") {
        const prepared = await prepareGameModelBinding3D(bytes, { assetId: binding.assetId, expectedDigest: digest });
        if (!prepared.ok) { throwApiError(ApiErrorCode.INVALID_INPUT, prepared.diagnostics.map((issue) => issue.message).join("; ")); }
        const sourceAsset = binding.sourceAssetId ? await Asset.find(ctx.userId, binding.sourceAssetId) : null;
        if (binding.sourceAssetId && !sourceAsset) { throwApiError(ApiErrorCode.INVALID_INPUT, "Model source asset is not owned"); }
        const canonical = { ...prepared.binding, required: binding.required };
        if (binding.provenance) { canonical.provenance = binding.provenance; }
        if (binding.importSettings) { canonical.importSettings = binding.importSettings; }
        if (binding.sourceDigest) { canonical.sourceDigest = binding.sourceDigest; }
        if (sourceAsset) { canonical.sourceAssetId = sourceAsset.id; }
        binding = canonical;
      } else if (binding.mediaKind === "collider") {
        let geometry: unknown;
        try { geometry = JSON.parse(new TextDecoder().decode(bytes)); }
        catch { throwApiError(ApiErrorCode.INVALID_INPUT, "Prepared collider is not valid JSON"); }
        const parsed = gamePreparedCollider3D.safeParse(geometry);
        if (!parsed.success || binding.shape === "triangleMesh" && !parsed.data.indices?.length) {
          throwApiError(ApiErrorCode.INVALID_INPUT, "Prepared collider has invalid vertices or triangle indices");
        }
        const { vertices, indices } = parsed.data;
        const minimum = { x: Infinity, y: Infinity, z: Infinity };
        const maximum = { x: -Infinity, y: -Infinity, z: -Infinity };
        for (let index = 0; index < vertices.length; index += 3) {
          minimum.x = Math.min(minimum.x, vertices[index]); maximum.x = Math.max(maximum.x, vertices[index]);
          minimum.y = Math.min(minimum.y, vertices[index + 1]); maximum.y = Math.max(maximum.y, vertices[index + 1]);
          minimum.z = Math.min(minimum.z, vertices[index + 2]); maximum.z = Math.max(maximum.z, vertices[index + 2]);
        }
        binding = { ...binding, preparationVersion: "1", bounds: { min: minimum, max: maximum }, vertices: vertices.length / 3, triangles: (indices?.length ?? 0) / 3 };
        try { await decodePreparedGameCollider3D(bytes, gameAssetBinding3D.options[1].parse(binding)); }
        catch (error) { throwApiError(ApiErrorCode.INVALID_INPUT, error instanceof Error ? error.message : "Prepared collider is invalid"); }
      }
      if (input.baseRevision && game.current_revision !== input.baseRevision) {
        throwApiError(ApiErrorCode.ALREADY_EXISTS, "Game was modified concurrently");
      }
      const draft = await Game.readDraft(ctx.userId, game.id, workspace);
      if (!draft) throwApiError(ApiErrorCode.NOT_FOUND, "Game draft not found");
      if (input.baseUpdatedAt && draft.game.draft_updated_at !== input.baseUpdatedAt) {
        throwApiError(ApiErrorCode.ALREADY_EXISTS, "Game draft was modified concurrently");
      }
      const targetBinding = draft.document.schemaVersion === 3 ? gameAssetBinding3D.safeParse(binding) :
        gameAssetBinding.safeParse(binding);
      if (!targetBinding.success || draft.document.schemaVersion !== 3 && (binding.mediaKind === "model" || binding.mediaKind === "collider")) {
        throwApiError(ApiErrorCode.INVALID_INPUT, "Asset binding does not match the game dimension");
      }
      return persistGameAsset(ctx.userId, game, workspace, draft.game.draft_updated_at, input.slot,
        targetBinding.data, bytes, extension, contentType);
    })
});
