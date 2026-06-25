/** @jsxImportSource @emotion/react */
/**
 * TopBarPrompt
 *
 * Always-visible quick prompt input embedded in the timeline TopBar. Type a
 * prompt, press Enter, and a text-to-video direct-gen clip is dropped onto the
 * first unlocked video track at the current playhead — and generation starts
 * immediately. If the sequence has no video track yet (e.g. a Studio sequence
 * with only voiceover + caption tracks), one is created first.
 *
 * The video model selection is remembered across submissions for the lifetime
 * of the session by reading the most recent direct-gen clip in the sequence
 * (mirrors `AddClipMenu`).
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
import {
  FlexRow,
  TextInput,
  Toast,
  NodeSelect,
  NodeMenuItem
} from "../ui_primitives";
import VideoModelSelect from "../properties/VideoModelSelect";

interface VideoModelChange {
  type: "video_model";
  id: string;
  provider: string;
  name: string;
}

// ── Generation presets ───────────────────────────────────────────────────

const ASPECT_RATIOS: string[] = ["16:9", "1:1", "9:16", "4:3", "3:4"];

/** Short-edge resolution tiers, expressed as the strings video models expect. */
const RESOLUTIONS: string[] = ["480p", "720p", "1080p"];

/** Selectable clip durations in seconds. */
const DURATIONS_SEC: number[] = [4, 6, 8];

const promptInputStyles = (theme: Theme) =>
  css({
    width: 480,
    [theme.breakpoints.down("md")]: {
      width: 300
    }
  });

const modelSelectStyles = (theme: Theme) =>
  css({
    width: 150,
    flexShrink: 0,
    [theme.breakpoints.down("md")]: {
      width: 120
    }
  });

const settingSelectStyles = css({
  width: 84,
  flexShrink: 0
});

const accentIconStyles = (theme: Theme) =>
  css({
    fontSize: 18,
    color: theme.vars.palette.primary.main,
    flexShrink: 0
  });

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
  // User-picked provider+model wins over the auto-derived default. We track
  // whether the user has explicitly chosen something so the picker stops
  // following the "last used" default once they engage with it.
  const [userPicked, setUserPicked] = useState(false);
  const [provider, setProvider] = useState<string | undefined>(undefined);
  const [model, setModel] = useState<string | undefined>(undefined);
  const [aspect, setAspect] = useState("16:9");
  const [resolution, setResolution] = useState("720p");
  const [durationSec, setDurationSec] = useState("4");
  const lastModel = useLastDirectGenModel("video");

  // Sync provider/model from the most recent direct-gen clip until the user
  // picks something themselves. This keeps "type → generate" fluid across
  // sequence loads without forcing a re-pick.
  useEffect(() => {
    if (userPicked) return;
    setProvider(lastModel.provider);
    setModel(lastModel.model);
  }, [lastModel.provider, lastModel.model, userPicked]);

  const addDirectGenClip = useTimelineStore((s) => s.addDirectGenClip);
  const selectClip = useTimelineUIStore((s) => s.selectClip);
  const directGen = useTimelineDirectGenJob();

  const canSubmit = prompt.trim().length > 0 && !!provider && !!model && !busy;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
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
        durationMs: Number(durationSec) * 1000,
        mediaType: "video",
        bindingKind: "text-to-video",
        prompt: prompt.trim(),
        provider,
        model,
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
    provider,
    model,
    aspect,
    resolution,
    durationSec,
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

  const handleVideoModelChange = useCallback((v: VideoModelChange) => {
    setUserPicked(true);
    setProvider(v.provider);
    setModel(v.id);
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
            placeholder="Generate a video at the playhead…"
            compact
            fullWidth
            disabled={busy}
            inputProps={{
              "aria-label": "Quick text-to-video prompt",
              "data-testid": "topbar-prompt-input"
            }}
          />
        </div>
        <div css={modelSelectStyles(theme)}>
          <VideoModelSelect
            value={model ?? ""}
            task="text_to_video"
            onChange={handleVideoModelChange}
          />
        </div>
        <div css={settingSelectStyles}>
          <NodeSelect
            value={aspect}
            onChange={(e) => setAspect(e.target.value as string)}
            aria-label="Aspect ratio"
            fullWidth
          >
            {ASPECT_RATIOS.map((r) => (
              <NodeMenuItem key={r} value={r}>
                {r}
              </NodeMenuItem>
            ))}
          </NodeSelect>
        </div>
        <div css={settingSelectStyles}>
          <NodeSelect
            value={resolution}
            onChange={(e) => setResolution(e.target.value as string)}
            aria-label="Resolution"
            fullWidth
          >
            {RESOLUTIONS.map((r) => (
              <NodeMenuItem key={r} value={r}>
                {r}
              </NodeMenuItem>
            ))}
          </NodeSelect>
        </div>
        <div css={settingSelectStyles}>
          <NodeSelect
            value={durationSec}
            onChange={(e) => setDurationSec(e.target.value as string)}
            aria-label="Duration"
            fullWidth
          >
            {DURATIONS_SEC.map((s) => (
              <NodeMenuItem key={s} value={String(s)}>
                {s}s
              </NodeMenuItem>
            ))}
          </NodeSelect>
        </div>
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
