/**
 * ShotStillModifyPanel
 *
 * Change the shot's current still without re-describing the shot: edit it
 * with a prompt (optionally only inside a painted area), upscale it, reframe
 * it to another aspect ratio, or adjust its light and colour.
 *
 * Every result is a new take, never an overwrite. The three model-backed
 * changes render through the shot's own generation path, so they show on the
 * card and in the queue like any render, and a still that lands next to an
 * existing one arrives as a candidate the creator accepts with `Set current`.
 * Adjust runs in the browser, costs nothing, and is uploaded as a take the
 * same way a flip is.
 *
 * The buttons that spend say what they spend, priced from the same catalog
 * as the render estimates.
 */

import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Shot, ShotModelRef } from "@nodetool-ai/protocol";
import { entitiesForShot } from "@nodetool-ai/protocol";

import {
  Box,
  Caption,
  Chip,
  EditorButton,
  FlexColumn,
  FlexRow,
  FormField,
  LabeledSwitch,
  ResponsiveImage,
  SelectField,
  Slider,
  TabGroup,
  TextArea,
  TextInput,
  ToggleGroup,
  ToggleOption,
  BORDER_RADIUS,
  SPACING,
  AlertBanner
} from "../ui_primitives";
import ImageModelSelect from "../properties/ImageModelSelect";
import ShotMaskPainter, { maskFileFromStrokes } from "./ShotMaskPainter";
import { ASPECT_OPTIONS } from "./aspectOptions";
import { imageValue, modelFieldSx } from "./shotRenderModels";
import {
  adjustedStill,
  adjustmentFilter,
  outpaintPadding,
  stillSize,
  type StillAdjustment
} from "./shotImageEdits";
import { isShotGenerating } from "./ShotStatusPill";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { useStoryboardGenerationStore } from "../../stores/storyboard/StoryboardGenerationStore";
import { useAssetStore } from "../../stores/AssetStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { getRememberedModelForTask } from "../../stores/lastModelStore";
import { useAssetUpload } from "../../serverState/useAssetUpload";
import { useEntities } from "../../serverState/useEntities";
import {
  useGenerateShot,
  type StillVariantMode
} from "../../hooks/storyboard/useGenerateShot";
import {
  useImageModelsByProvider,
  type ImageModelTask
} from "../../hooks/useModelsByProvider";
import { useResolvedMediaUri } from "../../hooks/useResolvedMediaUri";
import { priceRenderStep } from "../../hooks/storyboard/shotCostPricing";
import { STILL_RESOLUTION } from "../../hooks/storyboard/renderSpec";
import { mediaRefFromAsset } from "../../utils/mediaRef";
import { getErrorMessage } from "../../utils/errorHandling";
import type { ImageModelValue } from "../../stores/ApiTypes";

type ModifyTab = "edit" | "upscale" | "reframe" | "adjust";

/**
 * The catalog task each model-backed change needs. A whole-image edit needs
 * an instruction editor: an inpainting model the picker also lists fails
 * without a painted area.
 */
const TASK_FOR_MODE: Record<StillVariantMode, ImageModelTask> = {
  image_edit: "image_edit",
  inpaint: "inpainting",
  upscale: "upscale",
  outpaint: "outpaint"
};

const NEUTRAL: StillAdjustment = { brightness: 100, contrast: 100, saturation: 100 };

const ADJUSTMENTS: (keyof StillAdjustment)[] = [
  "brightness",
  "contrast",
  "saturation"
];

const previewSx = {
  width: "100%",
  borderRadius: BORDER_RADIUS.md,
  overflow: "hidden",
  bgcolor: "c_overlay_subtle"
} as const;

const reportFailure = (
  error: unknown,
  what: string,
  tryAgain: string
): void => {
  useNotificationStore.getState().addNotification({
    type: "error",
    alert: true,
    dismissable: true,
    content: `${what} ${getErrorMessage(error, tryAgain)}`
  });
};

/** A model picked before for this kind of change, as the picker's value. */
const rememberedFor = (task: ImageModelTask): ImageModelValue | null => {
  const remembered = getRememberedModelForTask("image", task);
  return remembered?.model && remembered.provider
    ? imageValue({ id: remembered.model, provider: remembered.provider })
    : null;
};

const asRef = (value: ImageModelValue | null): ShotModelRef | null =>
  value ? { id: value.id, provider: value.provider, name: value.name } : null;

/** " · ~$0.04" for a priced model, nothing otherwise. */
const priceSuffix = (model: ShotModelRef | null, locale: string): string => {
  const cost = priceRenderStep(
    "Still",
    model,
    "image model",
    STILL_RESOLUTION,
    undefined,
    []
  ).cost;
  if (cost == null) {
    return "";
  }
  const formatted = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD"
  }).format(cost);
  return cost ? ` · ~${formatted}` : "";
};

/** The shot's still job has left the queue: settled one way or the other. */
const whenShotSettles = (shotId: string, done: () => void): void => {
  const settled = (): boolean => {
    const job = useStoryboardGenerationStore.getState().shotJobs[shotId];
    return !job || (job.status !== "queued" && job.status !== "running");
  };
  if (settled()) {
    done();
    return;
  }
  const unsubscribe = useStoryboardGenerationStore.subscribe(() => {
    if (settled()) {
      unsubscribe();
      done();
    }
  });
};

interface ShotStillModifyPanelProps {
  boardId: string;
  shot: Shot;
}

const ShotStillModifyPanelInner: React.FC<ShotStillModifyPanelProps> = ({
  boardId,
  shot
}) => {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<ModifyTab>("edit");
  const [editModel, setEditModel] = useState<ImageModelValue | null>(
    () => rememberedFor("image_to_image") ?? rememberedFor("inpainting")
  );
  const [upscaleModel, setUpscaleModel] = useState<ImageModelValue | null>(
    () => rememberedFor("upscale")
  );
  const [reframeModel, setReframeModel] = useState<ImageModelValue | null>(
    () => rememberedFor("outpaint")
  );
  const [prompt, setPrompt] = useState("");
  const [reframePrompt, setReframePrompt] = useState("");
  const [includeCast, setIncludeCast] = useState(true);
  const [scale, setScale] = useState<2 | 4>(2);
  const boardAspect = useStoryboardStore(
    (state) => state.boards[boardId]?.aspectRatio ?? "16:9"
  );
  const [aspect, setAspect] = useState<string>(
    () =>
      ASPECT_OPTIONS.find((option) => option.value !== boardAspect)?.value ??
      boardAspect
  );
  const [strokes, setStrokes] = useState<HTMLCanvasElement | null>(null);
  const [painting, setPainting] = useState(false);
  const [adjustment, setAdjustment] = useState<StillAdjustment>(NEUTRAL);
  const [busy, setBusy] = useState(false);

  const boardEntityIds = useStoryboardStore(
    (state) => state.boards[boardId]?.entityIds
  );
  const appendShotKeyframeVersion = useStoryboardStore(
    (state) => state.appendShotKeyframeVersion
  );
  const uploadAsset = useAssetUpload((state) => state.uploadAsset);
  const { data: allEntities } = useEntities();
  const { models } = useImageModelsByProvider();
  const { generateStillVariant } = useGenerateShot();

  const still = shot.keyframe ?? undefined;
  const stillUrl = useResolvedMediaUri(still);
  const generating = isShotGenerating(shot);
  // A still without a stored asset (an example board's packaged file) is
  // stored on first use, so the server has bytes to read.
  const canSpend = (!!still?.asset_id || !!stillUrl) && !generating && !busy;
  const storedCopy = useRef<{ uri: string; assetId: string } | null>(null);
  const stillName = t("screens4_19.storyboard.shotStillModify.stillName", {
    index: new Intl.NumberFormat(i18n.resolvedLanguage).format(shot.index + 1)
  });

  const cast = useMemo(() => {
    const ids = new Set(boardEntityIds ?? []);
    return entitiesForShot(
      shot,
      (allEntities ?? []).filter((entity) => ids.has(entity.id))
    ).filter((entity) => (entity.reference_images?.length ?? 0) > 0);
  }, [shot, boardEntityIds, allEntities]);

  const supports = useCallback(
    (value: ImageModelValue | null, task: ImageModelTask): boolean => {
      if (!value) {
        return false;
      }
      const model = models.find(
        (candidate) =>
          candidate.id === value.id && candidate.provider === value.provider
      );
      // A model the catalog has not listed yet is given the benefit of the
      // doubt; the provider refuses what it cannot do.
      return !model?.supported_tasks?.length
        ? true
        : model.supported_tasks.includes(task);
    },
    [models]
  );

  /** The still's asset id, storing the still first when it has none. */
  const sourceAssetFor = useCallback(async (): Promise<string> => {
    if (still?.asset_id) {
      return still.asset_id;
    }
    const uri = still?.uri ?? "";
    if (storedCopy.current?.uri === uri) {
      return storedCopy.current.assetId;
    }
    if (!stillUrl) {
      throw new Error(t("screens4_19.storyboard.shotStillModify.errors.noStillFile"));
    }
    const response = await fetch(stillUrl);
    if (!response.ok) {
      throw new Error(t("screens4_19.storyboard.shotStillModify.errors.stillLoadFailed", {
        status: response.status
      }));
    }
    const blob = await response.blob();
    const type = blob.type || "image/png";
    const file = new File([blob], `${stillName}.${type.split("/")[1] ?? "png"}`, {
      type
    });
    const asset = await useAssetStore.getState().createAsset(file);
    storedCopy.current = { uri, assetId: asset.id };
    return asset.id;
  }, [still, stillUrl, stillName, t]);

  const editMode: StillVariantMode = strokes ? "inpaint" : "image_edit";
  const editModelFits = supports(editModel, TASK_FOR_MODE[editMode]);

  const run = useCallback(
    async (
      mode: StillVariantMode,
      model: ImageModelValue | null,
      extra: {
        prompt?: string;
        maskAssetId?: string;
        aspectRatio?: string;
        padding?: ReturnType<typeof outpaintPadding>;
        scale?: number;
      }
    ): Promise<boolean> => {
      const ref = asRef(model);
      if (!ref) {
        return false;
      }
      const sourceAssetId = await sourceAssetFor();
      await generateStillVariant(boardId, shot, {
        mode,
        model: ref,
        sourceAssetId,
        ...extra
      });
      return true;
    },
    [generateStillVariant, boardId, shot, sourceAssetFor]
  );

  const handleEdit = useCallback(async () => {
    const text = prompt.trim();
    if (!text) {
      return;
    }
    const tokens =
      includeCast && cast.length > 0
        ? `\n${cast.map((entity) => `entity://${entity.id}`).join(" ")}`
        : "";
    setBusy(true);
    let maskAssetId: string | undefined;
    try {
      if (strokes) {
        const mask = await useAssetStore
          .getState()
          .createAsset(await maskFileFromStrokes(strokes, `${stillName} edit mask.png`, {
            noCanvas: t("i18n-next102.storyboard.shotMaskPainter.errors.noCanvas"),
            encodeFailed: t("i18n-next102.storyboard.shotMaskPainter.errors.encodeFailed")
          }));
        maskAssetId = mask.id;
      }
      const started = await run(editMode, editModel, {
        prompt: `${text}${tokens}`,
        maskAssetId
      });
      if (started) {
        setStrokes(null);
      }
    } catch (error) {
      reportFailure(
        error,
        t("screens4_19.storyboard.shotStillModify.errors.editDidNotStart"),
        t("screens4_19.storyboard.shotStillModify.errors.tryAgain")
      );
    } finally {
      setBusy(false);
      // The mask is an input to this one request, not a take: drop it once the
      // provider has read it.
      if (maskAssetId) {
        const id = maskAssetId;
        whenShotSettles(shot.id, () => {
          void useAssetStore
            .getState()
            .delete(id)
            .catch(() => undefined);
        });
      }
    }
  }, [prompt, includeCast, cast, strokes, stillName, run, editMode, editModel, shot.id, t]);

  const handleUpscale = useCallback(async () => {
    setBusy(true);
    try {
      await run("upscale", upscaleModel, { scale });
    } catch (error) {
      reportFailure(
        error,
        t("screens4_19.storyboard.shotStillModify.errors.upscaleDidNotStart"),
        t("screens4_19.storyboard.shotStillModify.errors.tryAgain")
      );
    } finally {
      setBusy(false);
    }
  }, [run, upscaleModel, scale, t]);

  const handleReframe = useCallback(async () => {
    if (!stillUrl) {
      return;
    }
    setBusy(true);
    try {
      const size = await stillSize(stillUrl);
      await run("outpaint", reframeModel, {
        prompt: reframePrompt.trim() || undefined,
        aspectRatio: aspect,
        padding: outpaintPadding(size.width, size.height, aspect)
      });
    } catch (error) {
      reportFailure(
        error,
        t("screens4_19.storyboard.shotStillModify.errors.reframeDidNotStart"),
        t("screens4_19.storyboard.shotStillModify.errors.tryAgain")
      );
    } finally {
      setBusy(false);
    }
  }, [stillUrl, run, reframeModel, reframePrompt, aspect, t]);

  const handleSaveAdjustment = useCallback(async () => {
    if (!stillUrl) {
      return;
    }
    setBusy(true);
    try {
      const file = await adjustedStill(
        stillUrl,
        `${stillName} adjusted.png`,
        adjustment
      );
      uploadAsset({
        file,
        onCompleted: (asset) => {
          setBusy(false);
          setAdjustment(NEUTRAL);
          appendShotKeyframeVersion(
            boardId,
            shot.id,
            mediaRefFromAsset(asset, "image")
          );
        },
        onFailed: (error) => {
          setBusy(false);
          reportFailure(
            error,
            t("screens4_19.storyboard.shotStillModify.errors.adjustedStillCouldNotSave"),
            t("screens4_19.storyboard.shotStillModify.errors.tryAgain")
          );
        }
      });
    } catch (error) {
      setBusy(false);
      reportFailure(
        error,
        t("screens4_19.storyboard.shotStillModify.errors.stillCouldNotAdjust"),
        t("screens4_19.storyboard.shotStillModify.errors.tryAgain")
      );
    }
  }, [stillUrl, stillName, adjustment, uploadAsset, appendShotKeyframeVersion, boardId, shot.id, t]);

  const handlePainted = useCallback((next: HTMLCanvasElement | null) => {
    setStrokes(next);
    setPainting(false);
  }, []);

  if (!still) {
    return (
      <Caption color="muted">
        {t("screens4_19.storyboard.shotStillModify.emptyState")}
      </Caption>
    );
  }

  const adjusted =
    adjustment.brightness !== 100 ||
    adjustment.contrast !== 100 ||
    adjustment.saturation !== 100;

  return (
    <FlexColumn gap={SPACING.md} data-testid="shot-still-modify">
      <TabGroup
        tabs={[
          {
            value: "edit",
            label: t("screens4_19.storyboard.shotStillModify.tabs.edit")
          },
          {
            value: "upscale",
            label: t("screens4_19.storyboard.shotStillModify.tabs.upscale")
          },
          {
            value: "reframe",
            label: t("screens4_19.storyboard.shotStillModify.tabs.reframe")
          },
          {
            value: "adjust",
            label: t("screens4_19.storyboard.shotStillModify.tabs.adjust")
          }
        ]}
        value={tab}
        onChange={(value) => setTab(value as ModifyTab)}
        size="small"
        fullWidth
        aria-label={t("screens4_19.storyboard.shotStillModify.changeStill")}
      />

      {tab === "edit" && (
        <FlexColumn gap={SPACING.md}>
          <FormField
            label={t("screens4_19.storyboard.shotStillModify.editModel")}
            sx={modelFieldSx}
          >
            <ImageModelSelect
              value={editModel?.id ?? ""}
              provider={editModel?.provider}
              task={["image_edit", "inpainting"]}
              onChange={setEditModel}
            />
          </FormField>
          <FlexRow align="center" gap={SPACING.sm} wrap>
            <EditorButton
              size="small"
              onClick={() => setPainting(true)}
              disabled={!stillUrl}
            >
              {strokes
                ? t("screens4_19.storyboard.shotStillModify.repaintArea")
                : t("screens4_19.storyboard.shotStillModify.paintArea")}
            </EditorButton>
            {strokes ? (
              <Chip
                compact
                label={t("screens4_19.storyboard.shotStillModify.paintedAreaOnly")}
                aria-label={t("screens4_19.storyboard.shotStillModify.clearPaintedArea")}
                onDelete={() => setStrokes(null)}
              />
            ) : (
              <Caption color="secondary">
                {t("screens4_19.storyboard.shotStillModify.wholeStillMayChange")}
              </Caption>
            )}
          </FlexRow>
          <TextArea
            label={t("screens4_19.storyboard.shotStillModify.whatToChange")}
            placeholder={t("screens4_19.storyboard.shotStillModify.editPromptPlaceholder")}
            rows={3}
            value={prompt}
            onChange={(value) => setPrompt(value)}
          />
          {cast.length > 0 && (
            <LabeledSwitch
              id={`shot-modify-cast-${shot.id}`}
              size="small"
              label={t("screens4_19.storyboard.shotStillModify.keepCast", {
                cast: cast.map((entity) => entity.name).join(", ")
              })}
              description={t("screens4_19.storyboard.shotStillModify.keepCastDescription")}
              checked={includeCast}
              onChange={setIncludeCast}
            />
          )}
          {editModel && !editModelFits && (
            <AlertBanner severity="warning" compact>
              {strokes
                ? t("screens4_19.storyboard.shotStillModify.modelCannotInpaint")
                : supports(editModel, "inpainting")
                  ? t("screens4_19.storyboard.shotStillModify.modelRequiresPaintedArea")
                  : t("screens4_19.storyboard.shotStillModify.modelCannotEdit")}
            </AlertBanner>
          )}
          <EditorButton
            variant="contained"
            color="primary"
            onClick={() => void handleEdit()}
            disabled={!canSpend || !editModel || !editModelFits || !prompt.trim()}
          >
            {t("screens4_19.storyboard.shotStillModify.generateEdit")}
            {priceSuffix(
              asRef(editModel),
              i18n.resolvedLanguage ?? i18n.language
            )}
          </EditorButton>
        </FlexColumn>
      )}

      {tab === "upscale" && (
        <FlexColumn gap={SPACING.md}>
          <FormField
            label={t("screens4_19.storyboard.shotStillModify.upscaleModel")}
            sx={modelFieldSx}
          >
            <ImageModelSelect
              value={upscaleModel?.id ?? ""}
              provider={upscaleModel?.provider}
              task="upscale"
              onChange={setUpscaleModel}
            />
          </FormField>
          <FormField label={t("screens4_19.storyboard.shotStillModify.scale")}>
            <ToggleGroup
              exclusive
              size="small"
              segmented
              value={scale}
              onChange={(_event, next: 2 | 4 | null) => {
                if (next) {
                  setScale(next);
                }
              }}
              aria-label={t("screens4_19.storyboard.shotStillModify.upscaleFactor")}
            >
              <ToggleOption value={2}>2×</ToggleOption>
              <ToggleOption value={4}>4×</ToggleOption>
            </ToggleGroup>
          </FormField>
          <EditorButton
            variant="contained"
            color="primary"
            onClick={() => void handleUpscale()}
            disabled={!canSpend || !upscaleModel}
          >
            {t("screens4_19.storyboard.shotStillModify.upscale")}
            {priceSuffix(
              asRef(upscaleModel),
              i18n.resolvedLanguage ?? i18n.language
            )}
          </EditorButton>
        </FlexColumn>
      )}

      {tab === "reframe" && (
        <FlexColumn gap={SPACING.md}>
          <FormField
            label={t("screens4_19.storyboard.shotStillModify.newAspectRatio")}
          >
            <SelectField
              label={t("screens4_19.storyboard.shotStillModify.newAspectRatio")}
              hideLabel
              size="small"
              value={aspect}
              onChange={(value) => setAspect(String(value))}
              options={[...ASPECT_OPTIONS]}
            />
          </FormField>
          <FormField
            label={t("screens4_19.storyboard.shotStillModify.reframeModel")}
            sx={modelFieldSx}
          >
            <ImageModelSelect
              value={reframeModel?.id ?? ""}
              provider={reframeModel?.provider}
              task="outpaint"
              onChange={setReframeModel}
            />
          </FormField>
          <TextInput
            label={t("screens4_19.storyboard.shotStillModify.reframePromptLabel")}
            placeholder={t("screens4_19.storyboard.shotStillModify.reframePromptPlaceholder")}
            value={reframePrompt}
            onChange={(event) => setReframePrompt(event.target.value)}
          />
          <EditorButton
            variant="contained"
            color="primary"
            onClick={() => void handleReframe()}
            disabled={!canSpend || !reframeModel || !stillUrl}
          >
            {t("screens4_19.storyboard.shotStillModify.reframeTo", { aspect })}
            {priceSuffix(
              asRef(reframeModel),
              i18n.resolvedLanguage ?? i18n.language
            )}
          </EditorButton>
        </FlexColumn>
      )}

      {tab === "adjust" && (
        <FlexColumn gap={SPACING.md}>
          <Box
            sx={{
              ...previewSx,
              filter: adjustmentFilter(adjustment)
            }}
          >
            <ResponsiveImage
              locator={still}
              alt={t("screens4_19.storyboard.shotStillModify.adjustedStillPreview")}
              fit="contain"
            />
          </Box>
          {ADJUSTMENTS.map((key) => (
            <FlexRow key={key} align="center" gap={SPACING.md}>
              <Caption color="secondary" sx={{ minWidth: "6rem" }} id={`shot-adjust-${key}-${shot.id}`}>
                {t(`screens4_19.storyboard.shotStillModify.adjustments.${key}`)}
              </Caption>
              <Slider
                density="compact"
                value={adjustment[key]}
                min={50}
                max={150}
                onChange={(_event, value) =>
                  setAdjustment((current) => ({
                    ...current,
                    [key]: Array.isArray(value) ? value[0] : value
                  }))
                }
                aria-labelledby={`shot-adjust-${key}-${shot.id}`}
                valueLabelDisplay="auto"
                valueLabelFormat={(value) => `${value}%`}
              />
            </FlexRow>
          ))}
          <FlexRow gap={SPACING.sm} justify="flex-end">
            <EditorButton
              size="small"
              onClick={() => setAdjustment(NEUTRAL)}
              disabled={!adjusted}
            >
              {t("screens4_19.storyboard.shotStillModify.reset")}
            </EditorButton>
            <EditorButton
              variant="contained"
              color="primary"
              onClick={() => void handleSaveAdjustment()}
              disabled={!adjusted || busy || !stillUrl}
              tooltip={t("screens4_19.storyboard.shotStillModify.saveAdjustmentTooltip")}
            >
              {t("screens4_19.storyboard.shotStillModify.saveAsNewTake")}
            </EditorButton>
          </FlexRow>
        </FlexColumn>
      )}

      <Caption color="secondary">
        {t("screens4_19.storyboard.shotStillModify.newTakeHelp")}
      </Caption>

      {painting && stillUrl && (
        <ShotMaskPainter
          stillUrl={stillUrl}
          initialMask={strokes}
          onCancel={() => setPainting(false)}
          onDone={handlePainted}
        />
      )}
    </FlexColumn>
  );
};

export const ShotStillModifyPanel = memo(ShotStillModifyPanelInner);
ShotStillModifyPanel.displayName = "ShotStillModifyPanel";

export default ShotStillModifyPanel;
