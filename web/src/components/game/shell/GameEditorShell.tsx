import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentProps, type ReactNode } from "react";
import { useStore, type StoreApi } from "zustand";

import type { GamePanelLayoutState } from "../../../stores/game/GamePanelLayoutStore";
import { useGameShortcutStore } from "../../../stores/game/GameShortcutStore";
import { EditorUiProvider, FlexColumn } from "../../ui_primitives";
import GameToolbar from "./GameToolbar";
import GameStatusBar from "./GameStatusBar";
import GameCommandPalette from "./GameCommandPalette";
import GameShortcutsDialog from "./GameShortcutsDialog";
import { GameDockCanvas } from "./GameDockCanvas";
import { GameLayoutMenu } from "./GameLayoutMenu";
import { useGameDockPresentation } from "./useGameDockPresentation";
import { dispatchGameShortcut, resolveGameBindings, type GameCommandHandlers } from "./gameCommands";
import { createGameCommandRegistry, GameCommandContext } from "./useGameCommands";
import { gamePanelRegistry, type GameDimension, type GamePanelRegistry } from "./panelRegistry";
import { GAME_EDITOR_ROOT_SX } from "./gameEditorStyles";

export interface GamePanelView {
  readonly id: string;
  readonly node: ReactNode;
  readonly visible?: boolean;
  readonly keyboardScope?: boolean;
}
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
}

export default function GameEditorShell({ dimension, toolbar, status, panels, layoutStore, registry = gamePanelRegistry,
  notices, mobile, dialogs, commands }: GameEditorShellProps): ReactNode {
  const root = useRef<HTMLDivElement | null>(null);
  const registrations = useSyncExternalStore(registry.subscribe, registry.getSnapshot, registry.getSnapshot);
  const layout = useStore(layoutStore, (state) => state.layout);
  useEffect(() => { layoutStore.getState().registerPanels(registrations); }, [layoutStore, registrations, layout]);
  const views = panels.filter((view) => view.visible !== false && registrations.some((entry) => entry.id === view.id && entry.dimensions.includes(dimension)));
  const presentation = useGameDockPresentation({ store: layoutStore, layout, registry: registrations, dimension,
    availableIds: views.map((view) => view.id), views, root });
  const shortcutStore = useGameShortcutStore();
  const overrides = useStore(shortcutStore, (state) => state.overrides);
  const bindings = useMemo(() => resolveGameBindings(overrides), [overrides]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const builtIn: GameCommandHandlers = {
    "editor.commandPalette": { run: () => setPaletteOpen(true) },
    "editor.keyboardShortcuts": { run: () => setShortcutsOpen(true) },
    "editor.publish": { run: toolbar.onPublish, enabled: !toolbar.saving && toolbar.saveStatus !== "saving" },
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
  return <EditorUiProvider scope="inspector"><GameCommandContext.Provider value={commandRegistry}><FlexColumn ref={root} sx={GAME_EDITOR_ROOT_SX}
    onKeyDown={(event) => {
      // Dialogs render in portals, so their key presses bubble here through React without being inside the editor element.
      if (!(event.target instanceof Node) || !root.current?.contains(event.target)) { return; }
      dispatchGameShortcut(event, { dimension, playing: toolbar.playSession, bindings, handler: commandRegistry.handler });
    }}>
    <GameToolbar {...toolbar} onCommandPalette={() => setPaletteOpen(true)} />
    <GameLayoutMenu store={layoutStore} panels={registrations.filter((entry) => views.some((view) => view.id === entry.id))} />
    {notices}
    <GameDockCanvas presentation={presentation} store={layoutStore} />
    <GameStatusBar {...status} />
    {mobile}
    {dialogs}
    <GameCommandPalette open={paletteOpen} dimension={dimension} playing={toolbar.playSession} bindings={bindings}
      handler={commandRegistry.handler} onClose={() => setPaletteOpen(false)} />
    <GameShortcutsDialog open={shortcutsOpen} dimension={dimension} store={shortcutStore} onClose={() => setShortcutsOpen(false)} />
  </FlexColumn></GameCommandContext.Provider></EditorUiProvider>;
}
