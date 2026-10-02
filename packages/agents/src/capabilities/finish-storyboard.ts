import type { CapabilityExport, CapabilityRun } from "./types.js";
import { finishStoryboardSpec, previewStoryboardDesignSpec } from "./storyboards.specs.js";

async function materializeAuthorizedStoryboard(run: CapabilityRun, params: Record<string, unknown>, previewOnly: boolean): Promise<unknown> {
    const strategy = params["strategy"] ?? "deterministic";
    if (strategy !== "deterministic" && strategy !== "agentic") { return { error: "Unsupported finishing strategy." }; }
    if (strategy === "agentic" && !run.subAgent) { return { error: "Agentic finishing requires the session's provider and model." }; }
    run.context.signal?.throwIfAborted();
    const userId = run.context.userId;
    if (!userId) return { error: "No user is bound to this session." };
    const { findFinishResourceIds, Storyboard, TimelineSequence, Asset, entityFromAsset, commitFinishedStoryboard } = await import("@nodetool-ai/models");
    const { materializeStoryboard, resolveShotSource, validateStoryboardSemantics, frameSizeForAspect, makeSequence } = await import("@nodetool-ai/timeline");
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
    const resolveAssetId = async (id: string): Promise<string> => {
      const matches = await findFinishResourceIds("asset", id, userId);
      if (matches.length !== 1) throw new Error(matches.length ? `Asset prefix ${id} is ambiguous.` : `Asset ${id} is unavailable.`);
      return matches[0];
    };
    try {
      for (const shot of shots) {
        for (const protection of shot.production?.protected_inputs ?? []) {
          if (protection.asset_id) protection.asset_id = await resolveAssetId(protection.asset_id);
          if (protection.entity_id) protection.entity_id = await resolveAssetId(protection.entity_id);
        }
        for (const element of shot.graphics?.elements ?? []) {
          if (element.asset_id) element.asset_id = await resolveAssetId(element.asset_id);
          if (element.entity_id) element.entity_id = await resolveAssetId(element.entity_id);
        }
        const source = resolveShotSource(shot);
        if (source && source.kind !== "graphics") {
          const canonical = await resolveAssetId(source.assetId);
          if (source.kind === "still" && shot.keyframe) shot.keyframe.asset_id = canonical;
          if (source.kind === "video" && shot.clip) shot.clip.asset_id = canonical;
          source.assetId = canonical;
        }
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
          const rawReferenceId = entity.reference_images?.[0]?.asset_id;
          const referenceId = rawReferenceId ? await resolveAssetId(rawReferenceId) : undefined;
          if (!referenceId) return { error: `Entity ${entityId} has no reference image.` };
          const reference = await Asset.get<InstanceType<typeof Asset>>(referenceId);
          if (reference?.user_id !== userId || !reference.content_type.startsWith("image/")) return { error: `Entity reference image ${referenceId} is unavailable.` };
          entities.add(entityId);
          assets.add(referenceId);
          if (element.kind === "asset" && !element.asset_id) element.asset_id = referenceId;
          if (protection && !protection.asset_id && ["product", "logo", "source_asset"].includes(protection.kind)) protection.asset_id = referenceId;
        }
      }
    } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
    const semanticErrors = validateStoryboardSemantics(shots, doc.screenplay, { assetIds: assets, entityIds: entities });
    if (semanticErrors.length) return { error: "Storyboard cannot be finished.", validation: semanticErrors };
    const requestedTimelineId = previewOnly ? undefined : params["timelineId"] ?? board.timeline_id;
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
    if (previewOnly) { return { timeline: { type: "timeline", data: makeSequence({ ...result.document, id: board.id, projectId: board.project_id, name: `Design preview: ${board.name}`, width: size.width, height: size.height, fps: 30, durationMs: result.durationMs }) }, storyboardRevision: board.revision, validation: [] }; }
    try {
      let document = result.document;
      let reviews;
      if (strategy === "agentic") {
        const { finishStoryboardAgentically } = await import("./agentic-storyboard-finish.js");
        const candidate = await finishStoryboardAgentically(run, { boardId: board.id, shots, width: timeline?.width ?? size.width, height: timeline?.height ?? size.height, motionDesign: doc.screenplay?.motion_design, current: timeline?.toDocument() }, doc, timeline ?? new TimelineSequence({ user_id: userId, project_id: board.project_id, name: board.name, width: size.width, height: size.height, duration_ms: result.durationMs, document: JSON.stringify(result.document) }), result.document);
        document = candidate.document;
        reviews = candidate.reviews;
      }
      run.context.signal?.throwIfAborted();
      const saved = await commitFinishedStoryboard({ board, timeline, document, width: timeline?.width ?? size.width, height: timeline?.height ?? size.height, durationMs: result.durationMs });
      return { timelineId: saved.timeline.id, timelineRevision: saved.timeline.revision, storyboardRevision: saved.board.revision, validation: [], ...(reviews && { reviews }) };
    } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
}

export const finishStoryboard: CapabilityExport = {
  spec: finishStoryboardSpec,
  impl: (run, params) => materializeAuthorizedStoryboard(run, params, false)
};

export const previewStoryboardDesign: CapabilityExport = {
  spec: previewStoryboardDesignSpec,
  impl: (run, params) => materializeAuthorizedStoryboard(run, params, true)
};
