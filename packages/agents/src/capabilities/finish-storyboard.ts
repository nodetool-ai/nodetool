import type { CapabilityExport } from "./types.js";
import { finishStoryboardSpec } from "./storyboards.specs.js";

export const finishStoryboard: CapabilityExport = {
  spec: finishStoryboardSpec,
  impl: async (run, params) => {
    const userId = run.context.userId;
    if (!userId) return { error: "No user is bound to this session." };
    const { findFinishResourceIds, Storyboard, TimelineSequence, Asset, entityFromAsset, commitFinishedStoryboard } = await import("@nodetool-ai/models");
    const { materializeStoryboard, resolveShotSource, validateStoryboardSemantics, frameSizeForAspect } = await import("@nodetool-ai/timeline");
    const { resolveEffectiveProductionRequirement } = await import("@nodetool-ai/protocol");
    const boardId = String(params["storyboardId"] ?? "");
    const boardRows = await findFinishResourceIds("storyboard", boardId, userId, run.projectId);
    if (boardRows.length !== 1) return { error: boardRows.length ? "Storyboard prefix is ambiguous." : "Storyboard was not found." };
    const board = await Storyboard.findById(boardRows[0]);
    if (!board) return { error: "Storyboard was not found." };
    if (run.projectId && run.projectId !== board.project_id) return { error: "Storyboard was not found in this project." };
    if (board.revision !== params["expectedStoryboardRevision"]) return { error: "Storyboard revision conflict." };
    const doc = board.toDocument();
    const shots = structuredClone(doc.shots).map((shot) => ({ ...shot, production: resolveEffectiveProductionRequirement(undefined, shot.production) }));
    const assets = new Set<string>();
    const entities = new Set<string>();
    for (const shot of shots) {
      const source = resolveShotSource(shot);
      const selectedAssetId = source && source.kind !== "graphics" ? source.assetId : undefined;
      const refs = [selectedAssetId, ...(shot.production?.protected_inputs ?? []).map((input) => input.asset_id), ...(shot.graphics?.elements ?? []).map((element) => element.asset_id)];
      for (const id of refs) {
        if (!id || assets.has(id)) continue;
        const asset = await Asset.get<InstanceType<typeof Asset>>(id);
        if (asset?.user_id === userId) assets.add(id);
        else return { error: `Asset ${id} is unavailable.` };
      }
      for (const element of shot.graphics?.elements ?? []) {
        const protection = element.protected_input_id ? shot.production?.protected_inputs?.find((input) => input.id === element.protected_input_id) : undefined;
        const entityId = element.entity_id ?? protection?.entity_id;
        if (!entityId) continue;
        const row = await Asset.get<InstanceType<typeof Asset>>(entityId);
        const entity = row?.user_id === userId ? entityFromAsset(row) : null;
        if (!entity) return { error: `Entity ${entityId} is unavailable or is not an entity.` };
        const referenceId = entity.reference_images?.[0]?.asset_id;
        if (!referenceId) return { error: `Entity ${entityId} has no reference image.` };
        const reference = await Asset.get<InstanceType<typeof Asset>>(referenceId);
        if (reference?.user_id !== userId || !reference.content_type.startsWith("image/")) return { error: `Entity reference image ${referenceId} is unavailable.` };
        entities.add(entityId);
        assets.add(referenceId);
        if (element.kind === "asset" && !element.asset_id) element.asset_id = referenceId;
        if (protection && !protection.asset_id && ["product", "logo", "source_asset"].includes(protection.kind)) protection.asset_id = referenceId;
      }
    }
    const semanticErrors = validateStoryboardSemantics(shots, doc.screenplay, { assetIds: assets, entityIds: entities });
    if (semanticErrors.length) return { error: "Storyboard cannot be finished.", validation: semanticErrors };
    const requestedTimelineId = params["timelineId"] ?? board.timeline_id;
    let timeline: InstanceType<typeof TimelineSequence> | undefined;
    if (requestedTimelineId) {
      const id = String(requestedTimelineId);
      const rows = await findFinishResourceIds("timeline", id, userId, board.project_id);
      if (rows.length !== 1) return { error: rows.length ? "Timeline prefix is ambiguous." : "Timeline was not found in this project." };
      timeline = await TimelineSequence.findById(rows[0]) ?? undefined;
      if (!timeline) return { error: "Timeline was not found." };
      if (timeline.revision !== params["expectedTimelineRevision"]) return { error: "Timeline revision conflict. Supply expectedTimelineRevision for an existing result." };
    } else if (params["expectedTimelineRevision"] !== undefined) return { error: "expectedTimelineRevision requires an existing timeline." };
    const size = frameSizeForAspect(doc.aspectRatio ?? "9:16");
    const result = materializeStoryboard({ boardId: board.id, shots, width: timeline?.width ?? size.width, height: timeline?.height ?? size.height, motionDesign: doc.screenplay?.motion_design, current: timeline ? JSON.parse(timeline.document) : undefined });
    if (result.validation.length) return { error: "Produced Timeline violates production requirements.", validation: result.validation };
    const { validateTimelineSequence } = await import("@nodetool-ai/execution/timeline-debug");
    const structural = validateTimelineSequence(result.document, { fps: timeline?.fps ?? 30, width: timeline?.width ?? size.width, height: timeline?.height ?? size.height });
    if (!structural.ok) return { error: "Produced Timeline is structurally invalid.", validation: structural };
    try {
      const saved = await commitFinishedStoryboard({ board, timeline, document: result.document, width: timeline?.width ?? size.width, height: timeline?.height ?? size.height, durationMs: result.durationMs });
      return { timelineId: saved.timeline.id, timelineRevision: saved.timeline.revision, storyboardRevision: saved.board.revision, validation: [] };
    } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
  }
};
