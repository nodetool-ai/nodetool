import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import FileUploadOutlinedIcon from "@mui/icons-material/FileUploadOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import RedoIcon from "@mui/icons-material/Redo";
import SkipNextIcon from "@mui/icons-material/SkipNext";
import StopIcon from "@mui/icons-material/Stop";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import UndoIcon from "@mui/icons-material/Undo";
import VideogameAssetOutlinedIcon from "@mui/icons-material/VideogameAssetOutlined";

import { BORDER_RADIUS, Box, Caption, CONTROL, EditorButton, FlexRow, SPACING, Text, ToolbarIconButton } from "../../ui_primitives";

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
  onSave: () => void;
  onLoad: () => void;
  onPublish: () => void;
  onAssistant: () => void;
  onSceneTree: () => void;
  onInspector: () => void;
}

const DIVIDER_SX = { width: "1px", alignSelf: "stretch", my: SPACING.sm, bgcolor: "divider", flexShrink: 0 } as const;

function SaveState({ saveStatus }: { saveStatus: string }) {
  const color = saveStatus === "saved" ? "success.main" : saveStatus === "saving" ? "info.main" : saveStatus === "error" ? "error.main" : "warning.main";
  return <FlexRow gap={SPACING.xs} align="center" sx={{ minWidth: 0 }}>
    <Box sx={{ width: SPACING.md, height: SPACING.md, borderRadius: BORDER_RADIUS.circle, bgcolor: color, flexShrink: 0 }} />
    <Caption sx={{ whiteSpace: "nowrap" }}>
      {saveStatus === "saved" ? "Draft saved" : saveStatus === "saving" ? "Saving draft"
        : saveStatus === "error" ? "Draft not saved" : "Unsaved changes"}
    </Caption>
  </FlexRow>;
}

/** Editor title bar: document identity, history, transport controls and panel toggles. */
export default function GameToolbar({ name, playing, playSession, loading, saving, saveStatus,
  assistantOpen, sceneTreeOpen, inspectorOpen, playHref, canUndo = false, canRedo = false, onUndo, onRedo,
  onPlay, onStop, onStep, onSave, onLoad, onPublish, onAssistant, onSceneTree, onInspector }: GameToolbarProps) {
  return <Box component="header" sx={{
    display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)", alignItems: "center",
    columnGap: SPACING.lg, minHeight: CONTROL.height.xl, px: SPACING.md,
    bgcolor: "background.paper", borderBottom: 1, borderColor: "divider"
  }}>
    <FlexRow gap={SPACING.sm} align="center" sx={{ minWidth: 0 }}>
      <VideogameAssetOutlinedIcon fontSize="small" sx={{ color: "text.secondary", flexShrink: 0 }} />
      <Text weight={500} truncate title={name}>{name}</Text>
      <SaveState saveStatus={saveStatus} />
      {(onUndo || onRedo) && <>
        <Box sx={DIVIDER_SX} />
        <ToolbarIconButton icon={<UndoIcon fontSize="small" />} tooltip="Undo" shortcut={["Ctrl", "Z"]} disabled={!canUndo} onClick={onUndo} />
        <ToolbarIconButton icon={<RedoIcon fontSize="small" />} tooltip="Redo" shortcut={["Ctrl", "Shift", "Z"]} disabled={!canRedo} onClick={onRedo} />
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
    </FlexRow>

    <FlexRow gap={SPACING.xs} align="center" justify="flex-end" sx={{ minWidth: 0 }}>
      <ToolbarIconButton icon={<FileDownloadOutlinedIcon fontSize="small" />} tooltip="Save play state" onClick={onSave} disabled={loading || !playSession} />
      <ToolbarIconButton icon={<FileUploadOutlinedIcon fontSize="small" />} tooltip="Load play state" onClick={onLoad} disabled={loading || !playSession} />
      <ToolbarIconButton icon={<OpenInNewIcon fontSize="small" />} tooltip="Play in new tab" component="a"
        href={playHref} target="_blank" rel="noopener noreferrer" disabled={saveStatus !== "saved" || saving} />
      <Box sx={DIVIDER_SX} />
      <ToolbarIconButton icon={<AccountTreeOutlinedIcon fontSize="small" />} tooltip="Toggle scene tree"
        aria-pressed={sceneTreeOpen} active={sceneTreeOpen} onClick={onSceneTree} />
      <ToolbarIconButton icon={<TuneOutlinedIcon fontSize="small" />} tooltip="Toggle inspector"
        aria-pressed={inspectorOpen} active={inspectorOpen} onClick={onInspector} />
      <ToolbarIconButton icon={<AutoAwesomeOutlinedIcon fontSize="small" />} tooltip={assistantOpen ? "Hide assistant" : "Show assistant"}
        aria-pressed={assistantOpen} active={assistantOpen} onClick={onAssistant} />
      <Box sx={DIVIDER_SX} />
      <EditorButton variant="contained" disableElevation density="normal" onClick={onPublish} disabled={saving || saveStatus === "saving"}>Publish</EditorButton>
    </FlexRow>
  </Box>;
}
