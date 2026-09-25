/**
 * ShotRenderDialog
 *
 * Renders one shot's still or clip with a model the creator picks here. The
 * picker opens on the model the shot would use anyway (its remembered model,
 * then the board's, then the last one picked anywhere), so confirming without
 * a change is the one-click regenerate. The render records the choice on the
 * shot, so the next regenerate uses it too.
 */

import React, { useCallback, useMemo, useState } from "react";
import { shotRenderMode } from "@nodetool-ai/protocol";
import type { Shot, ShotModelRef } from "@nodetool-ai/protocol";
import { formatUsd } from "@nodetool-ai/model-pricing";

import {
  Caption,
  Dialog,
  FlexColumn,
  FormField,
  SPACING
} from "../ui_primitives";
import ImageModelSelect from "../properties/ImageModelSelect";
import VideoModelSelect from "../properties/VideoModelSelect";
import EntityStillModelWarning from "./EntityStillModelWarning";
import RenderCostSummary from "./RenderCostSummary";
import {
  CLIP_TASK_LABELS,
  STILL_MODEL_TASKS,
  clipTaskForShot,
  imageValue,
  modelFieldSx,
  videoValue,
  type ClipModelTask
} from "./shotRenderModels";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { useGenerateShot } from "../../hooks/storyboard/useGenerateShot";
import {
  useImageModelsByProvider,
  useVideoModelsByProvider
} from "../../hooks/useModelsByProvider";
import { modelMatchesTask } from "../../hooks/modelTaskMatching";
import { useRenderBatchCostEstimate } from "../../hooks/storyboard/useRenderBatchCostEstimate";
import {
  getRememberedModel,
  getRememberedModelForTask
} from "../../stores/lastModelStore";
import type { ImageModelValue, VideoModelValue } from "../../stores/ApiTypes";

export type ShotRenderStep = "still" | "clip";

interface ShotRenderDialogProps {
  boardId: string;
  shot: Shot;
  /** Which render the dialog starts. The card mounts it only while open. */
  step: ShotRenderStep;
  onClose: () => void;
}

const rememberedRef = (
  remembered: { provider?: string; model?: string } | undefined
): ShotModelRef | null =>
  remembered?.model && remembered.provider
    ? { id: remembered.model, provider: remembered.provider }
    : null;

export const ShotRenderDialog: React.FC<ShotRenderDialogProps> = ({
  boardId,
  shot,
  step,
  onClose
}) => {
  const { generateKeyframe, generateClip } = useGenerateShot();
  const { models: imageModels } = useImageModelsByProvider();
  const { models: videoModels } = useVideoModelsByProvider();
  const boardImageModel = useStoryboardStore(
    (state) => state.boards[boardId]?.imageModel ?? null
  );
  const boardVideoModel = useStoryboardStore(
    (state) => state.boards[boardId]?.videoModel ?? null
  );
  const hasEntities = useStoryboardStore(
    (state) => (state.boards[boardId]?.entityIds.length ?? 0) > 0
  );
  // What the creator picked in this dialog; null falls back to the default.
  const [pickedStill, setPickedStill] = useState<ImageModelValue | null>(null);
  const [pickedClip, setPickedClip] = useState<VideoModelValue | null>(null);

  const clipTask = clipTaskForShot(shot) as ClipModelTask;
  // A keyframe shot animates its still, so there is nothing to animate yet.
  const needsStill = shotRenderMode(shot) === "keyframe" && !shot.keyframe;

  const defaultStill = useMemo((): ImageModelValue | null => {
    const candidates = [
      shot.still_model,
      boardImageModel,
      rememberedRef(getRememberedModel("image"))
    ];
    for (const ref of candidates) {
      if (
        ref &&
        imageModels.some(
          (model) => model.id === ref.id && model.provider === ref.provider
        )
      ) {
        return imageValue(ref);
      }
    }
    return null;
  }, [shot.still_model, boardImageModel, imageModels]);

  const defaultClip = useMemo((): VideoModelValue | null => {
    const candidates = [
      shot.clip_model,
      boardVideoModel,
      rememberedRef(getRememberedModelForTask("video", clipTask)),
      rememberedRef(getRememberedModel("video"))
    ];
    for (const ref of candidates) {
      if (
        ref &&
        videoModels.some(
          (model) =>
            model.id === ref.id &&
            model.provider === ref.provider &&
            modelMatchesTask(model.supported_tasks, clipTask)
        )
      ) {
        return videoValue(ref);
      }
    }
    return null;
  }, [shot.clip_model, boardVideoModel, videoModels, clipTask]);

  const stillSelection = pickedStill ?? defaultStill;
  const clipSelection = pickedClip ?? defaultClip;
  const selection = step === "clip" ? clipSelection : stillSelection;

  const shots = useMemo(() => [shot], [shot]);
  const modelForShot = useCallback(() => selection, [selection]);
  const estimate = useRenderBatchCostEstimate(
    boardId,
    shots,
    step,
    modelForShot
  );

  // A start that fails records its reason on the shot, which the card shows.
  const handleConfirm = useCallback(() => {
    if (!selection) {
      return;
    }
    const run = step === "clip" ? generateClip : generateKeyframe;
    void run(boardId, shot, selection).catch(() => undefined);
    onClose();
  }, [selection, step, generateClip, generateKeyframe, boardId, shot, onClose]);

  const isClip = step === "clip";
  const priced = estimate.pricedRequestCount > 0 && estimate.cost > 0;
  const verb = isClip ? "Render clip" : "Render still";

  return (
    <Dialog
      open
      onClose={onClose}
      title={verb}
      onConfirm={handleConfirm}
      confirmText={`${verb}${priced ? ` · ~${formatUsd(estimate.cost)}` : ""}`}
      confirmDisabled={!selection || (isClip && needsStill)}
    >
      <FlexColumn gap={SPACING.md}>
        <Caption color="secondary">
          {isClip
            ? "Pick the model for this shot's clip. The shot keeps the choice for the next render."
            : "Pick the model for this shot's still. The shot keeps the choice for the next render."}
        </Caption>
        {isClip ? (
          <FormField label={CLIP_TASK_LABELS[clipTask]} sx={modelFieldSx}>
            <VideoModelSelect
              value={clipSelection?.id ?? ""}
              task={clipTask}
              onChange={setPickedClip}
            />
          </FormField>
        ) : (
          <FormField label="Still model" sx={modelFieldSx}>
            <ImageModelSelect
              value={stillSelection?.id ?? ""}
              task={STILL_MODEL_TASKS}
              onChange={setPickedStill}
            />
            {hasEntities && (
              <EntityStillModelWarning modelId={stillSelection?.id} />
            )}
          </FormField>
        )}
        {isClip && needsStill ? (
          <Caption role="alert" sx={{ color: "error.main" }}>
            This shot animates its still. Render a still first, or set the shot
            to render directly from its prompt.
          </Caption>
        ) : (
          <RenderCostSummary estimate={estimate} />
        )}
      </FlexColumn>
    </Dialog>
  );
};

export default ShotRenderDialog;
