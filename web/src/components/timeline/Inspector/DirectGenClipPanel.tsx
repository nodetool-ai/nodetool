/** @jsxImportSource @emotion/react */
/**
 * DirectGenClipPanel
 *
 * Inspector panel for a direct-generation clip (text-to-image /
 * image-to-image / text-to-video / text-to-audio). Mirrors the sketch
 * editor's `DirectGenLayerPanel`: prompt + model + (optional) source-clip
 * picker, with Generate/Cancel driven by the same `useGenerateClip` API
 * used elsewhere in the timeline.
 *
 * Workflow-bound clips render `GeneratedClipPanel` instead — dispatch
 * happens in `TimelineInspector`.
 */

import React, { memo, useCallback, useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { findClipById } from "../../../stores/timeline/clipLookup";
import { useTimelineHistoryBatch } from "../../../stores/timeline/useTimelineHistoryBatch";
import { useNotificationStore } from "../../../stores/NotificationStore";
import { useGenerateClip } from "../../../hooks/timeline/useGenerateClip";
import ImageModelSelect from "../../properties/ImageModelSelect";
import VideoModelSelect from "../../properties/VideoModelSelect";
import TTSModelSelect from "../../properties/TTSModelSelect";
import type {
  ImageModelValue,
  TTSModelValue
} from "../../../stores/ApiTypes";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import TvIcon from "@mui/icons-material/Tv";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import TuneIcon from "@mui/icons-material/Tune";
import LayersIcon from "@mui/icons-material/Layers";

import {
  MediaAspectChip,
  MediaOptionChip
} from "../../chat/composer/MediaSettingChips";
import {
  buildImageEditOptions,
  buildImageModelOptions
} from "../../chat/composer/imageModelOptions";
import { buildVideoModelOptions } from "../../chat/composer/videoModelOptions";
import {
  deriveImageSizePreset,
  resolveImageSize,
  type ImageResolution,
  type VideoModelSelection,
  type VideoResolution
} from "../../../stores/MediaGenerationStore";
import { useMediaOptions } from "../../../hooks/useModelsByProvider";

import {
  Caption,
  CollapsibleSection,
  EditorButton,
  FlexColumn,
  FlexRow,
  Panel,
  SelectField,
  TextInput
} from "../../ui_primitives";
import { GeneratedClipTopBar } from "./GeneratedClipTopBar";
import { InspectorSectionTitle } from "./InspectorPrimitives";
import { ClipAdjustments } from "./ClipAdjustments";
import { ClipVersionHistory } from "./ClipVersionHistory";

interface VideoModelChange {
  type: "video_model";
  id: string;
  provider: string;
  name: string;
}

export interface DirectGenClipPanelProps {
  clipId: string;
}

const sectionStyles = (theme: Theme) =>
  css({
    padding: theme.spacing(1)
  });

const panelSx = {
  width: "100%",
  height: "100%",
  maxHeight: "100%",
  minHeight: 0,
  overflow: "auto"
};

// Source-clip dropdown is only rendered in image-to-image mode. Sharing one
// empty array (rather than `[]` inline in the selector) keeps the selector's
// result referentially stable outside that mode, so `useShallow` bails out
// without a re-render.
const EMPTY_SOURCE_ENTRIES: readonly string[] = [];
// Encodes id + SEP + label as one primitive per eligible clip so the array
// compares element-wise under useShallow (an array of fresh {value, label}
// objects would never compare equal across renders). Clip ids never contain
// this separator, so splitting on its first occurrence is unambiguous.
const SOURCE_ENTRY_SEP = "\u0000";

// Defaults for the setting chips when the clip has no explicit value yet —
// same as the media chat composer's per-mode defaults.
const DEFAULT_STRENGTH = 0.65;
const DEFAULT_STEPS = 30;
const DEFAULT_VIDEO_RESOLUTION: VideoResolution = "720p";
const DEFAULT_VIDEO_ASPECT = "16:9";

const DirectGenClipPanelInner: React.FC<DirectGenClipPanelProps> = ({
  clipId
}) => {
  const theme = useTheme();

  const clip = useTimelineStore((s) => findClipById(s.clips, clipId));
  const setClipPrompt = useTimelineStore((s) => s.setClipPrompt);
  const setClipDirectGenModel = useTimelineStore(
    (s) => s.setClipDirectGenModel
  );
  const patchClipBinding = useTimelineStore((s) => s.patchClipBinding);
  const patchClip = useTimelineStore((s) => s.patchClip);
  const addNotification = useNotificationStore((s) => s.addNotification);

  const {
    generateClip,
    cancelClipGeneration,
    isActive,
    isFailed,
    canGenerate
  } = useGenerateClip(clipId);

  const kind: "image" | "video" | "audio" =
    clip?.bindingKind === "text-to-video"
      ? "video"
      : clip?.bindingKind === "text-to-audio"
        ? "audio"
        : "image";
  const isImageToImage = clip?.bindingKind === "image-to-image";

  // Per-model option constraints from the provider manifest — the same source
  // the media chat composer uses, so both surfaces offer identical choices.
  // Audio clips have no size/duration options, so their query stays disabled.
  const mediaOptions = useMediaOptions({
    provider: clip?.provider,
    model: kind === "audio" ? null : clip?.model,
    task: kind === "video" ? "video" : "image"
  });

  const { aspectOptions: imageAspectOptions, resolutionOptions } = useMemo(
    () =>
      buildImageModelOptions({
        aspectRatios: mediaOptions.data?.aspectRatios,
        resolutions: mediaOptions.data?.resolutions
      }),
    [mediaOptions.data]
  );
  const { strengthOptions, stepsOptions } = useMemo(buildImageEditOptions, []);
  const videoSelection = useMemo<VideoModelSelection | null>(
    () =>
      kind === "video" && clip?.model
        ? {
            type: "video_model",
            id: clip.model,
            provider: clip.provider ?? "",
            name: clip.model,
            durations: mediaOptions.data?.durations ?? undefined,
            resolutions: mediaOptions.data?.resolutions ?? undefined,
            aspectRatios: mediaOptions.data?.aspectRatios ?? undefined
          }
        : null,
    [kind, clip?.model, clip?.provider, mediaOptions.data]
  );
  const {
    durationOptions,
    resolutionOptions: videoResolutionOptions,
    aspectOptions: videoAspectOptions
  } = useMemo(() => buildVideoModelOptions(videoSelection), [videoSelection]);

  // Image size chips: derive the nearest preset from width/height for clips
  // created before aspect/resolution were stored on the binding.
  const imageSizeSeed = useMemo(
    () => deriveImageSizePreset(clip?.width ?? 1024, clip?.height ?? 1024),
    [clip?.width, clip?.height]
  );
  const imageResolution =
    (clip?.resolution as ImageResolution | undefined) ??
    imageSizeSeed.resolution;
  const imageAspect = clip?.aspectRatio ?? imageSizeSeed.aspectRatio;

  const applyImageSize = useCallback(
    (nextResolution: ImageResolution, nextAspect: string) => {
      const { width, height } = resolveImageSize(nextResolution, nextAspect);
      patchClipBinding(clipId, {
        resolution: nextResolution,
        aspectRatio: nextAspect,
        width,
        height
      });
    },
    [clipId, patchClipBinding]
  );

  // The direct-gen job derives the requested video duration from the clip's
  // timeline length, so the duration chip resizes the clip itself.
  const videoDuration = Math.max(
    1,
    Math.round((clip?.durationMs ?? 4000) / 1000)
  );
  const handleDurationChange = useCallback(
    (seconds: number) => {
      patchClip(clipId, { durationMs: seconds * 1000 });
    },
    [clipId, patchClip]
  );

  // Eligible image-to-image source clips: any other image/overlay clip with
  // a rendered asset in the sequence. Gated on `isImageToImage` so clips in
  // every other mode never subscribe to the full `clips` array; the selector
  // returns primitive strings (not fresh {value, label} objects) so
  // `useShallow` can actually bail out the re-render when nothing eligible
  // changed.
  const sourceEntries = useTimelineStore(
    useShallow((s) =>
      isImageToImage
        ? s.clips
            .filter(
              (c) =>
                c.id !== clipId &&
                (c.mediaType === "image" || c.mediaType === "overlay") &&
                !!c.currentAssetId
            )
            .map(
              (c) => `${c.id}${SOURCE_ENTRY_SEP}${c.name || c.id.slice(0, 8)}`
            )
        : EMPTY_SOURCE_ENTRIES
    )
  );

  const sourceOptions = useMemo(
    () =>
      sourceEntries.map((entry) => {
        const sepIndex = entry.indexOf(SOURCE_ENTRY_SEP);
        return { value: entry.slice(0, sepIndex), label: entry.slice(sepIndex + 1) };
      }),
    [sourceEntries]
  );

  const handleModelChange = useCallback(
    (v: ImageModelValue) => {
      setClipDirectGenModel(clipId, v.provider, v.id);
    },
    [clipId, setClipDirectGenModel]
  );

  const handleVideoModelChange = useCallback(
    (v: VideoModelChange) => {
      setClipDirectGenModel(clipId, v.provider, v.id);
    },
    [clipId, setClipDirectGenModel]
  );

  const handleTTSModelChange = useCallback(
    (v: TTSModelValue) => {
      const nextVoice =
        v.selected_voice || (v.voices && v.voices[0]) || undefined;
      patchClipBinding(clipId, {
        provider: v.provider,
        model: v.id,
        voice: nextVoice
      });
    },
    [clipId, patchClipBinding]
  );

  // Typing in the prompt field would otherwise push one undo entry per
  // keystroke. Batch the whole focused-editing session into a single entry:
  // begin on focus, mark per keystroke, end on blur (a stray unmount mid-edit
  // is covered by useTimelineHistoryBatch's own unmount safety net).
  const promptHistory = useTimelineHistoryBatch();
  const promptGestureActiveRef = useRef(false);

  const handlePromptFocus = useCallback(() => {
    promptGestureActiveRef.current = true;
    promptHistory.begin();
  }, [promptHistory]);

  const handlePromptBlur = useCallback(() => {
    if (promptGestureActiveRef.current) {
      promptGestureActiveRef.current = false;
      promptHistory.end();
    }
  }, [promptHistory]);

  const handlePromptChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setClipPrompt(clipId, e.target.value);
      promptHistory.mark();
    },
    [clipId, setClipPrompt, promptHistory]
  );

  const handleSourceChange = useCallback(
    (value: string) => {
      patchClipBinding(clipId, { sourceClipId: value || null });
    },
    [clipId, patchClipBinding]
  );

  const handleKindToggle = useCallback(
    (target: "text-to-image" | "image-to-image") => {
      if (!clip || clip.bindingKind === target) return;
      patchClipBinding(clipId, { bindingKind: target });
    },
    [clip, clipId, patchClipBinding]
  );

  const handleGenerateClick = useCallback(() => {
    const action = isActive ? cancelClipGeneration() : generateClip();
    action.catch((err: unknown) => {
      addNotification({
        content: `Clip generation failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
        type: "error",
        alert: true,
        dedupeKey: "timeline-clip-generate-failed",
        replaceExisting: true
      });
    });
  }, [isActive, cancelClipGeneration, generateClip, addNotification]);

  if (!clip) {
    return null;
  }

  const promptPlaceholder =
    kind === "video"
      ? "Describe the video…"
      : kind === "audio"
        ? "Type text to speak…"
        : "Describe the image…";

  const generateLabel = clip.currentAssetId ? "Regenerate" : "Generate";

  return (
    <Panel background="default" bordered={false} sx={panelSx}>
      <FlexColumn gap={0}>
        <GeneratedClipTopBar clip={clip} />

        <CollapsibleSection
          title={
            <InspectorSectionTitle
              title="Prompt"
              icon={<AutoAwesomeOutlinedIcon />}
            />
          }
          defaultOpen
        >
          <FlexColumn gap={1} css={sectionStyles(theme)}>
            {kind === "image" && (
              <FlexRow gap={0.5}>
                <EditorButton
                  size="small"
                  variant={
                    clip.bindingKind === "text-to-image"
                      ? "contained"
                      : "outlined"
                  }
                  onClick={() => handleKindToggle("text-to-image")}
                  data-testid="direct-gen-mode-t2i"
                >
                  Text → Image
                </EditorButton>
                <EditorButton
                  size="small"
                  variant={isImageToImage ? "contained" : "outlined"}
                  onClick={() => handleKindToggle("image-to-image")}
                  data-testid="direct-gen-mode-i2i"
                >
                  Image → Image
                </EditorButton>
              </FlexRow>
            )}

            {kind === "video" ? (
              <VideoModelSelect
                value={clip.model ?? ""}
                task="text_to_video"
                onChange={handleVideoModelChange}
              />
            ) : kind === "audio" ? (
              <TTSModelSelect
                value={
                  clip.model
                    ? ({
                        type: "tts_model",
                        id: clip.model,
                        provider: clip.provider ?? "",
                        name: clip.model,
                        voices: clip.voice ? [clip.voice] : [],
                        selected_voice: clip.voice ?? ""
                      } as TTSModelValue)
                    : ""
                }
                onChange={handleTTSModelChange}
              />
            ) : (
              <ImageModelSelect
                value={clip.model ?? ""}
                task={isImageToImage ? "image_to_image" : "text_to_image"}
                onChange={handleModelChange}
              />
            )}

            <TextInput
              value={clip.prompt ?? ""}
              onChange={handlePromptChange}
              onFocus={handlePromptFocus}
              onBlur={handlePromptBlur}
              placeholder={promptPlaceholder}
              multiline
              minRows={2}
              maxRows={10}
              compact
              fullWidth
              inputProps={{
                "aria-label": "Prompt",
                "data-testid": "direct-gen-prompt"
              }}
            />

            {isImageToImage && (
              sourceOptions.length === 0 ? (
                <Caption color="secondary">
                  No source clips with a rendered asset are available.
                </Caption>
              ) : (
                <SelectField
                  label="Source clip"
                  value={clip.sourceClipId ?? ""}
                  onChange={handleSourceChange}
                  options={sourceOptions}
                  size="small"
                />
              )
            )}

            {/* Output settings — the same fields as the header generation
                panel (media chat composer) for the matching mode. */}
            {kind === "image" && (
              <FlexRow gap={0.5} align="center" sx={{ flexWrap: "wrap" }}>
                <MediaOptionChip
                  icon={<TvIcon fontSize="small" />}
                  header="Resolution"
                  value={imageResolution}
                  options={resolutionOptions}
                  onChange={(r) => applyImageSize(r, imageAspect)}
                />
                <MediaAspectChip
                  value={imageAspect}
                  options={imageAspectOptions}
                  onChange={(a) => applyImageSize(imageResolution, a)}
                />
                {isImageToImage && (
                  <>
                    <MediaOptionChip
                      icon={<TuneIcon fontSize="small" />}
                      label={`Strength ${(clip.strength ?? DEFAULT_STRENGTH).toFixed(2)}`}
                      header="Edit Strength"
                      value={clip.strength ?? DEFAULT_STRENGTH}
                      options={strengthOptions}
                      onChange={(s) =>
                        patchClipBinding(clipId, { strength: s })
                      }
                    />
                    <MediaOptionChip
                      icon={<LayersIcon fontSize="small" />}
                      label={`${clip.numInferenceSteps ?? DEFAULT_STEPS} steps`}
                      header="Inference Steps"
                      value={clip.numInferenceSteps ?? DEFAULT_STEPS}
                      options={stepsOptions}
                      onChange={(n) =>
                        patchClipBinding(clipId, { numInferenceSteps: n })
                      }
                    />
                  </>
                )}
              </FlexRow>
            )}
            {kind === "video" && (
              <FlexRow gap={0.5} align="center" sx={{ flexWrap: "wrap" }}>
                <MediaOptionChip
                  icon={<AccessTimeIcon fontSize="small" />}
                  label={`${videoDuration} Sec`}
                  header="Duration"
                  value={videoDuration}
                  options={durationOptions}
                  onChange={handleDurationChange}
                />
                <MediaOptionChip
                  icon={<TvIcon fontSize="small" />}
                  header="Video Resolution"
                  value={
                    (clip.resolution as VideoResolution | undefined) ??
                    DEFAULT_VIDEO_RESOLUTION
                  }
                  options={videoResolutionOptions}
                  onChange={(r) =>
                    patchClipBinding(clipId, { resolution: r })
                  }
                />
                <MediaAspectChip
                  value={clip.aspectRatio ?? DEFAULT_VIDEO_ASPECT}
                  options={videoAspectOptions}
                  onChange={(a) =>
                    patchClipBinding(clipId, { aspectRatio: a })
                  }
                />
              </FlexRow>
            )}

            <EditorButton
              fullWidth
              variant={isActive ? "outlined" : "contained"}
              color={isActive ? "warning" : "primary"}
              startIcon={
                isActive ? <StopRoundedIcon /> : <AutoAwesomeOutlinedIcon />
              }
              disabled={!isActive && !canGenerate}
              onClick={handleGenerateClick}
              data-testid="direct-gen-generate"
            >
              {isActive ? "Cancel" : generateLabel}
            </EditorButton>
            {isFailed && (
              <Caption sx={{ color: "error.main", textAlign: "center" }}>
                Generation failed.
              </Caption>
            )}
          </FlexColumn>
        </CollapsibleSection>

        <ClipVersionHistory clipId={clipId} />

        <ClipAdjustments clip={clip} />
      </FlexColumn>
    </Panel>
  );
};

export const DirectGenClipPanel = memo(DirectGenClipPanelInner);
DirectGenClipPanel.displayName = "DirectGenClipPanel";
