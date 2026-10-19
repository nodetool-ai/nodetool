import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import FileUploadOutlinedIcon from "@mui/icons-material/FileUploadOutlined";
import KeyboardCommandKeyIcon from "@mui/icons-material/KeyboardCommandKey";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import RedoIcon from "@mui/icons-material/Redo";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import SkipNextIcon from "@mui/icons-material/SkipNext";
import StopIcon from "@mui/icons-material/Stop";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import UndoIcon from "@mui/icons-material/Undo";
import VideogameAssetOutlinedIcon from "@mui/icons-material/VideogameAssetOutlined";

import { CONTROL, EditorButton, FlexRow, SaveState, SPACING, Text, Toolbar, ToolbarDivider, ToolbarIconButton } from "../../ui_primitives";
import { useGameCommandShortcut } from "./useGameCommands";
import GameExportButton from "./GameExportButton";
import type { GameExportTarget } from "../../../utils/gameExportZip";

interface GameToolbarProps {
  name: string;
  playing: boolean;
  playSession: boolean;
  loading: boolean;
  saving: boolean;
  saveStatus: string;
  assistantOpen: boolean;
  sceneTreeOpen: boolean;
  inspectorOpen: boolean;
  playHref: string;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onPlay: () => void;
  onStop: () => void;
  onStep: () => void;
  onRestart?: () => void;
  onSave: () => void;
  onLoad: () => void;
  onPublish: () => void;
  /** Downloads the published revision. The export control is hidden without it. */
  onExport?: (target: GameExportTarget) => void;
  exporting?: boolean;
  /** Compiles a desktop executable on this computer. */
  onBuildExecutable?: () => void;
  onAssistant: () => void;
  onSceneTree: () => void;
  onInspector: () => void;
  onCommandPalette?: () => void;
  /** The Layout menu, placed with the panel toggles. */
  layoutMenu?: ReactNode;
}

function GameSaveState({ saveStatus }: { saveStatus: string }) {
  const { t } = useTranslation();
  const state = saveStatus === "saved" || saveStatus === "saving" || saveStatus === "error" ? saveStatus : "dirty";
  return <SaveState state={state} labels={{ dirty: t("screen_game.toolbar.unsavedChanges"), saving: t("screen_game.toolbar.savingDraft"), saved: t("screen_game.toolbar.draftSaved"), error: t("screen_game.toolbar.draftNotSaved") }} />;
}

/** Editor title bar: document identity, history, transport controls and panel toggles. */
export default function GameToolbar({ name, playing, playSession, loading, saving, saveStatus,
  assistantOpen, sceneTreeOpen, inspectorOpen, playHref, canUndo = false, canRedo = false, onUndo, onRedo,
  onPlay, onStop, onStep, onRestart, onSave, onLoad, onPublish, onExport, exporting = false, onBuildExecutable, onAssistant, onSceneTree, onInspector, onCommandPalette, layoutMenu }: GameToolbarProps) {
  const undoShortcut = useGameCommandShortcut("edit.undo");
  const { t } = useTranslation();
  const redoShortcut = useGameCommandShortcut("edit.redo");
  const paletteShortcut = useGameCommandShortcut("editor.commandPalette");
  return <Toolbar component="header" sx={{
    display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)", columnGap: SPACING.lg
  }}>
    <FlexRow gap={SPACING.sm} align="center" sx={{ minWidth: 0 }}>
      <VideogameAssetOutlinedIcon fontSize="small" sx={{ color: "text.secondary", flexShrink: 0 }} />
      <Text weight={500} truncate title={name}>{name}</Text>
      <GameSaveState saveStatus={saveStatus} />
      {(onUndo || onRedo) && <>
        <ToolbarDivider />
        <ToolbarIconButton icon={<UndoIcon fontSize="small" />} tooltip={t("screen_game.toolbar.undo")} shortcut={undoShortcut} disabled={!canUndo} onClick={onUndo} />
        <ToolbarIconButton icon={<RedoIcon fontSize="small" />} tooltip={t("screen_game.toolbar.redo")} shortcut={redoShortcut} disabled={!canRedo} onClick={onRedo} />
      </>}
    </FlexRow>

    <FlexRow gap={SPACING.micro} align="center" role="group" aria-label={t("screen_game.toolbar.playControls")} sx={{
      p: SPACING.micro, borderRadius: CONTROL.radius, bgcolor: "action.hover", border: 1, borderColor: "divider"
    }}>
      <ToolbarIconButton icon={playing ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
        tooltip={playing ? t("screen_game.toolbar.pause") : t("screen_game.toolbar.play")} onClick={onPlay} disabled={loading} active={playSession}
        sx={playSession ? { bgcolor: "primary.main", color: "primary.contrastText", "&:hover": { bgcolor: "primary.dark", color: "primary.contrastText" } } : undefined} />
      <ToolbarIconButton icon={<SkipNextIcon fontSize="small" />} tooltip={t("screen_game.toolbar.step")} onClick={onStep} disabled={playing || loading || !playSession} />
      <ToolbarIconButton icon={<StopIcon fontSize="small" />} tooltip={t("screen_game.toolbar.stop")} onClick={onStop} disabled={loading || !playSession} />
      {onRestart && <ToolbarIconButton icon={<RestartAltIcon fontSize="small" />} tooltip={t("screen_game.toolbar.restartFromTickZero")} onClick={onRestart} disabled={loading || !playSession} />}
    </FlexRow>

    <FlexRow gap={SPACING.xs} align="center" justify="flex-end" sx={{ minWidth: 0 }}>
      <ToolbarIconButton icon={<FileDownloadOutlinedIcon fontSize="small" />} tooltip={t("screen_game.toolbar.savePlayState")} onClick={onSave} disabled={loading || !playSession} />
      <ToolbarIconButton icon={<FileUploadOutlinedIcon fontSize="small" />} tooltip={t("screen_game.toolbar.loadPlayState")} onClick={onLoad} disabled={loading || !playSession} />
      <ToolbarIconButton icon={<OpenInNewIcon fontSize="small" />} tooltip={t("screen_game.toolbar.playInNewTab")} component="a"
        href={playHref} target="_blank" rel="noopener noreferrer" disabled={saveStatus !== "saved" || saving} />
      <ToolbarDivider />
      <ToolbarIconButton icon={<AccountTreeOutlinedIcon fontSize="small" />} tooltip={t("screen_game.toolbar.toggleSceneTree")}
        aria-pressed={sceneTreeOpen} active={sceneTreeOpen} onClick={onSceneTree} />
      <ToolbarIconButton icon={<TuneOutlinedIcon fontSize="small" />} tooltip={t("screen_game.toolbar.toggleInspector")}
        aria-pressed={inspectorOpen} active={inspectorOpen} onClick={onInspector} />
      <ToolbarIconButton icon={<AutoAwesomeOutlinedIcon fontSize="small" />} tooltip={assistantOpen ? t("screen_game.toolbar.hideAssistant") : t("screen_game.toolbar.showAssistant")}
        aria-pressed={assistantOpen} active={assistantOpen} onClick={onAssistant} />
      {onCommandPalette && <ToolbarIconButton icon={<KeyboardCommandKeyIcon fontSize="small" />} tooltip={t("screen_game.toolbar.commands")}
        shortcut={paletteShortcut} onClick={onCommandPalette} />}
      {layoutMenu}
      <ToolbarDivider />
      {onExport && <GameExportButton exporting={exporting} onExport={onExport} onBuildExecutable={onBuildExecutable} />}
      <EditorButton variant="contained" disableElevation density="normal" onClick={onPublish} disabled={saving || saveStatus === "saving"}>{t("screen_game.toolbar.publish")}</EditorButton>
    </FlexRow>
  </Toolbar>;
}
