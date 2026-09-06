/**
 * Step 3 of the video flow — the look (PRD § 8.3).
 *
 * Aspect, the video model, whether there is a voice and whether there is music.
 * The step body is pickers; the primary button lives on the `SetupFlow` shell,
 * so `useLookStep` hands the flow config what that button needs — the price
 * beside it and the generate action behind it — while the spend stays here with
 * the pickers it belongs to.
 *
 * Model and voice choices go through the same `lastModelStore` every other
 * direct-generation surface writes, rather than into a field of this flow's
 * own: the timeline's inspector reads them next, and a creator who picks a
 * model here should not have to pick it again in the editor.
 *
 * Sample clips are fetched on first use, never shipped (R5) — see
 * `modelSamples.ts`.
 */

import React, { memo, useCallback, useMemo } from "react";

import {
  FlexColumn,
  GAP,
  LabeledSwitch,
  SelectField,
  Text
} from "../../ui_primitives";
import { ASPECT_OPTIONS, aspectOf } from "../../storyboard/aspectOptions";
import { PresetTileGrid, type PresetTile } from "../PresetTileGrid";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useLastModelStore } from "../../../stores/lastModelStore";
import {
  STUDIO_CLIP_MODELS,
  STUDIO_VOICES,
  forTasks
} from "../../../studio/curatedModels";
import { useGenerateFromBeats } from "../../../hooks/timeline/useGenerateFromBeats";
import { useTimelineProjectSettings } from "../../../hooks/timeline/useTimelineProjectSettings";
import { useBeatPlanCostEstimate } from "../../../hooks/timeline/useBeatPlanCostEstimate";
import { videoFormatById } from "./formats";
import { useModelSamples } from "../modelSamples";

/** What the button says when no catalog figure covers the plan (PRD § 8.3). */
export const COST_UNKNOWN_TEXT = "cost unknown until the first clip returns";

/** The frame a ratio describes, keeping the long edge at 1920. */
export function dimensionsForAspect(aspect: string): {
  width: number;
  height: number;
} {
  const [w, h] = aspect.split(":").map((part) => Number.parseFloat(part));
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return { width: 1920, height: 1080 };
  }
  const long = 1920;
  return w >= h
    ? { width: long, height: Math.round((long * h) / w) }
    : { width: Math.round((long * w) / h), height: long };
}

const CLIP_MODELS = forTasks(STUDIO_CLIP_MODELS, "text_to_video");

/**
 * Whether the flow can generate a music bed.
 *
 * False, because nothing here can pick a music model: the curated catalog
 * (`NODETOOL_MODELS`) has `language`, `image`, `video` and `tts` kinds and no
 * music one, and the last-model store's "audio" bucket holds the TTS voice.
 * The toggle used to be offered anyway, which created a bed with no model that
 * `generateFromBeats` then left out of the queue — the flow finished on a
 * silent placeholder nothing would ever fill. Offered disabled, so the absence
 * is visible rather than a clip that never arrives.
 *
 * `generateFromBeats` still takes `musicProvider`/`musicModel`, and the agent
 * bridge's `generate_from_beats` can supply them; this flips to a real model
 * lookup once a music model is curated.
 */
const MUSIC_AVAILABLE = false;

export interface LookStepChoices {
  /** Read each beat's line over its clip. Off means no voiceover clip. */
  voiceOn: boolean;
  /** One bed under the whole cut. */
  musicOn: boolean;
}

export interface LookStepControls {
  /** False until there is a plan and a model to render it with. */
  canAdvance: boolean;
  /** The price, or the "unknown" line. Never absent — clips cost dollars. */
  primaryDetail: string;
  /** Create the clips, enqueue the jobs, hand the timeline back. */
  generate: () => Promise<void>;
  /**
   * Whether a bed can be rendered at all. The toggle is offered disabled
   * rather than hidden, so the absence reads as a gap in what NodeTool
   * curates rather than as a format that has no bed — and an enabled toggle
   * always produces one.
   */
  musicAvailable: boolean;
}

/**
 * Whether the flow offers a voice and a bed at all: the format's own lanes.
 * A trailer has no voiceover track, so it is not asked about one.
 */
const useLanes = () => {
  const formatId = useTimelineStore((state) => state.setup?.format);
  const format = videoFormatById(formatId);
  return {
    voiceLane: format?.tracks.some((track) => track.name === "Voiceover") ?? true,
    musicLane: format?.tracks.some((track) => track.name === "Music") ?? true
  };
};

export function useLookStep({
  voiceOn,
  musicOn
}: LookStepChoices): LookStepControls {
  const beats = useTimelineStore((state) => state.setup?.beats);
  const width = useTimelineStore((state) => state.width);
  const height = useTimelineStore((state) => state.height);
  const generateFromBeats = useGenerateFromBeats();
  const { voiceLane } = useLanes();
  // Read through the store so the estimate follows a model picked in the grid.
  const byKind = useLastModelStore((state) => state.byKind);
  const video = byKind.video;
  const audio = byKind.audio;
  const voiced = voiceLane && voiceOn && !!audio?.voice;

  const estimate = useBeatPlanCostEstimate(beats ?? [], {
    aspectRatio: aspectOf(width, height),
    videoProvider: video?.provider,
    videoModel: video?.model,
    voiceProvider: audio?.provider,
    voiceModel: audio?.model,
    voiced
  });

  const generate = useCallback(async () => {
    // The two toggles are the only look choices that are not already on the
    // document, so they are passed rather than re-derived. Music is not passed
    // at all: see MUSIC_AVAILABLE.
    await generateFromBeats({
      voiceover: voiced,
      voice: audio?.voice,
      music: MUSIC_AVAILABLE && musicOn
    });
  }, [audio?.voice, generateFromBeats, musicOn, voiced]);

  const clipCount = beats?.length ?? 0;
  const primaryDetail = estimate
    ? `${clipCount} clip${clipCount === 1 ? "" : "s"} · about ${estimate.label}`
    : COST_UNKNOWN_TEXT;

  return {
    canAdvance: clipCount > 0 && !!video?.model,
    primaryDetail,
    generate,
    musicAvailable: MUSIC_AVAILABLE
  };
}

export interface LookStepProps extends LookStepChoices {
  onVoiceChange: (on: boolean) => void;
  onMusicChange: (on: boolean) => void;
  /** From {@link LookStepControls}: false when no bed can be rendered. */
  musicAvailable?: boolean;
}

const LookStepInternal: React.FC<LookStepProps> = ({
  voiceOn,
  musicOn,
  onVoiceChange,
  onMusicChange,
  musicAvailable
}) => {
  const width = useTimelineStore((state) => state.width);
  const height = useTimelineStore((state) => state.height);
  // The frame is a top-level sequence field, not part of the document autosave
  // persists, so it goes through the hook that writes those.
  const { save: saveProjectSettings } = useTimelineProjectSettings();
  const remember = useLastModelStore((state) => state.remember);
  const byKind = useLastModelStore((state) => state.byKind);
  const { voiceLane, musicLane } = useLanes();

  const sampleIds = useMemo(() => CLIP_MODELS.map((option) => option.id), []);
  const samples = useModelSamples(sampleIds, "video");

  const modelTiles = useMemo<PresetTile[]>(
    () =>
      CLIP_MODELS.map((option) => ({
        id: option.id,
        title: option.label,
        video: samples[option.id]
      })),
    [samples]
  );

  const voiceTiles = useMemo<PresetTile[]>(
    () => STUDIO_VOICES.map((voice) => ({ id: voice.id, title: voice.label })),
    []
  );

  const handleAspect = useCallback(
    (value: string) => void saveProjectSettings(dimensionsForAspect(value)),
    [saveProjectSettings]
  );

  const handleModel = useCallback(
    (id: string) => {
      const picked = CLIP_MODELS.find((option) => option.id === id);
      if (picked) {
        remember("video", {
          provider: picked.value.provider,
          model: picked.value.id
        });
      }
    },
    [remember]
  );

  const handleVoice = useCallback(
    (id: string) => {
      const picked = STUDIO_VOICES.find((option) => option.id === id);
      if (picked) {
        remember("audio", {
          provider: picked.value.provider,
          model: picked.modelId,
          voice: id
        });
        onVoiceChange(true);
      }
    },
    [onVoiceChange, remember]
  );

  return (
    <FlexColumn gap={GAP.spacious}>
      <SelectField
        label="Aspect ratio"
        value={aspectOf(width, height)}
        onChange={handleAspect}
        options={ASPECT_OPTIONS}
      />

      <FlexColumn gap={GAP.normal}>
        <Text size="small" component="h3">
          Video model
        </Text>
        <PresetTileGrid
          label="Video model"
          presets={modelTiles}
          selectedId={byKind.video?.model ?? null}
          onSelect={handleModel}
          onAddOwn={() => undefined}
          addOwnLabel="More models in the editor"
          addOwnDisabled
          addOwnDisabledReason="The timeline's inspector offers every configured provider."
        />
      </FlexColumn>

      {voiceLane ? (
        <FlexColumn gap={GAP.normal}>
          <LabeledSwitch
            label="Voiceover"
            description="Reads each beat's line over its clip"
            checked={voiceOn}
            onChange={onVoiceChange}
          />
          {voiceOn ? (
            <PresetTileGrid
              label="Voice"
              presets={voiceTiles}
              selectedId={byKind.audio?.voice ?? null}
              onSelect={handleVoice}
              onAddOwn={() => undefined}
              addOwnLabel="More voices in the editor"
              addOwnDisabled
              addOwnDisabledReason="The timeline's inspector offers every configured voice."
              aspectRatio="1/1"
            />
          ) : null}
        </FlexColumn>
      ) : null}

      {musicLane ? (
        <LabeledSwitch
          label="Music"
          description={
            musicAvailable === false
              ? "Not available yet — no music model is curated"
              : "One bed under the whole cut"
          }
          checked={musicOn && musicAvailable !== false}
          disabled={musicAvailable === false}
          onChange={onMusicChange}
        />
      ) : null}
    </FlexColumn>
  );
};

export const LookStep = memo(LookStepInternal);
LookStep.displayName = "VideoLookStep";

export default LookStep;
