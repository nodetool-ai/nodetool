import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentProps, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useStore, type StoreApi } from "zustand";

import type { GamePanelLayoutState } from "../../../stores/game/GamePanelLayoutStore";
import { useGameShortcutStore } from "../../../stores/game/GameShortcutStore";
import { Caption, EditorButton, EditorUiProvider, FlexColumn, FlexRow, SPACING } from "../../ui_primitives";
import ReportBugButton from "../../support/ReportBugButton";
import GameToolbar from "./GameToolbar";
import GameStatusBar from "./GameStatusBar";
import GameCommandPalette from "./GameCommandPalette";
import GameShortcutsDialog from "./GameShortcutsDialog";
import { DockCanvas } from "../../dock/DockCanvas";
import { DockLayoutMenu } from "../../dock/DockLayoutMenu";
import { useDockPresentation, type DockPanelView } from "../../dock/useDockPresentation";
import { dispatchGameShortcut, formatGameBinding, GAME_COMMANDS, resolveGameBindings, type GameCommandHandlers } from "./gameCommands";
import type { ContextCommand } from "../../../stores/CommandMenuStore";
import { useContextCommands } from "../../../hooks/useContextCommands";
import { isMac } from "../../../utils/platform";
import { createGameCommandRegistry, GameCommandContext } from "./useGameCommands";
import { gamePanelRegistry, type GameDimension, type GamePanelRegistry } from "./panelRegistry";
import { GAME_EDITOR_ROOT_SX } from "./gameEditorStyles";
import { useGameExport } from "./useGameExport";
import { useGameExecutableBuild } from "./useGameExecutableBuild";
import { isElectron, isLocalhost } from "../../../lib/env";

/** Compiling runs cargo on the server's machine, which is this computer only in the desktop app or a local server. */
const CAN_BUILD_EXECUTABLE = isElectron || isLocalhost;

export type GamePanelView = DockPanelView;
interface GameEditorShellProps {
  readonly dimension: GameDimension;
  readonly toolbar: ComponentProps<typeof GameToolbar>;
  readonly status: ComponentProps<typeof GameStatusBar>;
  readonly panels: readonly GamePanelView[];
  readonly layoutStore: StoreApi<GamePanelLayoutState>;
  readonly registry?: GamePanelRegistry;
  readonly notices?: ReactNode;
  readonly mobile?: ReactNode;
  readonly dialogs?: ReactNode;
  /** Handlers for registry commands. Components inside the shell can add more with `useGameCommandHandlers`. */
  readonly commands?: GameCommandHandlers;
  /** Whether this editor's tab is the one on screen; its commands join the app's command menu while it is. */
  readonly active?: boolean;
  /** The saved game, for exporting its published revision. */
  readonly exportGame?: { readonly id: string; readonly name: string };
}

export default function GameEditorShell({ dimension, toolbar, status, panels, layoutStore, registry = gamePanelRegistry,
  notices, mobile, dialogs, commands, active = true, exportGame }: GameEditorShellProps): ReactNode {
  const { t } = useTranslation();
  const root = useRef<HTMLDivElement | null>(null);
  const registrations = useSyncExternalStore(registry.subscribe, registry.getSnapshot, registry.getSnapshot);
  const layout = useStore(layoutStore, (state) => state.layout);
  useEffect(() => { layoutStore.getState().registerPanels(registrations); }, [layoutStore, registrations, layout]);
  const views = panels.filter((view) => view.visible !== false && registrations.some((entry) => entry.id === view.id && entry.dimensions.includes(dimension)));
  const presentation = useDockPresentation({ store: layoutStore, layout, registry: registrations,
    availableIds: views.map((view) => view.id), views, root });
  const shortcutStore = useGameShortcutStore();
  const overrides = useStore(shortcutStore, (state) => state.overrides);
  const bindings = useMemo(() => resolveGameBindings(overrides), [overrides]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const exporter = useGameExport(exportGame);
  const exportEnabled = exportGame !== undefined && exporter.exporting === null;
  const executable = useGameExecutableBuild(exportGame, () => layoutStore.getState().dispatch({ type: "reveal", panelId: "console" }));
  const canBuildExecutable = CAN_BUILD_EXECUTABLE && exportGame !== undefined;
  const showBinary = window.api?.showItemInFolder;
  const builtIn: GameCommandHandlers = {
    "editor.commandPalette": { run: () => setPaletteOpen(true) },
    "editor.keyboardShortcuts": { run: () => setShortcutsOpen(true) },
    "editor.publish": { run: toolbar.onPublish, enabled: !toolbar.saving && toolbar.saveStatus !== "saving" },
    "editor.exportWeb": { run: () => exporter.run("web"), enabled: exportEnabled },
    "editor.exportDesktop": { run: () => exporter.run("tauri"), enabled: exportEnabled },
    "editor.buildExecutable": { run: executable.run, enabled: canBuildExecutable && !executable.building },
    "edit.undo": toolbar.onUndo ? { run: toolbar.onUndo, enabled: toolbar.canUndo !== false } : undefined,
    "edit.redo": toolbar.onRedo ? { run: toolbar.onRedo, enabled: toolbar.canRedo !== false } : undefined,
    "play.toggle": { run: toolbar.onPlay, enabled: !toolbar.loading },
    "play.step": { run: toolbar.onStep, enabled: toolbar.playSession && !toolbar.playing && !toolbar.loading },
    "play.stop": { run: toolbar.onStop, enabled: toolbar.playSession && !toolbar.loading },
    "panel.sceneTree": { run: toolbar.onSceneTree },
    "panel.inspector": { run: toolbar.onInspector },
    "panel.assistant": { run: toolbar.onAssistant }
  };
  const fallback = useRef<GameCommandHandlers>({});
  useLayoutEffect(() => { fallback.current = { ...builtIn, ...commands }; });
  const [commandRegistry] = useState(() => createGameCommandRegistry(() => fallback.current));
  const playSession = toolbar.playSession;
  // The registry's commands in the app's command menu. A handler is looked up when the command runs,
  // so one disabled or missing by then does nothing.
  const menuCommands = useMemo<ContextCommand[]>(() => GAME_COMMANDS
    .filter((entry) => entry.id !== "editor.commandPalette" && entry.dimensions.includes(dimension) && (!playSession || entry.whilePlaying))
    .map((entry) => {
      const binding = bindings.get(entry.id)?.[0];
      return { id: entry.id, label: entry.title, keywords: [entry.category],
        shortcut: binding ? formatGameBinding(binding, isMac()).join("+") : undefined,
        run: () => {
          const handler = commandRegistry.handler(entry.id);
          if (handler && handler.enabled !== false) { handler.run(); }
        } };
    }), [bindings, commandRegistry, dimension, playSession]);
  useContextCommands(t("screen_game.shell.contextMenuLabel"), menuCommands, active);
  return <EditorUiProvider scope="inspector"><GameCommandContext.Provider value={commandRegistry}><FlexColumn ref={root} sx={GAME_EDITOR_ROOT_SX}
    onKeyDown={(event) => {
      // Dialogs render in portals, so their key presses bubble here through React without being inside the editor element.
      if (!(event.target instanceof Node) || !root.current?.contains(event.target)) { return; }
      dispatchGameShortcut(event, { dimension, playing: toolbar.playSession, bindings, handler: commandRegistry.handler });
    }}>
    <GameToolbar {...toolbar} onCommandPalette={() => setPaletteOpen(true)}
      onExport={exportGame ? exporter.run : undefined} exporting={exporter.exporting !== null}
      onBuildExecutable={canBuildExecutable && !executable.building ? executable.run : undefined}
      layoutMenu={<DockLayoutMenu store={layoutStore} panels={registrations.filter((entry) => views.some((view) => view.id === entry.id))} />} />
    {exporter.exporting && <Caption role="status" sx={{ px: SPACING.md, py: SPACING.xs }}>
      {exporter.exporting === "tauri" ? t("screen_game.shell.buildingDesktop") : t("screen_game.shell.buildingWeb")}
    </Caption>}
    {exporter.error && <FlexRow gap={SPACING.sm} align="center" sx={{ px: SPACING.md, py: SPACING.xs, borderBottom: 1, borderColor: "divider" }}>
      <Caption color="error" role="alert">{t("screen_game.shell.exportFailed", { error: exporter.error })}</Caption>
      <ReportBugButton context={{ source: "panel-crash", summary: t("screen_game.shell.exportFailedSummary"), errorText: exporter.error }} />
      <EditorButton onClick={exporter.dismiss}>{t("screen_game.common.dismiss")}</EditorButton>
    </FlexRow>}
    {executable.building && <FlexRow gap={SPACING.sm} align="center" sx={{ px: SPACING.md, py: SPACING.xs }}>
      <Caption role="status">{t("screen_game.shell.compilingExecutable")}</Caption>
      <EditorButton onClick={executable.cancel}>{t("screen_game.common.cancel")}</EditorButton>
    </FlexRow>}
    {executable.binaryPath && <FlexRow gap={SPACING.sm} align="center" sx={{ px: SPACING.md, py: SPACING.xs, borderBottom: 1, borderColor: "divider" }}>
      <Caption role="status" sx={{ minWidth: 0, overflowWrap: "anywhere" }}>{t("screen_game.shell.built", { path: executable.binaryPath })}</Caption>
      {showBinary && <EditorButton onClick={() => { void showBinary(executable.binaryPath ?? ""); }}>{t("screen_game.shell.showInFolder")}</EditorButton>}
      <EditorButton onClick={executable.dismiss}>{t("screen_game.common.dismiss")}</EditorButton>
    </FlexRow>}
    {executable.error && <FlexRow gap={SPACING.sm} align="center" sx={{ px: SPACING.md, py: SPACING.xs, borderBottom: 1, borderColor: "divider" }}>
      <Caption color="error" role="alert">{t("screen_game.shell.buildFailed", { error: executable.error })}</Caption>
      <ReportBugButton context={{ source: "panel-crash", summary: t("screen_game.shell.buildFailedSummary"), errorText: executable.error }} />
      <EditorButton onClick={executable.dismiss}>{t("screen_game.common.dismiss")}</EditorButton>
    </FlexRow>}
    {notices}
    <DockCanvas presentation={presentation} store={layoutStore} />
    <GameStatusBar {...status} />
    {mobile}
    {dialogs}
    <GameCommandPalette open={paletteOpen} dimension={dimension} playing={toolbar.playSession} bindings={bindings}
      handler={commandRegistry.handler} onClose={() => setPaletteOpen(false)} />
    <GameShortcutsDialog open={shortcutsOpen} dimension={dimension} store={shortcutStore} onClose={() => setShortcutsOpen(false)} />
  </FlexColumn></GameCommandContext.Provider></EditorUiProvider>;
}
