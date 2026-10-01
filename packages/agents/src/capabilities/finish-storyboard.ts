import { and, eq, like } from "drizzle-orm";
import type { CapabilityExport } from "./types.js";
import { finishStoryboardSpec } from "./storyboards.specs.js";

export const finishStoryboard: CapabilityExport = {
  spec: finishStoryboardSpec,
  impl: async (run, params) => {
    const userId = run.context.userId;
    if (!userId) return { error: "No user is bound to this session." };
    const { getDb, storyboards, timelineSequences, Storyboard, TimelineSequence, Asset, commitFinishedStoryboard } = await import("@nodetool-ai/models");
    const { materializeStoryboard, validateStoryboardSemantics, frameSizeForAspect } = await import("@nodetool-ai/timeline");
    const { resolveEffectiveProductionRequirement } = await import("@nodetool-ai/protocol");
    const db = getDb();
    const boardId = String(params["storyboardId"] ?? "");
    const boardRows = await db.select({ id: storyboards.id }).from(storyboards).where(and(eq(storyboards.user_id, userId), /^[a-f0-9]{12}$/.test(boardId) ? like(storyboards.id, `${boardId}%`) : eq(storyboards.id, boardId))).limit(2);
    if (boardRows.length !== 1) return { error: boardRows.length ? "Storyboard prefix is ambiguous." : "Storyboard was not found." };
    const board = (await Storyboard.findById(boardRows[0].id))!;
    if (run.projectId && run.projectId !== board.project_id) return { error: "Storyboard was not found in this project." };
    if (board.revision !== params["expectedStoryboardRevision"]) return { error: "Storyboard revision conflict." };
    const doc = board.toDocument();
    const shots = doc.shots.map((shot) => ({ ...shot, production: resolveEffectiveProductionRequirement(undefined, shot.production) }));
    const assets = new Set<string>();
    const entities = new Set<string>();
    for (const shot of shots) {
      const refs = [shot.keyframe?.asset_id, shot.clip?.asset_id, ...(shot.production?.protected_inputs ?? []).map((input) => input.asset_id), ...(shot.graphics?.elements ?? []).map((element) => element.asset_id)];
      for (const id of refs) {
        if (!id || assets.has(id)) continue;
        const asset = await Asset.get<InstanceType<typeof Asset>>(id);
        if (asset?.user_id === userId) assets.add(id);
        else return { error: `Asset ${id} is unavailable.` };
      }
      for (const element of shot.graphics?.elements ?? []) {
        if (!element.entity_id || entities.has(element.entity_id)) continue;
        const entity = await Asset.get<InstanceType<typeof Asset>>(element.entity_id);
        if (entity?.user_id === userId) entities.add(element.entity_id);
      }
    }
    const semanticErrors = validateStoryboardSemantics(shots, doc.screenplay, { assetIds: assets, entityIds: entities });
    if (semanticErrors.length) return { error: "Storyboard cannot be finished.", validation: semanticErrors };
    const requestedTimelineId = params["timelineId"] ?? board.timeline_id;
    let timeline: InstanceType<typeof TimelineSequence> | undefined;
    if (requestedTimelineId) {
      const id = String(requestedTimelineId);
      const rows = await db.select({ id: timelineSequences.id }).from(timelineSequences).where(and(eq(timelineSequences.user_id, userId), eq(timelineSequences.project_id, board.project_id), /^[a-f0-9]{12}$/.test(id) ? like(timelineSequences.id, `${id}%`) : eq(timelineSequences.id, id))).limit(2);
      if (rows.length !== 1) return { error: rows.length ? "Timeline prefix is ambiguous." : "Timeline was not found in this project." };
      timeline = (await TimelineSequence.findById(rows[0].id))!;
      if (timeline.revision !== params["expectedTimelineRevision"]) return { error: "Timeline revision conflict. Supply expectedTimelineRevision for an existing result." };
    } else if (params["expectedTimelineRevision"] !== undefined) return { error: "expectedTimelineRevision requires an existing timeline." };
    const size = frameSizeForAspect(doc.aspectRatio ?? "9:16");
    const result = materializeStoryboard({ boardId: board.id, shots, width: timeline?.width ?? size.width, height: timeline?.height ?? size.height, current: timeline ? JSON.parse(timeline.document) : undefined });
    if (result.validation.length) return { error: "Produced Timeline violates production requirements.", validation: result.validation };
    try {
      const saved = await commitFinishedStoryboard({ board, timeline, document: result.document, width: timeline?.width ?? size.width, height: timeline?.height ?? size.height, durationMs: result.durationMs });
      return { timelineId: saved.timeline.id, timelineRevision: saved.timeline.revision, storyboardRevision: saved.board.revision, validation: [] };
    } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
  }
};
