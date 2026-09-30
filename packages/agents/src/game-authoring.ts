import { z } from "zod";
import { AmbiguousGameIdError, Game, Project, Workspace } from "@nodetool-ai/models";
import { anyGameDocument, gameAuthoringCandidate, gameAuthoringProgram, type AnyGameDocument, type GameAuthoringProgram } from "@nodetool-ai/protocol";
import { reconcileGameAuthoring, validateAnyGame } from "@nodetool-ai/game-runtime";
import { workspaceFromRow } from "@nodetool-ai/execution/service";
import type { CapabilityRun } from "./capabilities/types.js";
import { gameDocumentDigest, reproducibleGameBake } from "./game-code-bake.js";

function native(document: AnyGameDocument): AnyGameDocument {
  const { authoring: _authoring, ...rest } = document;
  return anyGameDocument.parse(rest);
}

async function draftFor(run: CapabilityRun, id: unknown) {
  const user = run.context.userId;
  if (!user || typeof id !== "string") { return null; }
  let game: Game | null;
  try { game = await Game.findOwned(user, id); }
  catch (error) { if (error instanceof AmbiguousGameIdError) { return null; } throw error; }
  if (!game || !(await Project.findOwned(user, game.project_id))) { return null; }
  const row = await Workspace.find(user, game.workspace_id);
  if (!row || row.project_id !== game.project_id) { return null; }
  const workspace = workspaceFromRow(row);
  if (!workspace) { return null; }
  const draft = await Game.readDraft(user, game.id, workspace);
  return draft ? { user, workspace, ...draft } : null;
}

async function preview(run: CapabilityRun, current: AnyGameDocument, program: GameAuthoringProgram, replaceExisting: boolean) {
  const baked = await reproducibleGameBake(run.context, program);
  if (!baked.ok) { return { error: baked.error }; }
  if ((baked.document.schemaVersion === 3) !== (current.schemaVersion === 3)) { return { error: "Construction cannot change game dimension" }; }
  const generated = anyGameDocument.parse({ ...baked.document, id: current.id, revision: current.revision });
  if (!current.authoring && !replaceExisting && gameDocumentDigest(native(current)) !== gameDocumentDigest(generated)) {
    return { error: "Initial construction differs from draft; pass expected_document for intentional whole-document replacement" };
  }
  const candidate = anyGameDocument.parse({ ...generated, authoring: {
    version: 1, program, baseline: z.record(z.string(), z.json()).parse(generated),
    overrides: [], suppressions: [], detached: [], parameters: baked.parameters,
    prefabs: baked.prefabs, instances: baked.instances
  } });
  const merged = current.authoring ? reconcileGameAuthoring(current, candidate) : {
    document: candidate, conflicts: [], changedEntityIds: candidate.scenes.flatMap((scene) => scene.entities.map((entity) => entity.id))
  };
  const validation = validateAnyGame(merged.conflicts.length ? native(merged.document) : merged.document);
  const conflicts = [...merged.conflicts];
  if (!validation.valid) {
    for (const diagnostic of validation.diagnostics) {
      const sceneIndex = diagnostic.path[0] === "scenes" && typeof diagnostic.path[1] === "number" ? diagnostic.path[1] : -1;
      const entityIndex = diagnostic.path[2] === "entities" && typeof diagnostic.path[3] === "number" ? diagnostic.path[3] : -1;
      const scene = merged.document.scenes[sceneIndex];
      conflicts.push({ sceneId: scene?.id ?? merged.document.entrySceneId,
        entityId: scene?.entities[entityIndex]?.id ?? "__document__",
        code: diagnostic.code, message: diagnostic.message });
    }
  }
  const beforeAssets = current.assets;
  const afterAssets = merged.document.assets;
  const changedDependencies = [...new Set([...Object.keys(beforeAssets), ...Object.keys(afterAssets)])]
    .filter((key) => gameDocumentDigest(beforeAssets[key]) !== gameDocumentDigest(afterAssets[key]));
  return { document: merged.document, conflicts, affected_entities: merged.changedEntityIds,
    changed_dependencies: changedDependencies, replace_existing: replaceExisting,
    restart_required: gameDocumentDigest(native(current)) !== gameDocumentDigest(native(merged.document)) };
}

export async function previewGameAuthoring(run: CapabilityRun, args: Record<string, unknown>) {
  const draft = await draftFor(run, args["game_id"]);
  if (!draft) { return { error: "Game draft not found" }; }
  if (args["base_updated_at"] !== undefined && args["base_updated_at"] !== draft.game.draft_updated_at) {
    return { error: "Game draft was modified concurrently" };
  }
  const program = gameAuthoringProgram.safeParse(args["program"] ?? draft.document.authoring?.program);
  if (!program.success) { return { error: "Invalid retained construction program", issues: program.error.issues }; }
  if (args["replace_existing"] !== undefined && typeof args["replace_existing"] !== "boolean") { return { error: "replace_existing must be a boolean" }; }
  const replaceExisting = args["expected_document"] !== undefined || args["replace_existing"] === true;
  const result = await preview(run, draft.document, program.data, replaceExisting);
  if ("error" in result) { return result; }
  if (args["expected_document"] !== undefined) {
    const expected = anyGameDocument.safeParse(args["expected_document"]);
    if (!expected.success) { return { error: "Invalid expected construction document" }; }
    const baked = await reproducibleGameBake(run.context, program.data);
    if (!baked.ok) { return { error: baked.error }; }
    const comparable = anyGameDocument.parse({ ...baked.document, id: expected.data.id, revision: expected.data.revision });
    if (gameDocumentDigest(native(comparable)) !== gameDocumentDigest(native(expected.data))) {
      return { error: "Retained construction does not reproduce the saved document" };
    }
  }
  return { ...result, candidate: { base_updated_at: draft.game.draft_updated_at,
    base_digest: gameDocumentDigest(draft.document), program: program.data, replace_existing: replaceExisting, digest: gameDocumentDigest(result) } };
}

export async function applyGameAuthoring(run: CapabilityRun, args: Record<string, unknown>) {
  const token = gameAuthoringCandidate.safeParse(args["candidate"]);
  if (!token.success) { return { error: "Invalid authoring candidate" }; }
  const draft = await draftFor(run, args["game_id"]);
  if (!draft) { return { error: "Game draft not found" }; }
  if (draft.game.draft_updated_at !== token.data.base_updated_at || gameDocumentDigest(draft.document) !== token.data.base_digest) {
    return { error: "Game draft was modified concurrently" };
  }
  const result = await preview(run, draft.document, token.data.program, token.data.replace_existing);
  if ("error" in result) { return result; }
  if (gameDocumentDigest(result) !== token.data.digest) { return { error: "Authoring candidate changed since preview" }; }
  if (result.conflicts.length) { return { error: "Resolve authoring conflicts before applying", conflicts: result.conflicts }; }
  const saved = await Game.applyAuthoringCandidate(draft.user, draft.game.id, token.data.base_updated_at,
    token.data.base_digest, result.document, draft.workspace, { actor: "agent", threadId: run.context.threadId ?? undefined });
  if (!saved) { return { error: "Game draft was modified concurrently" }; }
  return { game: { id: saved.game.id, revision: saved.game.current_revision },
    draft_updated_at: saved.game.draft_updated_at, document: saved.document, restart_required: result.restart_required };
}
