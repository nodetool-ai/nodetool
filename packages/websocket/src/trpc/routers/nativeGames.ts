import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { Game, NativeGameStore, Project, Workspace } from "@nodetool-ai/models";
import { nativeGameDocument } from "@nodetool-ai/protocol/native-game";
import { isShortResourceId } from "@nodetool-ai/protocol";
import { nativeCppExecutable } from "@nodetool-ai/game-runtime/native";
import { NativeGameWorker } from "../../lib/native-game-worker.js";
import { workspaceFromRow } from "../../lib/workflow-workspace.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { TRPCError } from "@trpc/server";

async function owned(userId: string, id: string) {
  const game = await Game.findOwned(userId, id);
  if (!game || !(await Project.findOwned(userId, game.project_id))) { throw new TRPCError({ code: "NOT_FOUND", message: "Native game not found" }); }
  const row = await Workspace.find(userId, game.workspace_id);
  if (!row || row.project_id !== game.project_id) { throw new TRPCError({ code: "NOT_FOUND", message: "Native game workspace not found" }); }
  if (!/^\d+$/.test(game.current_revision)) { throw new TRPCError({ code: "BAD_REQUEST", message: "Game belongs to the legacy web engine. Use the games route." }); }
  const workspace = workspaceFromRow(row);
  if (!workspace) { throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Workspace storage unavailable" }); }
  return { game, workspace };
}

async function validate(document: z.output<typeof nativeGameDocument>): Promise<void> {
  let executable: string;
  try { executable = nativeCppExecutable("worker"); }
  catch (cause) { throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Native game worker is unavailable", cause }); }
  const worker = new NativeGameWorker({ executable });
  try { await worker.request("hello"); await worker.request("validate", { document }); }
  finally { worker.close(); }
}

export const nativeGamesRouter = router({
  create: protectedProcedure.input(z.object({ projectId: z.string(), workspaceId: z.string(), document: nativeGameDocument }))
    .output(nativeGameDocument).mutation(async ({ ctx, input }) => {
      const project = await Project.findOwned(ctx.userId, input.projectId);
      if (!project) { throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" }); }
      const matches = isShortResourceId(input.workspaceId)
        ? (await Workspace.listByProject(ctx.userId, project.id)).filter((item) => item.id.startsWith(input.workspaceId))
        : [];
      if (matches.length > 1) { throw new TRPCError({ code: "BAD_REQUEST", message: "Workspace ID prefix is ambiguous" }); }
      const row = isShortResourceId(input.workspaceId) ? matches[0] : await Workspace.find(ctx.userId, input.workspaceId);
      if (!row || row.project_id !== project.id) { throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found" }); }
      const workspace = workspaceFromRow(row);
      if (!workspace) { throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Workspace storage unavailable" }); }
      const document = nativeGameDocument.parse({ ...input.document, id: randomUUID().replace(/-/g, ""), revision: 0 });
      await validate(document);
      const source = JSON.stringify(document);
      const digest = createHash("sha256").update(source).digest("hex");
      await workspace.write(`games/${document.id}/native/${digest}.json`, source, "application/json");
      const game = await Game.insertNew({ id: document.id, userId: ctx.userId, projectId: project.id,
        workspaceId: row.id, name: document.title, revision: "0", draftVersionId: digest });
      if (!game) { throw new TRPCError({ code: "CONFLICT", message: "Game already exists" }); }
      return document;
    }),
  get: protectedProcedure.input(z.object({ id: z.string() })).output(nativeGameDocument).query(async ({ ctx, input }) => {
    const { game, workspace } = await owned(ctx.userId, input.id);
    const result = await NativeGameStore.read(ctx.userId, game.id, workspace);
    if (!result) { throw new TRPCError({ code: "NOT_FOUND", message: "Native game not found" }); }
    return result.document;
  }),
  save: protectedProcedure.input(z.object({ id: z.string(), expectedRevision: z.number().int().nonnegative(), document: nativeGameDocument }))
    .output(nativeGameDocument).mutation(async ({ ctx, input }) => {
      const { game, workspace } = await owned(ctx.userId, input.id);
      await validate(input.document);
      const result = await NativeGameStore.save(ctx.userId, game.id, input.expectedRevision, input.document, workspace);
      if (!result) {
        const current = await NativeGameStore.read(ctx.userId, game.id, workspace);
        throw new TRPCError({ code: "CONFLICT", message: `Native game revision changed. Current revision: ${current?.document.revision ?? "unavailable"}. Reopen before retrying.`,
          cause: { currentRevision: current?.document.revision } });
      }
      return result.document;
    })
});
