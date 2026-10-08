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

import React, { memo, useCallback, useMemo, useState } from "react";
import type { Shot, ShotModelRef } from "@nodetool-ai/protocol";
import { entitiesForShot } from "@nodetool-ai/protocol";
import { formatUsd } from "@nodetool-ai/model-pricing";

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
  TextInput,
  ToggleGroup,
  ToggleOption,
  BORDER_RADIUS,
  SPACING
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

const TABS: { value: ModifyTab; label: string }[] = [
  { value: "edit", label: "Edit" },
  { value: "upscale", label: "Upscale" },
  { value: "reframe", label: "Reframe" },
  { value: "adjust", label: "Adjust" }
];

/** The catalog task each model-backed change needs. */
const TASK_FOR_MODE: Record<StillVariantMode, ImageModelTask> = {
  image_edit: "image_to_image",
  inpaint: "inpainting",
  upscale: "upscale",
  outpaint: "outpaint"
};

const NEUTRAL: StillAdjustment = { brightness: 100, contrast: 100, saturation: 100 };

const ADJUSTMENTS: { key: keyof StillAdjustment; label: string }[] = [
  { key: "brightness", label: "Brightness" },
  { key: "contrast", label: "Contrast" },
  { key: "saturation", label: "Saturation" }
];

const previewSx = {
  width: "100%",
  borderRadius: BORDER_RADIUS.md,
  overflow: "hidden",
  bgcolor: "c_overlay_subtle"
} as const;

const reportFailure = (error: unknown, what: string): void => {
  useNotificationStore.getState().addNotification({
    type: "error",
    alert: true,
    dismissable: true,
    content: `${what} ${getErrorMessage(error, "Try again.")}`
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
const priceSuffix = (model: ShotModelRef | null): string => {
  const cost = priceRenderStep(
    "Still",
    model,
    "image model",
    STILL_RESOLUTION,
    undefined,
    []
  ).cost;
  return cost ? ` · ~${formatUsd(cost)}` : "";
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
  const sourceAssetId = still?.asset_id ?? undefined;
  const generating = isShotGenerating(shot);
  const canSpend = !!sourceAssetId && !generating && !busy;
  const stillName = `Shot ${shot.index + 1} still`;

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
      if (!ref || !sourceAssetId) {
        return false;
      }
      await generateStillVariant(boardId, shot, {
        mode,
        model: ref,
        sourceAssetId,
        ...extra
      });
      return true;
    },
    [generateStillVariant, boardId, shot, sourceAssetId]
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
          .createAsset(await maskFileFromStrokes(strokes, `${stillName} edit mask.png`));
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
      reportFailure(error, "The edit did not start.");
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
  }, [prompt, includeCast, cast, strokes, stillName, run, editMode, editModel, shot.id]);

  const handleUpscale = useCallback(async () => {
    setBusy(true);
    try {
      await run("upscale", upscaleModel, { scale });
    } catch (error) {
      reportFailure(error, "The upscale did not start.");
    } finally {
      setBusy(false);
    }
  }, [run, upscaleModel, scale]);

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
      reportFailure(error, "The reframe did not start.");
    } finally {
      setBusy(false);
    }
  }, [stillUrl, run, reframeModel, reframePrompt, aspect]);

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
          reportFailure(error, "The adjusted still could not be saved.");
        }
      });
    } catch (error) {
      setBusy(false);
      reportFailure(error, "The still could not be adjusted.");
    }
  }, [stillUrl, stillName, adjustment, uploadAsset, appendShotKeyframeVersion, boardId, shot.id]);

  const handlePainted = useCallback((next: HTMLCanvasElement | null) => {
    setStrokes(next);
    setPainting(false);
  }, []);

  if (!still) {
    return (
      <Caption color="muted">
        Render or upload a still first. Edits start from the current still.
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
        tabs={TABS}
        value={tab}
        onChange={(value) => setTab(value as ModifyTab)}
        size="small"
        fullWidth
        aria-label="Change the current still"
      />

      {tab === "edit" && (
        <FlexColumn gap={SPACING.md}>
          <FormField label="Edit model" sx={modelFieldSx}>
            <ImageModelSelect
              value={editModel?.id ?? ""}
              provider={editModel?.provider}
              task={["image_to_image", "inpainting"]}
              onChange={setEditModel}
            />
          </FormField>
          <FlexRow align="center" gap={SPACING.sm} wrap>
            <EditorButton
              size="small"
              onClick={() => setPainting(true)}
              disabled={!stillUrl}
            >
              {strokes ? "Repaint area" : "Paint area"}
            </EditorButton>
            {strokes ? (
              <Chip
                compact
                label="Only the painted area changes"
                onDelete={() => setStrokes(null)}
              />
            ) : (
              <Caption color="secondary">
                Without a painted area the whole still can change.
              </Caption>
            )}
          </FlexRow>
          <TextInput
            label="What to change"
            placeholder="Make her scarf deep red"
            multiline
            rows={3}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />
          {cast.length > 0 && (
            <LabeledSwitch
              id={`shot-modify-cast-${shot.id}`}
              size="small"
              label={`Keep ${cast.map((entity) => entity.name).join(", ")} on model`}
              description="Sends the cast's reference images with the edit."
              checked={includeCast}
              onChange={setIncludeCast}
            />
          )}
          {editModel && !editModelFits && (
            <Caption color="error">
              {strokes
                ? "This model cannot change only a painted area. Pick an inpainting model, or clear the area."
                : "This model cannot edit an existing image. Pick an editing model."}
            </Caption>
          )}
          <EditorButton
            variant="contained"
            color="primary"
            onClick={() => void handleEdit()}
            disabled={!canSpend || !editModel || !editModelFits || !prompt.trim()}
          >
            {`Generate edit${priceSuffix(asRef(editModel))}`}
          </EditorButton>
        </FlexColumn>
      )}

      {tab === "upscale" && (
        <FlexColumn gap={SPACING.md}>
          <FormField label="Upscale model" sx={modelFieldSx}>
            <ImageModelSelect
              value={upscaleModel?.id ?? ""}
              provider={upscaleModel?.provider}
              task="upscale"
              onChange={setUpscaleModel}
            />
          </FormField>
          <FormField label="Scale">
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
              aria-label="Upscale factor"
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
            {`Upscale${priceSuffix(asRef(upscaleModel))}`}
          </EditorButton>
        </FlexColumn>
      )}

      {tab === "reframe" && (
        <FlexColumn gap={SPACING.md}>
          <FormField label="New aspect ratio">
            <SelectField
              label="New aspect ratio"
              hideLabel
              size="small"
              value={aspect}
              onChange={(value) => setAspect(String(value))}
              options={[...ASPECT_OPTIONS]}
            />
          </FormField>
          <FormField label="Reframe model" sx={modelFieldSx}>
            <ImageModelSelect
              value={reframeModel?.id ?? ""}
              provider={reframeModel?.provider}
              task="outpaint"
              onChange={setReframeModel}
            />
          </FormField>
          <TextInput
            label="What fills the new space (optional)"
            placeholder="Leave empty to continue the scene"
            value={reframePrompt}
            onChange={(event) => setReframePrompt(event.target.value)}
          />
          <EditorButton
            variant="contained"
            color="primary"
            onClick={() => void handleReframe()}
            disabled={!canSpend || !reframeModel || !stillUrl}
          >
            {`Reframe to ${aspect}${priceSuffix(asRef(reframeModel))}`}
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
            <ResponsiveImage locator={still} alt="Adjusted still preview" fit="contain" />
          </Box>
          {ADJUSTMENTS.map(({ key, label }) => (
            <FlexRow key={key} align="center" gap={SPACING.md}>
              <Caption color="secondary" sx={{ minWidth: "6rem" }} id={`shot-adjust-${key}-${shot.id}`}>
                {label}
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
              Reset
            </EditorButton>
            <EditorButton
              variant="contained"
              color="primary"
              onClick={() => void handleSaveAdjustment()}
              disabled={!adjusted || busy || !stillUrl}
              title="Made in your browser, no provider involved"
            >
              Save as new take
            </EditorButton>
          </FlexRow>
        </FlexColumn>
      )}

      <Caption color="secondary">
        Each change arrives as a new take. Use Set current to put it on the shot.
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
