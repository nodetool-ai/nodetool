import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { GameBehavior } from "@nodetool-ai/protocol/game.js";
import { GAME_SCRIPT_LIFECYCLE_TYPES, GAME_SCRIPT_LIFECYCLE_TYPES_3D, GAME_SCRIPT_TYPES, GAME_SCRIPT_TYPES_3D, GAME_SCRIPT_WORLD_TYPES, GAME_SCRIPT_WORLD_TYPES_3D } from "@nodetool-ai/game-runtime";

import CloseIcon from "@mui/icons-material/Close";
import CodeIcon from "@mui/icons-material/Code";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";

import { useMonacoEditor } from "../../../../hooks/editor/useMonacoEditor";
import { Box, Caption, CONTROL, Divider, EditorButton, FlexColumn, FlexRow, FONT_SIZE_SANS, LoadingSpinner, SPACING, ToolbarIconButton } from "../../../ui_primitives";
import DockPanelHeader from "../../../dock/DockPanelHeader";

interface GameScriptPaneProps {
  dimension?: "2d" | "3d";
  entityId: string;
  entityName: string;
  behaviorIndex: number;
  behavior: Extract<GameBehavior, { kind: "script" }>;
  error?: { message: string; tick: number } | null;
  onReplay?: () => void;
  onAskAssistant?: () => void;
  onRunTenSeconds?: () => void;
  runningTenSeconds?: boolean;
  runSummary?: string | null;
  runEntityStats?: readonly { entityId: string; durationMs: number; calls: number }[];
  onChange: (source: string) => void;
  onClose: () => void;
}

/** A full-width notice strip between the toolbar and the editor. */
function Notice({ tone, children }: { tone: "warning" | "error"; children: ReactNode }) {
  return <FlexRow align="center" gap={SPACING.sm} wrap sx={{ flexShrink: 0, minHeight: CONTROL.height.md, px: SPACING.md, py: SPACING.xs,
    borderBottom: 1, borderColor: "divider", bgcolor: `rgba(var(--palette-${tone}-mainChannel) / 0.08)` }}>{children}</FlexRow>;
}

export default function GameScriptPane({ dimension = "2d", entityId, entityName, behaviorIndex, behavior, error, onReplay, onAskAssistant, onRunTenSeconds,
  runningTenSeconds, runSummary, runEntityStats = [], onChange, onClose }: GameScriptPaneProps) {
  const { MonacoEditor, monacoLoadError, isMonacoLoading, loadMonacoIfNeeded } = useMonacoEditor();
  const [source, setSource] = useState(behavior.source);
  const [conflict, setConflict] = useState(false);
  const sourceRef = useRef(source);
  const baselineRef = useRef(behavior.source);
  const key = `${entityId}:${behaviorIndex}`;

  useEffect(() => { void loadMonacoIfNeeded(); }, [loadMonacoIfNeeded]);
  useEffect(() => {
    if (sourceRef.current === baselineRef.current) {
      sourceRef.current = behavior.source;
      setSource(behavior.source);
      setConflict(false);
    } else if (sourceRef.current === behavior.source) {
      setConflict(false);
    } else {
      setConflict(true);
    }
    baselineRef.current = behavior.source;
  }, [behavior.source]);

  const options = useMemo(() => ({ minimap: { enabled: false }, automaticLayout: true,
    scrollBeyondLastLine: false, tabSize: 2 }), []);

  const limits = `${source.length} / 16384 characters · ${behavior.maxCommands} commands · ${behavior.maxTickMs} ms per tick`;
  return (
    <FlexColumn sx={{ flex: 1, minHeight: 0, minWidth: 0, height: "100%" }}>
      <DockPanelHeader title="Scripts" label={`${entityName || entityId} · Script ${behaviorIndex + 1}`}
        icon={<CodeIcon sx={{ fontSize: FONT_SIZE_SANS.body, color: "text.secondary" }} />}>
        {onRunTenSeconds && <EditorButton startIcon={<PlayArrowIcon fontSize="small" />} disabled={runningTenSeconds}
          onClick={onRunTenSeconds}>{runningTenSeconds ? "Running" : "Run 10 s"}</EditorButton>}
        {onRunTenSeconds && <Divider orientation="vertical" flexItem sx={{ my: SPACING.sm, mx: SPACING.xs }} />}
        <ToolbarIconButton icon={<CloseIcon fontSize="small" />} tooltip="Close" onClick={onClose} />
      </DockPanelHeader>
      {conflict && <Notice tone="warning">
        <Caption role="alert" sx={{ flex: 1, minWidth: 0 }}>The draft script changed. Your edits are not being saved until you choose a version.</Caption>
        <EditorButton onClick={() => { sourceRef.current = behavior.source; setSource(behavior.source); setConflict(false); }}>Use draft version</EditorButton>
        <EditorButton onClick={() => { setConflict(false); onChange(sourceRef.current); }}>Keep my version</EditorButton>
      </Notice>}
      {error && <Notice tone="error">
        <Caption color="error" role="alert" sx={{ flex: 1, minWidth: 0, fontFamily: "var(--fontFamily2)" }}>Tick {error.tick}: {error.message}</Caption>
        {onReplay && error.tick > 0 && <EditorButton onClick={onReplay}>Replay to tick {error.tick - 1}</EditorButton>}
        {onAskAssistant && <EditorButton onClick={onAskAssistant}>Ask the assistant</EditorButton>}
      </Notice>}
      <Box sx={{ position: "relative", flex: 1, minHeight: 0 }}>
        {MonacoEditor ? <MonacoEditor key={key} value={source} onChange={(value) => {
          const next = value ?? "";
          sourceRef.current = next;
          setSource(next);
          if (!conflict) { onChange(next); }
        }}
          onMount={() => {
            void import("monaco-editor/esm/vs/language/typescript/monaco.contribution.js").then((module) => {
              const { javascriptDefaults, ScriptTarget } = module as unknown as {
                javascriptDefaults: {
                  addExtraLib: (source: string, path: string) => void;
                  setCompilerOptions: (options: { allowJs: boolean; checkJs: boolean; noEmit: boolean; target: number }) => void;
                };
                ScriptTarget: { ES2020: number };
              };
              javascriptDefaults.addExtraLib(dimension === "3d"
                ? GAME_SCRIPT_TYPES_3D + GAME_SCRIPT_WORLD_TYPES_3D + GAME_SCRIPT_LIFECYCLE_TYPES_3D
                : GAME_SCRIPT_TYPES + GAME_SCRIPT_WORLD_TYPES + GAME_SCRIPT_LIFECYCLE_TYPES, "file:///native-game.d.ts");
              javascriptDefaults.setCompilerOptions({ allowJs: true, checkJs: true, noEmit: true, target: ScriptTarget.ES2020 });
            });
          }}
          language="javascript" theme="vs-dark" width="100%" height="100%" options={options} />
          : <FlexRow align="center" justify="center" sx={{ position: "absolute", inset: 0, p: SPACING.lg }}>
            {monacoLoadError ? <Caption color="error" role="alert">{monacoLoadError}</Caption> : isMonacoLoading ? <LoadingSpinner size="small" /> : null}
          </FlexRow>}
      </Box>
      {runEntityStats.length > 0 && <FlexColumn component="ul" aria-label="Script time by entity" sx={{ flexShrink: 0, maxHeight: "25%", overflowY: "auto",
        m: 0, px: SPACING.md, py: SPACING.xs, listStyle: "none", borderTop: 1, borderColor: "divider" }}>
        {runEntityStats.map((entry) => <FlexRow component="li" key={entry.entityId} gap={SPACING.md} align="center" sx={{ minHeight: CONTROL.height.xs }}>
          <Caption sx={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "var(--fontFamily2)" }}>{entry.entityId}</Caption>
          <Caption color="text.secondary" sx={{ fontFamily: "var(--fontFamily2)" }}>{entry.durationMs.toFixed(1)} ms across {entry.calls} calls</Caption>
        </FlexRow>)}
      </FlexColumn>}
      <FlexRow align="center" gap={SPACING.md} sx={{ flexShrink: 0, minHeight: CONTROL.height.sm, px: SPACING.md,
        borderTop: 1, borderColor: "divider", bgcolor: "background.paper" }}>
        <Caption color="text.secondary" sx={{ flexShrink: 0 }}>{limits}</Caption>
        {runSummary && <Caption role="status" sx={{ ml: "auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{runSummary}</Caption>}
      </FlexRow>
    </FlexColumn>
  );
}
