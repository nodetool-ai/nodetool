import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { GameBehavior } from "@nodetool-ai/protocol/game.js";
import { GAME_SCRIPT_LIFECYCLE_TYPES, GAME_SCRIPT_LIFECYCLE_TYPES_3D, GAME_SCRIPT_TYPES, GAME_SCRIPT_TYPES_3D, GAME_SCRIPT_WORLD_TYPES, GAME_SCRIPT_WORLD_TYPES_3D } from "@nodetool-ai/game-runtime";

import CloseIcon from "@mui/icons-material/CloseOutlined";
import CodeIcon from "@mui/icons-material/Code";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";

import { useMonacoEditor } from "../../../../hooks/editor/useMonacoEditor";
import { AlertBanner, Box, Caption, CONTROL, Divider, EditorButton, FlexColumn, FlexRow, FONT_SIZE_SANS, LoadingSpinner, SPACING, ToolbarIconButton } from "../../../ui_primitives";
import ErrorBanner from "../../../support/ErrorBanner";
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

const NOTICE_SX = { flexShrink: 0, mx: SPACING.md, my: SPACING.xs };

export default function GameScriptPane({ dimension = "2d", entityId, entityName, behaviorIndex, behavior, error, onReplay, onAskAssistant, onRunTenSeconds,
  runningTenSeconds, runSummary, runEntityStats = [], onChange, onClose }: GameScriptPaneProps) {
  const { t } = useTranslation();
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

  const limits = `${t("i18n-next26.game.scriptLength", { length: source.length, maxLength: 16384 })} · ${t("i18n-next26.game.scriptCommandLimit", { count: behavior.maxCommands })} · ${t("i18n-next26.game.scriptMillisecondsPerTick", { milliseconds: behavior.maxTickMs })}`;
  return (
    <FlexColumn sx={{ flex: 1, minHeight: 0, minWidth: 0, height: "100%" }}>
      <DockPanelHeader title={t("i18n-next26.game.scripts")} label={t("i18n-next26.game.scriptLabel", { entity: entityName || entityId, number: behaviorIndex + 1 })}
        icon={<CodeIcon sx={{ fontSize: FONT_SIZE_SANS.body, color: "text.secondary" }} />}>
        {onRunTenSeconds && <EditorButton startIcon={<PlayArrowIcon />} disabled={runningTenSeconds}
          onClick={onRunTenSeconds}>{runningTenSeconds ? t("i18n-next26.game.running") : t("i18n-next26.game.runTenSeconds")}</EditorButton>}
        {onRunTenSeconds && <Divider orientation="vertical" flexItem sx={{ my: SPACING.sm, mx: SPACING.xs }} />}
        <ToolbarIconButton icon={<CloseIcon fontSize="small" />} tooltip={t("i18n-next26.game.close")} onClick={onClose} />
      </DockPanelHeader>
      {conflict && <AlertBanner severity="warning" compact sx={NOTICE_SX} action={<FlexRow gap={SPACING.xs}>
        <EditorButton onClick={() => { sourceRef.current = behavior.source; setSource(behavior.source); setConflict(false); }}>{t("i18n-next26.game.useDraftVersion")}</EditorButton>
        <EditorButton onClick={() => { setConflict(false); onChange(sourceRef.current); }}>{t("i18n-next26.game.keepMyVersion")}</EditorButton>
      </FlexRow>}>{t("i18n-next26.game.scriptConflict")}</AlertBanner>}
      {/* The user's own script failed: no Report, it is not a NodeTool fault. */}
      {error && <AlertBanner severity="error" compact sx={NOTICE_SX} action={<FlexRow gap={SPACING.xs}>
        {onReplay && error.tick > 0 && <EditorButton onClick={onReplay}>{t("i18n-next26.game.replayToTick", { tick: error.tick - 1 })}</EditorButton>}
        {onAskAssistant && <EditorButton onClick={onAskAssistant}>{t("i18n-next26.game.askAssistant")}</EditorButton>}
      </FlexRow>}><Box component="span" sx={{ fontFamily: "var(--fontFamily2)" }}>{t("i18n-next101.game.script.tickError", { tick: error.tick, message: error.message })}</Box></AlertBanner>}
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
            {monacoLoadError ? <ErrorBanner report={{ source: "panel-crash", summary: t("i18n-next26.game.scripts"), errorText: monacoLoadError }}>{monacoLoadError}</ErrorBanner> : isMonacoLoading ? <LoadingSpinner size="small" /> : null}
          </FlexRow>}
      </Box>
      {runEntityStats.length > 0 && <FlexColumn component="ul" aria-label={t("i18n-next26.game.scriptTimeByEntity")} sx={{ flexShrink: 0, maxHeight: "25%", overflowY: "auto",
        m: 0, px: SPACING.md, py: SPACING.xs, listStyle: "none", borderTop: 1, borderColor: "divider" }}>
        {runEntityStats.map((entry) => <FlexRow component="li" key={entry.entityId} gap={SPACING.md} align="center" sx={{ minHeight: CONTROL.height.xs }}>
          <Caption sx={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "var(--fontFamily2)" }}>{entry.entityId}</Caption>
          <Caption color="text.secondary" sx={{ fontFamily: "var(--fontFamily2)" }}>{t("i18n-next26.game.scriptTimeEntry", { duration: entry.durationMs.toFixed(1) })} {t("i18n-next26.game.scriptCallCount", { count: entry.calls })}</Caption>
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
