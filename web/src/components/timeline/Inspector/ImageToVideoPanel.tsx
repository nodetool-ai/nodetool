/**
 * ImageToVideoPanel
 *
 * Animates an image clip. The panel creates an `image-to-video` direct-gen
 * clip with the image as its source, on the video track directly above the
 * image and over the same span, then starts generating it. The request takes
 * the image clip's duration and the image's proportions, snapped to the
 * nearest values the chosen model accepts (see `imageToVideoSettings`).
 */

import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import MovieFilterOutlinedIcon from "@mui/icons-material/MovieFilterOutlined";

import type { VideoModelValue } from "../../../stores/ApiTypes";
import {
  useTimelineStore,
  useTimelineStoreApi
} from "../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { findClipById } from "../../../stores/timeline/clipLookup";
import { useTimelineHistoryBatch } from "../../../stores/timeline/useTimelineHistoryBatch";
import {
  useMediaOptions,
  useVideoModelsByProvider
} from "../../../hooks/useModelsByProvider";
import { useTimelineDirectGenJob } from "../../../hooks/timeline/useTimelineDirectGenJob";
import { useClipCostEstimate } from "../../../hooks/timeline/useClipCostEstimate";
import { useResolvedMediaUri } from "../../../hooks/useResolvedMediaUri";
import { useImageNaturalSize } from "../../../hooks/useImageNaturalSize";
import {
  imageToVideoSettings,
  placeImageToVideoClip
} from "../../../hooks/timeline/imageToVideoSettings";
import { isElectron, isLocalhost } from "../../../lib/env";
import CostEstimateLine from "../../costs/CostEstimateLine";
import { generationCostLine } from "../../costs/costLine";
import VideoModelSelect from "../../properties/VideoModelSelect";
import CuratedModelSelect from "../../properties/curated/CuratedModelSelect";
import ErrorBanner from "../../support/ErrorBanner";
import {
  Caption,
  CollapsibleSection,
  EditorButton,
  EmptyState,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  SPACING,
  TextArea
} from "../../ui_primitives";
import { InspectorSectionTitle } from "./InspectorPrimitives";
import { usePersistedFold } from "./usePersistedFold";

interface ImageToVideoPanelProps {
  clipId: string;
}

const IS_MANAGED_BUILD = !isLocalhost && !isElectron;

const toVideoModelValue = (model: {
  id: string;
  name: string;
  provider: string;
  supported_tasks?: string[];
}): VideoModelValue => ({
  type: "video_model",
  id: model.id,
  name: model.name,
  provider: model.provider,
  supported_tasks: model.supported_tasks
});

/**
 * The model's own option list, or the catalog's when it listed none. An empty
 * list is what a failed or empty options lookup returns, not a model that
 * accepts nothing.
 */
const listedOr = <T,>(
  listed: readonly T[] | null | undefined,
  catalog: readonly T[] | null | undefined
): readonly T[] | null | undefined =>
  listed && listed.length > 0 ? listed : catalog;

const formatSeconds = (ms: number): string =>
  `${Number((ms / 1000).toFixed(2))} s`;

const ImageToVideoPanel: React.FC<ImageToVideoPanelProps> = ({ clipId }) => {
  const { t } = useTranslation();
  const [open, setOpen] = usePersistedFold("image-to-video", true);
  const timeline = useTimelineStoreApi();
  const clip = useTimelineStore((state) => findClipById(state.clips, clipId));
  const selectClip = useTimelineUIStore((state) => state.selectClip);
  const history = useTimelineHistoryBatch();
  const { start } = useTimelineDirectGenJob();

  const { models, isLoading, error, refetch } = useVideoModelsByProvider({
    task: "image_to_video"
  });
  const availableModels = useMemo(
    () =>
      IS_MANAGED_BUILD
        ? models.filter((model) => model.provider === "nodetool")
        : models,
    [models]
  );
  const managedModelOptions = useMemo(
    () =>
      availableModels.map((model) => ({
        id: model.id,
        modelId: model.id,
        value: toVideoModelValue(model),
        label: model.name,
        blurb: "",
        tasks: model.supported_tasks ?? []
      })),
    [availableModels]
  );

  const [selectedModel, setSelectedModel] = useState<VideoModelValue | null>(
    null
  );
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedModel && availableModels[0]) {
      setSelectedModel(toVideoModelValue(availableModels[0]));
    }
  }, [availableModels, selectedModel]);

  const assetId = clip?.currentAssetId;
  const imageUrl = useResolvedMediaUri(assetId ? `asset://${assetId}` : null);
  const measured = useImageNaturalSize(
    clip?.width && clip?.height ? undefined : imageUrl
  );
  const clipWidth = clip?.width;
  const clipHeight = clip?.height;
  const imageSize = useMemo(
    () =>
      clipWidth && clipHeight
        ? { width: clipWidth, height: clipHeight }
        : measured.size,
    [clipHeight, clipWidth, measured.size]
  );

  const mediaOptions = useMediaOptions({
    provider: selectedModel?.provider,
    model: selectedModel?.id,
    task: "video"
  });
  const catalogModel = useMemo(
    () =>
      availableModels.find(
        (model) =>
          model.id === selectedModel?.id &&
          model.provider === selectedModel?.provider
      ),
    [availableModels, selectedModel]
  );
  const settings = useMemo(
    () =>
      clip
        ? imageToVideoSettings(
            {
              durationMs: clip.durationMs,
              width: imageSize?.width,
              height: imageSize?.height
            },
            {
              durations: listedOr(
                mediaOptions.data?.durations,
                catalogModel?.durations
              ),
              aspectRatios: listedOr(
                mediaOptions.data?.aspectRatios,
                catalogModel?.aspect_ratios
              ),
              resolutions: listedOr(
                mediaOptions.data?.resolutions,
                catalogModel?.resolutions
              )
            }
          )
        : null,
    [catalogModel, clip, imageSize?.height, imageSize?.width, mediaOptions.data]
  );

  const costEstimate = useClipCostEstimate(
    settings && selectedModel
      ? {
          bindingKind: "image-to-video",
          provider: selectedModel.provider,
          model: selectedModel.id,
          resolution: settings.resolution,
          aspectRatio: settings.aspectRatio,
          durationMs: settings.clipDurationMs
        }
      : null
  );

  const handleModelChange = useCallback((value: VideoModelValue) => {
    setSelectedModel(value);
    setErrorMessage(null);
  }, []);

  const handleGenerate = useCallback(async () => {
    const image = timeline.getState().clips.find((item) => item.id === clipId);
    if (!image || !settings || !imageSize || !selectedModel || !prompt.trim()) {
      return;
    }
    setErrorMessage(null);
    setSubmitting(true);
    try {
      const state = timeline.getState();
      const placement = placeImageToVideoClip(
        state.tracks,
        state.clips,
        image,
        settings.clipDurationMs
      );
      history.begin();
      let videoClipId: string;
      try {
        const trackId =
          placement.kind === "existing"
            ? placement.trackId
            : state.insertTrack(
                "video",
                placement.atIndex,
                t("pass3_29.imageToVideo.trackName")
              );
        history.mark();
        videoClipId = timeline.getState().addDirectGenClip({
          trackId,
          startMs: image.startMs,
          durationMs: settings.clipDurationMs,
          mediaType: "video",
          bindingKind: "image-to-video",
          prompt: prompt.trim(),
          provider: selectedModel.provider,
          model: selectedModel.id,
          sourceClipId: image.id,
          aspectRatio: settings.aspectRatio,
          resolution: settings.resolution,
          name: t("pass3_29.imageToVideo.clipName", { name: image.name })
        });
        history.mark();
      } finally {
        history.end();
      }
      // Selecting the new clip replaces this panel, so it waits for the start:
      // an error thrown by the start must still have a panel to show it.
      await start(videoClipId);
      selectClip(videoClipId);
    } catch (failure) {
      setErrorMessage(
        failure instanceof Error ? failure.message : String(failure)
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    clipId,
    history,
    imageSize,
    prompt,
    selectClip,
    selectedModel,
    settings,
    start,
    t,
    timeline
  ]);

  if (!clip || clip.mediaType !== "image") {
    return null;
  }

  const noCompatibleModel =
    !isLoading && !error && availableModels.length === 0;
  const durationChanged =
    settings !== null && settings.clipDurationMs !== clip.durationMs;
  const summary = settings
    ? [
        formatSeconds(settings.clipDurationMs),
        settings.aspectRatio ??
          (imageSize ? `${imageSize.width}×${imageSize.height}` : undefined),
        settings.resolution
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <CollapsibleSection
      title={
        <InspectorSectionTitle
          title={t("pass3_29.imageToVideo.title")}
          icon={<MovieFilterOutlinedIcon />}
        />
      }
      open={open}
      onToggle={setOpen}
    >
      <FlexColumn gap={SPACING.sm} sx={{ p: SPACING.md }}>
        {!assetId ? (
          <EmptyState
            variant="empty"
            size="small"
            title={t("pass3_29.imageToVideo.noImageTitle")}
            description={t("pass3_29.imageToVideo.noImageDescription")}
          />
        ) : (
          <>
            <TextArea
              value={prompt}
              onChange={(value) => setPrompt(value)}
              placeholder={t("pass3_29.imageToVideo.motionPlaceholder")}
              minRows={2}
              maxRows={6}
              compact
              fullWidth
              inputProps={{
                "aria-label": t("pass3_29.imageToVideo.motionPromptLabel"),
                "data-testid": "image-to-video-prompt"
              }}
              disabled={submitting}
            />

            {isLoading ? (
              <LoadingSpinner size="small" />
            ) : error || noCompatibleModel ? (
              <EmptyState
                variant={error ? "error" : "empty"}
                size="small"
                title={t("pass3_29.imageToVideo.noModelTitle")}
                description={
                  error
                    ? t("pass3_29.imageToVideo.catalogError")
                    : t("pass3_29.imageToVideo.noCompatibleModel")
                }
                actionText={
                  error ? t("pass3_29.imageToVideo.retryCatalog") : undefined
                }
                onAction={error ? () => void refetch() : undefined}
              />
            ) : IS_MANAGED_BUILD ? (
              <CuratedModelSelect
                label={t("pass3_29.imageToVideo.modelLabel")}
                options={managedModelOptions}
                value={selectedModel?.id ?? ""}
                onChange={handleModelChange}
              />
            ) : (
              <VideoModelSelect
                value={selectedModel?.id ?? ""}
                provider={selectedModel?.provider}
                task="image_to_video"
                onChange={handleModelChange}
              />
            )}

            {summary && (
              <Caption color="secondary" data-testid="image-to-video-summary">
                {summary}
              </Caption>
            )}
            {durationChanged && (
              <Caption color="secondary">
                {t("pass3_29.imageToVideo.durationAdjusted", {
                  requested: formatSeconds(clip.durationMs),
                  actual: formatSeconds(settings.clipDurationMs)
                })}
              </Caption>
            )}

            <FlexRow justify="flex-end" fullWidth>
              <CostEstimateLine
                estimate={generationCostLine(costEstimate)}
                title={t("pass3_29.imageToVideo.estimatedCost")}
              />
            </FlexRow>

            <EditorButton
              fullWidth
              variant="contained"
              startIcon={<MovieFilterOutlinedIcon />}
              disabled={!prompt.trim() || !selectedModel || !imageSize}
              loading={submitting}
              onClick={() => void handleGenerate()}
              data-testid="image-to-video-submit"
            >
              {submitting
                ? t("pass3_29.imageToVideo.starting")
                : t("pass3_29.imageToVideo.generate")}
            </EditorButton>

            {!imageSize && measured.failed && (
              <ErrorBanner
                report={{
                  source: "operation-failure",
                  summary: t("pass3_29.imageToVideo.sourceImageFailedSummary")
                }}
              >
                {t("pass3_29.imageToVideo.sourceImageFailed")}
              </ErrorBanner>
            )}
            {errorMessage && (
              <ErrorBanner
                report={{
                  source: "operation-failure",
                  summary: t("pass3_29.imageToVideo.generationFailedSummary"),
                  errorText: errorMessage
                }}
              >
                {errorMessage}
              </ErrorBanner>
            )}
          </>
        )}
      </FlexColumn>
    </CollapsibleSection>
  );
};

ImageToVideoPanel.displayName = "ImageToVideoPanel";

export default memo(ImageToVideoPanel);
