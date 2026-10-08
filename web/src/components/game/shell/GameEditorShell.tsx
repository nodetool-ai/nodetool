import { useEffect, useRef, useSyncExternalStore, type ComponentProps, type KeyboardEvent, type ReactNode } from "react";
import { useStore, type StoreApi } from "zustand";

import type { GamePanelLayoutState } from "../../../stores/game/GamePanelLayoutStore";
import { EditorUiProvider, FlexColumn } from "../../ui_primitives";
import GameToolbar from "./GameToolbar";
import GameStatusBar from "./GameStatusBar";
import { GameDockCanvas } from "./GameDockCanvas";
import { GameLayoutMenu } from "./GameLayoutMenu";
import { useGameDockPresentation } from "./useGameDockPresentation";
import { isEditableElement } from "../../../utils/browser";
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
  readonly onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
}

export default function GameEditorShell({ dimension, toolbar, status, panels, layoutStore, registry = gamePanelRegistry,
  notices, mobile, dialogs, onKeyDown }: GameEditorShellProps): ReactNode {
  const root = useRef<HTMLDivElement | null>(null);
  const registrations = useSyncExternalStore(registry.subscribe, registry.getSnapshot, registry.getSnapshot);
  const layout = useStore(layoutStore, (state) => state.layout);
  useEffect(() => { layoutStore.getState().registerPanels(registrations); }, [layoutStore, registrations, layout]);
  const views = panels.filter((view) => view.visible !== false && registrations.some((entry) => entry.id === view.id && entry.dimensions.includes(dimension)));
  const presentation = useGameDockPresentation({ store: layoutStore, layout, registry: registrations, dimension,
    availableIds: views.map((view) => view.id), views, root });
  return <EditorUiProvider scope="inspector"><FlexColumn ref={root} sx={GAME_EDITOR_ROOT_SX}
    onKeyDown={(event) => {
      const target = event.target;
      if (event.defaultPrevented || toolbar.playSession || !(target instanceof HTMLElement)
        || Boolean(isEditableElement(target)) || !target.closest("[data-game-undo-scope]")) { return; }
      onKeyDown?.(event);
    }}>
    <GameToolbar {...toolbar} />
    <GameLayoutMenu store={layoutStore} />
    {notices}
    <GameDockCanvas presentation={presentation} store={layoutStore} />
    <GameStatusBar {...status} />
    {mobile}
    {dialogs}
  </FlexColumn></EditorUiProvider>;
}
