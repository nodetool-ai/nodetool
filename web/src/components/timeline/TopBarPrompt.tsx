/** @jsxImportSource @emotion/react */
/**
 * TopBarPrompt
 *
 * Always-visible quick prompt input embedded in the timeline TopBar. Type
 * a prompt, press Enter, and a direct-gen image clip is dropped onto the
 * first video/overlay track at the current playhead — and generation
 * starts immediately.
 *
 * The model picker is collapsed into a small button next to the input so
 * the bar stays narrow; selection is remembered across submissions for
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
import type { ImageModelValue } from "../../stores/ApiTypes";

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

/** Find the best target track for a fresh image clip: any video or overlay
 *  track that isn't locked. Falls back to undefined if none exist. */
function pickTargetTrackId(): {
  trackId: string | undefined;
  mediaTypeOverride: "overlay" | undefined;
} {
  const { tracks } = useTimelineStore.getState();
  const overlay = tracks.find((t) => t.type === "overlay" && !t.locked);
  if (overlay) {
    return { trackId: overlay.id, mediaTypeOverride: "overlay" };
  }
  const video = tracks.find((t) => t.type === "video" && !t.locked);
  if (video) {
    return { trackId: video.id, mediaTypeOverride: undefined };
  }
  return { trackId: undefined, mediaTypeOverride: undefined };
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
  const lastModel = useLastDirectGenModel();

  // Sync provider/model from the most recent direct-gen clip until the
  // user picks something themselves. This keeps "type → generate" fluid
  // across sequence loads without forcing a re-pick.
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
    const target = pickTargetTrackId();
    if (!target.trackId) {
      setError("Add a video or overlay track first.");
      return;
    }
    const startMs = useTimelinePlaybackStore.getState().currentTimeMs;
    setBusy(true);
    try {
      const clipId = addDirectGenClip({
        trackId: target.trackId,
        startMs,
        mediaType: target.mediaTypeOverride ?? "image",
        bindingKind: "text-to-image",
        prompt: prompt.trim(),
        provider,
        model
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

  return (
    <>
      <FlexRow gap={0.5} align="center" data-testid="topbar-prompt">
        <AutoAwesomeIcon css={accentIconStyles(theme)} aria-hidden />
        <div css={promptInputStyles(theme)}>
          <TextInput
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Generate an image at the playhead…"
            compact
            fullWidth
            disabled={busy}
            inputProps={{
              "aria-label": "Quick generation prompt",
              "data-testid": "topbar-prompt-input"
            }}
          />
        </div>
        <ImageModelSelect
          value={model ?? ""}
          task="text_to_image"
          onChange={handleModelChange}
        />
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
