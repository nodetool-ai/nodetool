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
import { useTranslation } from "react-i18next";
import {
  SCENE_CLIP_MAX_SHOTS,
  SCENE_CLIP_MIN_SHOTS
} from "@nodetool-ai/protocol";
import type { SceneClipDirection, Shot } from "@nodetool-ai/protocol";

import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import VideoModelSelect from "../properties/VideoModelSelect";
import {
  AlertBanner,
  Box,
  Button,
  Caption,
  Dialog,
  FlexColumn,
  FlexRow,
  FormField,
  FormSection,
  ResponsiveImage,
  SelectField,
  Text,
  TextArea,
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
  const { t, i18n } = useTranslation();
  const formatNumber = useCallback(
    (value: number): string =>
      new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(value),
    [i18n.language]
  );
  const seconds = useCallback(
    (value: number): string =>
      t("screens4_14.storyboard.sceneClip.seconds", { value: formatNumber(value) }),
    [formatNumber, t]
  );
  const formatUsd = (value: number): string =>
    new Intl.NumberFormat(i18n.language, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 12
    }).format(value);
  const translateBlocker = (blocker: string): string => {
    if (blocker === "A shot in this scene clip was deleted.") {
      return t("screens4_14.storyboard.sceneClip.blockers.shotDeleted");
    }
    if (blocker === "The shots in this scene clip are no longer next to each other.") {
      return t("screens4_14.storyboard.sceneClip.blockers.notAdjacent");
    }
    if (blocker === "The shots in this scene clip are no longer in one scene.") {
      return t("screens4_14.storyboard.sceneClip.blockers.differentScenes");
    }
    if (blocker === "Add a shot to the board first.") {
      return t("screens4_14.storyboard.sceneClip.blockers.addShot");
    }
    if (blocker === "Render a still for at least one shot.") {
      return t("screens4_14.storyboard.sceneClip.blockers.renderStill");
    }
    if (blocker === "Give an entity on the board a reference image first.") {
      return t("screens4_14.storyboard.sceneClip.blockers.addEntityImage");
    }
    if (blocker === "No video model chosen.") {
      return t("screens4_14.storyboard.sceneClip.blockers.noVideoModel");
    }
    const countLimit = blocker.match(/^(\d+) images is over the limit of (\d+)\. Remove (\d+)\.$/);
    if (countLimit) {
      return t("screens4_14.storyboard.sceneClip.blockers.imageLimit", {
        imageCount: formatNumber(Number(countLimit[1])),
        limit: formatNumber(Number(countLimit[2])),
        remove: formatNumber(Number(countLimit[3]))
      });
    }
    const unavailableDuration = blocker.match(/^(.+) does not offer a (.+) clip\. Pick one of (.+)\.$/);
    if (unavailableDuration) {
      const choices = unavailableDuration[3]
        .split(", ")
        .map((choice) => {
          const value = Number(choice.replace(/s$/, ""));
          return Number.isFinite(value) ? seconds(value) : choice;
        })
        .join(", ");
      const durationValue = Number(unavailableDuration[2].replace(/s$/, ""));
      return t("screens4_14.storyboard.sceneClip.blockers.durationUnavailable", {
        model: unavailableDuration[1],
        duration: Number.isFinite(durationValue)
          ? seconds(durationValue)
          : unavailableDuration[2],
        choices
      });
    }
    const tooLong = blocker.match(/^The take runs (.+)\. One take renders at most (.+)\.$/);
    if (tooLong) {
      const durationValue = Number(tooLong[1].replace(/s$/, ""));
      const limitValue = Number(tooLong[2].replace(/s$/, ""));
      return t("screens4_14.storyboard.sceneClip.blockers.durationLimit", {
        duration: Number.isFinite(durationValue) ? seconds(durationValue) : tooLong[1],
        limit: Number.isFinite(limitValue) ? seconds(limitValue) : tooLong[2]
      });
    }
    const clipRange = blocker.match(/^A scene clip covers (\d+) to (\d+) shots\.$/);
    if (clipRange) {
      return t("screens4_14.storyboard.sceneClip.blockers.shotRange", {
        min: formatNumber(Number(clipRange[1])),
        max: formatNumber(Number(clipRange[2]))
      });
    }
    return blocker;
  };
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
          label: `${t("screens4_14.storyboard.sceneClip.shot", {
            count: index + 1,
            number: new Intl.NumberFormat(i18n.language).format(index + 1)
          })}${shot.slug ? ` · ${shot.slug}` : ""}`
        })),
    [sceneShots, i18n.language, t]
  );
  const maxCount = Math.min(SCENE_CLIP_MAX_SHOTS, sceneShots.length - startIndex);
  const countOptions = useMemo(
    () =>
      Array.from(
        { length: Math.max(0, maxCount - SCENE_CLIP_MIN_SHOTS + 1) },
        (_, i) => {
          const value = SCENE_CLIP_MIN_SHOTS + i;
          return {
            value: String(value),
            label: t("screens4_14.storyboard.sceneClip.shots", {
              count: value,
              number: new Intl.NumberFormat(i18n.language).format(value)
            })
          };
        }
      ),
    [maxCount, i18n.language, t]
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
    (value: string) => {
      const prompt = value;
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
      {
        value: "",
        label: t("screens4_14.storyboard.sceneClip.shotTotal", {
          duration: seconds(shotTotal)
        })
      },
      ...values.map((value) => ({ value: String(value), label: seconds(value) }))
    ];
  }, [catalogModel?.durations, shotTotal, seconds, t]);
  const resolutionOptions = useMemo(() => {
    const declared = catalogModel?.resolutions;
    const values =
      declared && declared.length > 0 ? declared : ONE_TAKE_FALLBACK_RESOLUTIONS;
    return [
      { value: "", label: t("screens4_14.storyboard.sceneClip.default") },
      ...values.map((value) => ({ value, label: value }))
    ];
  }, [catalogModel?.resolutions, t]);

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
        content: `${t("screens4_14.storyboard.sceneClip.startFailed")} ${
          error instanceof Error ? error.message : String(error)
        }`
      });
    });
    onClose();
  }, [blockers.length, setSceneClip, boardId, draft, renderSceneClip, onClose, t]);

  const handleRemove = useCallback(() => {
    removeSceneClip(boardId, clip.id);
    onClose();
  }, [removeSceneClip, boardId, clip.id, onClose]);

  const references = plan?.compiled.references ?? [];
  const steps = plan?.compiled.steps ?? [];
  // With entity images as the references the stills above are not sent, so
  // the images that are get their own row.
  const sendsEntities = plan?.compiled.reference_source === "entities";

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("screens4_14.storyboard.sceneClip.dialogTitle")}
      fullWidth
      maxWidth="sm"
      actions={
        <>
          {saved && (
            <Button
              variant="text"
              color="error"
              onClick={handleRemove}
              sx={{ mr: "auto" }}
            >
              {t("screens4_14.storyboard.sceneClip.remove")}
            </Button>
          )}
          <Button
            className="button-cancel"
            variant="text"
            color="inherit"
            onClick={onClose}
          >
            {t("screens4_14.storyboard.sceneClip.cancel")}
          </Button>
          <Button
            className="button-confirm"
            variant="contained"
            onClick={handleConfirm}
            disabled={blockers.length > 0}
            autoFocus
          >
            {t("screens4_14.storyboard.sceneClip.render", {
              cost: priced ? ` · ~${formatUsd(cost ?? 0)}` : ""
            })}
          </Button>
        </>
      }
    >
      <FlexColumn gap={SPACING.lg} data-testid="scene-clip-dialog">
        <Caption color="secondary">
          {t("screens4_14.storyboard.sceneClip.description")}
        </Caption>

        <FlexRow gap={SPACING.lg} wrap>
          <Box sx={settingSx}>
            <SelectField
              label={t("screens4_14.storyboard.sceneClip.from")}
              size="small"
              value={String(startIndex)}
              onChange={handleStartChange}
              options={startOptions}
            />
          </Box>
          <Box sx={settingSx}>
            <SelectField
              label={t("screens4_14.storyboard.sceneClip.length")}
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
                      alt={shot?.slug ?? t("screens4_14.storyboard.sceneClip.shotStillAlt")}
                      aspectRatio="16 / 9"
                      fit="cover"
                    />
                  ) : (
                    <Box sx={{ aspectRatio: "16 / 9" }} />
                  )}
                  <Caption color="secondary" sx={{ px: SPACING.micro }}>
                    {`${imageIndex >= 0 ? t("screens4_14.storyboard.sceneClip.imageReference", { number: new Intl.NumberFormat(i18n.language).format(imageIndex + 1) }) : ""}${seconds(step.start_seconds)}–${seconds(step.end_seconds)}`}
                  </Caption>
                </FlexColumn>
              );
            })}
          </FlexRow>
        )}

        {sendsEntities && references.length > 0 && (
          <FlexRow gap={SPACING.sm} wrap data-testid="scene-clip-entity-images">
            {references.map((reference, index) => (
              <FlexColumn
                key={`${reference.entity_id}-${reference.asset_id}`}
                gap={SPACING.micro}
                sx={thumbSx}
              >
                <ResponsiveImage
                  locator={{ asset_id: reference.asset_id }}
                  preferThumbnail
                  loading="lazy"
                  alt={reference.label}
                  aspectRatio="1 / 1"
                  fit="cover"
                />
                <Caption color="secondary" sx={{ px: SPACING.micro }}>
                  {`${t("screens4_14.storyboard.sceneClip.imageReference", {
                    number: new Intl.NumberFormat(i18n.language).format(
                      index + 1
                    )
                  })}${reference.label}`}
                </Caption>
              </FlexColumn>
            ))}
          </FlexRow>
        )}

        <TextArea
          minRows={3}
          size="small"
          label={t("screens4_14.storyboard.sceneClip.promptLabel")}
          placeholder={t("screens4_14.storyboard.sceneClip.promptPlaceholder")}
          helperText={t("screens4_14.storyboard.sceneClip.promptHelp")}
          value={draft.prompt}
          onChange={handlePromptChange}
        />

        <FormSection label={t("screens4_14.storyboard.sceneClip.renderSettings")}>
          <FormField label={t("screens4_14.storyboard.sceneClip.videoModel")} sx={modelFieldSx}>
            <VideoModelSelect
              value={model?.id ?? ""}
              provider={model?.provider}
              task={ONE_TAKE_TASK}
              onChange={handleModelChange}
            />
          </FormField>
          <FlexRow gap={SPACING.lg} wrap>
            <Box sx={settingSx}>
              <SelectField
                label={t("screens4_14.storyboard.sceneClip.duration")}
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
                label={t("screens4_14.storyboard.sceneClip.resolution")}
                size="small"
                value={draft.resolution ?? ""}
                onChange={handleResolutionChange}
                options={resolutionOptions}
              />
            </Box>
          </FlexRow>
          <Text size="small" data-testid="scene-clip-summary">
            {t("screens4_14.storyboard.sceneClip.summary", {
              duration: seconds(duration_seconds),
              aspectRatio: settings.aspect_ratio,
              resolution,
              imageCount: new Intl.NumberFormat(i18n.language).format(references.length),
              maxImages: new Intl.NumberFormat(i18n.language).format(ONE_TAKE_MAX_IMAGES)
            })}
          </Text>
          <Text size="small">
            {priced
              ? t("screens4_14.storyboard.renderCost.estimatedFull", {
                  cost: formatUsd(cost ?? 0)
                })
              : t("screens4_14.storyboard.renderCost.selectPricedModel")}
          </Text>
        </FormSection>

        {blockers.length > 0 && (
          <AlertBanner severity="error">
            {blockers.map((blocker) => (
              <div key={blocker}>{translateBlocker(blocker)}</div>
            ))}
          </AlertBanner>
        )}
      </FlexColumn>
    </Dialog>
  );
};

export default SceneClipDialog;
