/**
 * TopBarPrompt
 *
 * The timeline editor's quick text-to-video generation bar. Type a prompt,
 * pick a model + output settings, and Generate drops a text-to-video direct-gen
 * clip onto the first unlocked video track at the playhead (creating a video
 * track if the sequence has none). Generation starts immediately.
 *
 * Layout mirrors the image editor's generate form (`ConnectedGeneratePopover`) and
 * the media chat composer: a prompt that grows to fill, then the model + setting
 * chips, then the primary Generate action. The model / duration / resolution /
 * aspect controls are the shared `MediaControlChip` + option menus, so options
 * track the selected model's manifest.
 *
 * On phones (`compact`) that one row is 600px of content in 390px of viewport,
 * so it wraps into two: prompt + Generate on top, the setting chips below in a
 * horizontally scrollable rail.
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@mui/material/styles";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import MovieIcon from "@mui/icons-material/Movie";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import AspectRatioIcon from "@mui/icons-material/CropOriginal";
import TvIcon from "@mui/icons-material/Tv";

import { useTimelineStore } from "../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../stores/timeline/TimelineUIStore";
import { useTimelinePlaybackStore } from "../../stores/timeline/TimelinePlaybackStore";
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
import type { VideoModel } from "../../stores/ApiTypes";
import { useInStudio } from "../../studio/StudioContext";
import { forTasks, STUDIO_CLIP_MODELS } from "../../studio/curatedModels";

/**
 * Resolve the video track to drop the clip onto: the first unlocked video
 * track, creating one if the sequence has none yet. Returns `undefined` only
 * if a video track exists but is locked.
 */
function pickOrCreateVideoTrack(): string | undefined {
  const findVideo = () =>
    useTimelineStore.getState().tracks.find((t) => t.type === "video");

  let video = findVideo();
  if (!video) {
    useTimelineStore.getState().addTrack("video", "Video");
    video = findVideo();
  }
  if (!video || video.locked) return undefined;
  return video.id;
}

interface TopBarPromptProps {
  /** Phone layout: prompt + Generate on one row, setting chips on a second. */
  compact?: boolean;
}

export const TopBarPrompt: React.FC<TopBarPromptProps> = memo(({ compact = false }) => {
  const theme = useTheme();
  const inStudio = useInStudio();
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
  const [durationAnchor, setDurationAnchor] = useState<HTMLElement | null>(null);
  const [resolutionAnchor, setResolutionAnchor] = useState<HTMLElement | null>(
    null
  );
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

  const canSubmit = prompt.trim().length > 0 && !!selectedModel?.id && !busy;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !selectedModel) return;
    // Clear any prior failure toast before we attempt again — otherwise a
    // successful retry leaves the previous error visible.
    setError(null);
    const trackId = pickOrCreateVideoTrack();
    if (!trackId) {
      setError("Unlock the video track first.");
      return;
    }
    const startMs = useTimelinePlaybackStore.getState().currentTimeMs;
    setBusy(true);
    try {
      const clipId = addDirectGenClip({
        trackId,
        startMs,
        durationMs: duration * 1000,
        mediaType: "video",
        bindingKind: "text-to-video",
        prompt: prompt.trim(),
        provider: selectedModel.provider,
        model: selectedModel.id,
        aspectRatio: aspect,
        resolution
      });
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
    selectedModel,
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
        compact ? "Generate a video…" : "Generate a video at the playhead…"
      }
      compact
      fullWidth
      disabled={busy}
      inputProps={{
        "aria-label": "Quick text-to-video prompt",
        "data-testid": "topbar-prompt-input"
      }}
      slotProps={{
        input: {
          startAdornment: (
            <AutoAwesomeIcon
              fontSize="small"
              sx={{ mr: 0.5, color: theme.vars.palette.primary.main }}
            />
          )
        }
      }}
      sx={{
        flex: 1,
        minWidth: compact ? 0 : 160,
        "& .MuiOutlinedInput-root": { height: 34 }
      }}
    />
  );

  // The bar creates a text-to-video clip with exactly these fields, so it
  // prices through the same hook the clip inspector uses.
  const costEstimate = useClipCostEstimate({
    bindingKind: "text-to-video",
    provider: selectedModel?.provider,
    model: selectedModel?.id,
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
      aria-label="Generate video"
      sx={{
        flexShrink: 0,
        height: 34,
        ...(compact
          ? { minWidth: 44, px: 1, "& .MuiButton-startIcon": { m: 0 } }
          : null)
      }}
    >
      {compact ? null : "Generate"}
    </EditorButton>
  );

  const settingChips = (
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
          gap={1}
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
