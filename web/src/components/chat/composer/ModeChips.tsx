/**
 * ModeChips — the chip cluster the composer shows for the selected media mode.
 *
 * One component per mode, each reading only its own slice of
 * MediaGenerationStore, so switching mode unmounts the previous cluster along
 * with every menu and dialog it owned. That is what removed the composer's
 * "close everything on mode change" effect: there is nothing left to close.
 */
import React, { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import AppsIcon from "@mui/icons-material/Apps";
import AspectRatioIcon from "@mui/icons-material/CropOriginal";
import AudiotrackIcon from "@mui/icons-material/Audiotrack";
import BurstModeIcon from "@mui/icons-material/BurstMode";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import DisplaySettingsIcon from "@mui/icons-material/Tv";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import LayersIcon from "@mui/icons-material/Layers";
import MovieIcon from "@mui/icons-material/Movie";
import MovieFilterIcon from "@mui/icons-material/MovieFilter";
import RecordVoiceOverIcon from "@mui/icons-material/RecordVoiceOver";
import SpeedIcon from "@mui/icons-material/Speed";
import TuneIcon from "@mui/icons-material/Tune";

import useMediaGenerationStore, {
  AUDIO_FORMATS,
  AUDIO_SPEEDS,
  DEFAULT_TTS_VOICES,
  MUSIC_DURATIONS,
  IMAGE_VARIATIONS
} from "../../../stores/MediaGenerationStore";
import type {
  AudioFormat,
  MediaMode
} from "../../../stores/MediaGenerationStore";
import type { MusicModel } from "../../../stores/ApiTypes";
import useModelPreferencesStore from "../../../stores/ModelPreferencesStore";
import ModelChip, { type ModelPickerHandle } from "./ModelChip";
import OptionChip from "./OptionChip";
import { type MediaOption } from "./MediaOptionMenu";
import {
  buildImageEditOptions,
  buildImageModelOptions,
  imageModelConstraints
} from "./imageModelOptions";
import {
  buildVideoModelOptions,
  clampToAllowed,
  videoModelConstraints
} from "./videoModelOptions";
import {
  audioModelPatch,
  imageModelPatch,
  recentModelEntry,
  videoModelPatch
} from "./modelSelection";

/** Static option lists — the same rows whatever the model. */
const VARIATIONS_OPTIONS: MediaOption<number>[] = IMAGE_VARIATIONS.map((n) => ({
  id: n,
  label: `${n}`,
  description: n === 1 ? "variation" : "variations",
  icon: <AppsIcon fontSize="small" />
}));

const SPEED_OPTIONS: MediaOption<number>[] = AUDIO_SPEEDS.map((s) => ({
  id: s,
  label: `${s}x`,
  icon: <SpeedIcon fontSize="small" />
}));

const AUDIO_FORMAT_OPTIONS: MediaOption<AudioFormat>[] = AUDIO_FORMATS.map(
  (f) => ({
    id: f,
    label: f.toUpperCase(),
    icon: <AudiotrackIcon fontSize="small" />
  })
);

const { strengthOptions: STRENGTH_OPTIONS, stepsOptions: STEPS_OPTIONS } =
  buildImageEditOptions();

/** Whether the first reference video's own audio survives into the result. */
interface ModeChipsProps {
  mode: MediaMode;
  /** Lets the composer open the mode's model picker when a send is refused. */
  openModelPickerRef: React.Ref<ModelPickerHandle>;
}

interface ClusterProps {
  openModelPickerRef: React.Ref<ModelPickerHandle>;
}

function MusicModeChips({ openModelPickerRef }: ClusterProps) {
  const { t } = useTranslation();
  const params = useMediaGenerationStore((s) => s.music);
  const setParams = useMediaGenerationStore((s) => s.setMusicParams);
  const addRecentModel = useModelPreferencesStore((s) => s.addRecent);
  const handlePickMusic = useCallback(
    (model: MusicModel) => {
      setParams({
        model: {
          type: "music_model",
          id: model.id,
          provider: model.provider,
          name: model.name
        }
      });
      addRecentModel(recentModelEntry(model));
    },
    [setParams, addRecentModel]
  );
  return (
    <>
      <ModelChip
        openRef={openModelPickerRef}
        icon={<AudiotrackIcon fontSize="small" />}
        label={params.model?.name || t("i18n-next54.composer.selectMusicModel")}
        picker={{
          kind: "music",
          onPick: handlePickMusic
        }}
      />
      <OptionChip
        menu="option"
        icon={<AccessTimeIcon fontSize="small" />}
        label={t("i18n-next54.composer.durationSeconds", { count: params.duration })}
        header={t("i18n-next54.composer.targetDuration")}
        title={t("i18n-next54.composer.targetDurationTitle", { seconds: params.duration })}
        value={params.duration}
        options={MUSIC_DURATIONS.map((id) => ({ id, label: t("i18n-next54.composer.durationSeconds", { count: id }) }))}
        onChange={(duration) => setParams({ duration })}
      />
    </>
  );
}

function ImageModeChips({ openModelPickerRef }: ClusterProps) {
  const { t } = useTranslation();
  const params = useMediaGenerationStore((s) => s.image);
  const setParams = useMediaGenerationStore((s) => s.setImageParams);
  const addRecentModel = useModelPreferencesStore((s) => s.addRecent);
  const { aspectOptions, resolutionOptions } = useMemo(
    () => buildImageModelOptions(params.model),
    [params.model]
  );

  return (
    <>
      <ModelChip
        openRef={openModelPickerRef}
        icon={null}
        label={params.model?.name || t("i18n-next54.composer.selectModel")}
        picker={{
          kind: "image",
          task: "text_to_image",
          onPick: (model) => {
            setParams(imageModelPatch(model, params));
            addRecentModel(recentModelEntry(model));
          }
        }}
      />
      <OptionChip
        menu="option"
        icon={<DisplaySettingsIcon fontSize="small" />}
        label={params.resolution}
        header={t("i18n-next54.composer.imageResolution")}
        value={params.resolution}
        options={resolutionOptions}
        onChange={(resolution) => setParams({ resolution })}
      />
      <OptionChip
        menu="aspect"
        icon={<AspectRatioIcon fontSize="small" />}
        label={params.aspectRatio}
        value={params.aspectRatio}
        options={aspectOptions}
        onChange={(aspectRatio) => setParams({ aspectRatio })}
      />
      <OptionChip
        menu="option"
        icon={<AppsIcon fontSize="small" />}
        label={`${params.variations}`}
        header={t("i18n-next54.composer.numberOfVariations")}
        value={params.variations}
        options={VARIATIONS_OPTIONS}
        onChange={(variations) => setParams({ variations })}
      />
    </>
  );
}

function ImageEditModeChips({ openModelPickerRef }: ClusterProps) {
  const { t } = useTranslation();
  const params = useMediaGenerationStore((s) => s.imageEdit);
  const setParams = useMediaGenerationStore((s) => s.setImageEditParams);
  const addRecentModel = useModelPreferencesStore((s) => s.addRecent);
  const { aspectOptions, resolutionOptions } = useMemo(
    () => buildImageModelOptions(params.model),
    [params.model]
  );

  return (
    <>
      <ModelChip
        openRef={openModelPickerRef}
        icon={<AutoFixHighIcon fontSize="small" />}
        label={params.model?.name || t("i18n-next54.composer.selectEditModel")}
        picker={{
          kind: "image",
          task: "image_to_image",
          onPick: (model) => {
            const constraints = imageModelConstraints(model);
            setParams({
              model: {
                type: "image_model",
                id: model.id,
                provider: model.provider,
                name: model.name || "",
                path: model.path || "",
                ...constraints
              },
              resolution: clampToAllowed(
                params.resolution,
                constraints.resolutions
              ),
              aspectRatio: clampToAllowed(
                params.aspectRatio,
                constraints.aspectRatios
              )
            });
            addRecentModel(recentModelEntry(model));
          }
        }}
      />
      <OptionChip
        menu="option"
        icon={<DisplaySettingsIcon fontSize="small" />}
        label={params.resolution}
        header={t("i18n-next54.composer.imageResolution")}
        value={params.resolution}
        options={resolutionOptions}
        onChange={(resolution) => setParams({ resolution })}
      />
      <OptionChip
        menu="aspect"
        icon={<AspectRatioIcon fontSize="small" />}
        label={params.aspectRatio}
        value={params.aspectRatio}
        options={aspectOptions}
        onChange={(aspectRatio) => setParams({ aspectRatio })}
      />
      <OptionChip
        menu="option"
        icon={<TuneIcon fontSize="small" />}
        label={t("i18n-next54.composer.strength", { value: params.strength.toFixed(2) })}
        header={t("i18n-next54.composer.editStrength")}
        value={params.strength}
        options={STRENGTH_OPTIONS}
        onChange={(strength) => setParams({ strength })}
      />
      <OptionChip
        menu="option"
        icon={<LayersIcon fontSize="small" />}
        label={t("i18n-next54.composer.steps", { count: params.numInferenceSteps })}
        header={t("i18n-next54.composer.inferenceSteps")}
        value={params.numInferenceSteps}
        options={STEPS_OPTIONS}
        onChange={(numInferenceSteps) => setParams({ numInferenceSteps })}
      />
      <OptionChip
        menu="option"
        icon={<AppsIcon fontSize="small" />}
        label={`${params.variations}`}
        header={t("i18n-next54.composer.numberOfVariations")}
        value={params.variations}
        options={VARIATIONS_OPTIONS}
        onChange={(variations) => setParams({ variations })}
      />
    </>
  );
}

function VideoModeChips({ openModelPickerRef }: ClusterProps) {
  const { t } = useTranslation();
  const params = useMediaGenerationStore((s) => s.video);
  const setParams = useMediaGenerationStore((s) => s.setVideoParams);
  const addRecentModel = useModelPreferencesStore((s) => s.addRecent);
  const { durationOptions, resolutionOptions, aspectOptions } = useMemo(
    () => buildVideoModelOptions(params.model),
    [params.model]
  );

  return (
    <>
      <ModelChip
        openRef={openModelPickerRef}
        icon={<MovieIcon fontSize="small" />}
        label={params.model?.name || t("i18n-next54.composer.selectVideoModel")}
        picker={{
          kind: "video",
          task: "text_to_video",
          onPick: (model) => {
            setParams(videoModelPatch(model, params));
            addRecentModel(recentModelEntry(model));
          }
        }}
      />
      <OptionChip
        menu="option"
        icon={<AccessTimeIcon fontSize="small" />}
        label={t("i18n-next54.composer.durationSeconds", { count: params.duration })}
        value={params.duration}
        options={durationOptions}
        onChange={(duration) => setParams({ duration })}
      />
      <OptionChip
        menu="option"
        icon={<DisplaySettingsIcon fontSize="small" />}
        label={params.resolution}
        header={t("i18n-next54.composer.videoResolution")}
        value={params.resolution}
        options={resolutionOptions}
        onChange={(resolution) => setParams({ resolution })}
      />
      <OptionChip
        menu="aspect"
        icon={<AspectRatioIcon fontSize="small" />}
        label={params.aspectRatio}
        value={params.aspectRatio}
        options={aspectOptions}
        onChange={(aspectRatio) => setParams({ aspectRatio })}
      />
    </>
  );
}

function ImageToVideoModeChips({ openModelPickerRef }: ClusterProps) {
  const { t } = useTranslation();
  const params = useMediaGenerationStore((s) => s.imageToVideo);
  const setParams = useMediaGenerationStore((s) => s.setImageToVideoParams);
  const addRecentModel = useModelPreferencesStore((s) => s.addRecent);
  const { durationOptions, resolutionOptions, aspectOptions } = useMemo(
    () => buildVideoModelOptions(params.model),
    [params.model]
  );

  return (
    <>
      <ModelChip
        openRef={openModelPickerRef}
        icon={<MovieFilterIcon fontSize="small" />}
        label={params.model?.name || t("i18n-next54.composer.selectI2VModel")}
        picker={{
          kind: "video",
          task: "image_to_video",
          onPick: (model) => {
            const constraints = videoModelConstraints(model);
            setParams({
              model: {
                type: "video_model",
                id: model.id,
                provider: model.provider,
                name: model.name || "",
                ...constraints
              },
              duration: clampToAllowed(params.duration, constraints.durations),
              resolution: clampToAllowed(
                params.resolution,
                constraints.resolutions
              ),
              aspectRatio: clampToAllowed(
                params.aspectRatio,
                constraints.aspectRatios
              )
            });
            addRecentModel(recentModelEntry(model));
          }
        }}
      />
      <OptionChip
        menu="option"
        icon={<AccessTimeIcon fontSize="small" />}
        label={`${params.duration} Sec`}
        header={t("i18n-next54.composer.clipDuration")}
        value={params.duration}
        options={durationOptions}
        onChange={(duration) => setParams({ duration })}
      />
      <OptionChip
        menu="option"
        icon={<DisplaySettingsIcon fontSize="small" />}
        label={params.resolution}
        header={t("i18n-next54.composer.videoResolution")}
        value={params.resolution}
        options={resolutionOptions}
        onChange={(resolution) => setParams({ resolution })}
      />
      <OptionChip
        menu="aspect"
        icon={<AspectRatioIcon fontSize="small" />}
        label={params.aspectRatio}
        value={params.aspectRatio}
        options={aspectOptions}
        onChange={(aspectRatio) => setParams({ aspectRatio })}
      />
      <OptionChip
        menu="option"
        icon={<LayersIcon fontSize="small" />}
        label={t("i18n-next54.composer.steps", { count: params.numInferenceSteps })}
        header={t("i18n-next54.composer.inferenceSteps")}
        value={params.numInferenceSteps}
        options={STEPS_OPTIONS}
        onChange={(numInferenceSteps) => setParams({ numInferenceSteps })}
      />
    </>
  );
}

function ReferenceToVideoModeChips({ openModelPickerRef }: ClusterProps) {
  const { t } = useTranslation();
  const referenceAudioOptions: MediaOption<string>[] = [
    { id: "off", label: t("i18n-next54.composer.modelAudio"), description: t("i18n-next54.composer.modelAudioDescription"), icon: <VolumeUpIcon fontSize="small" /> },
    { id: "on", label: t("i18n-next54.composer.referenceAudio"), description: t("i18n-next54.composer.referenceAudioDescription"), icon: <VolumeUpIcon fontSize="small" /> }
  ];
  const params = useMediaGenerationStore((s) => s.referenceToVideo);
  const setParams = useMediaGenerationStore((s) => s.setReferenceToVideoParams);
  const addRecentModel = useModelPreferencesStore((s) => s.addRecent);
  const { durationOptions, resolutionOptions, aspectOptions } = useMemo(
    () => buildVideoModelOptions(params.model),
    [params.model]
  );

  return (
    <>
      <ModelChip
        openRef={openModelPickerRef}
        icon={<BurstModeIcon fontSize="small" />}
        label={params.model?.name || t("i18n-next54.composer.selectReferenceModel")}
        picker={{
          kind: "video",
          task: "reference_to_video",
          onPick: (model) => {
            setParams(videoModelPatch(model, params));
            addRecentModel(recentModelEntry(model));
          }
        }}
      />
      <OptionChip
        menu="option"
        icon={<AccessTimeIcon fontSize="small" />}
        label={t("i18n-next54.composer.durationSeconds", { count: params.duration })}
        header={t("i18n-next54.composer.clipDuration")}
        value={params.duration}
        options={durationOptions}
        onChange={(duration) => setParams({ duration })}
      />
      <OptionChip
        menu="option"
        icon={<DisplaySettingsIcon fontSize="small" />}
        label={params.resolution}
        header={t("i18n-next54.composer.videoResolution")}
        value={params.resolution}
        options={resolutionOptions}
        onChange={(resolution) => setParams({ resolution })}
      />
      <OptionChip
        menu="aspect"
        icon={<AspectRatioIcon fontSize="small" />}
        label={params.aspectRatio}
        value={params.aspectRatio}
        options={aspectOptions}
        onChange={(aspectRatio) => setParams({ aspectRatio })}
      />
      <OptionChip
        menu="option"
        icon={<VolumeUpIcon fontSize="small" />}
        label={params.useReferenceVideoAudio ? t("i18n-next54.composer.referenceAudio") : t("i18n-next54.composer.modelAudio")}
        header={t("i18n-next54.composer.audioSource")}
        value={params.useReferenceVideoAudio ? "on" : "off"}
        options={referenceAudioOptions}
        onChange={(value) =>
          setParams({ useReferenceVideoAudio: value === "on" })
        }
      />
    </>
  );
}

function AudioModeChips({ openModelPickerRef }: ClusterProps) {
  const { t } = useTranslation();
  const params = useMediaGenerationStore((s) => s.audio);
  const setParams = useMediaGenerationStore((s) => s.setAudioParams);
  const addRecentModel = useModelPreferencesStore((s) => s.addRecent);
  const voiceOptions = useMemo<MediaOption<string>[]>(() => {
    const fromModel = params.model?.voices ?? [];
    const merged = Array.from(
      new Set(fromModel.length > 0 ? fromModel : DEFAULT_TTS_VOICES)
    );
    return merged.map((id) => ({
      id,
      label: id.charAt(0).toUpperCase() + id.slice(1),
      icon: <RecordVoiceOverIcon fontSize="small" />
    }));
  }, [params.model]);

  return (
    <>
      <ModelChip
        openRef={openModelPickerRef}
        icon={<GraphicEqIcon fontSize="small" />}
        label={params.model?.name || t("i18n-next54.composer.selectTTSModel")}
        picker={{
          kind: "tts",
          onPick: (model) => {
            setParams(audioModelPatch(model, params.voice));
            addRecentModel(recentModelEntry(model));
          }
        }}
      />
      <OptionChip
        menu="option"
        icon={<RecordVoiceOverIcon fontSize="small" />}
        label={
          params.voice
            ? params.voice.charAt(0).toUpperCase() + params.voice.slice(1)
            : t("i18n-next54.composer.voiceLabel")
        }
        header={t("i18n-next54.composer.voiceLabel")}
        value={params.voice}
        options={voiceOptions}
        onChange={(voice) => setParams({ voice })}
      />
      <OptionChip
        menu="option"
        icon={<SpeedIcon fontSize="small" />}
        label={`${params.speed}x`}
        header={t("i18n-next54.composer.speechRate")}
        value={params.speed}
        options={SPEED_OPTIONS}
        onChange={(speed) => setParams({ speed })}
      />
      <OptionChip
        menu="option"
        icon={<AudiotrackIcon fontSize="small" />}
        label={params.format.toUpperCase()}
        header={t("i18n-next54.composer.audioFormat")}
        value={params.format}
        options={AUDIO_FORMAT_OPTIONS}
        onChange={(format) => setParams({ format })}
      />
    </>
  );
}

export function ModeChips({ mode, openModelPickerRef }: ModeChipsProps) {
  if (mode === "image") {
    return <ImageModeChips openModelPickerRef={openModelPickerRef} />;
  }
  if (mode === "image_edit") {
    return <ImageEditModeChips openModelPickerRef={openModelPickerRef} />;
  }
  if (mode === "video") {
    return <VideoModeChips openModelPickerRef={openModelPickerRef} />;
  }
  if (mode === "image_to_video") {
    return <ImageToVideoModeChips openModelPickerRef={openModelPickerRef} />;
  }
  if (mode === "reference_to_video") {
    return (
      <ReferenceToVideoModeChips openModelPickerRef={openModelPickerRef} />
    );
  }
  if (mode === "music")
    return <MusicModeChips openModelPickerRef={openModelPickerRef} />;
  if (mode === "audio") {
    return <AudioModeChips openModelPickerRef={openModelPickerRef} />;
  }
  return null;
}

export default ModeChips;
