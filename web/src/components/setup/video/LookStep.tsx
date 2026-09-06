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
  AlertBanner,
  Box,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  GAP,
  LabeledSwitch,
  LoadingSpinner,
  SelectField,
  Text
} from "../../ui_primitives";
import { SETUP_FIELD_WIDTH } from "../layout";
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
import {
  isAvailable,
  useClipModelAvailability,
  useVoiceAvailability,
  type CuratedAvailability
} from "./modelAvailability";

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
  /** False until there is a plan and available models to render it with. */
  canAdvance: boolean;
  /** Why `canAdvance` is false, for the shell to show beside the button. */
  blockedReason: string | undefined;
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
    voiceLane:
      format?.tracks.some((track) => track.name === "Voiceover") ?? true,
    musicLane: format?.tracks.some((track) => track.name === "Music") ?? true
  };
};

/** The first reason that holds, or nothing when the step is ready to run. */
const firstBlocker = (
  checks: readonly (readonly [boolean, string])[]
): string | undefined => checks.find(([blocked]) => blocked)?.[1];

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
  const clipModels = useClipModelAvailability();
  const voices = useVoiceAvailability();
  // A switched-on Voiceover with no usable voice used to be silently turned
  // off at generate time, so the cut came out mute while the switch still read
  // on. The switch is the creator's word now: it holds the step until they
  // pick a voice or switch it off themselves (F11).
  const voiceWanted = voiceLane && voiceOn;
  const voiced =
    voiceWanted && !!audio?.voice && isAvailable(voices, audio.voice);

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

  const blockedReason = firstBlocker([
    [
      clipCount === 0,
      "Plan the beats first — there is nothing to render yet"
    ],
    [
      clipModels.noProvider,
      "No provider is set up to render video. Connect one in Settings."
    ],
    [!video?.model, "Pick a video model"],
    [
      !!video?.model && !isAvailable(clipModels, video.model),
      "Your providers do not offer that video model. Pick another."
    ],
    [voiceWanted && !audio?.voice, "Pick a voice, or switch Voiceover off"],
    [
      voiceWanted && !!audio?.voice && !isAvailable(voices, audio.voice),
      "Your providers do not offer that voice. Pick another, or switch Voiceover off."
    ]
  ]);

  return {
    canAdvance: blockedReason === undefined,
    blockedReason,
    primaryDetail,
    generate,
    musicAvailable: MUSIC_AVAILABLE
  };
}


/**
 * The state of a curated grid's provider lookup, above the grid: waiting,
 * failed with a way to ask again, or nothing configured to run it (F14).
 * Silent once the list is known — a working grid needs no note.
 */
const ModelAvailabilityNote: React.FC<{
  availability: CuratedAvailability;
  kind: "video" | "voice";
  /** True when the providers answered and none of the curated tiles survived. */
  noCompatible: boolean;
}> = ({ availability, kind, noCompatible }) => {
  if (availability.loading) {
    return (
      <FlexRow gap={GAP.tight} align="center" role="status">
        <LoadingSpinner size="small" inline />
        <Caption color="secondary">
          {kind === "video"
            ? "Checking which video models your providers offer…"
            : "Checking which voices your providers offer…"}
        </Caption>
      </FlexRow>
    );
  }
  if (availability.error) {
    return (
      <AlertBanner severity="error">
        <FlexRow gap={GAP.normal} align="center" wrap>
          <Text size="normal" component="span">
            {kind === "video"
              ? "Could not read the video models your providers offer."
              : "Could not read the voices your providers offer."}
          </Text>
          <EditorButton variant="outlined" onClick={availability.refetch}>
            Try again
          </EditorButton>
        </FlexRow>
      </AlertBanner>
    );
  }
  if (availability.noProvider) {
    return (
      <AlertBanner severity="warning">
        {kind === "video"
          ? "No provider is set up to render video. Connect one in Settings, then come back."
          : "No provider is set up to read lines aloud. Connect one in Settings, or switch Voiceover off."}
      </AlertBanner>
    );
  }
  if (noCompatible) {
    return (
      <AlertBanner severity="warning">
        {kind === "video"
          ? "Your providers offer no video model. Connect one that does, then come back."
          : "Your providers offer no voice. Connect one that does, or switch Voiceover off."}
      </AlertBanner>
    );
  }
  return null;
};

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
  const clipModels = useClipModelAvailability();
  const voices = useVoiceAvailability();

  const sampleIds = useMemo(() => CLIP_MODELS.map((option) => option.id), []);
  const samples = useModelSamples(sampleIds, "video");

  const modelTiles = useMemo<PresetTile[]>(
    () =>
      CLIP_MODELS.map((option) => ({
        id: option.id,
        title: option.label,
        video: samples[option.id],
        disabled: !isAvailable(clipModels, option.id),
        disabledReason: "Your providers do not offer this model."
      })),
    [clipModels, samples]
  );

  const voiceTiles = useMemo<PresetTile[]>(
    () =>
      STUDIO_VOICES.map((voice) => ({
        id: voice.id,
        title: voice.label,
        disabled: !isAvailable(voices, voice.id),
        disabledReason: "Your providers do not offer this voice."
      })),
    [voices]
  );

  // Every curated tile refused by the providers is the fourth state: they
  // answered, and none of what this flow offers survived.
  const noCompatibleModel = modelTiles.every((tile) => tile.disabled);
  const noCompatibleVoice = voiceTiles.every((tile) => tile.disabled);

  const pickedVoice = byKind.audio?.voice;
  // The reason the final button is dead belongs beside the control that fixes
  // it as well as beside the button (F11).
  const voiceNote =
    voiceOn && !pickedVoice
      ? "Pick a voice, or switch Voiceover off — nothing is read otherwise."
      : voiceOn && pickedVoice && !isAvailable(voices, pickedVoice)
        ? "Your providers do not offer the voice you picked. Pick another, or switch Voiceover off."
        : null;

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
      <FlexColumn gap={GAP.tight}>
        <Text size="big" component="h2">
          Choose your look
        </Text>
        <Text size="normal" color="secondary">
          The frame, the model that renders every beat, and whether the cut is
          spoken over. You can change all of it in the editor.
        </Text>
      </FlexColumn>

      <Box sx={{ maxWidth: SETUP_FIELD_WIDTH }}>
        <SelectField
          label="Aspect ratio"
          value={aspectOf(width, height)}
          onChange={handleAspect}
          options={ASPECT_OPTIONS}
        />
      </Box>

      <FlexColumn gap={GAP.normal}>
        <Text size="small" component="h3">
          Video model
        </Text>
        <ModelAvailabilityNote
          availability={clipModels}
          kind="video"
          noCompatible={noCompatibleModel}
        />
        {/* The samples are fetched, not shipped, so the preview area is held
            open from the first paint rather than appearing under the reader. */}
        <PresetTileGrid
          label="Video model"
          presets={modelTiles}
          selectedId={byKind.video?.model ?? null}
          onSelect={handleModel}
          onAddOwn={() => undefined}
          addOwnLabel="More models in the editor"
          addOwnDisabled
          addOwnDisabledReason="The timeline's inspector offers every configured provider."
          reservePreview
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
            <>
              <ModelAvailabilityNote
                availability={voices}
                kind="voice"
                noCompatible={noCompatibleVoice}
              />
              {voiceNote ? (
                <Caption color="secondary" role="status">
                  {voiceNote}
                </Caption>
              ) : null}
            </>
          ) : null}
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
              ? "Music generation is unavailable. Add an audio track in the editor."
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
