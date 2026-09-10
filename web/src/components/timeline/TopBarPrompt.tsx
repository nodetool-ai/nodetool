/** Quick video or speech generation at the timeline playhead. */

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useTheme } from "@mui/material/styles";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import RecordVoiceOverIcon from "@mui/icons-material/RecordVoiceOver";
import MovieIcon from "@mui/icons-material/Movie";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import AspectRatioIcon from "@mui/icons-material/CropOriginal";
import TvIcon from "@mui/icons-material/Tv";

import {
  useTimelineStore,
  useTimelineStoreApi
} from "../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../stores/timeline/TimelineUIStore";
import { useTimelinePlaybackStoreApi } from "../../stores/timeline/TimelineInstance";
import { useTimelineDirectGenJob } from "../../hooks/timeline/useTimelineDirectGenJob";
import { useLastDirectGenModel } from "../../hooks/timeline/useLastDirectGenModel";
import { useClipCostEstimate } from "../../hooks/timeline/useClipCostEstimate";
import CostEstimateLine from "../costs/CostEstimateLine";
import { generationCostLine } from "../costs/costLine";
import {
  EditorButton,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  TextInput,
  Toast,
  SPACING
} from "../ui_primitives";
import ModeSelectChip from "../chat/composer/ModeSelectChip";
import OptionChip from "../chat/composer/OptionChip";
import { audioModelPatch } from "../chat/composer/modelSelection";
import TTSModelMenuDialog from "../model_menu/TTSModelMenuDialog";
import MediaControlChip from "../chat/composer/MediaControlChip";
import MediaOptionMenu from "../chat/composer/MediaOptionMenu";
import MediaAspectRatioMenu from "../chat/composer/MediaAspectRatioMenu";
import VideoModelMenuDialog from "../model_menu/VideoModelMenuDialog";
import {
  buildVideoModelOptions,
  clampToAllowed,
  normalizeVideoModel
} from "../chat/composer/videoModelOptions";
import type {
  VideoModelSelection,
  VideoResolution
} from "../../stores/MediaGenerationStore";
import type { TTSModel, VideoModel } from "../../stores/ApiTypes";
import { useInStudio } from "../../studio/StudioContext";
import {
  forTasks,
  STUDIO_CLIP_MODELS,
  STUDIO_VOICES,
  STUDIO_VOICE
} from "../../studio/curatedModels";

const GENERATION_MODES = ["video", "audio"] as const;
type GenerationMode = (typeof GENERATION_MODES)[number];

interface AudioSelection {
  model: { id: string; provider: string; name: string; voices: string[] };
  voice: string;
}

interface TopBarPromptProps {
  /** Phone layout: prompt + Generate on one row, setting chips on a second. */
  compact?: boolean;
}

export const TopBarPrompt: React.FC<TopBarPromptProps> = memo(({ compact = false }) => {
  const theme = useTheme();
  const inStudio = useInStudio();
  const timeline = useTimelineStoreApi();
  const playback = useTimelinePlaybackStoreApi();
  const [mode, setMode] = useState<GenerationMode>("video");
  const [audioSelection, setAudioSelection] = useState<AudioSelection>();
  const lastAudioModel = useLastDirectGenModel("audio");
  const studioVoice =
    STUDIO_VOICES.find(
      (option) =>
        option.modelId === lastAudioModel.model &&
        option.id === lastAudioModel.voice
    )?.value ?? STUDIO_VOICE;
  const audio =
    audioSelection ??
    (inStudio
      ? studioVoice
        ? { model: studioVoice, voice: studioVoice.selected_voice }
        : undefined
      : lastAudioModel.model && lastAudioModel.provider
        ? {
            model: {
              id: lastAudioModel.model,
              provider: lastAudioModel.provider,
              name: lastAudioModel.model,
              // Remembered bindings have no catalog. Offer only their known voice.
              voices: lastAudioModel.voice ? [lastAudioModel.voice] : []
            },
            voice: lastAudioModel.voice ?? ""
          }
        : undefined);
  const audioModelAnchorRef = useRef<HTMLButtonElement>(null);
  const [audioModelOpen, setAudioModelOpen] = useState(false);
  const voiceOptions = (audio?.model.voices ?? []).map((id) => ({
    id,
    label: id
  }));
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // User-picked model wins over the auto-derived default. We track whether the
  // user has explicitly chosen something so the picker stops following the
  // "last used" default once they engage with it.
  const [userPicked, setUserPicked] = useState(false);
  const [selectedModel, setSelectedModel] = useState<
    VideoModelSelection | undefined
  >(undefined);
  const [aspect, setAspect] = useState("16:9");
  const [resolution, setResolution] = useState<VideoResolution>("720p");
  const [duration, setDuration] = useState(4);
  const lastModel = useLastDirectGenModel("video");

  // Chip popover anchors.
  const videoModelAnchorRef = useRef<HTMLButtonElement>(null);
  const [videoModelOpen, setVideoModelOpen] = useState(false);
  const [durationAnchor, setDurationAnchor] = useState<HTMLElement | null>(
    null
  );
  const [resolutionAnchor, setResolutionAnchor] =
    useState<HTMLElement | null>(null);
  const [aspectAnchor, setAspectAnchor] = useState<HTMLElement | null>(null);

  const { durationOptions, resolutionOptions, aspectOptions } = useMemo(
    () => buildVideoModelOptions(selectedModel),
    [selectedModel]
  );

  // Sync the model from the most recent direct-gen clip until the user picks
  // one themselves, so "type → generate" stays fluid across sequence loads.
  // The remembered default carries no manifest constraints, so the full option
  // sets show until a model is picked through the dialog.
  useEffect(() => {
    if (userPicked) return;
    if (lastModel.provider && lastModel.model) {
      setSelectedModel({
        type: "video_model",
        id: lastModel.model,
        provider: lastModel.provider,
        name: lastModel.model
      });
    } else {
      setSelectedModel(undefined);
    }
  }, [lastModel.provider, lastModel.model, userPicked]);

  const addDirectGenClip = useTimelineStore((s) => s.addDirectGenClip);
  const selectClip = useTimelineUIStore((s) => s.selectClip);
  const directGen = useTimelineDirectGenJob();

  const model = mode === "audio" ? audio?.model : selectedModel;
  const bindingKind = mode === "audio" ? "text-to-audio" : "text-to-video";
  const canSubmit = prompt.trim().length > 0 && !!model?.id && !busy;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !model) return;
    // Clear any prior failure toast before we attempt again — otherwise a
    // successful retry leaves the previous error visible.
    setError(null);
    const tracks = timeline
      .getState()
      .tracks.filter((track) => track.type === mode);
    if (tracks.length === 0) {
      timeline
        .getState()
        .addTrack(mode, mode === "audio" ? "Audio" : "Video");
    }
    const trackId = timeline
      .getState()
      .tracks.find((track) => track.type === mode && !track.locked)?.id;
    if (!trackId) {
      setError(
        `Unlock ${mode === "audio" ? "an audio" : "a video"} track first.`
      );
      return;
    }
    const startMs = playback.getState().getTimeMs();
    setBusy(true);
    try {
      const clipOptions: Parameters<typeof addDirectGenClip>[0] = {
        trackId,
        startMs,
        durationMs: duration * 1000,
        mediaType: mode,
        bindingKind,
        prompt: prompt.trim(),
        provider: model.provider,
        model: model.id
      };
      if (mode === "video") {
        clipOptions.aspectRatio = aspect;
        clipOptions.resolution = resolution;
      } else if (audio?.voice) {
        clipOptions.voice = audio.voice;
      }
      const clipId = addDirectGenClip(clipOptions);
      selectClip(clipId);
      await directGen.start(clipId);
      setPrompt("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate");
    } finally {
      setBusy(false);
    }
  }, [
    canSubmit,
    addDirectGenClip,
    prompt,
    model,
    mode,
    bindingKind,
    audio?.voice,
    timeline,
    playback,
    aspect,
    resolution,
    duration,
    selectClip,
    directGen
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (
        e.key === "Enter" &&
        !e.shiftKey &&
        !e.nativeEvent.isComposing &&
        e.nativeEvent.keyCode !== 229
      ) {
        e.preventDefault();
        void handleSubmit();
      }
    },
    [handleSubmit]
  );

  // Inside the Studio shell the chip opens the curated list instead of the
  // provider browser — same chip, three options, no API keys.
  const curatedClipOptions = useMemo(
    () =>
      forTasks(STUDIO_CLIP_MODELS, "text_to_video").map((option) => ({
        id: option.id,
        label: option.label,
        description: option.blurb
      })),
    []
  );

  const handlePickVideoModel = useCallback((model: VideoModel) => {
    const normalized = normalizeVideoModel(model);
    setUserPicked(true);
    setSelectedModel(normalized);
    // Snap current settings to what the picked model allows.
    setAspect((a) => clampToAllowed(a, normalized.aspectRatios));
    setResolution((r) => clampToAllowed(r, normalized.resolutions));
    setDuration((d) => clampToAllowed(d, normalized.durations));
    setVideoModelOpen(false);
  }, []);

  const promptField = (
    <TextInput
      value={prompt}
      onChange={(e) => setPrompt(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder={
        mode === "audio"
          ? "Enter text to speak…"
          : compact
            ? "Generate a video…"
            : "Generate a video at the playhead…"
      }
      compact
      fullWidth
      disabled={busy}
      inputProps={{
        "aria-label": `Quick ${bindingKind} prompt`,
        "data-testid": "topbar-prompt-input"
      }}
      slotProps={{
        input: {
          startAdornment: (
            <AutoAwesomeIcon
              fontSize="small"
              sx={{
                mr: SPACING.micro,
                color: theme.vars.palette.primary.main
              }}
            />
          )
        }
      }}
      sx={{
        flex: 1,
        minWidth: compact ? 0 : 160,
        "& .MuiOutlinedInput-root": { height: 32 },
        // Bar text at the label token (13px) so the prompt reads at the same
        // size as the setting chips beside it. The doubled parent selector
        // outranks TextInput's own body-token rule for this bar only — the
        // primitive's 15px standard is untouched everywhere else.
        "&& .MuiInputBase-input": {
          fontSize: "var(--fontSizeSmall)"
        }
      }}
    />
  );

  // Price the same binding that Generate will create.
  const costEstimate = useClipCostEstimate({
    bindingKind,
    provider: model?.provider,
    model: model?.id,
    resolution,
    aspectRatio: aspect,
    durationMs: duration * 1000
  });

  const costLine = (
    <CostEstimateLine
      estimate={generationCostLine(costEstimate)}
      title="Estimated cost of this generation"
    />
  );

  const generateButton = (
    <EditorButton
      variant="contained"
      size="small"
      disabled={!canSubmit}
      onClick={() => void handleSubmit()}
      startIcon={
        busy ? (
          <LoadingSpinner inline size={14} color="inherit" />
        ) : (
          <AutoAwesomeIcon fontSize="small" />
        )
      }
      data-testid="topbar-generate"
      // Icon-only on phones: the label costs ~70px the prompt needs, and the
      // sparkle plus the field's placeholder already say what it does.
      aria-label={mode === "audio" ? "Generate audio" : "Generate video"}
      // Native tooltip still fires on a disabled button: say why it is off.
      title={
        canSubmit ? undefined : "Type a prompt and pick a model to generate"
      }
      sx={{
        flexShrink: 0,
        height: 32,
        ...(compact
          ? {
              minWidth: 44,
              px: SPACING.xs,
              "& .MuiButton-startIcon": { m: 0 }
            }
          : null)
      }}
    >
      {compact ? null : "Generate"}
    </EditorButton>
  );

  const videoSettingChips = (
    <>
      <MediaControlChip
        ref={videoModelAnchorRef}
        icon={<MovieIcon fontSize="small" />}
        label={selectedModel?.name || "Select Model"}
        active={videoModelOpen}
        onClick={() => setVideoModelOpen(true)}
        truncate
        showChevron={false}
      />
      {videoModelOpen &&
        (inStudio ? (
          <MediaOptionMenu
            anchorEl={videoModelAnchorRef.current}
            open
            onClose={() => setVideoModelOpen(false)}
            header="Video model"
            value={selectedModel?.id ?? ""}
            options={curatedClipOptions}
            onChange={(id) => {
              const picked = STUDIO_CLIP_MODELS.find((o) => o.id === id);
              if (picked) handlePickVideoModel(picked.value);
              setVideoModelOpen(false);
            }}
          />
        ) : (
          <VideoModelMenuDialog
            open
            anchorEl={videoModelAnchorRef.current}
            onClose={() => setVideoModelOpen(false)}
            onModelChange={handlePickVideoModel}
            task="text_to_video"
          />
        ))}

      <MediaControlChip
        icon={<AccessTimeIcon fontSize="small" />}
        label={`${duration} Sec`}
        active={!!durationAnchor}
        onClick={(e) => setDurationAnchor(e.currentTarget)}
        showChevron={false}
      />
      <MediaOptionMenu
        anchorEl={durationAnchor}
        open={!!durationAnchor}
        onClose={() => setDurationAnchor(null)}
        header="Duration"
        value={duration}
        options={durationOptions}
        onChange={(d) => setDuration(d)}
      />

      <MediaControlChip
        icon={<TvIcon fontSize="small" />}
        label={resolution}
        active={!!resolutionAnchor}
        onClick={(e) => setResolutionAnchor(e.currentTarget)}
        showChevron={false}
      />
      <MediaOptionMenu
        anchorEl={resolutionAnchor}
        open={!!resolutionAnchor}
        onClose={() => setResolutionAnchor(null)}
        header="Video Resolution"
        value={resolution}
        options={resolutionOptions}
        onChange={(r) => setResolution(r)}
      />

      <MediaControlChip
        icon={<AspectRatioIcon fontSize="small" />}
        label={aspect}
        active={!!aspectAnchor}
        onClick={(e) => setAspectAnchor(e.currentTarget)}
        showChevron={false}
      />
      <MediaAspectRatioMenu
        anchorEl={aspectAnchor}
        open={!!aspectAnchor}
        onClose={() => setAspectAnchor(null)}
        value={aspect}
        options={aspectOptions}
        onChange={(v) => setAspect(v)}
      />
    </>
  );

  const handlePickAudioModel = useCallback((picked: TTSModel) => {
    setAudioSelection(audioModelPatch(picked, ""));
    setAudioModelOpen(false);
  }, []);
  const openAudioModel = useCallback(() => setAudioModelOpen(true), []);
  const closeAudioModel = useCallback(() => setAudioModelOpen(false), []);

  const audioSettingChips = (
    <>
      <MediaControlChip
        ref={audioModelAnchorRef}
        icon={<GraphicEqIcon fontSize="small" />}
        label={
          inStudio
            ? (STUDIO_VOICES.find((option) => option.id === audio?.voice)
                ?.label ?? "Voice")
            : audio?.model.name || "Select TTS Model"
        }
        active={audioModelOpen}
        onClick={openAudioModel}
        truncate
      />
      {audioModelOpen &&
        (inStudio ? (
          <MediaOptionMenu
            anchorEl={audioModelAnchorRef.current}
            open
            onClose={closeAudioModel}
            header="Voice"
            value={audio?.voice ?? ""}
            options={STUDIO_VOICES.map((option) => ({
              id: option.id,
              label: option.label
            }))}
            onChange={(id) => {
              const picked = STUDIO_VOICES.find((option) => option.id === id);
              if (picked)
                setAudioSelection({ model: picked.value, voice: id });
              setAudioModelOpen(false);
            }}
          />
        ) : (
          <TTSModelMenuDialog
            open
            anchorEl={audioModelAnchorRef.current}
            onClose={closeAudioModel}
            onModelChange={handlePickAudioModel}
          />
        ))}
      {!inStudio && audio && voiceOptions.length > 0 && (
        <OptionChip
          menu="option"
          icon={<RecordVoiceOverIcon fontSize="small" />}
          label={audio.voice || "Voice"}
          header="Voice"
          value={audio.voice}
          options={voiceOptions}
          onChange={(voice) => setAudioSelection({ ...audio, voice })}
        />
      )}
    </>
  );

  const settingChips = (
    <>
      <ModeSelectChip
        mode={mode}
        modes={GENERATION_MODES}
        onChange={(nextMode) => {
          if (nextMode !== "video" && nextMode !== "audio") return;
          setMode(nextMode);
          setVideoModelOpen(false);
          setAudioModelOpen(false);
          setDurationAnchor(null);
          setResolutionAnchor(null);
          setAspectAnchor(null);
          setError(null);
        }}
      />
      {mode === "audio" ? audioSettingChips : videoSettingChips}
    </>
  );

  return (
    <>
      {compact ? (
        <FlexColumn
          gap={SPACING.xs}
          data-testid="topbar-prompt"
          sx={{ flex: 1, minWidth: 0 }}
        >
          <FlexRow gap={SPACING.sm} align="center" sx={{ minWidth: 0 }}>
            {promptField}
            {generateButton}
          </FlexRow>
          {/* Chip rail — scrolls horizontally rather than wrapping, so the bar
          keeps a predictable two-row height whatever the model name is. */}
          <FlexRow
            gap={SPACING.sm}
            align="center"
            sx={{
              minWidth: 0,
              overflowX: "auto",
              overflowY: "hidden",
              pb: SPACING.micro,
              scrollbarWidth: "none",
              "&::-webkit-scrollbar": { display: "none" },
              // The chips set `flexShrink: 1` themselves when truncating; in a
              // scrolling rail that squeezes the model name down to "Selec…"
              // instead of letting the rail scroll. Element selector so this
              // outranks the chip's own single-class rule.
              "& > button": { flexShrink: 0 }
            }}
          >
            {settingChips}
            {costLine}
          </FlexRow>
        </FlexColumn>
      ) : (
        <FlexRow
          gap={SPACING.xs}
          align="center"
          data-testid="topbar-prompt"
          sx={{ flex: 1, minWidth: 0 }}
        >
          {promptField}
          {settingChips}
          {costLine}
          {generateButton}
        </FlexRow>
      )}
      <Toast
        open={error !== null}
        message={error ?? ""}
        severity="error"
        onClose={() => setError(null)}
        vertical="top"
        horizontal="center"
      />
    </>
  );
});

TopBarPrompt.displayName = "TopBarPrompt";
