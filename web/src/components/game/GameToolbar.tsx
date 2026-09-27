import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";

import { Caption, EditorButton, FlexRow, SPACING, Text, ToolbarIconButton } from "../ui_primitives";

interface GameToolbarProps {
  name: string;
  playing: boolean;
  playSession: boolean;
  loading: boolean;
  saving: boolean;
  saveStatus: string;
  tick: number;
  score: number;
  won: boolean;
  backend: string;
  assistantOpen: boolean;
  sceneTreeOpen: boolean;
  inspectorOpen: boolean;
  playHref: string;
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

export default function GameToolbar({ name, playing, playSession, loading, saving, saveStatus, tick, score, won, backend,
  assistantOpen, sceneTreeOpen, inspectorOpen, playHref, onPlay, onStop, onStep, onSave, onLoad, onPublish,
  onAssistant, onSceneTree, onInspector }: GameToolbarProps) {
  return <FlexRow align="center" gap={SPACING.sm} wrap>
    <Text size="big">{name}</Text>
    <EditorButton onClick={onPlay} disabled={loading}>{playing ? "Pause" : "Play"}</EditorButton>
    <EditorButton href={playHref} target="_blank" rel="noopener noreferrer" disabled={saveStatus !== "saved" || saving}>
      Play in new tab
    </EditorButton>
    <EditorButton onClick={onStop} disabled={loading || !playSession}>Stop</EditorButton>
    <EditorButton onClick={onStep} disabled={playing || loading || !playSession}>Step</EditorButton>
    <EditorButton onClick={onSave} disabled={loading || !playSession}>Save play state</EditorButton>
    <EditorButton onClick={onLoad} disabled={loading || !playSession}>Load play state</EditorButton>
    <EditorButton onClick={onPublish} disabled={saving || saveStatus === "saving"}>Publish</EditorButton>
    <ToolbarIconButton icon={<AccountTreeOutlinedIcon fontSize="small" />} tooltip="Toggle scene tree"
      aria-pressed={sceneTreeOpen} active={sceneTreeOpen} onClick={onSceneTree} />
    <ToolbarIconButton icon={<TuneOutlinedIcon fontSize="small" />} tooltip="Toggle inspector"
      aria-pressed={inspectorOpen} active={inspectorOpen} onClick={onInspector} />
    <EditorButton onClick={onAssistant}>{assistantOpen ? "Hide assistant" : "Show assistant"}</EditorButton>
    <Caption>{saveStatus === "saved" ? "Draft saved" : saveStatus === "saving" ? "Saving draft" : "Unpublished changes"}</Caption>
    <Caption>Tick {tick} · Score {score} · {won ? "Won" : "Playing"} · {backend}</Caption>
  </FlexRow>;
}
