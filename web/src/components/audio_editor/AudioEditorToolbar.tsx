import { memo, useCallback, useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";

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
  EditorButton,
  EditorMenu,
  EditorMenuItem,
  SPACING,
  Toolbar,
  ToolbarDivider,
  ToolbarGroup,
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
  /** Open "Transform with workflow" on the current sample. */
  onTransform?: () => void;
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
  onTransform,
  onUndo,
  onRedo,
  onSave,
  onDone
}: AudioEditorToolbarProps) {
  const { t } = useTranslation();
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

  const scope = hasSelection
    ? t("audio_repair.toolbar.selectionScope")
    : t("audio_repair.toolbar.clipScope");

  return (
    <Toolbar
      role="toolbar"
      aria-label={t("batch2_16.toolbar.audioEdits")}
      sx={{ flexWrap: "wrap", py: SPACING.xs }}
    >
      <ToolbarGroup role="group" aria-label={t("batch2_16.toolbar.history")}>
        <ToolbarIconButton
          icon={<UndoIcon fontSize="small" />}
          tooltip={t("batch2_16.toolbar.undo")}
          onClick={onUndo}
          disabled={!canUndo}
        />
        <ToolbarIconButton
          icon={<RedoIcon fontSize="small" />}
          tooltip={t("batch2_16.toolbar.redo")}
          onClick={onRedo}
          disabled={!canRedo}
        />
      </ToolbarGroup>

      <ToolbarDivider />

      <ToolbarGroup role="group" aria-label={t("batch2_16.toolbar.selectionEdits")}>
        <ToolbarIconButton
          icon={<CropOutlinedIcon fontSize="small" />}
          tooltip={t("batch2_16.toolbar.trim")}
          onClick={onTrim}
          disabled={!hasSelection}
        />
        <ToolbarIconButton
          icon={<DeleteOutlineOutlinedIcon fontSize="small" />}
          tooltip={t("batch2_16.toolbar.delete")}
          onClick={onDelete}
          disabled={!hasSelection}
        />
        <ToolbarIconButton
          icon={<VolumeOffOutlinedIcon fontSize="small" />}
          tooltip={t("batch2_16.toolbar.silence")}
          onClick={onSilence}
          disabled={!hasSelection}
        />
        <ToolbarIconButton
          icon={<TrendingUpOutlinedIcon fontSize="small" />}
          tooltip={t("batch2_16.toolbar.fadeIn")}
          onClick={onFadeIn}
          disabled={!hasSelection}
        />
        <ToolbarIconButton
          icon={<TrendingDownOutlinedIcon fontSize="small" />}
          tooltip={t("batch2_16.toolbar.fadeOut")}
          onClick={onFadeOut}
          disabled={!hasSelection}
        />
      </ToolbarGroup>

      <ToolbarDivider />

      <ToolbarGroup role="group" aria-label={t("batch2_16.toolbar.levelEdits")}>
        <ToolbarIconButton
          icon={<HeightOutlinedIcon fontSize="small" />}
          tooltip={t("batch2_16.toolbar.normalize", { scope })}
          ariaLabel={t("batch2_16.toolbar.normalizeLabel")}
          onClick={onNormalize}
        />
        <ToolbarIconButton
          icon={<VolumeUpOutlinedIcon fontSize="small" />}
          tooltip={t("batch2_16.toolbar.amplify", { scope })}
          ariaLabel={t("batch2_16.toolbar.amplifyLabel")}
          onClick={onAmplify}
        />
        <ToolbarIconButton
          icon={<VolumeDownOutlinedIcon fontSize="small" />}
          tooltip={t("batch2_16.toolbar.quieten", { scope })}
          ariaLabel={t("batch2_16.toolbar.quietenLabel")}
          onClick={onQuieten}
        />
        <ToolbarIconButton
          icon={<SwapHorizOutlinedIcon fontSize="small" />}
          tooltip={t("batch2_16.toolbar.reverse", { scope })}
          ariaLabel={t("batch2_16.toolbar.reverseLabel")}
          onClick={onReverse}
        />
      </ToolbarGroup>

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
        {t("batch2_16.toolbar.effects")}
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
            {t(`batch2_16.effects.groups.${group}`)}
          </Caption>,
          ...AUDIO_EFFECTS.filter((effect) => effect.group === group).map(
            (effect) => (
              <EditorMenuItem
                key={effect.id}
                onClick={() => pickEffect(effect.id)}
              >
                {t(`batch2_16.effects.${effect.id}.label`)}{effect.params.length > 0 ? "…" : ""}
              </EditorMenuItem>
            )
          )
        ])}
      </EditorMenu>

      {onTransform && (
        <EditorButton
          variant="text"
          color="inherit"
          density="compact"
          startIcon={<AutoFixHighOutlinedIcon />}
          onClick={onTransform}
          disabled={!canSave}
        >
          {t("transformWithWorkflow.open")}
        </EditorButton>
      )}

      <Box sx={{ flexGrow: 1 }} />

      <ToolbarGroup>
        <EditorButton
          variant="text"
          color="inherit"
          density="compact"
          onClick={onDone}
        >
          {t("batch2_16.toolbar.done")}
        </EditorButton>
        <EditorButton
          variant="contained"
          density="compact"
          disableElevation
          onClick={onSave}
          disabled={!canSave}
          loading={saving}
          disabledReason={canSave ? undefined : t("batch2_16.toolbar.saveUnavailable")}
        >
          {saving ? t("batch2_16.toolbar.saving") : t("batch2_16.toolbar.save")}
        </EditorButton>
      </ToolbarGroup>
    </Toolbar>
  );
});

export default AudioEditorToolbar;
