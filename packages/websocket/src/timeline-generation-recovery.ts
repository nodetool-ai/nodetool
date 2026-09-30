import { z } from "zod";
import { TimelineSequence, type Prediction, type GenerationAttachmentTransition } from "@nodetool-ai/models";
import { composeGenerativeTakePatch, createMediaEditRequest, createMediaEditSourceContext, ensureBaselineTake } from "@nodetool-ai/timeline";

const savedMediaEdit = z.object({
  action: z.literal("video_edit"), modelTask: z.literal("video_to_video"),
  instruction: z.string().min(1), provider: z.string().min(1), model: z.string().min(1),
  sourceContext: z.object({
    sequenceId: z.string().min(1), clipId: z.string().min(1), sourceAssetId: z.string().min(1),
    sourceTakeId: z.string().optional(), sourceStartMs: z.number().finite(), sourceEndMs: z.number().finite(),
    timelineStartMs: z.number().finite(), timelineDurationMs: z.number().finite(), speedMultiplier: z.number().finite()
  }),
  strength: z.number().optional(), resolution: z.string().optional(),
  referenceAssetIds: z.array(z.string()).optional(), entityIds: z.array(z.string()).optional()
});

/** Live completion and recovery use the same immutable request and take id. */
export async function recoverTimelineMediaEdit(
  generation: Prediction,
  clipId: string,
  assetId: string
): Promise<GenerationAttachmentTransition | null> {
  const parsed = savedMediaEdit.safeParse(generation.parameters?.media_edit);
  // Other native timeline operations have their own candidate contracts.
  if (!parsed.success) {
    return null;
  }
  const source = createMediaEditSourceContext(parsed.data.sourceContext);
  if (!source.ok || source.context.sequenceId !== generation.document_id || source.context.clipId !== clipId) {
    return { status: "superseded", error: "Saved edit source does not match its destination", selected: false };
  }
  const request = createMediaEditRequest(parsed.data);
  for (let retry = 0; retry < 3; retry++) {
    const sequence = await TimelineSequence.findById(source.context.sequenceId);
    if (!sequence || sequence.user_id !== generation.user_id) {
      return { status: "target_deleted", error: "Timeline was deleted" };
    }
    const document = sequence.toDocument();
    const clip = document.clips.find((candidate) => candidate.id === clipId);
    if (!clip) {
      return { status: "target_deleted", error: "Timeline clip was deleted" };
    }
    if (clip.versions?.some((take) => take.id === generation.id)) {
      return { status: "attached", selected: false, error: null };
    }
    const createdAt = generation.created_at ?? new Date().toISOString();
    const historicalSource = ensureBaselineTake({
      ...clip,
      currentAssetId: source.context.sourceAssetId,
      durationMs: source.context.timelineDurationMs,
      inPointMs: source.context.sourceStartMs,
      outPointMs: source.context.sourceEndMs,
      speedMultiplier: source.context.speedMultiplier,
      speedBaked: false,
      timeRemap: undefined
    }, createdAt);
    const existingTakeIds = new Set((clip.versions ?? []).map((take) => take.id));
    const versions = historicalSource.versions?.map((take) => {
      if (!existingTakeIds.has(take.id) && source.context.sourceTakeId) {
        return { ...take, id: source.context.sourceTakeId };
      }
      return take;
    });
    const next = composeGenerativeTakePatch({ ...clip, versions }, "restyle", {
      assetId, jobId: generation.id, createdAt,
      provider: request.provider, model: request.model, prompt: request.instruction,
      durationMs: source.context.timelineDurationMs, mediaEdit: request
    });
    const saved = await TimelineSequence.updateDocumentIfUnchanged(sequence.id, sequence.updated_at, {
      ...document, clips: document.clips.map((candidate) => candidate.id === clipId ? next : candidate)
    }, { ops: [{ tool: "ui_timeline_generatively_edit_clip", input: { clip_id: clipId } }] });
    if (saved) {
      return { status: "attached", selected: false, error: null };
    }
  }
  return { status: "retrying", error: "Timeline changed while attaching recovered candidate" };
}
