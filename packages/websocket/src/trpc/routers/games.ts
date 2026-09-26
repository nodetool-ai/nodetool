import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import sharp from "sharp";
import { getManagedWorkspaceDir, managedWorkspaceKey, workspaceStorageKind } from "@nodetool-ai/config";
import { AmbiguousGameIdError, Asset, Game, Project, Workspace } from "@nodetool-ai/models";
import { gameAssetBinding, gameDocument, type GameDocument } from "@nodetool-ai/protocol/game.js";
import { createTopDownRoomGame, validateGame } from "@nodetool-ai/game-runtime";
import type { Workspace as RunWorkspace } from "@nodetool-ai/runtime";
import { getAssetAdapter } from "../../lib/storage.js";
import { getAssetStorageKey, retrieveAssetBytes } from "../../lib/asset-paths.js";
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
  createdAt: z.string(),
  updatedAt: z.string()
});
const gameWithDocument = z.object({ game: gameInfo, document: gameDocument });
const gameRevisionInfo = z.object({ revision: z.string(), modifiedAt: z.number(), current: z.boolean() });

function info(game: Game): z.infer<typeof gameInfo> {
  return {
    id: game.id,
    projectId: game.project_id,
    workspaceId: game.workspace_id,
    name: game.name,
    revision: game.current_revision,
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
  const source = gameDocument.parse(value);
  const result = validateGame({ ...source, id, revision });
  if (!result.valid || !result.document) {
    throwApiError(ApiErrorCode.INVALID_INPUT, result.errors.join("; "));
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

async function publishDocument(userId: string, game: Game, baseRevision: string, value: unknown): Promise<{ game: z.infer<typeof gameInfo>; document: GameDocument }> {
  if (baseRevision !== game.current_revision) {
    throwApiError(ApiErrorCode.ALREADY_EXISTS, "Game was modified concurrently");
  }
  const revision = newRevision();
  const document = validatedDocument(value, game.id, revision);
  const workspace = await gameWorkspace(userId, game);
  await writeRevision(workspace, game, document);
  const updated = await Game.publish(userId, game.id, baseRevision, revision);
  if (!updated) {
    throwApiError(ApiErrorCode.ALREADY_EXISTS, "Game was modified concurrently");
  }
  return { game: info(updated), document };
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
    .input(z.object({ projectId: z.string(), name: z.string().min(1).max(200), document: gameDocument.optional() }))
    .output(gameWithDocument)
    .mutation(async ({ ctx, input }) => {
      if (!(await Project.findOwned(ctx.userId, input.projectId))) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Project not found");
      }
      const workspaceRow = await projectWorkspace(ctx.userId, input.projectId);
      const workspace = workspaceFromRow(workspaceRow);
      if (!workspace) {
        throwApiError(ApiErrorCode.SERVICE_UNAVAILABLE, "Workspace storage is unavailable");
      }
      const id = randomUUID().replace(/-/g, "");
      const revision = newRevision();
      const source = input.document ?? createTopDownRoomGame(id);
      const document = validatedDocument(source, id, revision);
      const candidate = new Game({
        id,
        user_id: ctx.userId,
        project_id: input.projectId,
        workspace_id: workspaceRow.id,
        name: input.name,
        current_revision: revision
      });
      await writeRevision(workspace, candidate, document);
      const game = await Game.insertNew({
        id,
        userId: ctx.userId,
        projectId: input.projectId,
        workspaceId: workspaceRow.id,
        name: input.name,
        revision
      });
      if (!game) throwApiError(ApiErrorCode.ALREADY_EXISTS, "Game already exists");
      return { game: info(game), document };
    }),

  get: protectedProcedure
    .input(idInput.extend({ revision: z.string().optional() }))
    .output(gameWithDocument)
    .query(async ({ ctx, input }) => {
      const game = await ownedGame(ctx.userId, input.id);
      const workspace = await gameWorkspace(ctx.userId, game);
      return { game: info(game), document: await readRevision(workspace, game, input.revision ?? game.current_revision) };
    }),

  revisions: protectedProcedure
    .input(idInput)
    .output(z.array(gameRevisionInfo))
    .query(async ({ ctx, input }) => {
      const game = await ownedGame(ctx.userId, input.id);
      const workspace = await gameWorkspace(ctx.userId, game);
      const entries = await workspace.list(`${game.source_root}/revisions`, { recursive: true });
      const revisions = entries.flatMap((entry) => {
        const match = /^([a-f0-9]{32})\/game\.json$/.exec(entry.path.slice(`${game.source_root}/revisions/`.length));
        return match ? [{ revision: match[1], modifiedAt: entry.modifiedAt, current: match[1] === game.current_revision }] : [];
      });
      return revisions.sort((a, b) => b.modifiedAt - a.modifiedAt);
    }),

  publish: protectedProcedure
    .input(idInput.extend({ baseRevision: z.string(), document: gameDocument }))
    .output(gameWithDocument)
    .mutation(async ({ ctx, input }) =>
      publishDocument(ctx.userId, await ownedGame(ctx.userId, input.id), input.baseRevision, input.document)
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

  installAsset: protectedProcedure
    .input(idInput.extend({ baseRevision: z.string(), slot: z.string().min(1), assetId: z.string(), expectedDigest: z.string().optional() }))
    .output(gameWithDocument)
    .mutation(async ({ ctx, input }) => {
      const game = await ownedGame(ctx.userId, input.id);
      const asset = await Asset.find(ctx.userId, input.assetId);
      if (!asset || !asset.content_type.startsWith("image/")) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Image asset not found");
      }
      const bytes = await retrieveAssetBytes(
        getAssetAdapter(),
        ctx.userId,
        asset.id,
        asset.content_type
      );
      if (!bytes) throwApiError(ApiErrorCode.NOT_FOUND, "Image bytes not found");
      const digest = createHash("sha256").update(bytes).digest("hex");
      if (input.expectedDigest && digest !== input.expectedDigest) {
        throwApiError(ApiErrorCode.INVALID_INPUT, "Image content digest changed");
      }
      const metadata = await sharp(bytes).metadata();
      if (!metadata.width || !metadata.height) {
        throwApiError(ApiErrorCode.INVALID_INPUT, "Image dimensions are unavailable");
      }
      const workspace = await gameWorkspace(ctx.userId, game);
      const document = await readRevision(workspace, game, game.current_revision);
      return publishDocument(ctx.userId, game, input.baseRevision, {
        ...document,
        assets: {
          ...document.assets,
          [input.slot]: {
            assetId: asset.id,
            digest,
            width: metadata.width,
            height: metadata.height,
            pivot: document.assets[input.slot]?.pivot ?? { x: 0.5, y: 0.5 },
            sampling: document.assets[input.slot]?.sampling ?? "nearest",
            provenance: asset.workflow_id ?? undefined
          }
        }
      });
    }),

  installCandidate: protectedProcedure
    .input(idInput.extend({
      baseRevision: z.string(),
      slot: z.string().min(1),
      candidateWorkspaceId: z.string().optional(),
      binding: gameAssetBinding
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
      const extension = input.binding.mediaKind === "audio" ? "wav" : "png";
      const path = `${game.source_root}/assets/${digest}.${extension}`;
      const bytes = await candidateWorkspace.read(path);
      if (!bytes || createHash("sha256").update(bytes).digest("hex") !== digest) {
        throwApiError(ApiErrorCode.INVALID_INPUT, "Candidate asset is missing or changed");
      }
      if (game.current_revision !== input.baseRevision) {
        throwApiError(ApiErrorCode.ALREADY_EXISTS, "Game was modified concurrently");
      }
      const contentType = extension === "wav" ? "audio/wav" : "image/png";
      if (candidateRow && candidateRow.id !== game.workspace_id) {
        await workspace.write(path, bytes, contentType);
      }
      const document = await readRevision(workspace, game, game.current_revision);
      const installed = (await Asset.create({
        user_id: ctx.userId,
        project_id: game.project_id,
        parent_id: ctx.userId,
        name: `${input.slot}.${extension}`,
        content_type: contentType,
        size: bytes.byteLength,
        metadata: { game_source_asset_id: input.binding.assetId, game_digest: digest }
      })) as Asset;
      const storage = getAssetAdapter();
      const key = getAssetStorageKey(ctx.userId, installed.id, contentType);
      let uri: string | null = null;
      try {
        uri = await storage.store(key, bytes, contentType);
        return await publishDocument(ctx.userId, game, input.baseRevision, {
          ...document,
          assets: {
            ...document.assets,
            [input.slot]: { ...input.binding, assetId: installed.id }
          }
        });
      } catch (error) {
        if (uri) await storage.delete(uri);
        await installed.delete();
        throw error;
      }
    })
});
