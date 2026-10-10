/**
 * `browse_native_game_assets`: the asset browser's view of a game draft for an
 * agent. It returns the same catalog the editor panel shows (assets with
 * "used by", prefabs, scenes), the staged candidates under the game's
 * `assets/` folder, and the generation request each slot's template or last
 * recorded prompt implies. Passing `digest` returns one candidate with the
 * binding `install_native_game_asset` accepts.
 */

import { AmbiguousGameIdError, Game, Project, Workspace } from "@nodetool-ai/models";
import { filterGameAssetCatalog, gameAssetBinding3D, gameAssetCatalog, gameSlotGenerationRequest, shortResourceId, type AnyGameAssetBinding,
  type AnyGameDocument, type GameAssetBinding, type GameAssetMediaKind } from "@nodetool-ai/protocol";
import { workspaceFromRow } from "@nodetool-ai/execution/service";
import type { Workspace as RunWorkspace } from "@nodetool-ai/runtime";
import type { CapabilityRun } from "./types.js";
import { BROWSE_GAME_ASSET_KINDS } from "./game.specs.js";

const KINDS = BROWSE_GAME_ASSET_KINDS;

interface GameDraft {
  readonly user: string;
  readonly game: Game;
  readonly workspace: RunWorkspace;
  readonly document: AnyGameDocument;
  readonly draftUpdatedAt: string;
}

async function draftFor(run: CapabilityRun, id: unknown): Promise<GameDraft | null> {
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
  return draft ? { user, game, workspace, document: draft.document, draftUpdatedAt: draft.game.draft_updated_at } : null;
}

/** A recorded or derived binding for one staged candidate, shaped for the draft's dimension. */
async function candidateBinding(run: CapabilityRun, draft: GameDraft, digest: string, slot: string | undefined): Promise<
  { candidate: Record<string, unknown>; binding: AnyGameAssetBinding } | { error: string }> {
  const { listStagedGameCandidates, derivedStagedBinding2D } = await import("@nodetool-ai/game-nodes");
  const candidate = (await listStagedGameCandidates(draft.workspace, draft.game.source_root)).find((entry) => entry.digest === digest);
  if (!candidate) { return { error: "No staged candidate has that digest" }; }
  const summary = { digest: candidate.digest, extension: candidate.extension, media_kind: candidate.mediaKind, path: candidate.path,
    slot: candidate.record?.slot, prompt: candidate.record?.prompt };
  const is3D = draft.document.schemaVersion === 3;
  const recorded = candidate.record?.binding;
  if (recorded && recorded["digest"] === digest) {
    const parsed = (is3D ? gameAssetBinding3D : (await import("@nodetool-ai/protocol")).gameAssetBinding).safeParse(recorded);
    if (parsed.success) { return { candidate: summary, binding: parsed.data }; }
  }
  const bytes = await draft.workspace.read(candidate.path);
  if (!bytes) { return { error: "Staged candidate bytes are unavailable" }; }
  if (candidate.mediaKind === "model") {
    if (!is3D) { return { error: "Model candidates require a 3D game" }; }
    const { prepareGameModelBinding3D } = await import("@nodetool-ai/game-renderer/preparation3d");
    const prepared = await prepareGameModelBinding3D(bytes, { assetId: `staged:${digest}`, expectedDigest: digest, signal: run.context.signal });
    if (!prepared.ok) { return { error: prepared.diagnostics.map((issue) => issue.message).join("; ") }; }
    return { candidate: summary, binding: prepared.binding };
  }
  if (candidate.mediaKind === "collider") { return { error: "A collider candidate needs the record staging wrote; restage it with generate_game_asset" }; }
  if (is3D && candidate.mediaKind === "image") { return { error: "3D games use model assets with embedded textures" }; }
  const previous = slot ? draft.document.assets[slot] : undefined;
  const legacy = await derivedStagedBinding2D(bytes, candidate,
    previous && "pivot" in previous ? previous as Pick<GameAssetBinding, "pivot" | "sampling"> : undefined);
  if (!is3D) { return { candidate: summary, binding: legacy }; }
  const { width: _width, height: _height, pivot: _pivot, sampling: _sampling, ...identity } = legacy;
  const parsed = gameAssetBinding3D.safeParse({ ...identity, required: true });
  return parsed.success ? { candidate: summary, binding: parsed.data } : { error: "Candidate does not fit a 3D asset binding" };
}

export async function browseGameAssets(run: CapabilityRun, args: Record<string, unknown>): Promise<unknown> {
  const draft = await draftFor(run, args["game_id"]);
  if (!draft) { return { error: "Game draft not found" }; }
  const digest = args["digest"];
  const slot = typeof args["slot"] === "string" && args["slot"] ? args["slot"] : undefined;
  if (digest !== undefined) {
    if (typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest)) { return { error: "digest must be a 64-character hex digest" }; }
    const result = await candidateBinding(run, draft, digest, slot);
    if ("error" in result) { return result; }
    return { game_id: shortResourceId(draft.game.id), draft_updated_at: draft.draftUpdatedAt, ...result,
      next: slot ? `Call install_native_game_asset with game_id, slot "${slot}", this binding and base_updated_at.` : "Pass slot to install this binding." };
  }
  const query = typeof args["query"] === "string" ? args["query"] : "";
  const kind = KINDS.find((entry): entry is GameAssetMediaKind => entry === args["kind"]);
  const catalog = gameAssetCatalog(draft.document);
  const filtered = filterGameAssetCatalog(catalog, { query, kind });
  const { listStagedGameCandidates, gameTemplateSlot } = await import("@nodetool-ai/game-nodes");
  const candidates = await listStagedGameCandidates(draft.workspace, draft.game.source_root);
  const slotsByDigest = new Map<string, string[]>();
  for (const [boundSlot, binding] of Object.entries(draft.document.assets)) {
    slotsByDigest.set(binding.digest, [...(slotsByDigest.get(binding.digest) ?? []), boundSlot]);
  }
  const promptByDigest = new Map(candidates.flatMap((entry) => entry.record?.prompt ? [[entry.digest, entry.record.prompt] as const] : []));
  const slotRequests: Record<string, Record<string, unknown>> = {};
  for (const entry of catalog.assets) {
    if (entry.siblingOf) { continue; }
    const template = gameTemplateSlot(entry.slot);
    const request = template ? gameSlotGenerationRequest(template) : undefined;
    const recorded = promptByDigest.get(entry.digest);
    if (request || recorded) {
      const slotRequest: Record<string, unknown> = { kind: request?.kind ?? (entry.mediaKind === "audio" ? "music" : entry.mediaKind),
        prompt: recorded ?? request?.prompt, source: recorded ? "recorded" : "template" };
      if (request?.preparation) { slotRequest["preparation"] = request.preparation; }
      slotRequests[entry.slot] = slotRequest;
    }
  }
  return {
    game_id: shortResourceId(draft.game.id),
    dimension: draft.document.schemaVersion === 3 ? "3d" : "2d",
    draft_updated_at: draft.draftUpdatedAt,
    candidate_workspace_id: draft.game.workspace_id,
    assets: filtered.assets,
    prefabs: filtered.prefabs,
    scenes: filtered.scenes,
    candidates: candidates.filter((entry) => !kind || entry.mediaKind === kind).map((entry) => ({
      digest: entry.digest, extension: entry.extension, media_kind: entry.mediaKind, path: entry.path, size: entry.size,
      modified_at: new Date(entry.modifiedAt).toISOString(), bound_slots: slotsByDigest.get(entry.digest) ?? [],
      slot: entry.record?.slot, prompt: entry.record?.prompt, source: entry.record?.source, recorded: Boolean(entry.record)
    })),
    slot_requests: slotRequests
  };
}
