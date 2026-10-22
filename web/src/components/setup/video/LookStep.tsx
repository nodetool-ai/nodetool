/**
 * Step 3 of the video flow — the look (PRD § 8.3).
 *
 * Aspect, the video model, whether there is a voice and whether there is music.
 * The step body is pickers; the primary button lives on the `SetupFlow` shell,
 * so `useLookStep` hands the flow config what that button needs — the price
 * beside it and the generate action behind it — while the spend stays here with
 * the pickers it belongs to.
 *
 * A new draft seeds its model and voice once from `lastModelStore` (the voice
 * falls back to the default speech model), then owns
 * those choices in `setup.generation_settings`. The global store remains the
 * default for the next draft, never the authority for one already in progress.
 *
 * Sample clips are fetched on first use, never shipped (R5) — see
 * `modelSamples.ts`.
 */

import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  AlertBanner,
  Box,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  FormField,
  GAP,
  LabeledSwitch,
  LoadingSpinner,
  SelectField,
  Text
} from "../../ui_primitives";
import { SETUP_FIELD_WIDTH } from "../layout";
import { ASPECT_OPTIONS, aspectOf } from "../../storyboard/aspectOptions";
import { PresetTileGrid, type PresetTile } from "../PresetTileGrid";
import ReportBugButton from "../../support/ReportBugButton";
import VideoModelSelect from "../../properties/VideoModelSelect";
import TTSModelSelect from "../../properties/TTSModelSelect";
import type { TTSModelValue, VideoModelValue } from "../../../stores/ApiTypes";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useLastModelStore } from "../../../stores/lastModelStore";
import useModelPreferencesStore from "../../../stores/ModelPreferencesStore";
import { useTTSModelsByProvider } from "../../../hooks/useModelsByProvider";
import { openProviderOnboarding } from "../../../stores/ProviderOnboardingStore";
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

/** The exact request manifest and its priced portion, beside the paid action. */
export const videoCommitmentDetail = (
  estimate: NonNullable<ReturnType<typeof useBeatPlanCostEstimate>>,
  t: ReturnType<typeof useTranslation>["t"]
): string => {
  const parts = [
    t("pass3_13.video.look.commitment.destinations", {
      count: estimate.destinationCount
    }),
    t("pass3_13.video.look.commitment.videoTakes", {
      count: estimate.videoRequestCount
    })
  ];
  if (estimate.voiceRequestCount > 0) {
    parts.push(
      t("pass3_13.video.look.commitment.voiceRequests", {
        count: estimate.voiceRequestCount
      })
    );
  }
  if (estimate.videoRequestCount + estimate.voiceRequestCount === 0) {
    parts.push(
      t("pass3_13.video.look.commitment.noGenerationRequests"),
      t("pass3_13.video.look.commitment.noGenerationCost")
    );
  } else if (estimate.pricedCount === 0) {
    parts.push(
      t("pass3_13.video.look.commitment.costUnknown"),
      t("pass3_13.video.look.commitment.unpricedRequests", {
        count: estimate.unpricedCount
      })
    );
  } else if (estimate.unpricedCount > 0) {
    parts.push(
      t("pass3_13.video.look.commitment.knownSubtotal", {
        amount: estimate.label
      }),
      t("pass3_13.video.look.commitment.unpricedRequests", {
        count: estimate.unpricedCount
      })
    );
  } else {
    parts.push(
      t("pass3_13.video.look.commitment.about", { amount: estimate.label })
    );
  }
  return parts.join(" · ");
};

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
  /** The exact request commitment, including a zero-generation source edit. */
  primaryDetail: string;
  /** Create the clips, enqueue the jobs, hand the timeline back. */
  generate: (signal?: AbortSignal) => Promise<void>;
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

interface DraftGenerationSettings {
  video?: { provider: string; model: string };
  voice?: { provider: string; model: string; voice: string };
}

const isModelChoice = (
  value: unknown
): value is { provider: string; model: string } =>
  typeof value === "object" &&
  value !== null &&
  "provider" in value &&
  typeof value.provider === "string" &&
  "model" in value &&
  typeof value.model === "string";

const isDraftGenerationSettings = (
  value: unknown
): value is DraftGenerationSettings =>
  typeof value === "object" &&
  value !== null &&
  (!("video" in value) ||
    value.video === undefined ||
    isModelChoice(value.video)) &&
  (!("voice" in value) ||
    value.voice === undefined ||
    (isModelChoice(value.voice) &&
      "voice" in value.voice &&
      typeof value.voice.voice === "string"));

/**
 * The voice a new draft starts with: the one last picked in this flow, else
 * the first voice of the default speech model, which is set once a provider
 * that reads aloud is connected (study-10 D1).
 */
const useSeedVoice = (): {
  voice: DraftGenerationSettings["voice"];
  pending: boolean;
} => {
  const rememberedVoice = useLastModelStore((state) => state.byKind.audio);
  const ttsDefault = useModelPreferencesStore(
    (state) => state.defaults["tts_model"]
  );
  const { models, isLoading } = useTTSModelsByProvider();
  return useMemo(() => {
    if (
      rememberedVoice?.provider &&
      rememberedVoice.model &&
      rememberedVoice.voice
    ) {
      return {
        voice: {
          provider: rememberedVoice.provider,
          model: rememberedVoice.model,
          voice: rememberedVoice.voice
        },
        pending: false
      };
    }
    if (!ttsDefault) {
      return { voice: undefined, pending: false };
    }
    if (isLoading) {
      return { voice: undefined, pending: true };
    }
    const model = models.find(
      (m) => m.id === ttsDefault.id && m.provider === ttsDefault.provider
    );
    const voice = model?.voices?.[0];
    return {
      voice: voice
        ? { provider: ttsDefault.provider, model: ttsDefault.id, voice }
        : undefined,
      pending: false
    };
  }, [isLoading, models, rememberedVoice, ttsDefault]);
};

/** Seed once from the global preference, then read only this document. */
export function useDraftGenerationSettings(): DraftGenerationSettings {
  const setup = useTimelineStore((state) => state.setup);
  const storedValue = setup?.generation_settings;
  const stored = isDraftGenerationSettings(storedValue)
    ? storedValue
    : undefined;
  const setSetup = useTimelineStore((state) => state.setSetup);
  const rememberedVideo = useLastModelStore((state) => state.byKind.video);
  const seedVoice = useSeedVoice();

  const seeded = useMemo<DraftGenerationSettings>(() => {
    const next: DraftGenerationSettings = {};
    if (rememberedVideo?.provider && rememberedVideo.model) {
      next.video = {
        provider: rememberedVideo.provider,
        model: rememberedVideo.model
      };
    }
    if (seedVoice.voice) {
      next.voice = seedVoice.voice;
    }
    return next;
  }, [rememberedVideo, seedVoice.voice]);

  useEffect(() => {
    if (
      setup === null ||
      setup.stage === "done" ||
      stored !== undefined ||
      seedVoice.pending
    ) {
      return;
    }
    setSetup({ generation_settings: seeded });
  }, [seedVoice.pending, seeded, setSetup, setup, stored]);

  if (stored !== undefined) {
    return stored;
  }
  if (setup === null || setup.stage === "done") {
    return {};
  }
  return seeded;
}

/** Whether any beat carries words for the Voiceover to read. */
const beatsHaveLines = (
  beats: readonly { voiceover?: string | null }[] | undefined
): boolean =>
  (beats ?? []).some((beat) => (beat.voiceover ?? "").trim().length > 0);

export function useLookStep({
  voiceOn,
  musicOn
}: LookStepChoices): LookStepControls {
  const { t } = useTranslation();
  const beats = useTimelineStore((state) => state.setup?.beats);
  const width = useTimelineStore((state) => state.width);
  const height = useTimelineStore((state) => state.height);
  const generateFromBeats = useGenerateFromBeats();
  const { voiceLane } = useLanes();
  const settings = useDraftGenerationSettings();
  const video = settings.video;
  const audio = settings.voice;
  const clipModels = useClipModelAvailability();
  const voices = useVoiceAvailability();
  // A switched-on Voiceover with no usable voice used to be silently turned
  // off at generate time, so the cut came out mute while the switch still read
  // on. The switch is the creator's word now: it holds the step until they
  // pick a voice or switch it off themselves (F11).
  const needsVideoGeneration =
    beats?.some((beat) => !beat.source_clip_id) ?? false;
  const voiceWanted = voiceLane && voiceOn;
  // With no line to read there is nothing to voice, so no voice is required.
  const needsVoiceGeneration = voiceWanted && beatsHaveLines(beats);
  const voiced =
    needsVoiceGeneration && !!audio?.voice && isAvailable(voices, audio.voice);

  const estimate = useBeatPlanCostEstimate(beats ?? [], {
    aspectRatio: aspectOf(width, height),
    videoProvider: video?.provider,
    videoModel: video?.model,
    voiceProvider: audio?.provider,
    voiceModel: audio?.model,
    voiced
  });

  const generate = useCallback(
    async (signal?: AbortSignal) => {
      // The two toggles are the only look choices that are not already on the
      // document, so they are passed rather than re-derived. Music is not passed
      // at all: see MUSIC_AVAILABLE.
      await generateFromBeats({
        provider: video?.provider,
        model: video?.model,
        voiceover: voiced,
        voice: audio?.voice,
        voiceProvider: audio?.provider,
        voiceModel: audio?.model,
        music: MUSIC_AVAILABLE && musicOn,
        signal
      });
    },
    [audio, generateFromBeats, musicOn, video, voiced]
  );

  const clipCount = beats?.length ?? 0;
  const primaryDetail = estimate
    ? videoCommitmentDetail(estimate, t)
    : t("pass3_13.video.look.commitment.costUnknownUntilFirstClip");

  const blockedReason = firstBlocker([
    [clipCount === 0, t("pass3_13.video.look.blockers.planBeatsFirst")],
    [
      needsVideoGeneration && clipModels.noProvider,
      t("pass3_13.video.look.blockers.videoProviderMissing")
    ],
    [
      needsVideoGeneration && !video?.model,
      t("pass3_13.video.look.blockers.pickVideoModel")
    ],
    [
      needsVideoGeneration &&
        !!video?.model &&
        !isAvailable(clipModels, video.model),
      t("pass3_13.video.look.blockers.videoModelUnavailable")
    ],
    // A remembered model can be one the providers have since dropped, so
    // Generate waits for the list that can say so. A list that failed keeps
    // Generate live and names the unchecked model above the grid instead.
    [
      needsVideoGeneration && !!video?.model && clipModels.loading,
      t("pass3_13.video.look.blockers.checkingVideoModel")
    ],
    [
      needsVoiceGeneration && !audio?.voice,
      t("pass3_13.video.look.blockers.pickVoiceOrDisable")
    ],
    [
      needsVoiceGeneration && !!audio?.voice && voices.loading,
      t("pass3_13.video.look.blockers.checkingVoice")
    ],
    [
      needsVoiceGeneration &&
        !!audio?.voice &&
        !isAvailable(voices, audio.voice),
      t("pass3_13.video.look.blockers.voiceUnavailable")
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
  /** The picked model's name, which a failed list could not check. */
  pickedLabel?: string;
}> = ({ availability, kind, noCompatible, pickedLabel }) => {
  const { t } = useTranslation();
  const connect = useCallback(() => {
    openProviderOnboarding(
      kind === "video"
        ? {
            capability: "text_to_video",
            reason: t("pass3_13.video.look.connectReasons.video")
          }
        : {
            capability: "text_to_speech",
            reason: t("pass3_13.video.look.connectReasons.voice")
          }
    );
  }, [kind, t]);

  if (availability.loading) {
    return (
      <FlexRow gap={GAP.tight} align="center" role="status">
        <LoadingSpinner size="small" inline />
        <Caption color="secondary">
          {kind === "video"
            ? t("pass3_13.video.look.availability.checkingVideo")
            : t("pass3_13.video.look.availability.checkingVoices")}
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
              ? t("pass3_13.video.look.availability.videoReadFailed")
              : t("pass3_13.video.look.availability.voicesReadFailed")}
          </Text>
          {pickedLabel ? (
            <Text size="normal" component="span">
              {t("pass3_13.video.look.availability.pickedModelUnchecked", {
                model: pickedLabel
              })}
            </Text>
          ) : null}
          <EditorButton variant="outlined" onClick={availability.refetch}>
            {t("pass3_13.video.look.actions.tryAgain")}
          </EditorButton>
          <ReportBugButton
            context={{
              source: "provider-call",
              summary:
                kind === "video"
                  ? t("pass3_13.video.look.errorSummaries.videoList")
                  : t("pass3_13.video.look.errorSummaries.voiceList"),
              errorText: availability.error
            }}
          />
        </FlexRow>
      </AlertBanner>
    );
  }
  if (availability.noProvider) {
    return (
      <AlertBanner severity="warning">
        <FlexRow gap={GAP.normal} align="center" wrap>
          <Text size="normal" component="span">
            {kind === "video"
              ? t("pass3_13.video.look.availability.noVideoProvider")
              : t("pass3_13.video.look.availability.noVoiceProvider")}
          </Text>
          <EditorButton variant="outlined" onClick={connect}>
            {t("pass3_13.video.look.actions.connectProvider")}
          </EditorButton>
        </FlexRow>
      </AlertBanner>
    );
  }
  if (noCompatible) {
    return (
      <AlertBanner severity="warning">
        <FlexRow gap={GAP.normal} align="center" wrap>
          <Text size="normal" component="span">
            {kind === "video"
              ? t("pass3_13.video.look.availability.noVideoModel")
              : t("pass3_13.video.look.availability.noVoice")}
          </Text>
          <EditorButton variant="outlined" onClick={connect}>
            {t("pass3_13.video.look.actions.connectProvider")}
          </EditorButton>
        </FlexRow>
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
  /** Why the last Generate stopped after the shell had handed over. */
  error?: string;
}

const LookStepInternal: React.FC<LookStepProps> = ({
  voiceOn,
  musicOn,
  onVoiceChange,
  onMusicChange,
  musicAvailable,
  error
}) => {
  const { t } = useTranslation();
  const width = useTimelineStore((state) => state.width);
  const height = useTimelineStore((state) => state.height);
  const hasLines = useTimelineStore((state) =>
    beatsHaveLines(state.setup?.beats)
  );
  // A switched-on Voiceover with no lines asks for no voice: it explains the
  // gap instead of offering pickers that change nothing.
  const readsLines = voiceOn && hasLines;
  // The frame is a top-level sequence field, not part of the document autosave
  // persists, so it goes through the hook that writes those.
  const { save: saveProjectSettings } = useTimelineProjectSettings();
  const remember = useLastModelStore((state) => state.remember);
  const settings = useDraftGenerationSettings();
  const setSetup = useTimelineStore((state) => state.setSetup);
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
        disabledReason: t("pass3_13.video.look.tileUnavailable.model")
      })),
    [clipModels, samples, t]
  );

  const voiceTiles = useMemo<PresetTile[]>(
    () =>
      STUDIO_VOICES.map((voice) => ({
        id: voice.id,
        title: voice.label,
        disabled: !isAvailable(voices, voice.id),
        disabledReason: t("pass3_13.video.look.tileUnavailable.voice")
      })),
    [voices, t]
  );

  // The curated tiles are NodeTool's own managed models, so only the cloud
  // `nodetool` provider ever reports them. A desktop, self-hosted or BYOK
  // install offers none of them however many video providers it has, and the
  // step used to read that as a setup problem and hold the button. Where no
  // curated tile survives, the pickers fall back to what the configured
  // providers do report (the same answer `directorModel.ts` gives for the
  // model that drafts the beats).
  const curatedModelOffered = modelTiles.some((tile) => !tile.disabled);
  const curatedVoiceOffered = voiceTiles.some((tile) => !tile.disabled);

  // The fallback pickers are the shared model selects. The TTS select reads
  // the voice off `selected_voice`, so the draft's pick is rebuilt as one.
  const voiceValue = useMemo<TTSModelValue | "">(() => {
    const current = settings.voice;
    return current
      ? {
          type: "tts_model",
          id: current.model,
          provider: current.provider as TTSModelValue["provider"],
          name: "",
          voices: [],
          selected_voice: current.voice
        }
      : "";
  }, [settings.voice]);

  // The providers answered, nothing curated survived, and they offer nothing
  // of their own either: the fourth state, and the only one that is a gap in
  // the setup rather than in what this flow curates.
  const noCompatibleModel =
    !curatedModelOffered && clipModels.reported.length === 0;
  const noCompatibleVoice =
    !curatedVoiceOffered && voices.reported.length === 0;

  const pickedVoice = settings.voice?.voice;
  const pickedModel = settings.video?.model;
  const pickedModelLabel = pickedModel
    ? (STUDIO_CLIP_MODELS.find((option) => option.id === pickedModel)?.label ??
      pickedModel)
    : undefined;
  // A curated voice label reads "Ada — warm, female". The name goes in a sentence.
  const pickedVoiceLabel = pickedVoice
    ? (STUDIO_VOICES.find((option) => option.id === pickedVoice)?.label.split(
        " — "
      )[0] ?? pickedVoice)
    : undefined;
  // The reason the final button is dead belongs beside the control that fixes
  // it as well as beside the button (F11).
  const voiceNote =
    voiceOn && !hasLines
      ? t("pass3_13.video.look.voiceNotes.noLine")
      : voiceOn && !pickedVoice
        ? t("pass3_13.video.look.voiceNotes.pickVoice")
        : voiceOn && pickedVoice && !isAvailable(voices, pickedVoice)
          ? t("pass3_13.video.look.voiceNotes.voiceUnavailable")
          : null;

  const handleAspect = useCallback(
    (value: string) => void saveProjectSettings(dimensionsForAspect(value)),
    [saveProjectSettings]
  );

  const applyModel = useCallback(
    (provider: string, model: string) => {
      setSetup({
        generation_settings: { ...settings, video: { provider, model } }
      });
      remember("video", { provider, model });
    },
    [remember, setSetup, settings]
  );

  const applyVoice = useCallback(
    (provider: string, model: string, voice: string) => {
      setSetup({
        generation_settings: {
          ...settings,
          voice: { provider, model, voice }
        }
      });
      remember("audio", { provider, model, voice });
      onVoiceChange(true);
    },
    [onVoiceChange, remember, setSetup, settings]
  );

  const handleModel = useCallback(
    (id: string) => {
      const picked = CLIP_MODELS.find((option) => option.id === id);
      if (picked) {
        applyModel(picked.value.provider, picked.value.id);
      }
    },
    [applyModel]
  );

  const handleReportedModel = useCallback(
    (value: VideoModelValue) => applyModel(value.provider, value.id),
    [applyModel]
  );

  const handleVoice = useCallback(
    (id: string) => {
      const picked = STUDIO_VOICES.find((option) => option.id === id);
      if (picked) {
        applyVoice(picked.value.provider, picked.modelId, id);
      }
    },
    [applyVoice]
  );

  // A model with no preset voices hands back no voice. Applying it would
  // leave the step asking for a voice the creator thinks they just picked.
  const [noPresetVoice, setNoPresetVoice] = useState(false);
  const handleReportedVoice = useCallback(
    (value: TTSModelValue) => {
      if (!value.selected_voice) {
        setNoPresetVoice(true);
        return;
      }
      setNoPresetVoice(false);
      applyVoice(value.provider, value.id, value.selected_voice);
    },
    [applyVoice]
  );

  return (
    <FlexColumn gap={GAP.comfortable}>
      <FlexColumn gap={GAP.tight}>
        <Text size="big" component="h2">
          {t("pass3_13.video.look.title")}
        </Text>
        <Text size="normal" color="secondary">
          {t("pass3_13.video.look.description")}
        </Text>
      </FlexColumn>

      {error ? (
        <AlertBanner
          severity="error"
          title={t("pass3_13.video.look.errors.clipsDidNotStart")}
        >
          <FlexRow gap={GAP.normal} align="center" wrap>
            <Text size="normal" component="span">
              {error}
            </Text>
            <ReportBugButton
              context={{
                source: "operation-failure",
                summary: t("pass3_13.video.look.errors.clipsDidNotStart"),
                errorText: error
              }}
            />
          </FlexRow>
        </AlertBanner>
      ) : null}

      <Box sx={{ maxWidth: SETUP_FIELD_WIDTH }}>
        <SelectField
          label={t("pass3_13.video.look.fields.aspectRatio")}
          value={aspectOf(width, height)}
          onChange={handleAspect}
          options={ASPECT_OPTIONS.map((option) => ({
            ...option,
            label: t(
              `pass3_13.video.look.aspectOptions.${option.value.replace(":", "_")}`
            )
          }))}
        />
      </Box>

      <FormField label={t("pass3_13.video.look.fields.videoModel")}>
        <FlexColumn gap={GAP.normal}>
          <ModelAvailabilityNote
            availability={clipModels}
            kind="video"
            noCompatible={noCompatibleModel}
            pickedLabel={pickedModelLabel}
          />
          {curatedModelOffered ? (
            /* The samples are fetched, not shipped, so the preview area is
               held open from the first paint rather than appearing under the
               reader. */
            <PresetTileGrid
              label={t("pass3_13.video.look.fields.videoModel")}
              presets={modelTiles}
              selectedId={settings.video?.model ?? null}
              onSelect={handleModel}
              onAddOwn={() => undefined}
              addOwnLabel={t("pass3_13.video.look.actions.moreModels")}
              addOwnDisabled
              addOwnDisabledReason={t(
                "pass3_13.video.look.actions.allModelsInInspector"
              )}
              reservePreview
            />
          ) : clipModels.reported.length > 0 ? (
            <FormField
              helperText={t("pass3_13.video.look.fields.videoModelHelp")}
              sx={{ maxWidth: SETUP_FIELD_WIDTH }}
            >
              <VideoModelSelect
                value={settings.video?.model ?? ""}
                provider={settings.video?.provider}
                task="text_to_video"
                onChange={handleReportedModel}
              />
            </FormField>
          ) : null}
        </FlexColumn>
      </FormField>

      {voiceLane ? (
        <FlexColumn gap={GAP.comfortable}>
          <LabeledSwitch
            label={t("pass3_13.video.look.fields.voiceover")}
            description={t("pass3_13.video.look.fields.voiceoverDescription")}
            checked={voiceOn}
            onChange={onVoiceChange}
          />
          {voiceOn ? (
            <>
              {readsLines ? (
                <ModelAvailabilityNote
                  availability={voices}
                  kind="voice"
                  noCompatible={noCompatibleVoice}
                  pickedLabel={pickedVoiceLabel}
                />
              ) : null}
              {voiceNote ? (
                <Caption color="secondary" role="status">
                  {voiceNote}
                </Caption>
              ) : null}
            </>
          ) : null}
          {readsLines && curatedVoiceOffered ? (
            <PresetTileGrid
              label={t("pass3_13.video.look.fields.voice")}
              presets={voiceTiles}
              selectedId={settings.voice?.voice ?? null}
              onSelect={handleVoice}
              onAddOwn={() => undefined}
              addOwnLabel={t("pass3_13.video.look.actions.moreVoices")}
              addOwnDisabled
              addOwnDisabledReason={t(
                "pass3_13.video.look.actions.allVoicesInInspector"
              )}
              aspectRatio="1/1"
            />
          ) : null}
          {readsLines && !curatedVoiceOffered && voices.reported.length > 0 ? (
            <FormField
              label={t("pass3_13.video.look.fields.voiceModel")}
              helperText={t("pass3_13.video.look.fields.voiceModelHelp")}
              error={
                noPresetVoice
                  ? t("pass3_13.video.look.errors.noPresetVoices")
                  : undefined
              }
              sx={{ maxWidth: SETUP_FIELD_WIDTH }}
            >
              <TTSModelSelect
                value={voiceValue}
                onChange={handleReportedVoice}
              />
            </FormField>
          ) : null}
        </FlexColumn>
      ) : null}

      {musicLane ? (
        <LabeledSwitch
          label={t("pass3_13.video.look.fields.music")}
          description={
            musicAvailable === false
              ? t("pass3_13.video.look.fields.musicUnavailable")
              : t("pass3_13.video.look.fields.musicDescription")
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
