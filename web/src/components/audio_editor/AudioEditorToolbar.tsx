import { memo, useCallback, useState, type MouseEvent } from "react";

import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import CropOutlinedIcon from "@mui/icons-material/CropOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import VolumeOffOutlinedIcon from "@mui/icons-material/VolumeOffOutlined";
import TrendingUpOutlinedIcon from "@mui/icons-material/TrendingUpOutlined";
import TrendingDownOutlinedIcon from "@mui/icons-material/TrendingDownOutlined";
import HeightOutlinedIcon from "@mui/icons-material/HeightOutlined";
import VolumeUpOutlinedIcon from "@mui/icons-material/VolumeUpOutlined";
import VolumeDownOutlinedIcon from "@mui/icons-material/VolumeDownOutlined";
import SwapHorizOutlinedIcon from "@mui/icons-material/SwapHorizOutlined";
import AutoFixHighOutlinedIcon from "@mui/icons-material/AutoFixHighOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

import {
  Box,
  Caption,
  CONTROL,
  EditorButton,
  EditorMenu,
  EditorMenuItem,
  FlexRow,
  SPACING,
  Toolbar,
  ToolbarDivider,
  ToolbarIconButton
} from "../ui_primitives";
import { AUDIO_EFFECTS, EFFECT_GROUPS } from "./audioEffects";

interface AudioEditorToolbarProps {
  hasSelection: boolean;
  canUndo: boolean;
  canRedo: boolean;
  saving: boolean;
  canSave: boolean;
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

/**
 * The audio editor's command bar: history, selection edits, level edits, the
 * effects menu, and save. Transport and zoom live in `AudioTransportBar`
 * under the waveform. Memoized so it does not re-render on playback frames.
 */
const AudioEditorToolbar = memo(function AudioEditorToolbar({
  hasSelection,
  canUndo,
  canRedo,
  saving,
  canSave,
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
  const [effectsAnchor, setEffectsAnchor] = useState<HTMLElement | null>(null);
  const openEffectsMenu = useCallback(
    (event: MouseEvent<HTMLElement>) => setEffectsAnchor(event.currentTarget),
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

  const scope = hasSelection ? "selection" : "whole clip";

  return (
    <Toolbar
      role="toolbar"
      aria-label="Audio edits"
      sx={{
        flexWrap: "wrap",
        minHeight: CONTROL.height.xl,
        gap: SPACING.micro,
        py: SPACING.xs
      }}
    >
      <FlexRow role="group" aria-label="History" align="center" gap={SPACING.micro}>
        <ToolbarIconButton
          icon={<UndoIcon fontSize="small" />}
          tooltip="Undo"
          onClick={onUndo}
          disabled={!canUndo}
        />
        <ToolbarIconButton
          icon={<RedoIcon fontSize="small" />}
          tooltip="Redo"
          onClick={onRedo}
          disabled={!canRedo}
        />
      </FlexRow>

      <ToolbarDivider />

      <FlexRow role="group" aria-label="Selection edits" align="center" gap={SPACING.micro}>
        <ToolbarIconButton
          icon={<CropOutlinedIcon fontSize="small" />}
          tooltip="Trim to selection"
          onClick={onTrim}
          disabled={!hasSelection}
        />
        <ToolbarIconButton
          icon={<DeleteOutlineOutlinedIcon fontSize="small" />}
          tooltip="Delete selection"
          onClick={onDelete}
          disabled={!hasSelection}
        />
        <ToolbarIconButton
          icon={<VolumeOffOutlinedIcon fontSize="small" />}
          tooltip="Silence selection"
          onClick={onSilence}
          disabled={!hasSelection}
        />
        <ToolbarIconButton
          icon={<TrendingUpOutlinedIcon fontSize="small" />}
          tooltip="Fade in selection"
          onClick={onFadeIn}
          disabled={!hasSelection}
        />
        <ToolbarIconButton
          icon={<TrendingDownOutlinedIcon fontSize="small" />}
          tooltip="Fade out selection"
          onClick={onFadeOut}
          disabled={!hasSelection}
        />
      </FlexRow>

      <ToolbarDivider />

      <FlexRow role="group" aria-label="Level edits" align="center" gap={SPACING.micro}>
        <ToolbarIconButton
          icon={<HeightOutlinedIcon fontSize="small" />}
          tooltip={`Normalize ${scope}`}
          ariaLabel="Normalize"
          onClick={onNormalize}
        />
        <ToolbarIconButton
          icon={<VolumeUpOutlinedIcon fontSize="small" />}
          tooltip={`Amplify ${scope}`}
          ariaLabel="Amplify"
          onClick={onAmplify}
        />
        <ToolbarIconButton
          icon={<VolumeDownOutlinedIcon fontSize="small" />}
          tooltip={`Quieten ${scope}`}
          ariaLabel="Quieten"
          onClick={onQuieten}
        />
        <ToolbarIconButton
          icon={<SwapHorizOutlinedIcon fontSize="small" />}
          tooltip={`Reverse ${scope}`}
          ariaLabel="Reverse"
          onClick={onReverse}
        />
      </FlexRow>

      <ToolbarDivider />

      <EditorButton
        variant="text"
        color="inherit"
        density="compact"
        startIcon={<AutoFixHighOutlinedIcon />}
        endIcon={<ExpandMoreIcon />}
        onClick={openEffectsMenu}
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
            sx={{ px: SPACING.lg, pt: SPACING.xs, pb: SPACING.micro }}
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

      <Box sx={{ flexGrow: 1 }} />

      <FlexRow align="center" gap={SPACING.xs}>
        <EditorButton
          variant="text"
          color="inherit"
          density="compact"
          onClick={onDone}
        >
          Done
        </EditorButton>
        <EditorButton
          variant="contained"
          density="compact"
          disableElevation
          onClick={onSave}
          disabled={saving || !canSave}
        >
          {saving ? "Saving…" : "Save"}
        </EditorButton>
      </FlexRow>
    </Toolbar>
  );
});

export default AudioEditorToolbar;
