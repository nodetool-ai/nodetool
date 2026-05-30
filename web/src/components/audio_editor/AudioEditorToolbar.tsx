import { memo } from "react";

import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import StopIcon from "@mui/icons-material/Stop";
import RepeatIcon from "@mui/icons-material/Repeat";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import FitScreenIcon from "@mui/icons-material/FitScreen";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";

import { Box, FlexRow, ToolbarIconButton } from "../ui_primitives";
import { EditorButton } from "../editor_ui";

export interface AudioEditorToolbarProps {
  isPlaying: boolean;
  loop: boolean;
  canZoomIn: boolean;
  canZoomOut: boolean;
  hasSelection: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onTogglePlay: () => void;
  onStop: () => void;
  onToggleLoop: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
  onTrim: () => void;
  onDelete: () => void;
  onSilence: () => void;
  onFadeIn: () => void;
  onFadeOut: () => void;
  onNormalize: () => void;
  onAmplify: () => void;
  onQuieten: () => void;
  onReverse: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

const Separator = () => (
  <Box
    sx={{
      width: "1px",
      alignSelf: "stretch",
      mx: 0.5,
      my: 0.25,
      backgroundColor: "var(--palette-divider)"
    }}
  />
);

/**
 * The audio editor's command bar: transport, zoom, region edits, and
 * undo/redo. Memoized so it does not re-render on every playback frame — only
 * the playhead and clock update while audio is playing.
 */
const AudioEditorToolbar = memo(function AudioEditorToolbar({
  isPlaying,
  loop,
  canZoomIn,
  canZoomOut,
  hasSelection,
  canUndo,
  canRedo,
  onTogglePlay,
  onStop,
  onToggleLoop,
  onZoomIn,
  onZoomOut,
  onZoomFit,
  onTrim,
  onDelete,
  onSilence,
  onFadeIn,
  onFadeOut,
  onNormalize,
  onAmplify,
  onQuieten,
  onReverse,
  onUndo,
  onRedo
}: AudioEditorToolbarProps) {
  return (
    <FlexRow
      align="center"
      gap={0.5}
      sx={{
        flexShrink: 0,
        flexWrap: "wrap",
        px: 1,
        py: 0.5,
        borderBottom: "1px solid var(--palette-divider)"
      }}
    >
      <ToolbarIconButton
        icon={isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
        tooltip={isPlaying ? "Pause" : "Play"}
        onClick={onTogglePlay}
      />
      <ToolbarIconButton icon={<StopIcon />} tooltip="Stop" onClick={onStop} />
      <ToolbarIconButton
        icon={<RepeatIcon />}
        tooltip="Loop"
        active={loop}
        onClick={onToggleLoop}
      />

      <Separator />

      <ToolbarIconButton
        icon={<ZoomOutIcon />}
        tooltip="Zoom out"
        onClick={onZoomOut}
        disabled={!canZoomOut}
      />
      <ToolbarIconButton
        icon={<ZoomInIcon />}
        tooltip="Zoom in"
        onClick={onZoomIn}
        disabled={!canZoomIn}
      />
      <ToolbarIconButton
        icon={<FitScreenIcon />}
        tooltip="Fit to window"
        onClick={onZoomFit}
      />

      <Separator />

      <EditorButton size="small" onClick={onTrim} disabled={!hasSelection}>
        Trim
      </EditorButton>
      <EditorButton size="small" onClick={onDelete} disabled={!hasSelection}>
        Delete
      </EditorButton>
      <EditorButton size="small" onClick={onSilence} disabled={!hasSelection}>
        Silence
      </EditorButton>
      <EditorButton size="small" onClick={onFadeIn} disabled={!hasSelection}>
        Fade in
      </EditorButton>
      <EditorButton size="small" onClick={onFadeOut} disabled={!hasSelection}>
        Fade out
      </EditorButton>
      <EditorButton size="small" onClick={onNormalize}>
        Normalize
      </EditorButton>
      <EditorButton size="small" onClick={onAmplify}>
        Amplify
      </EditorButton>
      <EditorButton size="small" onClick={onQuieten}>
        Quieten
      </EditorButton>
      <EditorButton size="small" onClick={onReverse}>
        Reverse
      </EditorButton>

      <Separator />

      <ToolbarIconButton
        icon={<UndoIcon />}
        tooltip="Undo"
        onClick={onUndo}
        disabled={!canUndo}
      />
      <ToolbarIconButton
        icon={<RedoIcon />}
        tooltip="Redo"
        onClick={onRedo}
        disabled={!canRedo}
      />
    </FlexRow>
  );
});

export default AudioEditorToolbar;
