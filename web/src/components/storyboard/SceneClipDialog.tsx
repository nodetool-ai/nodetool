/**
 * SceneClipDialog
 *
 * Sets up and confirms a scene clip: a run of 2 to 5 consecutive shots in one
 * scene rendered as one clip. The creator picks the run, the stills and entity
 * images sent as references, and may override the model, duration and
 * resolution; an unset setting falls back to the board's one-take setting. The
 * prompt is compiled from the shots and takes no free text, so a re-render
 * sends the same direction. The dialog also shows the cost and anything that
 * blocks the render.
 *
 * Nothing is written until Render: confirming saves the scene clip on the
 * board and starts the render, so a cancelled draft leaves no trace.
 */

import React, { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  SCENE_CLIP_MAX_SHOTS,
  SCENE_CLIP_MIN_SHOTS
} from "@nodetool-ai/protocol";
import AddIcon from "@mui/icons-material/AddOutlined";
import type { Entity, SceneClipDirection, Shot } from "@nodetool-ai/protocol";

import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import VideoModelSelect from "../properties/VideoModelSelect";
import EntityPicker from "../entities/EntityPicker";
import SceneClipReferenceTile from "./SceneClipReferenceTile";
import {
  AlertBanner,
  Box,
  Button,
  Caption,
  Dialog,
  DownloadButton,
  EditorButton,
  FlexColumn,
  FlexRow,
  FormField,
  FormSection,
  Popover,
  SelectField,
  Text,
  VideoPlayer,
  BORDER_RADIUS,
  SPACING
} from "../ui_primitives";
import {
  ONE_TAKE_FALLBACK_DURATIONS,
  ONE_TAKE_FALLBACK_RESOLUTIONS,
  ONE_TAKE_MAX_IMAGES,
  ONE_TAKE_TASK
} from "../../hooks/storyboard/useRenderOneTake";
import {
  SCENE_CLIP_NO_REFERENCE_BLOCKER,
  useRenderSceneClip
} from "../../hooks/storyboard/useRenderSceneClip";
import { priceRenderStep } from "../../hooks/storyboard/shotCostPricing";
import type { VideoModelValue } from "../../stores/ApiTypes";
import { useResolvedMediaUri } from "../../hooks/useResolvedMediaUri";
import { modelFieldSx } from "./shotRenderModels";
import { downloadResolvedMedia, sceneClipDownloadName } from "./shotMediaDownload";

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

const settingSx = { flex: "1 1 8rem", minWidth: 0 } as const;

// Stacks on a narrow window. From md up the player stays in view beside the
// form while the form scrolls.
const renderedLayoutSx = {
  display: "grid",
  gap: SPACING.xl,
  gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "minmax(0, 1.2fr) minmax(0, 1fr)" },
  alignItems: "start"
} as const;
const playerColumnSx = {
  minWidth: 0,
  position: { md: "sticky" },
  top: { md: 0 }
} as const;

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
    if (blocker === SCENE_CLIP_NO_REFERENCE_BLOCKER) {
      return t("screens4_14.storyboard.sceneClip.blockers.noReference");
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
  const { plan, settings, blockers, cast, renderSceneClip } = useRenderSceneClip(
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
      setDraft((current) => ({
        ...current,
        shot_ids: shotIds,
        // A shot that joins the run starts on, as every shot does by default.
        reference_shot_ids: current.reference_shot_ids
          ? shotIds.filter(
              (id) =>
                !current.shot_ids.includes(id) ||
                current.reference_shot_ids?.includes(id)
            )
          : current.reference_shot_ids
      }));
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

  // The rendered clip, once this saved run has one. It sits on the run's first
  // shot and every other shot in the run is covered by a window of it. A draft
  // that changed the run shows no player: the clip belongs to the saved run.
  const renderedClip = useMemo(() => {
    if (!saved || draft.shot_ids.join() !== clip.shot_ids.join()) {
      return undefined;
    }
    const [firstId, ...rest] = clip.shot_ids;
    const first = sceneShots.find((shot) => shot.id === firstId);
    const covered = rest.every(
      (id) =>
        sceneShots.find((shot) => shot.id === id)?.covered_by?.shot_id ===
        firstId
    );
    return covered ? first?.clip : undefined;
  }, [saved, draft.shot_ids, clip.shot_ids, sceneShots]);

  const renderedClipUrl = useResolvedMediaUri(renderedClip);
  const handleDownload = useCallback(() => {
    if (renderedClipUrl) {
      void downloadResolvedMedia(
        renderedClipUrl,
        sceneClipDownloadName(startIndex, count, renderedClipUrl)
      );
    }
  }, [renderedClipUrl, startIndex, count]);

  const references = useMemo(() => plan?.compiled.references ?? [], [plan]);
  const steps = plan?.compiled.steps ?? [];

  // Entities picked in this dialog keep their tile after being turned off.
  const [pickedEntities, setPickedEntities] = useState<Entity[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const addEntityRef = useRef<HTMLButtonElement | null>(null);
  const entityTiles = useMemo(() => {
    const inCast = new Set(cast.map((entity) => entity.id));
    return [
      ...cast,
      ...pickedEntities.filter((entity) => !inCast.has(entity.id))
    ];
  }, [cast, pickedEntities]);

  // The first toggle turns the images now resolved into the clip's stored
  // choice, so it stops following the board's reference source.
  const toggleReference = useCallback(
    (kind: "shot" | "entity", id: string) => {
      const chosenIds = (key: "shot_id" | "entity_id"): string[] =>
        references.flatMap((reference) => reference[key] ?? []);
      const shotIds = chosenIds("shot_id");
      const entityIds = chosenIds("entity_id");
      const toggled = (ids: string[]): string[] =>
        ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
      setDraft((current) => ({
        ...current,
        reference_shot_ids: kind === "shot" ? toggled(shotIds) : shotIds,
        reference_entity_ids: kind === "entity" ? toggled(entityIds) : entityIds
      }));
    },
    [references]
  );
  const handlePickEntity = useCallback(
    (entity: Entity) => {
      setPickedEntities((current) =>
        current.some((item) => item.id === entity.id)
          ? current
          : [...current, entity]
      );
      if (entity.reference_images?.[0]?.asset_id) {
        toggleReference("entity", entity.id);
      }
    },
    [toggleReference]
  );
  const imageLabel = (index: number): string | undefined =>
    index >= 0
      ? t("screens4_14.storyboard.sceneClip.imageReference", {
          number: new Intl.NumberFormat(i18n.language).format(index + 1)
        }).trim()
      : undefined;

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("screens4_14.storyboard.sceneClip.dialogTitle")}
      fullWidth
      maxWidth={renderedClip ? "lg" : "sm"}
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
      <Box sx={renderedClip ? renderedLayoutSx : undefined}>
        {renderedClip && (
          <Box sx={playerColumnSx}>
            <FormSection label={t("screens4_14.storyboard.sceneClip.playTitle")}>
              <Box
                data-testid="scene-clip-player"
                sx={{
                  aspectRatio: settings.aspect_ratio.replace(":", " / "),
                  maxHeight: "70vh",
                  width: "100%",
                  borderRadius: BORDER_RADIUS.md,
                  overflow: "hidden"
                }}
              >
                <VideoPlayer
                  locator={renderedClip}
                  label={t("screens4_14.storyboard.sceneClip.playLabel")}
                />
              </Box>
              <FlexRow justify="flex-end">
                <DownloadButton
                  label={t("screens4_14.storyboard.sceneClip.downloadClip")}
                  tooltip={t("screens4_14.storyboard.sceneClip.downloadClip")}
                  onClick={handleDownload}
                  disabled={!renderedClipUrl}
                />
              </FlexRow>
            </FormSection>
          </Box>
        )}
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

          <FormSection label={t("screens4_14.storyboard.sceneClip.references")}>
            <Caption color="secondary">
              {t("screens4_14.storyboard.sceneClip.referencesHelp")}
            </Caption>
            <FormField label={t("screens4_14.storyboard.sceneClip.stills")}>
              <FlexRow gap={SPACING.sm} wrap data-testid="scene-clip-shots">
                {steps.map((step) => {
                  const shot = sceneShots.find((s) => s.id === step.shot_id);
                  const index = references.findIndex(
                    (reference) => reference.shot_id === step.shot_id
                  );
                  const assetId = shot?.keyframe?.asset_id;
                  return (
                    <SceneClipReferenceTile
                      key={step.shot_id}
                      assetId={assetId ?? undefined}
                      alt={
                        shot?.slug ??
                        t("screens4_14.storyboard.sceneClip.shotStillAlt")
                      }
                      selected={index >= 0}
                      unavailableText={
                        assetId
                          ? undefined
                          : t("screens4_14.storyboard.sceneClip.noStill")
                      }
                      imageLabel={imageLabel(index)}
                      detail={`${seconds(step.start_seconds)}–${seconds(step.end_seconds)}`}
                      onToggle={() => toggleReference("shot", step.shot_id)}
                      testId={`scene-clip-still-${step.shot_id}`}
                    />
                  );
                })}
              </FlexRow>
            </FormField>
            <FormField label={t("screens4_14.storyboard.sceneClip.entities")}>
              <FlexColumn gap={SPACING.sm}>
                {entityTiles.length > 0 && (
                  <FlexRow gap={SPACING.sm} wrap data-testid="scene-clip-entities">
                    {entityTiles.map((entity) => {
                      const index = references.findIndex(
                        (reference) => reference.entity_id === entity.id
                      );
                      const assetId = entity.reference_images?.[0]?.asset_id;
                      return (
                        <SceneClipReferenceTile
                          key={entity.id}
                          assetId={assetId ?? undefined}
                          alt={entity.name}
                          selected={index >= 0}
                          unavailableText={
                            assetId
                              ? undefined
                              : t("screens4_14.storyboard.sceneClip.noEntityImage")
                          }
                          imageLabel={imageLabel(index)}
                          detail={entity.name}
                          onToggle={() => toggleReference("entity", entity.id)}
                          testId={`scene-clip-entity-${entity.id}`}
                        />
                      );
                    })}
                  </FlexRow>
                )}
                <Box>
                  <EditorButton
                    ref={addEntityRef}
                    variant="outlined"
                    startIcon={<AddIcon />}
                    onClick={() => setPickerOpen(true)}
                    aria-haspopup="dialog"
                    aria-expanded={pickerOpen}
                  >
                    {t("screens4_14.storyboard.sceneClip.addEntity")}
                  </EditorButton>
                </Box>
                {pickerOpen && (
                  <Popover
                    open
                    anchorEl={addEntityRef.current}
                    onClose={() => setPickerOpen(false)}
                    placement="bottom-left"
                    maxWidth="28rem"
                  >
                    <Box sx={{ p: SPACING.md, width: "28rem", maxWidth: "100%" }}>
                      <EntityPicker
                        onSelect={handlePickEntity}
                        selectedIds={references.flatMap(
                          (reference) => reference.entity_id ?? []
                        )}
                        height="20rem"
                        autoFocus
                      />
                    </Box>
                  </Popover>
                )}
              </FlexColumn>
            </FormField>
          </FormSection>

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
      </Box>
    </Dialog>
  );
};

export default SceneClipDialog;
