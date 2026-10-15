import type { ReactNode } from "react";
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

const SAVE_LABELS = {
  dirty: "Unsaved changes", saving: "Saving draft", saved: "Draft saved", error: "Draft not saved"
} as const;

function GameSaveState({ saveStatus }: { saveStatus: string }) {
  const state = saveStatus === "saved" || saveStatus === "saving" || saveStatus === "error" ? saveStatus : "dirty";
  return <SaveState state={state} labels={SAVE_LABELS} />;
}

/** Editor title bar: document identity, history, transport controls and panel toggles. */
export default function GameToolbar({ name, playing, playSession, loading, saving, saveStatus,
  assistantOpen, sceneTreeOpen, inspectorOpen, playHref, canUndo = false, canRedo = false, onUndo, onRedo,
  onPlay, onStop, onStep, onRestart, onSave, onLoad, onPublish, onExport, exporting = false, onBuildExecutable, onAssistant, onSceneTree, onInspector, onCommandPalette, layoutMenu }: GameToolbarProps) {
  const undoShortcut = useGameCommandShortcut("edit.undo");
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
        <ToolbarIconButton icon={<UndoIcon fontSize="small" />} tooltip="Undo" shortcut={undoShortcut} disabled={!canUndo} onClick={onUndo} />
        <ToolbarIconButton icon={<RedoIcon fontSize="small" />} tooltip="Redo" shortcut={redoShortcut} disabled={!canRedo} onClick={onRedo} />
      </>}
    </FlexRow>

    <FlexRow gap={SPACING.micro} align="center" role="group" aria-label="Play controls" sx={{
      p: SPACING.micro, borderRadius: CONTROL.radius, bgcolor: "action.hover", border: 1, borderColor: "divider"
    }}>
      <ToolbarIconButton icon={playing ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
        tooltip={playing ? "Pause" : "Play"} onClick={onPlay} disabled={loading} active={playSession}
        sx={playSession ? { bgcolor: "primary.main", color: "primary.contrastText", "&:hover": { bgcolor: "primary.dark", color: "primary.contrastText" } } : undefined} />
      <ToolbarIconButton icon={<SkipNextIcon fontSize="small" />} tooltip="Step" onClick={onStep} disabled={playing || loading || !playSession} />
      <ToolbarIconButton icon={<StopIcon fontSize="small" />} tooltip="Stop" onClick={onStop} disabled={loading || !playSession} />
      {onRestart && <ToolbarIconButton icon={<RestartAltIcon fontSize="small" />} tooltip="Restart from tick 0" onClick={onRestart} disabled={loading || !playSession} />}
    </FlexRow>

    <FlexRow gap={SPACING.xs} align="center" justify="flex-end" sx={{ minWidth: 0 }}>
      <ToolbarIconButton icon={<FileDownloadOutlinedIcon fontSize="small" />} tooltip="Save play state" onClick={onSave} disabled={loading || !playSession} />
      <ToolbarIconButton icon={<FileUploadOutlinedIcon fontSize="small" />} tooltip="Load play state" onClick={onLoad} disabled={loading || !playSession} />
      <ToolbarIconButton icon={<OpenInNewIcon fontSize="small" />} tooltip="Play in new tab" component="a"
        href={playHref} target="_blank" rel="noopener noreferrer" disabled={saveStatus !== "saved" || saving} />
      <ToolbarDivider />
      <ToolbarIconButton icon={<AccountTreeOutlinedIcon fontSize="small" />} tooltip="Toggle scene tree"
        aria-pressed={sceneTreeOpen} active={sceneTreeOpen} onClick={onSceneTree} />
      <ToolbarIconButton icon={<TuneOutlinedIcon fontSize="small" />} tooltip="Toggle inspector"
        aria-pressed={inspectorOpen} active={inspectorOpen} onClick={onInspector} />
      <ToolbarIconButton icon={<AutoAwesomeOutlinedIcon fontSize="small" />} tooltip={assistantOpen ? "Hide assistant" : "Show assistant"}
        aria-pressed={assistantOpen} active={assistantOpen} onClick={onAssistant} />
      {onCommandPalette && <ToolbarIconButton icon={<KeyboardCommandKeyIcon fontSize="small" />} tooltip="Commands"
        shortcut={paletteShortcut} onClick={onCommandPalette} />}
      {layoutMenu}
      <ToolbarDivider />
      {onExport && <GameExportButton exporting={exporting} onExport={onExport} onBuildExecutable={onBuildExecutable} />}
      <EditorButton variant="contained" disableElevation density="normal" onClick={onPublish} disabled={saving || saveStatus === "saving"}>Publish</EditorButton>
    </FlexRow>
  </Toolbar>;
}
