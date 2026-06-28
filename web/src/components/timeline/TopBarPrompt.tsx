/**
 * TopBarPrompt
 *
 * The timeline editor's quick text-to-video generation bar. Type a prompt,
 * pick a model + output settings, and Generate drops a text-to-video direct-gen
 * clip onto the first unlocked video track at the playhead (creating a video
 * track if the sequence has none). Generation starts immediately.
 *
 * Layout mirrors the image editor's prompt bar (`ConnectedModePromptBar`) and
 * the media chat composer: a prompt that grows to fill, then the model + setting
 * chips, then the primary Generate action. The model / duration / resolution /
 * aspect controls are the shared `MediaControlChip` + option menus, so options
 * track the selected model's manifest.
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
import {
  EditorButton,
  FlexRow,
  LoadingSpinner,
  TextInput,
  Toast
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

export const TopBarPrompt: React.FC = memo(() => {
  const theme = useTheme();
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
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSubmit();
      }
    },
    [handleSubmit]
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

  return (
    <>
      <FlexRow
        gap={1}
        align="center"
        data-testid="topbar-prompt"
        sx={{ flex: 1, minWidth: 0 }}
      >
        <TextInput
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Generate a video at the playhead…"
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
            minWidth: 160,
            "& .MuiOutlinedInput-root": { height: 34 }
          }}
        />

        <MediaControlChip
          ref={videoModelAnchorRef}
          icon={<MovieIcon fontSize="small" />}
          label={selectedModel?.name || "Select Model"}
          active={videoModelOpen}
          onClick={() => setVideoModelOpen(true)}
          truncate
          showChevron={false}
        />
        {videoModelOpen && (
          <VideoModelMenuDialog
            open
            anchorEl={videoModelAnchorRef.current}
            onClose={() => setVideoModelOpen(false)}
            onModelChange={handlePickVideoModel}
            task="text_to_video"
          />
        )}

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
          sx={{ flexShrink: 0, height: 34 }}
        >
          Generate
        </EditorButton>
      </FlexRow>
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
