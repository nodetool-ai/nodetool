import { memo, useCallback, useState, type MouseEvent } from "react";

import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import StopIcon from "@mui/icons-material/Stop";
import RepeatIcon from "@mui/icons-material/Repeat";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import FitScreenIcon from "@mui/icons-material/FitScreen";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";

import {
  Box,
  Caption,
  EditorMenu,
  EditorMenuItem,
  FlexRow,
  NodeSlider,
  ToolbarIconButton
} from "../ui_primitives";
import { EditorButton } from "../editor_ui";
import { isNumber } from "../../utils/typePredicates";
import { AUDIO_EFFECTS, EFFECT_GROUPS } from "./audioEffects";

interface AudioEditorToolbarProps {
  isPlaying: boolean;
  loop: boolean;
  zoom: number;
  minZoom: number;
  maxZoom: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  hasSelection: boolean;
  canUndo: boolean;
  canRedo: boolean;
  saving: boolean;
  canSave: boolean;
  onTogglePlay: () => void;
  onStop: () => void;
  onToggleLoop: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
  onZoomChange: (zoom: number) => void;
  onTrim: () => void;
  onDelete: () => void;
  onSilence: () => void;
  onFadeIn: () => void;
  onFadeOut: () => void;
  onNormalize: () => void;
  onAmplify: () => void;
  onQuieten: () => void;
  onReverse: () => void;
  /** Open (or, for one-click effects, apply) an effect from the catalogue. */
  onEffect: (effectId: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onDone: () => void;
}

const Separator = () => (
  <Box
    sx={{
      width: "1px",
      alignSelf: "stretch",
      mx: 0.5,
      my: 0.5,
      backgroundColor: "var(--palette-divider)"
    }}
  />
);

const ZOOM_SLIDER_MIN = 0;
const ZOOM_SLIDER_MAX = 100;
const ZOOM_SLIDER_STEP = 1;

const zoomToSliderValue = (zoom: number, minZoom: number, maxZoom: number) => {
  const minLog = Math.log(minZoom);
  const maxLog = Math.log(maxZoom);
  const clampedZoom = Math.min(maxZoom, Math.max(minZoom, zoom));
  return (
    ((Math.log(clampedZoom) - minLog) / (maxLog - minLog)) * ZOOM_SLIDER_MAX
  );
};

const sliderValueToZoom = (
  sliderValue: number,
  minZoom: number,
  maxZoom: number
) => {
  const minLog = Math.log(minZoom);
  const maxLog = Math.log(maxZoom);
  const ratio = sliderValue / ZOOM_SLIDER_MAX;
  return Math.exp(minLog + ratio * (maxLog - minLog));
};

/**
 * The audio editor's command bar: transport, zoom, region edits, and
 * undo/redo. Memoized so it does not re-render on every playback frame — only
 * the playhead and clock update while audio is playing.
 */
const AudioEditorToolbar = memo(function AudioEditorToolbar({
  isPlaying,
  loop,
  zoom,
  minZoom,
  maxZoom,
  canZoomIn,
  canZoomOut,
  hasSelection,
  canUndo,
  canRedo,
  saving,
  canSave,
  onTogglePlay,
  onStop,
  onToggleLoop,
  onZoomIn,
  onZoomOut,
  onZoomFit,
  onZoomChange,
  onTrim,
  onDelete,
  onSilence,
  onFadeIn,
  onFadeOut,
  onNormalize,
  onAmplify,
  onQuieten,
  onReverse,
  onEffect,
  onUndo,
  onRedo,
  onSave,
  onDone
}: AudioEditorToolbarProps) {
  const zoomSliderValue = zoomToSliderValue(zoom, minZoom, maxZoom);
  const handleZoomSliderChange = useCallback(
    (_event: Event, value: number | number[]) => {
      if (isNumber(value)) {
        onZoomChange(sliderValueToZoom(value, minZoom, maxZoom));
      }
    },
    [maxZoom, minZoom, onZoomChange]
  );

  const [effectsAnchor, setEffectsAnchor] = useState<HTMLElement | null>(null);
  const openEffectsMenu = useCallback(
    (event: MouseEvent<HTMLElement>) =>
      setEffectsAnchor(event.currentTarget),
    []
  );
  const closeEffectsMenu = useCallback(() => setEffectsAnchor(null), []);
  const pickEffect = useCallback(
    (effectId: string) => {
      setEffectsAnchor(null);
      onEffect(effectId);
    },
    [onEffect]
  );

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
      <FlexRow align="center" gap={1} sx={{ width: 160, mx: 0.5 }}>
        <NodeSlider
          aria-label="Waveform zoom"
          value={zoomSliderValue}
          min={ZOOM_SLIDER_MIN}
          max={ZOOM_SLIDER_MAX}
          step={ZOOM_SLIDER_STEP}
          onChange={handleZoomSliderChange}
          sx={{ flex: 1 }}
        />
        <Caption sx={{ minWidth: 44, textAlign: "right" }}>
          {Math.round(zoom * 100)}%
        </Caption>
      </FlexRow>

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
      <EditorButton
        size="small"
        onClick={openEffectsMenu}
        endIcon={<ArrowDropDownIcon />}
        aria-haspopup="menu"
        aria-expanded={effectsAnchor ? "true" : undefined}
      >
        Effects
      </EditorButton>
      <EditorMenu
        anchorEl={effectsAnchor}
        open={Boolean(effectsAnchor)}
        onClose={closeEffectsMenu}
      >
        {EFFECT_GROUPS.flatMap((group) => [
          <Caption
            key={`group-${group}`}
            component="li"
            role="presentation"
            color="secondary"
            sx={{ px: 2, pt: 1, pb: 0.5 }}
          >
            {group}
          </Caption>,
          ...AUDIO_EFFECTS.filter((effect) => effect.group === group).map(
            (effect) => (
              <EditorMenuItem
                key={effect.id}
                onClick={() => pickEffect(effect.id)}
              >
                {effect.params.length > 0 ? `${effect.label}…` : effect.label}
              </EditorMenuItem>
            )
          )
        ])}
      </EditorMenu>

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

      <Box sx={{ flexGrow: 1 }} />

      <EditorButton
        variant="contained"
        size="small"
        onClick={onSave}
        disabled={saving || !canSave}
      >
        {saving ? "Saving…" : "Save to audio"}
      </EditorButton>
      <EditorButton variant="text" size="small" onClick={onDone}>
        Done
      </EditorButton>
    </FlexRow>
  );
});

export default AudioEditorToolbar;
