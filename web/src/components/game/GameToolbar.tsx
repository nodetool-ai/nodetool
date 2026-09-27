import { Caption, EditorButton, FlexRow, SPACING, Text } from "../ui_primitives";

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
  onPlay: () => void;
  onStop: () => void;
  onStep: () => void;
  onSave: () => void;
  onLoad: () => void;
  onPublish: () => void;
  onAssistant: () => void;
}

export default function GameToolbar({ name, playing, playSession, loading, saving, saveStatus, tick, score, won, backend,
  assistantOpen, onPlay, onStop, onStep, onSave, onLoad, onPublish, onAssistant }: GameToolbarProps) {
  return <FlexRow align="center" gap={SPACING.sm} wrap>
    <Text size="big">{name}</Text>
    <EditorButton onClick={onPlay} disabled={loading}>{playing ? "Pause" : "Play"}</EditorButton>
    <EditorButton onClick={onStop} disabled={loading || !playSession}>Stop</EditorButton>
    <EditorButton onClick={onStep} disabled={playing || loading || !playSession}>Step</EditorButton>
    <EditorButton onClick={onSave} disabled={loading || !playSession}>Save play state</EditorButton>
    <EditorButton onClick={onLoad} disabled={loading || !playSession}>Load play state</EditorButton>
    <EditorButton onClick={onPublish} disabled={saving || saveStatus === "saving"}>Publish</EditorButton>
    <EditorButton onClick={onAssistant}>{assistantOpen ? "Hide assistant" : "Show assistant"}</EditorButton>
    <Caption>{saveStatus === "saved" ? "Draft saved" : saveStatus === "saving" ? "Saving draft" : "Unpublished changes"}</Caption>
    <Caption>Tick {tick} · Score {score} · {won ? "Won" : "Playing"} · {backend}</Caption>
  </FlexRow>;
}
