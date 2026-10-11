/**
 * SceneClipDialog
 *
 * Sets up and confirms a scene clip: a run of 2 to 5 consecutive shots in one
 * scene rendered as one clip. The creator picks the run, writes an optional
 * prompt and may override the model, duration and resolution; an unset
 * setting falls back to the board's one-take setting. The dialog shows the
 * stills the clip conditions on, the cost and anything that blocks the
 * render.
 *
 * Nothing is written until Render: confirming saves the scene clip on the
 * board and starts the render, so a cancelled draft leaves no trace.
 */

import React, { useCallback, useMemo, useState } from "react";
import { formatUsd } from "@nodetool-ai/model-pricing";
import {
  SCENE_CLIP_MAX_SHOTS,
  SCENE_CLIP_MIN_SHOTS
} from "@nodetool-ai/protocol";
import type { SceneClipDirection, Shot } from "@nodetool-ai/protocol";

import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import VideoModelSelect from "../properties/VideoModelSelect";
import {
  Box,
  Caption,
  Dialog,
  EditorButton,
  FlexColumn,
  FlexRow,
  FormField,
  Label,
  ResponsiveImage,
  SelectField,
  Text,
  TextInput,
  BORDER_RADIUS,
  SPACING
} from "../ui_primitives";
import {
  ONE_TAKE_FALLBACK_DURATIONS,
  ONE_TAKE_FALLBACK_RESOLUTIONS,
  ONE_TAKE_MAX_IMAGES,
  ONE_TAKE_TASK
} from "../../hooks/storyboard/useRenderOneTake";
import { useRenderSceneClip } from "../../hooks/storyboard/useRenderSceneClip";
import { priceRenderStep } from "../../hooks/storyboard/shotCostPricing";
import type { VideoModelValue } from "../../stores/ApiTypes";
import { modelFieldSx } from "./shotRenderModels";

export interface SceneClipDialogProps {
  boardId: string;
  /** The scene's shots in board order. The run is picked from these. */
  sceneShots: readonly Shot[];
  /** The scene clip to edit, or a new draft. */
  clip: SceneClipDirection;
  /** True when `clip` is saved on the board, which offers Remove. */
  saved: boolean;
  onClose: () => void;
}

const seconds = (value: number): string => `${Math.round(value * 10) / 10}s`;

const thumbSx = {
  width: "4.5rem",
  flex: "0 0 auto",
  overflow: "hidden",
  borderRadius: BORDER_RADIUS.sm,
  bgcolor: "c_overlay_subtle"
} as const;

const settingSx = { flex: "1 1 8rem", minWidth: 0 } as const;

const SceneClipDialog: React.FC<SceneClipDialogProps> = ({
  boardId,
  sceneShots,
  clip,
  saved,
  onClose
}) => {
  const [draft, setDraft] = useState<SceneClipDirection>(clip);
  const setSceneClip = useStoryboardStore((state) => state.setSceneClip);
  const removeSceneClip = useStoryboardStore((state) => state.removeSceneClip);
  const { plan, settings, blockers, renderSceneClip } = useRenderSceneClip(
    boardId,
    draft
  );
  const { model, catalogModel, duration_seconds, resolution } = settings;

  const startIndex = Math.max(
    0,
    sceneShots.findIndex((shot) => shot.id === draft.shot_ids[0])
  );
  const count = draft.shot_ids.length;

  const setRun = useCallback(
    (start: number, length: number) => {
      const shotIds = sceneShots
        .slice(start, start + length)
        .map((shot) => shot.id);
      setDraft((current) => ({ ...current, shot_ids: shotIds }));
    },
    [sceneShots]
  );

  const startOptions = useMemo(
    () =>
      sceneShots
        .slice(0, Math.max(0, sceneShots.length - SCENE_CLIP_MIN_SHOTS + 1))
        .map((shot, index) => ({
          value: String(index),
          label: `Shot ${index + 1}${shot.slug ? ` · ${shot.slug}` : ""}`
        })),
    [sceneShots]
  );
  const maxCount = Math.min(SCENE_CLIP_MAX_SHOTS, sceneShots.length - startIndex);
  const countOptions = useMemo(
    () =>
      Array.from(
        { length: Math.max(0, maxCount - SCENE_CLIP_MIN_SHOTS + 1) },
        (_, i) => {
          const value = SCENE_CLIP_MIN_SHOTS + i;
          return { value: String(value), label: `${value} shots` };
        }
      ),
    [maxCount]
  );

  const handleStartChange = useCallback(
    (value: string) => {
      const start = Number(value);
      const room = Math.min(SCENE_CLIP_MAX_SHOTS, sceneShots.length - start);
      setRun(start, Math.max(SCENE_CLIP_MIN_SHOTS, Math.min(count, room)));
    },
    [setRun, sceneShots.length, count]
  );
  const handleCountChange = useCallback(
    (value: string) => setRun(startIndex, Number(value)),
    [setRun, startIndex]
  );
  const handlePromptChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const prompt = event.target.value;
      setDraft((current) => ({ ...current, prompt }));
    },
    []
  );
  const handleModelChange = useCallback((value: VideoModelValue) => {
    setDraft((current) => ({
      ...current,
      model: { id: value.id, provider: value.provider, name: value.name }
    }));
  }, []);
  const handleDurationChange = useCallback((value: string) => {
    setDraft((current) => ({
      ...current,
      duration_seconds: value === "" ? null : Number(value)
    }));
  }, []);
  const handleResolutionChange = useCallback((value: string) => {
    setDraft((current) => ({
      ...current,
      resolution: value === "" ? null : value
    }));
  }, []);

  const shotTotal = settings.shot_total_seconds;
  const durationOptions = useMemo(() => {
    const declared = catalogModel?.durations;
    const values =
      declared && declared.length > 0
        ? [...declared]
        : [...ONE_TAKE_FALLBACK_DURATIONS];
    return [
      { value: "", label: `Shot total (${seconds(shotTotal)})` },
      ...values.map((value) => ({ value: String(value), label: seconds(value) }))
    ];
  }, [catalogModel?.durations, shotTotal]);
  const resolutionOptions = useMemo(() => {
    const declared = catalogModel?.resolutions;
    const values =
      declared && declared.length > 0 ? declared : ONE_TAKE_FALLBACK_RESOLUTIONS;
    return [
      { value: "", label: "Default" },
      ...values.map((value) => ({ value, label: value }))
    ];
  }, [catalogModel?.resolutions]);

  const cost = useMemo(
    () =>
      model && duration_seconds > 0
        ? priceRenderStep(
            "Clip",
            model,
            "clip model",
            resolution,
            duration_seconds,
            []
          ).cost
        : null,
    [model, resolution, duration_seconds]
  );
  const priced = cost !== null && cost > 0;

  const handleConfirm = useCallback(() => {
    if (blockers.length > 0) {
      return;
    }
    setSceneClip(boardId, draft);
    // A start that fails after the send records its reason on the first shot.
    void renderSceneClip(draft).catch((error: unknown) => {
      useNotificationStore.getState().addNotification({
        type: "error",
        alert: true,
        dismissable: true,
        content: `Scene clip did not start. ${
          error instanceof Error ? error.message : String(error)
        }`
      });
    });
    onClose();
  }, [blockers.length, setSceneClip, boardId, draft, renderSceneClip, onClose]);

  const handleRemove = useCallback(() => {
    removeSceneClip(boardId, clip.id);
    onClose();
  }, [removeSceneClip, boardId, clip.id, onClose]);

  const references = plan?.compiled.references ?? [];
  const steps = plan?.compiled.steps ?? [];

  return (
    <Dialog
      open
      onClose={onClose}
      title="Render scene clip"
      onConfirm={handleConfirm}
      confirmText={`Render scene clip${priced ? ` · ~${formatUsd(cost)}` : ""}`}
      confirmDisabled={blockers.length > 0}
      fullWidth
      maxWidth="sm"
    >
      <FlexColumn gap={SPACING.lg} data-testid="scene-clip-dialog">
        <Caption color="secondary">
          Renders these shots as one continuous clip. The clip lands on the
          first shot, and each other shot plays its window of it, so the cut
          keeps its order.
        </Caption>

        <FlexRow gap={SPACING.md} wrap>
          <Box sx={settingSx}>
            <SelectField
              label="From"
              size="small"
              value={String(startIndex)}
              onChange={handleStartChange}
              options={startOptions}
            />
          </Box>
          <Box sx={settingSx}>
            <SelectField
              label="Length"
              size="small"
              value={String(count)}
              onChange={handleCountChange}
              options={countOptions}
            />
          </Box>
        </FlexRow>

        {steps.length > 0 && (
          <FlexRow gap={SPACING.sm} wrap data-testid="scene-clip-shots">
            {steps.map((step) => {
              const shot = sceneShots.find((s) => s.id === step.shot_id);
              const imageIndex = references.findIndex(
                (reference) => reference.shot_id === step.shot_id
              );
              const assetId = shot?.keyframe?.asset_id;
              return (
                <FlexColumn key={step.shot_id} gap={SPACING.micro} sx={thumbSx}>
                  {assetId ? (
                    <ResponsiveImage
                      locator={{ asset_id: assetId }}
                      preferThumbnail
                      loading="lazy"
                      alt={shot?.slug ?? "Shot still"}
                      aspectRatio="16 / 9"
                      fit="cover"
                    />
                  ) : (
                    <Box sx={{ aspectRatio: "16 / 9" }} />
                  )}
                  <Caption color="secondary" sx={{ px: SPACING.micro }}>
                    {`${imageIndex >= 0 ? `[Image ${imageIndex + 1}] ` : ""}${seconds(step.start_seconds)}–${seconds(step.end_seconds)}`}
                  </Caption>
                </FlexColumn>
              );
            })}
          </FlexRow>
        )}

        <TextInput
          multiline
          minRows={3}
          size="small"
          label="Your prompt"
          placeholder="One continuous move from the doorway to the window."
          helperText="Optional. The shots' actions, motion and sound are added after it. Refer to stills as [Image N]."
          value={draft.prompt}
          onChange={handlePromptChange}
        />

        <FlexColumn gap={SPACING.sm}>
          <Label sx={{ color: "text.secondary" }}>Render settings</Label>
          <FormField label="Video model" sx={modelFieldSx}>
            <VideoModelSelect
              value={model?.id ?? ""}
              provider={model?.provider}
              task={ONE_TAKE_TASK}
              onChange={handleModelChange}
            />
          </FormField>
          <FlexRow gap={SPACING.md} wrap>
            <Box sx={settingSx}>
              <SelectField
                label="Duration"
                size="small"
                value={
                  draft.duration_seconds ? String(draft.duration_seconds) : ""
                }
                onChange={handleDurationChange}
                options={durationOptions}
              />
            </Box>
            <Box sx={settingSx}>
              <SelectField
                label="Resolution"
                size="small"
                value={draft.resolution ?? ""}
                onChange={handleResolutionChange}
                options={resolutionOptions}
              />
            </Box>
          </FlexRow>
          <Text size="small" data-testid="scene-clip-summary">
            {`${seconds(duration_seconds)} · ${settings.aspect_ratio} · ${resolution} · ${references.length} of ${ONE_TAKE_MAX_IMAGES} images`}
          </Text>
          <Text size="small">
            {priced
              ? `Estimated cost: about ${formatUsd(cost)}`
              : "Select a priced model to see the estimate."}
          </Text>
        </FlexColumn>

        {blockers.length > 0 && (
          <FlexColumn gap={SPACING.micro} role="alert">
            {blockers.map((blocker) => (
              <Caption key={blocker} sx={{ color: "error.main" }}>
                {blocker}
              </Caption>
            ))}
          </FlexColumn>
        )}

        {saved && (
          <FlexRow>
            <EditorButton variant="text" color="error" onClick={handleRemove}>
              Remove scene clip
            </EditorButton>
          </FlexRow>
        )}
      </FlexColumn>
    </Dialog>
  );
};

export default SceneClipDialog;
