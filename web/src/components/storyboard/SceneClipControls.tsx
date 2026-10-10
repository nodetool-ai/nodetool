/**
 * SceneClipControls
 *
 * The scene header's scene clip controls: one button per scene clip in the
 * scene, naming its shots and its state, and *Scene clip…* to set up a new
 * one. Each opens {@link SceneClipDialog}; nothing here spends money.
 */

import React, { memo, useCallback } from "react";
import type { SceneClipDirection, Shot } from "@nodetool-ai/protocol";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";

import { EditorButton } from "../ui_primitives";
import {
  SCENE_CLIP_STATUS_LABELS,
  sceneClipRangeLabel,
  sceneClipStatus
} from "./sceneClips";

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
  onOpen: SceneClipControlsProps["onOpen"];
}

const ClipButton: React.FC<ClipButtonProps> = ({
  sceneId,
  clip,
  label,
  status,
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
  const handleNew = useCallback(
    () => onOpen(sceneId, null),
    [onOpen, sceneId]
  );
  if (sceneShots.length < 2) {
    return null;
  }
  return (
    <>
      {clips.map((clip) => (
        <ClipButton
          key={clip.id}
          sceneId={sceneId}
          clip={clip}
          label={sceneClipRangeLabel(sceneShots, clip)}
          status={SCENE_CLIP_STATUS_LABELS[sceneClipStatus(boardShots, clip)]}
          onOpen={onOpen}
        />
      ))}
      <EditorButton
        size="small"
        variant="text"
        startIcon={<MovieOutlinedIcon fontSize="small" />}
        onClick={handleNew}
      >
        Scene clip…
      </EditorButton>
    </>
  );
};

export const SceneClipControls = memo(SceneClipControlsInner);
SceneClipControls.displayName = "SceneClipControls";

export default SceneClipControls;
