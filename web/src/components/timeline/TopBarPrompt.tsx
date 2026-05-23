/** @jsxImportSource @emotion/react */
/**
 * TopBarPrompt
 *
 * Always-visible quick prompt input embedded in the timeline TopBar. Type
 * a prompt, press Enter, and a direct-gen clip is dropped onto the first
 * unlocked overlay/video track at the current playhead — and generation
 * starts immediately.
 *
 * The model picker flavour follows the target track: overlay tracks get the
 * image model selector + text-to-image; video tracks get the video model
 * selector + text-to-video. Selection is remembered across submissions for
 * the lifetime of the session by reading the most recent direct-gen clip
 * in the sequence (mirrors `AddClipMenu`).
 */

import React, { memo, useCallback, useEffect, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";

import { useTimelineStore } from "../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../stores/timeline/TimelineUIStore";
import { useTimelinePlaybackStore } from "../../stores/timeline/TimelinePlaybackStore";
import { useTimelineDirectGenJob } from "../../hooks/timeline/useTimelineDirectGenJob";
import { useLastDirectGenModel } from "../../hooks/timeline/useLastDirectGenModel";
import { FlexRow, TextInput, Toast } from "../ui_primitives";
import ImageModelSelect from "../properties/ImageModelSelect";
import VideoModelSelect from "../properties/VideoModelSelect";
import TTSModelSelect from "../properties/TTSModelSelect";
import type { ImageModelValue, TTSModelValue } from "../../stores/ApiTypes";

interface VideoModelChange {
  type: "video_model";
  id: string;
  provider: string;
  name: string;
}

const promptInputStyles = (theme: Theme) =>
  css({
    width: 360,
    [theme.breakpoints.down("md")]: {
      width: 240
    }
  });

const accentIconStyles = (theme: Theme) =>
  css({
    fontSize: 18,
    color: theme.vars.palette.primary.main,
    flexShrink: 0
  });

/**
 * Find the best target track for a fresh direct-gen clip. Overlay tracks win
 * over video tracks (the top bar is meant for quick "drop a still on top"
 * generation); video tracks come next; audio tracks are the final fallback.
 */
type TargetKind = "image" | "video" | "audio";
function pickTarget(): {
  trackId: string | undefined;
  kind: TargetKind | undefined;
} {
  const { tracks } = useTimelineStore.getState();
  const overlay = tracks.find((t) => t.type === "overlay" && !t.locked);
  if (overlay) {
    return { trackId: overlay.id, kind: "image" };
  }
  const video = tracks.find((t) => t.type === "video" && !t.locked);
  if (video) {
    return { trackId: video.id, kind: "video" };
  }
  const audio = tracks.find((t) => t.type === "audio" && !t.locked);
  if (audio) {
    return { trackId: audio.id, kind: "audio" };
  }
  return { trackId: undefined, kind: undefined };
}

const useTopBarTargetKind = (): TargetKind => {
  return useTimelineStore((state) => {
    const overlay = state.tracks.find((t) => t.type === "overlay" && !t.locked);
    if (overlay) return "image";
    const video = state.tracks.find((t) => t.type === "video" && !t.locked);
    if (video) return "video";
    const audio = state.tracks.find((t) => t.type === "audio" && !t.locked);
    if (audio) return "audio";
    return "image";
  });
};

export const TopBarPrompt: React.FC = memo(() => {
  const theme = useTheme();
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // User-picked provider+model wins over the auto-derived default. We track
  // whether the user has explicitly chosen something so the picker stops
  // following the "last used" default once they engage with it.
  const [userPicked, setUserPicked] = useState(false);
  const [provider, setProvider] = useState<string | undefined>(undefined);
  const [model, setModel] = useState<string | undefined>(undefined);
  const [voice, setVoice] = useState<string | undefined>(undefined);
  const targetKind = useTopBarTargetKind();
  const lastModel = useLastDirectGenModel(targetKind);

  // Switching from overlay-target to video-target (or vice versa) needs a
  // fresh model — the user's last image model can't satisfy a text-to-video
  // request and would silently fail.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setUserPicked(false);
  }, [targetKind]);

  // Sync provider/model from the most recent direct-gen clip until the
  // user picks something themselves. This keeps "type → generate" fluid
  // across sequence loads without forcing a re-pick.
  useEffect(() => {
    if (userPicked) return;
    setProvider(lastModel.provider);
    setModel(lastModel.model);
    setVoice(lastModel.voice);
  }, [lastModel.provider, lastModel.model, lastModel.voice, userPicked]);

  const addDirectGenClip = useTimelineStore((s) => s.addDirectGenClip);
  const selectClip = useTimelineUIStore((s) => s.selectClip);
  const directGen = useTimelineDirectGenJob();

  const canSubmit = prompt.trim().length > 0 && !!provider && !!model && !busy;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    // Clear any prior failure toast before we attempt again — otherwise a
    // successful retry leaves the previous error visible.
    setError(null);
    const target = pickTarget();
    if (!target.trackId || !target.kind) {
      setError("Add a video, overlay, or audio track first.");
      return;
    }
    const startMs = useTimelinePlaybackStore.getState().currentTimeMs;
    setBusy(true);
    try {
      const mediaType =
        target.kind === "video"
          ? "video"
          : target.kind === "audio"
            ? "audio"
            : "overlay";
      const bindingKind =
        target.kind === "video"
          ? "text-to-video"
          : target.kind === "audio"
            ? "text-to-audio"
            : "text-to-image";
      const clipId = addDirectGenClip({
        trackId: target.trackId,
        startMs,
        mediaType,
        bindingKind,
        prompt: prompt.trim(),
        provider,
        model,
        voice: target.kind === "audio" ? voice : undefined
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
    provider,
    model,
    voice,
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

  const handleModelChange = useCallback((v: ImageModelValue) => {
    setUserPicked(true);
    setProvider(v.provider);
    setModel(v.id);
  }, []);

  const handleVideoModelChange = useCallback((v: VideoModelChange) => {
    setUserPicked(true);
    setProvider(v.provider);
    setModel(v.id);
  }, []);

  const handleTTSModelChange = useCallback((v: TTSModelValue) => {
    setUserPicked(true);
    setProvider(v.provider);
    setModel(v.id);
    setVoice(v.selected_voice || v.voices?.[0] || undefined);
  }, []);

  return (
    <>
      <FlexRow gap={0.5} align="center" data-testid="topbar-prompt">
        <AutoAwesomeIcon css={accentIconStyles(theme)} aria-hidden />
        <div css={promptInputStyles(theme)}>
          <TextInput
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              targetKind === "video"
                ? "Generate a video at the playhead…"
                : targetKind === "audio"
                  ? "Speak text at the playhead…"
                  : "Generate an image at the playhead…"
            }
            compact
            fullWidth
            disabled={busy}
            inputProps={{
              "aria-label": "Quick generation prompt",
              "data-testid": "topbar-prompt-input"
            }}
          />
        </div>
        {targetKind === "video" ? (
          <VideoModelSelect
            value={model ?? ""}
            task="text_to_video"
            onChange={handleVideoModelChange}
          />
        ) : targetKind === "audio" ? (
          <TTSModelSelect
            value={
              model
                ? ({
                    type: "tts_model",
                    id: model,
                    provider: provider ?? "",
                    name: model,
                    voices: voice ? [voice] : [],
                    selected_voice: voice ?? ""
                  } as TTSModelValue)
                : ""
            }
            onChange={handleTTSModelChange}
          />
        ) : (
          <ImageModelSelect
            value={model ?? ""}
            task="text_to_image"
            onChange={handleModelChange}
          />
        )}
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
