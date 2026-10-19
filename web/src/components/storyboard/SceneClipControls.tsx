/**
 * SceneClipControls
 *
 * The scene header's scene clip controls: one button per scene clip in the
 * scene, naming its shots and its state, and *Scene clip…* to set up a new
 * one. Each opens {@link SceneClipDialog}; nothing here spends money.
 */

import React, { memo, useCallback } from "react";
import type { SceneClipDirection, Shot } from "@nodetool-ai/protocol";
import { useTranslation } from "react-i18next";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";

import { EditorButton } from "../ui_primitives";
import { sceneClipStatus } from "./sceneClips";

export interface SceneClipControlsProps {
  /** The scene's id, or null for the implicit legacy group. */
  sceneId: string | null;
  /** The scene's shots in board order. */
  sceneShots: readonly Shot[];
  /** Every shot on the board, which a clip's run is resolved against. */
  boardShots: readonly Shot[];
  /** The scene clips holding a shot of this scene. */
  clips: readonly SceneClipDirection[];
  /** Opens the dialog on `clip`, or on a new one when null. */
  onOpen: (sceneId: string | null, clip: SceneClipDirection | null) => void;
}

interface ClipButtonProps {
  sceneId: string | null;
  clip: SceneClipDirection;
  label: string;
  status: string;
  ariaLabel: string;
  onOpen: SceneClipControlsProps["onOpen"];
}

const ClipButton: React.FC<ClipButtonProps> = ({
  sceneId,
  clip,
  label,
  status,
  ariaLabel,
  onOpen
}) => {
  const handleClick = useCallback(
    () => onOpen(sceneId, clip),
    [onOpen, sceneId, clip]
  );
  return (
    <EditorButton
      size="small"
      variant="outlined"
      onClick={handleClick}
      aria-label={ariaLabel}
      data-testid="scene-clip-button"
    >
      {`${label} · ${status}`}
    </EditorButton>
  );
};

const SceneClipControlsInner: React.FC<SceneClipControlsProps> = ({
  sceneId,
  sceneShots,
  boardShots,
  clips,
  onOpen
}) => {
  const { t, i18n } = useTranslation();
  const number = (value: number): string =>
    new Intl.NumberFormat(i18n.language).format(value);
  const handleNew = useCallback(
    () => onOpen(sceneId, null),
    [onOpen, sceneId]
  );
  if (sceneShots.length < 2) {
    return null;
  }
  const clipButtons = clips.map((clip) => {
    const positions = clip.shot_ids
      .map((id) => sceneShots.findIndex((shot) => shot.id === id))
      .filter((index) => index >= 0)
      .map((index) => index + 1)
      .sort((a, b) => a - b);
    const first = positions[0];
    const last = positions[positions.length - 1];
    const label =
      first === undefined
        ? t("screens4_14.storyboard.sceneClip.sceneClip")
        : first === last
          ? t("screens4_14.storyboard.sceneClip.shot", {
              count: first,
              number: number(first)
            })
          : t("screens4_14.storyboard.sceneClip.shotRange", {
              first: number(first),
              last: number(last)
            });
    const status = t(
      `screens4_14.storyboard.sceneClip.status.${sceneClipStatus(boardShots, clip)}`
    );
    return (
      <ClipButton
        key={clip.id}
        sceneId={sceneId}
        clip={clip}
        label={label}
        status={status}
        ariaLabel={t("screens4_14.storyboard.sceneClip.openClip", {
          label,
          status
        })}
        onOpen={onOpen}
      />
    );
  });
  return (
    <>
      {clipButtons}
      <EditorButton
        size="small"
        variant="text"
        startIcon={<MovieOutlinedIcon />}
        onClick={handleNew}
      >
        {t("screens4_14.storyboard.sceneClip.new")}
      </EditorButton>
    </>
  );
};

export const SceneClipControls = memo(SceneClipControlsInner);
SceneClipControls.displayName = "SceneClipControls";

export default SceneClipControls;
